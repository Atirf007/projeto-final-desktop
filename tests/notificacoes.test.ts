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
  valorTotal: 100,
  totalAlunos: 1,
  itens: [
    {
      pagamentoId: 1,
      alunoId: 10,
      alunoNome: 'Ana',
      competencia: '2026-01',
      valor: 100,
      dataVencimento: '2026-01-30',
      diasAtraso: 30
    }
  ]
}

test('alerta ao gestor não é persistido quando o atraso é de até 30 dias', async () => {
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

  assert.equal(await servico.registrarAlertaInadimplencia(resumoBase), 0)
  assert.equal(criados.length, 0)
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
})
