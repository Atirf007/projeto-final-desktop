import { registrarCanal } from '../SegurancaIpc'
import { Sessao } from '../Sessao'
import { Pagamento, PagamentoRepository } from '../pagamentos/PagamentoBackend'
import { RegrasInadimplencia } from './RegrasInadimplencia'

export type ItemInadimplencia = {
  pagamentoId: number
  alunoId: number
  alunoNome: string
  competencia: string
  valor: number
  dataVencimento: string
  diasAtraso: number
  status: 'pendente' | 'atrasado'
}

export type ResumoInadimplencia = {
  geradoEm: string
  atrasados: number
  atrasadosLongos: number
  atrasadosLeves: number
  emAberto: number
  valorTotal: number
  valorTotalAlerta: number
  totalAlunos: number
  totalAlunosAlerta: number
  itens: ItemInadimplencia[]
  itensEmAberto: ItemInadimplencia[]
}

const dataISO = (valor: unknown): string => String(valor ?? '').slice(0, 10)

export class InadimplenciaRepository {
  constructor(
    private readonly pagamentos: PagamentoRepository = new PagamentoRepository(),
    private readonly regras: RegrasInadimplencia = new RegrasInadimplencia()
  ) {}

  resumo = async (): Promise<ResumoInadimplencia> => {
    const lista = (await this.pagamentos.listar({}))
      .filter((pagamento) => pagamento.status === 'atrasado' || pagamento.status === 'pendente')
      .sort(
        (a, b) => a.dataVencimento.localeCompare(b.dataVencimento) || a.alunoNome.localeCompare(b.alunoNome)
      )
    const atrasados = lista.filter((pagamento) => pagamento.status === 'atrasado')
    const emAberto = lista.filter((pagamento) => pagamento.status === 'pendente')

    const mapear = (pagamento: Pagamento): ItemInadimplencia => ({
      pagamentoId: pagamento.id,
      alunoId: pagamento.alunoId,
      alunoNome: pagamento.alunoNome,
      competencia: dataISO(pagamento.competencia).slice(0, 7),
      valor: pagamento.valor,
      dataVencimento: dataISO(pagamento.dataVencimento),
      diasAtraso: this.regras.diasAtraso(pagamento.dataVencimento),
      status: pagamento.status === 'pendente' ? 'pendente' : 'atrasado'
    })
    const itens = atrasados.map(mapear)
    const itensEmAberto = emAberto.map(mapear)
    const somar = (valores: ItemInadimplencia[]): number =>
      Math.round(valores.reduce((total, item) => total + item.valor, 0) * 100) / 100
    const graves = itens.filter((item) => this.regras.atrasoExigeAlerta(item.diasAtraso))

    return {
      geradoEm: new Date().toISOString(),
      atrasados: atrasados.length,
      atrasadosLongos: graves.length,
      atrasadosLeves: itens.length - graves.length,
      emAberto: emAberto.length,
      valorTotal: somar(itens),
      valorTotalAlerta: somar([...itens, ...itensEmAberto]),
      totalAlunos: new Set(atrasados.map((pagamento) => pagamento.alunoId)).size,
      totalAlunosAlerta: new Set(lista.map((pagamento) => pagamento.alunoId)).size,
      itens: itens.slice(0, 10),
      itensEmAberto: itensEmAberto.slice(0, 10)
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
