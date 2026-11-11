import { ipcMain } from 'electron'
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { Banco } from '../Banco'
import { BancoErros } from '../BancoErros'
import { Sessao } from '../Sessao'

export type TipoVisitante = 'experimental' | 'visitante'
export type StatusVisitante = 'agendado' | 'compareceu' | 'faltou' | 'convertido'

export type Visitante = {
  id: number
  nome: string
  telefone: string
  email?: string
  aulaId?: number
  aulaTitulo?: string
  aulaDataHoraInicio?: string
  dataVisita: string
  tipo: TipoVisitante
  status: StatusVisitante
  observacoes?: string
  criadoEm: string
  atualizadoEm: string
}

export type CriarVisitanteInput = {
  nome: string
  telefone: string
  email?: string
  aulaId?: number
  dataVisita: string
  tipo: TipoVisitante
  observacoes?: string
}

export type AtualizarVisitanteInput = {
  id: number
  nome?: string
  telefone?: string
  email?: string | null
  aulaId?: number | null
  dataVisita?: string
  tipo?: TipoVisitante
  status?: StatusVisitante
  observacoes?: string | null
}

export type FiltroVisitantes = {
  data?: string
  tipo?: TipoVisitante
  status?: StatusVisitante
}

export type ResultadoVisitante = { ok: true; id?: number } | { ok: false; mensagem: string }

const TIMEOUT = 15000
const TIPOS: TipoVisitante[] = ['experimental', 'visitante']
const STATUS: StatusVisitante[] = ['agendado', 'compareceu', 'faltou', 'convertido']

class ErroVisitante extends Error {}

const dataStr = (valor: unknown): string => String(valor ?? '').slice(0, 10)

class VisitanteValidador {
  private texto(valor: unknown, max: number): string | null {
    if (typeof valor !== 'string') return null
    const limpo = valor.trim()
    return limpo.length <= max ? limpo : null
  }

  private nome(valor: unknown): string | null {
    const nome = this.texto(valor, 120)
    return nome && nome.length >= 2 ? nome : null
  }

  private telefone(valor: unknown): string | null {
    const telefone = this.texto(valor, 20)
    return telefone && telefone.replace(/\D/g, '').length >= 8 ? telefone : null
  }

  private email(valor: unknown): string | null {
    const email = this.texto(valor, 160)?.toLowerCase() ?? null
    return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
  }

  private emailOpcional(valor: unknown): string | undefined | null {
    if (valor === undefined || valor === null || valor === '') return undefined
    return this.email(valor)
  }

  private id(valor: unknown): number | null {
    if (valor === undefined || valor === null || valor === '') return null
    const id = Number(valor)
    return Number.isInteger(id) && id > 0 ? id : null
  }

