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

export type FiltroLancamento = {
  categoria: CategoriaLancamento | ''
  inicio: string
  fim: string
  busca: string
}

export type ResultadoLancamento = { ok: true; id?: number } | { ok: false; mensagem: string }

type DadosLancamento = {
  categoria: CategoriaLancamento
  descricao: string | null
  valor: number
  dataLancamento: string
}

type EntradaValidada = { valido: true; dados: DadosLancamento } | { valido: false; mensagem: string }

export class LancamentoRepository {
  private readonly pool = Banco.pool

  private readonly sqlListar = `
    SELECT id, categoria, descricao, valor, data_lancamento
    FROM lancamentos
    WHERE (? IS NULL OR categoria = ?)
      AND (? IS NULL OR data_lancamento >= ?)
      AND (? IS NULL OR data_lancamento <= ?)
      AND (? IS NULL OR descricao LIKE ?)
    ORDER BY data_lancamento DESC, id DESC`

  private mapear = (linha: RowDataPacket): Lancamento => ({
    id: Number(linha.id),
    categoria: linha.categoria as CategoriaLancamento,
    descricao: linha.descricao ?? null,
    valor: Number(linha.valor),
    dataLancamento: String(linha.data_lancamento)
  })

  listar = async (filtro: FiltroLancamento): Promise<Lancamento[]> => {
    const categoria = filtro.categoria || null
    const inicio = filtro.inicio || null
    const fim = filtro.fim || null
    const termo = filtro.busca ? `%${filtro.busca.replace(/[\\%_]/g, '\\$&')}%` : null

    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: this.sqlListar,
      values: [
        categoria, categoria,
        inicio, inicio,
        fim, fim,
        termo, termo
      ],
      timeout: 10000
    })

    return linhas.map(this.mapear)
  }

  obter = async (id: number): Promise<Lancamento | null> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>(
      'SELECT id, categoria, descricao, valor, data_lancamento FROM lancamentos WHERE id = ? LIMIT 1',
      [id]
    )
    return linhas[0] ? this.mapear(linhas[0]) : null
  }

  criar = async (dados: DadosLancamento): Promise<number> => {
    const [resultado] = await this.pool.query<ResultSetHeader>(
      'INSERT INTO lancamentos (categoria, descricao, valor, data_lancamento) VALUES (?, ?, ?, ?)',
      [dados.categoria, dados.descricao, dados.valor, dados.dataLancamento]
    )
    return Number(resultado.insertId)
  }

  atualizar = async (id: number, dados: DadosLancamento): Promise<boolean> => {
    const [resultado] = await this.pool.query<ResultSetHeader>(
      'UPDATE lancamentos SET categoria = ?, descricao = ?, valor = ?, data_lancamento = ? WHERE id = ?',
      [dados.categoria, dados.descricao, dados.valor, dados.dataLancamento, id]
    )
    return resultado.affectedRows > 0
  }

  excluir = async (id: number): Promise<boolean> => {
    const [resultado] = await this.pool.query<ResultSetHeader>('DELETE FROM lancamentos WHERE id = ?', [id])
    return resultado.affectedRows > 0
  }
}

export class LancamentoIpc {
  private readonly categorias: CategoriaLancamento[] = ['aula', 'aluguel', 'outros']

  constructor(
    private readonly sessao: Sessao,
    private readonly repositorio: LancamentoRepository = new LancamentoRepository()
  ) {}

  private validarId = (entrada: unknown): number | null => {
    if (typeof entrada !== 'number' && typeof entrada !== 'string') return null
    const id = Number(entrada)
    return Number.isInteger(id) && id > 0 ? id : null
  }

  private validarData = (entrada: unknown): string | null => {
    if (typeof entrada !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entrada)) return null

    const [ano, mes, dia] = entrada.split('-').map(Number)
    if (ano < 2000 || ano > 2100 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null

    const data = new Date(Date.UTC(ano, mes - 1, dia))
    if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null

    return entrada
  }

  private validarValor = (entrada: unknown): number | null => {
    if (typeof entrada !== 'number' && typeof entrada !== 'string') return null
    if (typeof entrada === 'string' && !/^\d+([.,]\d{1,2})?$/.test(entrada.trim())) return null

    const valor = typeof entrada === 'number' ? entrada : Number(entrada.trim().replace(',', '.'))
    if (!Number.isFinite(valor) || valor <= 0 || valor > 99999999.99) return null

    return Math.round(valor * 100) / 100
  }

  private validarFiltro = (entrada: unknown): FiltroLancamento | null => {
    if (entrada === undefined) return { categoria: '', inicio: '', fim: '', busca: '' }
    if (typeof entrada !== 'object' || entrada === null) return null

    const { categoria, inicio, fim, busca } = entrada as Record<string, unknown>
    if (categoria !== undefined && categoria !== '' && !this.categorias.includes(categoria as CategoriaLancamento)) {
      return null
    }
    if ((inicio !== undefined && inicio !== '' && !this.validarData(inicio)) ||
        (fim !== undefined && fim !== '' && !this.validarData(fim))) {
      return null
    }
    if (busca !== undefined && (typeof busca !== 'string' || busca.length > 160)) return null

    const inicioValido = typeof inicio === 'string' ? this.validarData(inicio) : null
    const fimValido = typeof fim === 'string' ? this.validarData(fim) : null
    if (inicioValido && fimValido && inicioValido > fimValido) return null

    return {
      categoria: typeof categoria === 'string' ? (categoria as CategoriaLancamento | '') : '',
      inicio: inicioValido ?? '',
      fim: fimValido ?? '',
      busca: typeof busca === 'string' ? busca.trim() : ''
    }
  }

