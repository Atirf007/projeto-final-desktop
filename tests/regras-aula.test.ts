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