  private data(valor: unknown): string | null {
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

  private tipo(valor: unknown): TipoVisitante | null {
    return typeof valor === 'string' && TIPOS.includes(valor as TipoVisitante) ? (valor as TipoVisitante) : null
  }

  private status(valor: unknown): StatusVisitante | null {
    return typeof valor === 'string' && STATUS.includes(valor as StatusVisitante) ? (valor as StatusVisitante) : null
  }

  private observacoes(valor: unknown): string | undefined | null {
    if (valor === undefined || valor === null || valor === '') return undefined
    return this.texto(valor, 255)
  }

  validarCriacao(entrada: unknown): { ok: true; dados: CriarVisitanteInput } | { ok: false; mensagem: string } {
    if (typeof entrada !== 'object' || entrada === null) return { ok: false, mensagem: 'Dados inválidos.' }
    const e = entrada as Record<string, unknown>
    const nome = this.nome(e.nome)
    if (!nome) return { ok: false, mensagem: 'Informe o nome do visitante com 2 a 120 caracteres.' }
    const telefone = this.telefone(e.telefone)
    if (!telefone) return { ok: false, mensagem: 'Informe um telefone válido.' }
    const email = this.emailOpcional(e.email)
    if (email === null) return { ok: false, mensagem: 'Informe um e-mail válido ou deixe o campo vazio.' }
    const dataVisita = this.data(e.dataVisita)
    if (!dataVisita) return { ok: false, mensagem: 'Informe uma data de visita válida.' }
    const tipo = this.tipo(e.tipo)
    if (!tipo) return { ok: false, mensagem: 'Selecione o tipo de visita.' }
    const observacoes = this.observacoes(e.observacoes)
    if (observacoes === null) return { ok: false, mensagem: 'As observações devem ter no máximo 255 caracteres.' }
    let aulaId: number | undefined
    if (e.aulaId !== undefined && e.aulaId !== null && e.aulaId !== '') {
      const id = this.id(e.aulaId)
      if (id === null) return { ok: false, mensagem: 'Selecione uma aula válida.' }
      aulaId = id
    }
    return { ok: true, dados: { nome, telefone, email, aulaId, dataVisita, tipo, observacoes } }
  }

  validarAtualizacao(entrada: unknown): { ok: true; dados: AtualizarVisitanteInput } | { ok: false; mensagem: string } {
    if (typeof entrada !== 'object' || entrada === null) return { ok: false, mensagem: 'Dados inválidos.' }
    const e = entrada as Record<string, unknown>
    const id = this.id(e.id)
    if (id === null) return { ok: false, mensagem: 'Visitante inválido.' }
    const dados: AtualizarVisitanteInput = { id }
    if (e.nome !== undefined) {
      const nome = this.nome(e.nome)
      if (!nome) return { ok: false, mensagem: 'Nome inválido.' }
      dados.nome = nome
    }
    if (e.telefone !== undefined) {
      const telefone = this.telefone(e.telefone)
      if (!telefone) return { ok: false, mensagem: 'Telefone inválido.' }
      dados.telefone = telefone
    }
    if (e.email !== undefined) {
      if (e.email === null || e.email === '') {
        dados.email = null
      } else {
        const email = this.email(e.email)
        if (!email) return { ok: false, mensagem: 'E-mail inválido.' }
        dados.email = email
      }
    }
    if (e.aulaId !== undefined) {
      if (e.aulaId === null || e.aulaId === '') {
        dados.aulaId = null
      } else {
        const aulaId = this.id(e.aulaId)
        if (aulaId === null) return { ok: false, mensagem: 'Aula inválida.' }
        dados.aulaId = aulaId
      }
    }
    if (e.dataVisita !== undefined) {
      const dataVisita = this.data(e.dataVisita)
      if (!dataVisita) return { ok: false, mensagem: 'Data de visita inválida.' }
      dados.dataVisita = dataVisita
    }
    if (e.tipo !== undefined) {
      const tipo = this.tipo(e.tipo)
      if (!tipo) return { ok: false, mensagem: 'Tipo de visita inválido.' }
      dados.tipo = tipo
    }
    if (e.status !== undefined) {
      const status = this.status(e.status)
      if (!status) return { ok: false, mensagem: 'Status inválido.' }
      dados.status = status
    }
    if (e.observacoes !== undefined) {
      if (e.observacoes === null || e.observacoes === '') {
        dados.observacoes = null
      } else {
        const observacoes = this.texto(e.observacoes, 255)
        if (observacoes === null) return { ok: false, mensagem: 'Observações inválidas.' }
        dados.observacoes = observacoes
      }
    }
    return { ok: true, dados }
  }

  filtro(entrada: unknown): FiltroVisitantes {
    if (typeof entrada !== 'object' || entrada === null) return {}
    const e = entrada as Record<string, unknown>
    const filtro: FiltroVisitantes = {}
    if (typeof e.data === 'string') {
      const data = this.data(e.data)
      if (data) filtro.data = data
    }
    if (typeof e.tipo === 'string') {
      const tipo = this.tipo(e.tipo)
      if (tipo) filtro.tipo = tipo
    }
    if (typeof e.status === 'string') {
      const status = this.status(e.status)
      if (status) filtro.status = status
    }
    return filtro
  }
}

const mapear = (linha: RowDataPacket): Visitante => ({
  id: Number(linha.id),
  nome: String(linha.nome ?? ''),
  telefone: String(linha.telefone ?? ''),
  email: linha.email ? String(linha.email) : undefined,
  aulaId: linha.aula_id === null || linha.aula_id === undefined ? undefined : Number(linha.aula_id),
  aulaTitulo: linha.aula_titulo ? String(linha.aula_titulo) : undefined,
  aulaDataHoraInicio: linha.aula_data_hora_inicio ? String(linha.aula_data_hora_inicio) : undefined,
  dataVisita: dataStr(linha.data_visita),
  tipo: String(linha.tipo) as TipoVisitante,
  status: String(linha.status) as StatusVisitante,
  observacoes: linha.observacoes ? String(linha.observacoes) : undefined,
  criadoEm: String(linha.criado_em ?? ''),
  atualizadoEm: String(linha.atualizado_em ?? '')
})

class VisitanteRepository {
  private readonly pool = Banco.pool

