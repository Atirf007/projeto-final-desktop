import { ipcMain } from 'electron'
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { Banco } from '../Banco'
import { BancoErros } from '../BancoErros'
import { Sessao } from '../Sessao'
import { gerarMensalidades } from './Mensalidades'

export type StatusPagamento = 'pendente' | 'pago' | 'atrasado' | 'cancelado'
export type MetodoPagamento = 'dinheiro' | 'pix' | 'cartao' | 'boleto' | 'transferencia'

export type Pagamento = {
  id: number
  assinaturaId: number
  alunoId: number
  alunoNome: string
  planoNome: string
  competencia: string
  valor: number
  dataVencimento: string
  dataPagamento: string | null
  status: StatusPagamento
  metodo: MetodoPagamento | null
  observacao: string | null
}

export type FiltroPagamentos = {
  status?: StatusPagamento
  busca?: string
  competencia?: string
}

export type ResumoPagamentos = {
  pendentes: number
  pagos: number
  atrasados: number
  cancelados: number
  totalPendente: number
  totalPago: number
  totalAtrasado: number
}

export type RegistrarPagamentoInput = {
  id: number
  dataPagamento: string
  metodo: MetodoPagamento
  observacao?: string | null
}

export type ResultadoPagamento =
  | { ok: true; id?: number; criados?: number; ignorados?: number }
  | { ok: false; mensagem: string }

const TIMEOUT = 15000
const STATUS: StatusPagamento[] = ['pendente', 'pago', 'atrasado', 'cancelado']
const METODOS: MetodoPagamento[] = ['dinheiro', 'pix', 'cartao', 'boleto', 'transferencia']

const dataISO = (valor: unknown): string => String(valor ?? '').slice(0, 10)

export class PagamentoRepository {
  private readonly pool = Banco.pool

  private readonly selectBase = `
    SELECT pg.id, pg.assinatura_id, a.aluno_id, u.nome AS aluno_nome,
           pl.nome AS plano_nome, pg.competencia, pg.valor, pg.data_vencimento,
           pg.data_pagamento, pg.status, pg.metodo, pg.observacao
    FROM pagamentos pg
    INNER JOIN assinaturas a ON a.id = pg.assinatura_id
    INNER JOIN alunos al ON al.id = a.aluno_id
    INNER JOIN usuarios u ON u.id = al.usuario_id
    INNER JOIN planos pl ON pl.id = a.plano_id`

  private mapear = (linha: RowDataPacket): Pagamento => ({
    id: Number(linha.id),
    assinaturaId: Number(linha.assinatura_id),
    alunoId: Number(linha.aluno_id),
    alunoNome: String(linha.aluno_nome),
    planoNome: String(linha.plano_nome),
    competencia: dataISO(linha.competencia),
    valor: Number(linha.valor),
    dataVencimento: dataISO(linha.data_vencimento),
    dataPagamento: linha.data_pagamento ? dataISO(linha.data_pagamento) : null,
    status: String(linha.status) as StatusPagamento,
    metodo: linha.metodo ? (String(linha.metodo) as MetodoPagamento) : null,
    observacao: linha.observacao ? String(linha.observacao) : null
  })

  marcarAtrasados = async (): Promise<void> => {
    await this.pool.query({
      sql: `UPDATE pagamentos SET status = 'atrasado', atualizado_em = NOW()
            WHERE status = 'pendente' AND data_vencimento < CURDATE()`,
      timeout: TIMEOUT
    })
  }

