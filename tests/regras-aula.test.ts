import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { Pool, PoolConnection } from 'mysql2/promise'
import { Banco } from '../src/Banco'
import { ErroAula, RegrasAulaService } from '../src/aulas/RegrasAula'

after(async () => {
  await Banco.pool.end()
})

type Consulta = { sql: string; values?: unknown[] }

class ConexaoFalsa {
  readonly eventos: string[] = []
  readonly consultas: Consulta[] = []

  constructor(private readonly respostas: (consulta: Consulta) => unknown[]) {}

  query = async (entrada: Consulta | string): Promise<[unknown[], unknown]> => {
    const consulta = typeof entrada === 'string' ? { sql: entrada } : entrada
    this.consultas.push(consulta)
    return [this.respostas(consulta), []]
  }

  beginTransaction = async (): Promise<void> => {
    this.eventos.push('begin')
  }

  commit = async (): Promise<void> => {
    this.eventos.push('commit')
  }

  rollback = async (): Promise<void> => {
    this.eventos.push('rollback')
  }

  release = (): void => {
    this.eventos.push('release')
  }
}

const poolCom = (conexao: ConexaoFalsa): Pool =>
  ({ getConnection: async () => conexao }) as unknown as Pool

const conexaoCom = (conexao: ConexaoFalsa): PoolConnection => conexao as unknown as PoolConnection

test('validação de uma aula por dia rejeita inscrição em outra aula', async () => {
  const conexao = new ConexaoFalsa((consulta) =>
    consulta.sql.includes('inscricoes_aula') ? [{ id: 7 }] : []
  )
  const regras = new RegrasAulaService(poolCom(conexao))

  await assert.rejects(
    () => regras.validarUmaAulaPorDia(conexaoCom(conexao), 12, 30, '2026-01-10'),
    (erro: unknown) => erro instanceof ErroAula && /uma aula por dia/.test(erro.message)
  )
})

test('validação de uma aula por dia rejeita presença em outra aula', async () => {
  const conexao = new ConexaoFalsa((consulta) =>
    consulta.sql.includes('FROM presencas') ? [{ id: 9 }] : []
  )
  const regras = new RegrasAulaService(poolCom(conexao))

  await assert.rejects(
    () => regras.validarUmaAulaPorDia(conexaoCom(conexao), 12, 30, '2026-01-10'),
    ErroAula
  )
})

test('validação ignora a própria aula e a presença em edição', async () => {
  const conexao = new ConexaoFalsa(() => [])
  const regras = new RegrasAulaService(poolCom(conexao))

  await regras.validarUmaAulaPorDia(conexaoCom(conexao), 12, 30, '2026-01-10', 9)

  assert.deepEqual(conexao.consultas[0].values, [12, 30, '2026-01-10', 12, '2026-01-10', 30, 9])
})

test('capacidade bloqueia ocupação acima do limite', async () => {
  const conexao = new ConexaoFalsa(() => [{ total: 3 }])
  const regras = new RegrasAulaService(poolCom(conexao))

  await assert.rejects(() => regras.validarCapacidade(conexaoCom(conexao), 30, 2), ErroAula)
  await regras.validarCapacidade(conexaoCom(conexao), 30, 3)
})

test('transação faz commit no sucesso e rollback na falha', async () => {
  const sucesso = new ConexaoFalsa(() => [])
  const regrasSucesso = new RegrasAulaService(poolCom(sucesso))
  await regrasSucesso.executarTransacao(async () => 'ok')
  assert.deepEqual(sucesso.eventos, ['begin', 'commit', 'release'])

  const falha = new ConexaoFalsa(() => [])
  const regrasFalha = new RegrasAulaService(poolCom(falha))
  await assert.rejects(
    () =>
      regrasFalha.executarTransacao(async () => {
        throw new Error('falha')
      }),
    /falha/
  )
  assert.deepEqual(falha.eventos, ['begin', 'rollback', 'release'])
})