  private readonly campos = `
    v.id, v.nome, v.telefone, v.email, v.aula_id,
    a.titulo AS aula_titulo, a.data_hora_inicio AS aula_data_hora_inicio,
    v.data_visita, v.tipo, v.status, v.observacoes, v.criado_em, v.atualizado_em`

  listar = async (filtro: FiltroVisitantes): Promise<Visitante[]> => {
    const condicoes: string[] = []
    const valores: unknown[] = []
    if (filtro.data) {
      condicoes.push('v.data_visita = ?')
      valores.push(filtro.data)
    }
    if (filtro.tipo) {
      condicoes.push('v.tipo = ?')
      valores.push(filtro.tipo)
    }
    if (filtro.status) {
      condicoes.push('v.status = ?')
      valores.push(filtro.status)
    }
    const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : ''

    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT ${this.campos}
            FROM visitantes v
            LEFT JOIN aulas a ON a.id = v.aula_id
            ${where}
            ORDER BY v.data_visita ASC, v.nome ASC`,
      values: valores,
      timeout: TIMEOUT
    })
    return linhas.map(mapear)
  }

  obter = async (id: number): Promise<Visitante | null> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT ${this.campos}
            FROM visitantes v
            LEFT JOIN aulas a ON a.id = v.aula_id
            WHERE v.id = ?
            LIMIT 1`,
      values: [id],
      timeout: TIMEOUT
    })
    return linhas.length ? mapear(linhas[0]) : null
  }

  private validarAula = async (aulaId: number | null): Promise<void> => {
    if (aulaId === null) return
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: 'SELECT id FROM aulas WHERE id = ? LIMIT 1',
      values: [aulaId],
      timeout: TIMEOUT
    })
    if (!linhas.length) throw new ErroVisitante('A aula selecionada não existe mais. Escolha outra aula.')
  }

  criar = async (dados: CriarVisitanteInput): Promise<number> => {
    await this.validarAula(dados.aulaId ?? null)
    const [resultado] = await this.pool.query<ResultSetHeader>({
      sql: `INSERT INTO visitantes
        (nome, telefone, email, aula_id, data_visita, tipo, status, observacoes, criado_em, atualizado_em)
        VALUES (?, ?, ?, ?, ?, ?, 'agendado', ?, NOW(), NOW())`,
      values: [
        dados.nome,
        dados.telefone,
        dados.email ?? null,
        dados.aulaId ?? null,
        dados.dataVisita,
        dados.tipo,
        dados.observacoes ?? null
      ],
      timeout: TIMEOUT
    })
    return Number(resultado.insertId)
  }

  atualizar = async (dados: AtualizarVisitanteInput): Promise<boolean> => {
    const [existentes] = await this.pool.query<RowDataPacket[]>({
      sql: 'SELECT id FROM visitantes WHERE id = ? LIMIT 1',
      values: [dados.id],
      timeout: TIMEOUT
    })
    if (!existentes.length) return false

    if (dados.aulaId !== undefined) await this.validarAula(dados.aulaId)

    const campos: string[] = []
    const valores: unknown[] = []
    const set = (coluna: string, valor: unknown): void => {
      campos.push(`${coluna} = ?`)
      valores.push(valor)
    }
    if (dados.nome !== undefined) set('nome', dados.nome)
    if (dados.telefone !== undefined) set('telefone', dados.telefone)
    if (dados.email !== undefined) set('email', dados.email)
    if (dados.aulaId !== undefined) set('aula_id', dados.aulaId)
    if (dados.dataVisita !== undefined) set('data_visita', dados.dataVisita)
    if (dados.tipo !== undefined) set('tipo', dados.tipo)
    if (dados.status !== undefined) set('status', dados.status)
    if (dados.observacoes !== undefined) set('observacoes', dados.observacoes)

    if (!campos.length) return true
    campos.push('atualizado_em = NOW()')
    await this.pool.query({
      sql: `UPDATE visitantes SET ${campos.join(', ')} WHERE id = ?`,
      values: [...valores, dados.id],
      timeout: TIMEOUT
    })
    return true
  }

  excluir = async (id: number): Promise<boolean> => {
    const [resultado] = await this.pool.query<ResultSetHeader>({
      sql: 'DELETE FROM visitantes WHERE id = ?',
      values: [id],
      timeout: TIMEOUT
    })
    return resultado.affectedRows > 0
  }
}