  listar = async (filtro: FiltroPagamentos): Promise<Pagamento[]> => {
    await this.marcarAtrasados()

    const condicoes: string[] = []
    const valores: unknown[] = []

    if (filtro.status) {
      condicoes.push('pg.status = ?')
      valores.push(filtro.status)
    }
    if (filtro.competencia) {
      condicoes.push('pg.competencia = ?')
      valores.push(`${filtro.competencia}-01`)
    }

    const busca = typeof filtro.busca === 'string' ? filtro.busca.trim() : ''
    if (busca) {
      const termo = `%${busca.replace(/[\\%_]/g, '\\$&')}%`
      condicoes.push('(u.nome LIKE ? OR pl.nome LIKE ?)')
      valores.push(termo, termo)
    }

    const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : ''

    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `${this.selectBase}
            ${where}
            ORDER BY pg.data_vencimento ASC, u.nome ASC`,
      values: valores,
      timeout: TIMEOUT
    })

    return linhas.map(this.mapear)
  }

  resumo = async (filtro: FiltroPagamentos): Promise<ResumoPagamentos> => {
    await this.marcarAtrasados()

    const condicoes: string[] = []
    const valores: unknown[] = []

    if (filtro.competencia) {
      condicoes.push('competencia = ?')
      valores.push(`${filtro.competencia}-01`)
    }

    const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : ''

    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT status, COUNT(*) AS quantidade, COALESCE(SUM(valor), 0) AS total
            FROM pagamentos
            ${where}
            GROUP BY status`,
      values: valores,
      timeout: TIMEOUT
    })

    const resumo: ResumoPagamentos = {
      pendentes: 0,
      pagos: 0,
      atrasados: 0,
      cancelados: 0,
      totalPendente: 0,
      totalPago: 0,
      totalAtrasado: 0
    }

    for (const linha of linhas) {
      const status = String(linha.status)
      const quantidade = Number(linha.quantidade)
      const total = Number(linha.total)

      if (status === 'pendente') {
        resumo.pendentes = quantidade
        resumo.totalPendente = total
      } else if (status === 'pago') {
        resumo.pagos = quantidade
        resumo.totalPago = total
      } else if (status === 'atrasado') {
        resumo.atrasados = quantidade
        resumo.totalAtrasado = total
      } else if (status === 'cancelado') {
        resumo.cancelados = quantidade
      }
    }

    return resumo
  }

  registrar = async (dados: RegistrarPagamentoInput): Promise<boolean> => {
    const [resultado] = await this.pool.query<ResultSetHeader>({
      sql: `UPDATE pagamentos
            SET status = 'pago', data_pagamento = ?, metodo = ?, observacao = ?, atualizado_em = NOW()
            WHERE id = ? AND status <> 'cancelado'`,
      values: [dados.dataPagamento, dados.metodo, dados.observacao ?? null, dados.id],
      timeout: TIMEOUT
    })
    return resultado.affectedRows > 0
  }

  cancelar = async (id: number): Promise<boolean> => {
    const [resultado] = await this.pool.query<ResultSetHeader>({
      sql: `UPDATE pagamentos SET status = 'cancelado', atualizado_em = NOW()
            WHERE id = ? AND status <> 'pago'`,
      values: [id],
      timeout: TIMEOUT
    })
    return resultado.affectedRows > 0
  }

  gerar = async (): Promise<{ criados: number; ignorados: number }> => {
    const [assinaturas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT a.id, a.data_inicio, a.valor_contratado, p.duracao_meses
            FROM assinaturas a
            INNER JOIN planos p ON p.id = a.plano_id
            WHERE a.status = 'ativa'`,
      timeout: TIMEOUT
    })

    let criados = 0
    let ignorados = 0

    for (const linha of assinaturas) {
      const resultado = await gerarMensalidades(this.pool, {
        assinaturaId: Number(linha.id),
        dataInicio: dataISO(linha.data_inicio),
        valorContratado: Number(linha.valor_contratado),
        duracaoMeses: Number(linha.duracao_meses)
      })
      criados += resultado.criados
      ignorados += resultado.ignorados
    }

    return { criados, ignorados }
  }
}

class PagamentoValidador {
  private id(valor: unknown): number | null {
    const numero = Number(valor)
    return Number.isInteger(numero) && numero > 0 ? numero : null
  }

  private data(valor: unknown): string | null {
    if (typeof valor !== 'string') return null
    const texto = valor.trim()
    const m = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!m) return null

