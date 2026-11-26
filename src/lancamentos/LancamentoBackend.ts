import { registrarCanal } from '../SegurancaIpc'
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { Banco } from '../Banco'
import { BancoErros } from '../BancoErros'
import { Sessao } from '../Sessao'

export type CategoriaLancamento = 'aula' | 'aluguel' | 'outros'

export type Lancamento = {
  id: number
  categoria: CategoriaLancamento
  descricao: string | null
  valor: number
  dataLancamento: string
}

export type FiltroLancamentos = {
  categoria?: CategoriaLancamento
  inicio?: string
  fim?: string
  busca?: string
}

export type FiltroLancamento = {
  categoria: CategoriaLancamento | ''
  inicio: string
  fim: string
  busca: string
}

export type LancamentoInput = {
  id?: number
  categoria: CategoriaLancamento
  descricao?: string | null
  valor: number
  dataLancamento: string
}

export type ResultadoLancamento = { ok: true; id: number } | { ok: false; mensagem: string }

const TIMEOUT = 15000
const CATEGORIAS: CategoriaLancamento[] = ['aula', 'aluguel', 'outros']

const dataISO = (valor: unknown): string => String(valor ?? '').slice(0, 10)

const dataValida = (valor: unknown): string | null => {
  if (typeof valor !== 'string') return null
  const m = valor.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const ano = Number(m[1])
  const mes = Number(m[2])
  const dia = Number(m[3])
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null
  if (ano < 1900 || ano > 2100) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

const mapear = (linha: RowDataPacket): Lancamento => ({
  id: Number(linha.id),
  categoria: String(linha.categoria) as CategoriaLancamento,
  descricao: linha.descricao ? String(linha.descricao) : null,
  valor: Number(linha.valor),
  dataLancamento: dataISO(linha.data_lancamento)
})

export class LancamentoRepository {
  private readonly pool = Banco.pool

  listar = async (filtro: FiltroLancamentos): Promise<Lancamento[]> => {
    const condicoes: string[] = []
    const valores: unknown[] = []
    if (filtro.categoria) {
      condicoes.push('categoria = ?')
      valores.push(filtro.categoria)
    }
    if (filtro.inicio) {
      condicoes.push('data_lancamento >= ?')
      valores.push(filtro.inicio)
    }
    if (filtro.fim) {
      condicoes.push('data_lancamento <= ?')
      valores.push(filtro.fim)
    }
    if (filtro.busca) {
      const termo = `%${filtro.busca.replace(/[\\%_]/g, '\\$&')}%`
      condicoes.push('descricao LIKE ?')
      valores.push(termo)
    }
    const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : ''
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT id, categoria, descricao, valor, data_lancamento
            FROM lancamentos
            ${where}
            ORDER BY data_lancamento DESC, id DESC
            LIMIT 500`,
      values: valores,
      timeout: TIMEOUT
    })
    return linhas.map(mapear)
  }

  obter = async (id: number): Promise<Lancamento | null> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT id, categoria, descricao, valor, data_lancamento
            FROM lancamentos WHERE id = ? LIMIT 1`,
      values: [id],
      timeout: TIMEOUT
    })
    return linhas.length ? mapear(linhas[0]) : null
  }

  criar = async (dados: LancamentoInput): Promise<number> => {
    const [resultado] = await this.pool.query<ResultSetHeader>({
      sql: `INSERT INTO lancamentos (categoria, descricao, valor, data_lancamento)
            VALUES (?, ?, ?, ?)`,
      values: [dados.categoria, dados.descricao ?? null, dados.valor, dados.dataLancamento],
      timeout: TIMEOUT
    })
    return Number(resultado.insertId)
  }

  atualizar = async (dados: LancamentoInput): Promise<boolean> => {
    const [resultado] = await this.pool.query<ResultSetHeader>({
      sql: `UPDATE lancamentos
            SET categoria = ?, descricao = ?, valor = ?, data_lancamento = ?
            WHERE id = ?`,
      values: [dados.categoria, dados.descricao ?? null, dados.valor, dados.dataLancamento, dados.id],
      timeout: TIMEOUT
    })
    return resultado.affectedRows > 0
  }

  excluir = async (id: number): Promise<boolean> => {
    const [resultado] = await this.pool.query<ResultSetHeader>({
      sql: 'DELETE FROM lancamentos WHERE id = ?',
      values: [id],
      timeout: TIMEOUT
    })
    return resultado.affectedRows > 0
  }
}

class LancamentoValidador {
  private id = (valor: unknown): number | null => {
    const numero = typeof valor === 'number' || typeof valor === 'string' ? Number(valor) : NaN
    return Number.isInteger(numero) && numero > 0 ? numero : null
  }

  filtro(entrada: unknown): FiltroLancamentos {
    if (typeof entrada !== 'object' || entrada === null) return {}
    const e = entrada as Record<string, unknown>
    const filtro: FiltroLancamentos = {}
    if (typeof e.categoria === 'string' && CATEGORIAS.includes(e.categoria as CategoriaLancamento)) {
      filtro.categoria = e.categoria as CategoriaLancamento
    }
    const inicio = dataValida(e.inicio)
    if (inicio) filtro.inicio = inicio
    const fim = dataValida(e.fim)
    if (fim) filtro.fim = fim
    if (typeof e.busca === 'string') filtro.busca = e.busca.trim().slice(0, 120)
    if (filtro.inicio && filtro.fim && filtro.inicio > filtro.fim) return {}
    return filtro
  }