export class VisitanteIpc {
  private readonly validador = new VisitanteValidador()

  constructor(
    private readonly sessao: Sessao,
    private readonly repositorio: VisitanteRepository = new VisitanteRepository()
  ) {}

  private idValido(valor: unknown): number | null {
    const id = typeof valor === 'number' ? valor : typeof valor === 'string' ? Number(valor) : NaN
    return Number.isInteger(id) && id > 0 ? id : null
  }

  private erro = (contexto: string, erro: unknown, padrao: string): ResultadoVisitante => {
    if (erro instanceof ErroVisitante) return { ok: false, mensagem: erro.message }
    console.error(`[${contexto}]`, erro)
    return { ok: false, mensagem: BancoErros.mensagem(erro, padrao) }
  }

  registrar = (): void => {
    ipcMain.handle('visitantes:listar', async (_evento, entrada: unknown): Promise<Visitante[]> => {
      this.sessao.exigir(['admin', 'instrutor'])
      return this.repositorio.listar(this.validador.filtro(entrada))
    })

    ipcMain.handle('visitantes:obter', async (_evento, entrada: unknown): Promise<Visitante | null> => {
      this.sessao.exigir(['admin', 'instrutor'])
      const id = this.idValido(entrada)
      if (id === null) throw new Error('Visitante inválido.')
      return this.repositorio.obter(id)
    })

    ipcMain.handle('visitantes:criar', async (_evento, entrada: unknown): Promise<ResultadoVisitante> => {
      this.sessao.exigir(['admin', 'instrutor'])
      const v = this.validador.validarCriacao(entrada)
      if (!v.ok) return v
      try {
        const id = await this.repositorio.criar(v.dados)
        return { ok: true, id }
      } catch (erro) {
        return this.erro('visitantes:criar', erro, 'Não foi possível cadastrar o visitante.')
      }
    })

    ipcMain.handle('visitantes:atualizar', async (_evento, entrada: unknown): Promise<ResultadoVisitante> => {
      this.sessao.exigir(['admin', 'instrutor'])
      const v = this.validador.validarAtualizacao(entrada)
      if (!v.ok) return v
      try {
        const ok = await this.repositorio.atualizar(v.dados)
        if (!ok) return { ok: false, mensagem: 'Visitante não encontrado.' }
        return { ok: true, id: v.dados.id }
      } catch (erro) {
        return this.erro('visitantes:atualizar', erro, 'Não foi possível atualizar o visitante.')
      }
    })

    ipcMain.handle('visitantes:excluir', async (_evento, entrada: unknown): Promise<ResultadoVisitante> => {
      this.sessao.exigir(['admin'])
      const id = this.idValido(entrada)
      if (id === null) return { ok: false, mensagem: 'Visitante inválido.' }
      try {
        const ok = await this.repositorio.excluir(id)
        if (!ok) return { ok: false, mensagem: 'Visitante não encontrado.' }
        return { ok: true, id }
      } catch (erro) {
        return this.erro('visitantes:excluir', erro, 'Não foi possível excluir o visitante.')
      }
    })
  }
}
