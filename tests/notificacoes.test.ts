import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { Banco } from '../src/Banco'
import { ResumoInadimplencia } from '../src/inadimplencia/InadimplenciaBackend'
import { EmailServico } from '../src/integracoes/EmailBackend'
import { NotificacaoInput, NotificacaoServico } from '../src/notificacoes/NotificacaoBackend'

after(async () => {
  await Banco.pool.end()
})

const resumoBase: ResumoInadimplencia = {
  geradoEm: '2026-03-01T00:00:00.000Z',
  atrasados: 1,
  atrasadosLongos: 0,
  atrasadosLeves: 1,
  emAberto: 0,
  valorTotal: 100,
  valorTotalAlerta: 100,
  totalAlunos: 1,
  totalAlunosAlerta: 1,
  itens: [
    {
      pagamentoId: 1,
      alunoId: 10,
      alunoNome: 'Ana',
      competencia: '2026-01',
      valor: 100,
      dataVencimento: '2026-01-30',
      diasAtraso: 30,
      status: 'atrasado'
    }
  ],
  itensEmAberto: []
}

test('alerta ao gestor é persistido quando o atraso é de até 30 dias', async () => {
  const criados: NotificacaoInput[] = []
  const repositorio = {
    alertaInadimplenciaExiste: async (): Promise<boolean> => false,
    admins: async () => [{ id: 1, email: 'admin@academia.test', nome: 'Admin' }],
    criarManual: async (dados: NotificacaoInput): Promise<number> => {
      criados.push(dados)
      return criados.length
    }
  } as unknown as ConstructorParameters<typeof NotificacaoServico>[1]
  const servico = new NotificacaoServico({} as EmailServico, repositorio)

  assert.equal(await servico.registrarAlertaInadimplencia(resumoBase), 1)
  assert.equal(criados.length, 1)
  assert.match(String(criados[0].mensagem), /atraso de até 30 dias/)
})

test('alerta ao gestor é persistido quando há pendência em aberto', async () => {
  const criados: NotificacaoInput[] = []
  const repositorio = {
    alertaInadimplenciaExiste: async (): Promise<boolean> => false,
    admins: async () => [{ id: 1, email: 'admin@academia.test', nome: 'Admin' }],
    criarManual: async (dados: NotificacaoInput): Promise<number> => {
      criados.push(dados)
      return criados.length
    }
  } as unknown as ConstructorParameters<typeof NotificacaoServico>[1]
  const servico = new NotificacaoServico({} as EmailServico, repositorio)
  const resumo: ResumoInadimplencia = {
    ...resumoBase,
    atrasados: 0,
    atrasadosLongos: 0,
    atrasadosLeves: 0,
    emAberto: 1,
    valorTotal: 0,
    valorTotalAlerta: 50,
    totalAlunos: 0,
    totalAlunosAlerta: 1,
    itens: [],
    itensEmAberto: [
      {
        pagamentoId: 2,
        alunoId: 11,
        alunoNome: 'Bruno',
        competencia: '2026-03',
        valor: 50,
        dataVencimento: '2026-03-20',
        diasAtraso: 0,
        status: 'pendente'
      }
    ]
  }

  assert.equal(await servico.registrarAlertaInadimplencia(resumo), 1)
  assert.equal(criados.length, 1)
  assert.match(String(criados[0].mensagem), /em aberto/)
})

test('alerta ao gestor é persistido quando existe atraso superior a 30 dias', async () => {
  const criados: NotificacaoInput[] = []
  const repositorio = {
    alertaInadimplenciaExiste: async (): Promise<boolean> => false,
    admins: async () => [{ id: 1, email: 'admin@academia.test', nome: 'Admin' }],
    criarManual: async (dados: NotificacaoInput): Promise<number> => {
      criados.push(dados)
      return criados.length
    }
  } as unknown as ConstructorParameters<typeof NotificacaoServico>[1]
  const servico = new NotificacaoServico({} as EmailServico, repositorio)
  const resumo: ResumoInadimplencia = {
    ...resumoBase,
    atrasados: 2,
    atrasadosLongos: 1,
    atrasadosLeves: 1,
    valorTotal: 200,
    valorTotalAlerta: 200,
    totalAlunos: 2,
    totalAlunosAlerta: 2,
    itens: [
      { ...resumoBase.itens[0], diasAtraso: 50 },
      { ...resumoBase.itens[0], pagamentoId: 2, alunoNome: 'Bruno', diasAtraso: 10 }
    ]
  }

  assert.equal(await servico.registrarAlertaInadimplencia(resumo), 1)
  assert.equal(criados.length, 1)
  assert.equal(criados[0].tipo, 'geral')
  assert.equal(criados[0].canal, 'sistema')
  assert.match(String(criados[0].mensagem), /superior a 30 dias/)
  assert.match(String(criados[0].mensagem), /atraso de até 30 dias/)
})

test('alerta ao gestor não é duplicado no mesmo dia', async () => {
  const criados: NotificacaoInput[] = []
  const repositorio = {
    alertaInadimplenciaExiste: async (): Promise<boolean> => true,
    admins: async () => [{ id: 1, email: 'admin@academia.test', nome: 'Admin' }],
    criarManual: async (dados: NotificacaoInput): Promise<number> => {
      criados.push(dados)
      return criados.length
    }
  } as unknown as ConstructorParameters<typeof NotificacaoServico>[1]
  const servico = new NotificacaoServico({} as EmailServico, repositorio)

  assert.equal(await servico.registrarAlertaInadimplencia(resumoBase), 0)
  assert.equal(criados.length, 0)
})