  private validar = (entrada: unknown): EntradaValidada => {
    if (typeof entrada !== 'object' || entrada === null) {
      return { valido: false, mensagem: 'Dados inválidos.' }
    }

    const { categoria, descricao, valor, dataLancamento } = entrada as Record<string, unknown>

    if (!this.categorias.includes(categoria as CategoriaLancamento)) {
      return { valido: false, mensagem: 'Selecione uma categoria válida.' }
    }

    const descricaoLimpa = typeof descricao === 'string' ? descricao.trim() : ''
    if (descricaoLimpa.length > 160) {
      return { valido: false, mensagem: 'A descrição deve ter até 160 caracteres.' }
    }

    const valorValido = this.validarValor(valor)
    if (valorValido === null) {
      return { valido: false, mensagem: 'Informe um valor entre 0,01 e 99.999.999,99.' }
    }

    const dataValida = this.validarData(dataLancamento)
    if (!dataValida) {
      return { valido: false, mensagem: 'Informe uma data válida entre 2000 e 2100.' }
    }

    return {
      valido: true,
      dados: {
        categoria: categoria as CategoriaLancamento,
        descricao: descricaoLimpa || null,
        valor: valorValido,
        dataLancamento: dataValida
      }
    }
  }

  registrar = (): void => {
    registrarCanal('lancamentos:listar', async (_evento, entrada: unknown): Promise<Lancamento[]> => {
      this.sessao.exigir(['admin'])

      const filtro = this.validarFiltro(entrada)
      if (!filtro) throw new Error('Filtro inválido')

      try {
        return await this.repositorio.listar(filtro)
      } catch (erro) {
        console.error('[lancamentos:listar]', erro)
        throw new Error(BancoErros.mensagem(erro, 'Não foi possível carregar os lançamentos.'))
      }
    })

    registrarCanal('lancamentos:obter', async (_evento, entrada: unknown): Promise<Lancamento | null> => {
      this.sessao.exigir(['admin'])

      const id = this.validarId(entrada)
      if (id === null) throw new Error('Identificador inválido')

      try {
        return await this.repositorio.obter(id)
      } catch (erro) {
        console.error('[lancamentos:obter]', erro)
        throw new Error(BancoErros.mensagem(erro, 'Não foi possível carregar o lançamento.'))
      }
    })

    registrarCanal('lancamentos:criar', async (_evento, entrada: unknown): Promise<ResultadoLancamento> => {
      this.sessao.exigir(['admin'])

      const validacao = this.validar(entrada)
      if (!validacao.valido) return { ok: false, mensagem: validacao.mensagem }

      try {
        const id = await this.repositorio.criar(validacao.dados)
        return { ok: true, id }
      } catch (erro) {
        console.error('[lancamentos:criar]', erro)
        return { ok: false, mensagem: BancoErros.mensagem(erro, 'Não foi possível cadastrar o lançamento.') }
      }
    })

    registrarCanal('lancamentos:atualizar', async (_evento, entrada: unknown): Promise<ResultadoLancamento> => {
      this.sessao.exigir(['admin'])

      if (typeof entrada !== 'object' || entrada === null) return { ok: false, mensagem: 'Dados inválidos.' }

      const { id, ...dados } = entrada as Record<string, unknown>
      const idValido = this.validarId(id)
      if (idValido === null) return { ok: false, mensagem: 'Identificador inválido.' }

      const validacao = this.validar(dados)
      if (!validacao.valido) return { ok: false, mensagem: validacao.mensagem }

      try {
        const atualizado = await this.repositorio.atualizar(idValido, validacao.dados)
        return atualizado ? { ok: true } : { ok: false, mensagem: 'Lançamento não encontrado.' }
      } catch (erro) {
        console.error('[lancamentos:atualizar]', erro)
        return { ok: false, mensagem: BancoErros.mensagem(erro, 'Não foi possível atualizar o lançamento.') }
      }
    })

    registrarCanal('lancamentos:excluir', async (_evento, entrada: unknown): Promise<ResultadoLancamento> => {
      this.sessao.exigir(['admin'])

      const id = this.validarId(entrada)
      if (id === null) return { ok: false, mensagem: 'Identificador inválido.' }

      try {
        const excluido = await this.repositorio.excluir(id)
        return excluido ? { ok: true } : { ok: false, mensagem: 'Lançamento não encontrado.' }
      } catch (erro) {
        console.error('[lancamentos:excluir]', erro)
        return { ok: false, mensagem: BancoErros.mensagem(erro, 'Não foi possível excluir o lançamento.') }
      }
    })
  }
}
