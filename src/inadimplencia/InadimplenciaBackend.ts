import { registrarCanal } from '../SegurancaIpc'
import { Sessao } from '../Sessao'
import { PagamentoRepository } from '../pagamentos/PagamentoBackend'

export type ItemInadimplencia = {
  pagamentoId: number
  alunoId: number
  alunoNome: string
  competencia: string
  valor: number
  dataVencimento: string
  diasAtraso: number
}

export type ResumoInadimplencia = {
  geradoEm: string
  atrasados: number
  valorTotal: number
  totalAlunos: number
  itens: ItemInadimplencia[]
}

const dataISO = (valor: unknown): string => String(valor ?? '').slice(0, 10)

const diasEmAtraso = (vencimento: string): number => {
  const [ano, mes, dia] = dataISO(vencimento).split('-').map(Number)
  if (!ano || !mes || !dia) return 0
  const agora = new Date()
  const hoje = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate())
  return Math.max(0, Math.round((hoje - Date.UTC(ano, mes - 1, dia)) / 86_400_000))
}

export class InadimplenciaRepository {
  constructor(private readonly pagamentos: PagamentoRepository = new PagamentoRepository()) {}

  resumo = async (): Promise<ResumoInadimplencia> => {
    const lista = (await this.pagamentos.listar({ status: 'atrasado' })).sort(
      (a, b) => a.dataVencimento.localeCompare(b.dataVencimento) || a.alunoNome.localeCompare(b.alunoNome)
    )

    return {
      geradoEm: new Date().toISOString(),
      atrasados: lista.length,
      valorTotal: Math.round(lista.reduce((soma, pagamento) => soma + pagamento.valor, 0) * 100) / 100,
      totalAlunos: new Set(lista.map((pagamento) => pagamento.alunoId)).size,
      itens: lista.slice(0, 10).map((pagamento) => ({
        pagamentoId: pagamento.id,
        alunoId: pagamento.alunoId,
        alunoNome: pagamento.alunoNome,
        competencia: dataISO(pagamento.competencia).slice(0, 7),
        valor: pagamento.valor,
        dataVencimento: dataISO(pagamento.dataVencimento),
        diasAtraso: diasEmAtraso(pagamento.dataVencimento)
      }))
    }
  }
}

export class InadimplenciaIpc {
  constructor(
    private readonly sessao: Sessao,
    private readonly repositorio: InadimplenciaRepository = new InadimplenciaRepository()
  ) {}

  registrar = (): void => {
    registrarCanal('inadimplencia:resumo', async (): Promise<ResumoInadimplencia> => {
      this.sessao.exigir(['admin'])
      return this.repositorio.resumo()
    })
  }
}