test('visitante duplicado no mesmo dia é rejeitado e usa identificadores normalizados', async () => {
  const conexao = new ConexaoFalsa((consulta) =>
    consulta.sql.includes('FROM visitantes v') ? [{ id: 8 }] : []
  )
  const regras = new RegrasAulaService(poolCom(conexao))

  await assert.rejects(
    () =>
      regras.validarVisitanteUnicoPorDia(conexaoCom(conexao), {
        nome: '  Ana   Silva ',
        telefone: '(11) 99999-9999',
        email: 'ANA@Example.com',
        dataVisita: '2026-01-10'
      }),
    (erro: unknown) => erro instanceof ErroAula && /uma aula por dia/.test(erro.message)
  )
  assert.deepEqual(conexao.consultas[0].values, [
    '2026-01-10',
    0,
    1,
    '11999999999',
    1,
    'ana@example.com',
    0,
    'ana silva'
  ])
})

test('validação de visitante ignora o próprio registro na atualização', async () => {
  const conexao = new ConexaoFalsa((consulta) =>
    consulta.sql.includes('FROM visitantes v') ? [] : []
  )
  const regras = new RegrasAulaService(poolCom(conexao))

  await regras.validarVisitanteUnicoPorDia(conexaoCom(conexao), {
    nome: 'Ana Silva',
    telefone: '11999999999',
    dataVisita: '2026-01-10',
    ignorarVisitanteId: 7
  })

  assert.equal(conexao.consultas[0].values?.[1], 7)
})

test('visitante vinculado a aluno com aula no dia é rejeitado', async () => {
  const conexao = new ConexaoFalsa((consulta) => {
    if (consulta.sql.includes('FROM visitantes v')) return []
    if (consulta.sql.includes('INNER JOIN usuarios u ON u.id = al.usuario_id')) return [{ id: 55 }]
    if (consulta.sql.includes('FROM presencas p')) return [{ id: 9 }]
    return []
  })
  const regras = new RegrasAulaService(poolCom(conexao))

  await assert.rejects(
    () =>
      regras.validarVisitanteUnicoPorDia(conexaoCom(conexao), {
        nome: 'Ana Silva',
        telefone: '11999999999',
        dataVisita: '2026-01-10',
        aulaId: 30
      }),
    (erro: unknown) => erro instanceof ErroAula && /Esta pessoa já possui/.test(erro.message)
  )
})

test('visitante cancelado no mesmo dia não bloqueia novo cadastro', async () => {
  const conexao = new ConexaoFalsa((consulta) => {
    if (!consulta.sql.includes('FROM visitantes v')) return []
    return consulta.sql.includes("v.status <> 'cancelado'") ? [] : [{ id: 8 }]
  })
  const regras = new RegrasAulaService(poolCom(conexao))

  await regras.validarVisitanteUnicoPorDia(conexaoCom(conexao), {
    nome: 'Ana Silva',
    telefone: '(11) 99999-9999',
    dataVisita: '2026-01-10'
  })

  assert.match(conexao.consultas[0].sql, /v\.status <> 'cancelado'/)
})

test('homônimos com telefone e e-mail diferentes não bloqueiam', async () => {
  const conexao = new ConexaoFalsa((consulta) => {
    if (!consulta.sql.includes('FROM visitantes v')) return []
    const [, , temTelefone, telefone, temEmail, email, usarNome] = consulta.values ?? []
    const duplicado =
      (temTelefone === 1 && telefone === '11999999999') ||
      (temEmail === 1 && email === 'ana@exemplo.com') ||
      usarNome === 1
    return duplicado ? [{ id: 9 }] : []
  })
  const regras = new RegrasAulaService(poolCom(conexao))

  await regras.validarVisitanteUnicoPorDia(conexaoCom(conexao), {
    nome: 'Ana Silva',
    telefone: '(11) 98888-8888',
    email: 'ana@outro.test',
    dataVisita: '2026-01-10'
  })

  assert.equal(conexao.consultas[0].values?.[6], 0)
})

test('nome é usado quando telefone e e-mail estão ausentes', async () => {
  const conexao = new ConexaoFalsa((consulta) => {
    if (!consulta.sql.includes('FROM visitantes v')) return []
    return consulta.values?.[6] === 1 ? [{ id: 10 }] : []
  })
  const regras = new RegrasAulaService(poolCom(conexao))

  await assert.rejects(
    () =>
      regras.validarVisitanteUnicoPorDia(conexaoCom(conexao), {
        nome: 'Ana Silva',
        telefone: '',
        dataVisita: '2026-01-10'
      }),
    ErroAula
  )
  assert.equal(conexao.consultas[0].values?.[6], 1)
})