    const ano = Number(m[1])
    const mes = Number(m[2])
    const dia = Number(m[3])
    const d = new Date(Date.UTC(ano, mes - 1, dia))
    if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null
    if (ano < 2000 || ano > 2100) return null
    return texto
  }

  private metodo(valor: unknown): MetodoPagamento | null {
    return typeof valor === 'string' && METODOS.includes(valor as MetodoPagamento)
      ? (valor as MetodoPagamento)
      : null
  }

  filtro(entrada: unknown): FiltroPagamentos {
    if (typeof entrada !== 'object' || entrada === null) return {}

    const e = entrada as Record<string, unknown>
    const filtro: FiltroPagamentos = {}

    if (typeof e.status === 'string' && STATUS.includes(e.status as StatusPagamento)) {
      filtro.status = e.status as StatusPagamento
    }
    if (typeof e.busca === 'string') filtro.busca = e.busca.slice(0, 120)
    if (typeof e.competencia === 'string' && /^\d{4}-\d{2}$/.test(e.competencia)) {
      filtro.competencia = e.competencia
    }

    return filtro
  }

  validarRegistro(entrada: unknown): { ok: true; dados: RegistrarPagamentoInput } | { ok: false; mensagem: string } {
    if (typeof entrada !== 'object' || entrada === null) return { ok: false, mensagem: 'Dados inválidos.' }

    const e = entrada as Record<string, unknown>
    const id = this.id(e.id)
    if (id === null) return { ok: false, mensagem: 'Pagamento inválido.' }

    const dataPagamento = this.data(e.dataPagamento)
    if (!dataPagamento) return { ok: false, mensagem: 'Informe uma data de pagamento válida.' }

    const metodo = this.metodo(e.metodo)
    if (!metodo) return { ok: false, mensagem: 'Selecione um método de pagamento válido.' }

    const observacao =
      typeof e.observacao === 'string' ? e.observacao.trim().slice(0, 255) : null

    return { ok: true, dados: { id, dataPagamento, metodo, observacao: observacao || null } }
  }
}

export class PagamentoIpc {
  private readonly validador = new PagamentoValidador()

  constructor(
    private readonly sessao: Sessao,
    private readonly repositorio: PagamentoRepository = new PagamentoRepository()
  ) {}

  private idValido(valor: unknown): number | null {
    const id = typeof valor === 'number' ? valor : typeof valor === 'string' ? Number(valor) : NaN
    return Number.isInteger(id) && id > 0 ? id : null
  }

  private erro = (contexto: string, erro: unknown, padrao: string): ResultadoPagamento => {
    if (erro instanceof Error && erro.message === 'Acesso negado') {
      return { ok: false, mensagem: 'Acesso negado para esta operação.' }
    }
    console.error(`[${contexto}]`, erro)
    return { ok: false, mensagem: BancoErros.mensagem(erro, padrao) }
  }

  registrar = (): void => {
    ipcMain.handle('pagamentos:listar', async (_evento, entrada: unknown): Promise<Pagamento[]> => {
      this.sessao.exigir(['admin'])
      return this.repositorio.listar(this.validador.filtro(entrada))
    })

    ipcMain.handle('pagamentos:resumo', async (_evento, entrada: unknown): Promise<ResumoPagamentos> => {
      this.sessao.exigir(['admin'])
      return this.repositorio.resumo(this.validador.filtro(entrada))
    })

    ipcMain.handle('pagamentos:registrar', async (_evento, entrada: unknown): Promise<ResultadoPagamento> => {
      this.sessao.exigir(['admin'])
      const v = this.validador.validarRegistro(entrada)
      if (!v.ok) return v

      try {
        const ok = await this.repositorio.registrar(v.dados)
        if (!ok) return { ok: false, mensagem: 'Pagamento não encontrado ou já cancelado.' }
        return { ok: true, id: v.dados.id }
      } catch (erro) {
        return this.erro('pagamentos:registrar', erro, 'Não foi possível validar o pagamento.')
      }
    })

    ipcMain.handle('pagamentos:cancelar', async (_evento, entrada: unknown): Promise<ResultadoPagamento> => {
      this.sessao.exigir(['admin'])
      const id = this.idValido(entrada)
      if (id === null) return { ok: false, mensagem: 'Pagamento inválido.' }

      try {
        const ok = await this.repositorio.cancelar(id)
        if (!ok) return { ok: false, mensagem: 'Pagamento não encontrado ou já pago.' }
        return { ok: true, id }
      } catch (erro) {
        return this.erro('pagamentos:cancelar', erro, 'Não foi possível cancelar o pagamento.')
      }
    })

    ipcMain.handle('pagamentos:gerar', async (): Promise<ResultadoPagamento> => {
      this.sessao.exigir(['admin'])
      try {
        const resultado = await this.repositorio.gerar()
        return { ok: true, ...resultado }
      } catch (erro) {
        return this.erro('pagamentos:gerar', erro, 'Não foi possível gerar as mensalidades.')
      }
    })
  }
}