  validar(entrada: unknown): { ok: true; dados: LancamentoInput } | { ok: false; mensagem: string } {
    if (typeof entrada !== 'object' || entrada === null) return { ok: false, mensagem: 'Dados inválidos.' }
    const e = entrada as Record<string, unknown>

    let id: number | undefined
    if (e.id !== undefined) {
      const idValido = this.id(e.id)
      if (idValido === null) return { ok: false, mensagem: 'Lançamento inválido.' }
      id = idValido
    }

    if (typeof e.categoria !== 'string' || !CATEGORIAS.includes(e.categoria as CategoriaLancamento)) {
      return { ok: false, mensagem: 'Selecione uma categoria válida.' }
    }

    const descricaoTexto = typeof e.descricao === 'string' ? e.descricao.trim() : ''
    if (descricaoTexto.length > 160) {
      return { ok: false, mensagem: 'A descrição deve ter até 160 caracteres.' }
    }
    const descricao = descricaoTexto || null
    const numero =
      typeof e.valor === 'number'
        ? e.valor
        : typeof e.valor === 'string' && /^\d+([.,]\d{1,2})?$/.test(e.valor.trim())
          ? Number(e.valor.trim().replace(',', '.'))
          : NaN
    if (!Number.isFinite(numero) || numero <= 0 || numero > 99999999.99) {
      return { ok: false, mensagem: 'Informe um valor entre 0,01 e 99.999.999,99.' }
    }
    const dataLancamento = dataValida(e.dataLancamento)
    if (!dataLancamento) return { ok: false, mensagem: 'Informe uma data válida.' }

    return {
      ok: true,
      dados: {
        id,
        categoria: e.categoria as CategoriaLancamento,
        descricao,
        valor: Math.round(numero * 100) / 100,
        dataLancamento
      }
    }
  }
}

export class LancamentoIpc {
  private readonly validador = new LancamentoValidador()

  constructor(
    private readonly sessao: Sessao,
    private readonly repositorio: LancamentoRepository = new LancamentoRepository()
  ) {}

  private id = (valor: unknown): number | null => {
    const numero = typeof valor === 'number' || typeof valor === 'string' ? Number(valor) : NaN
    return Number.isInteger(numero) && numero > 0 ? numero : null
  }

  private erro = (contexto: string, erro: unknown, padrao: string): ResultadoLancamento => {
    if (erro instanceof Error && erro.message === 'Acesso negado') {
      return { ok: false, mensagem: 'Acesso negado para esta operação.' }
    }
    console.error(`[${contexto}]`, erro)
    return { ok: false, mensagem: BancoErros.mensagem(erro, padrao) }
  }

  registrar = (): void => {
    registrarCanal('lancamentos:listar', async (_evento, entrada: unknown): Promise<Lancamento[]> => {
      this.sessao.exigir(['admin'])
      return this.repositorio.listar(this.validador.filtro(entrada))
    })

    registrarCanal('lancamentos:obter', async (_evento, entrada: unknown): Promise<Lancamento | null> => {
      this.sessao.exigir(['admin'])
      const id = this.id(entrada)
      if (id === null) throw new Error('Lançamento inválido.')
      return this.repositorio.obter(id)
    })

    registrarCanal('lancamentos:criar', async (_evento, entrada: unknown): Promise<ResultadoLancamento> => {
      this.sessao.exigir(['admin'])
      const v = this.validador.validar(entrada)
      if (!v.ok) return v
      try {
        const id = await this.repositorio.criar(v.dados)
        return { ok: true, id }
      } catch (erro) {
        return this.erro('lancamentos:criar', erro, 'Não foi possível criar o lançamento.')
      }
    })

    registrarCanal('lancamentos:atualizar', async (_evento, entrada: unknown): Promise<ResultadoLancamento> => {
      this.sessao.exigir(['admin'])
      const v = this.validador.validar(entrada)
      if (!v.ok) return v
      if (v.dados.id === undefined) return { ok: false, mensagem: 'Lançamento inválido.' }
      try {
        const ok = await this.repositorio.atualizar(v.dados)
        if (!ok) return { ok: false, mensagem: 'Lançamento não encontrado.' }
        return { ok: true, id: v.dados.id }
      } catch (erro) {
        return this.erro('lancamentos:atualizar', erro, 'Não foi possível atualizar o lançamento.')
      }
    })

    registrarCanal('lancamentos:excluir', async (_evento, entrada: unknown): Promise<ResultadoLancamento> => {
      this.sessao.exigir(['admin'])
      const id = this.id(entrada)
      if (id === null) return { ok: false, mensagem: 'Lançamento inválido.' }
      try {
        const ok = await this.repositorio.excluir(id)
        if (!ok) return { ok: false, mensagem: 'Lançamento não encontrado.' }
        return { ok: true, id }
      } catch (erro) {
        return this.erro('lancamentos:excluir', erro, 'Não foi possível excluir o lançamento.')
      }
    })
  }
}
