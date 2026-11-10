import { ipcMain } from 'electron'
import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { Banco } from '../Banco'
import { BancoErros } from '../BancoErros'
import { Senha } from '../autenticacao/AutenticacaoBackend'
import { Sessao } from '../Sessao'

export type Modalidade = {
  id: number
  nome: string
  descricao?: string
  ativo: boolean
}

export type FuncionarioResumo = {
  id: number
  usuarioId: number
  nome: string
  email: string
  cref: string
  modalidades: string[]
  ativo: boolean
}

export type Funcionario = {
  id: number
  usuarioId: number
  nome: string
  email: string
  cref: string
  bio?: string
  modalidades: Modalidade[]
  ativo: boolean
  criadoEm: string
  atualizadoEm: string
}

export type CriarFuncionarioInput = {
  nome: string
  email: string
  senha: string
  cref: string
  bio?: string
  modalidadeIds: number[]
}

export type AtualizarFuncionarioInput = {
  id: number
  nome?: string
  email?: string
  novaSenha?: string
  cref?: string
  bio?: string | null
  modalidadeIds?: number[]
  ativo?: boolean
}

export type CriarModalidadeInput = {
  nome: string
  descricao?: string
}

export type AtualizarModalidadeInput = {
  id: number
  nome?: string
  descricao?: string | null
  ativo?: boolean
}

export type ResultadoFuncionario = { ok: true; id?: number } | { ok: false; mensagem: string }
export type ResultadoModalidade = { ok: true; id?: number } | { ok: false; mensagem: string }

type FiltroFuncionarios = { busca?: string; ativo?: boolean }
type FiltroModalidades = { ativo?: boolean }

const TIMEOUT = 15000

const textoOuNulo = (valor: unknown): string | null => (typeof valor === 'string' && valor.trim() ? valor.trim() : null)
const dataHora = (valor: unknown): string => String(valor ?? '')

class FuncionarioValidador {
  private texto(valor: unknown, max: number): string | null {
    if (typeof valor !== 'string') return null
    const limpo = valor.trim()
    return limpo.length <= max ? limpo : null
  }

  private nome(valor: unknown): string | null {
    const nome = this.texto(valor, 120)
    return nome && nome.length >= 2 ? nome : null
  }

  private email(valor: unknown): string | null {
    const email = this.texto(valor, 160)?.toLowerCase() ?? null
    return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
  }

  private senha(valor: unknown): string | null {
    if (typeof valor !== 'string') return null
    return valor.length >= 8 && valor.length <= 128 && /[A-Za-z]/.test(valor) && /\d/.test(valor) ? valor : null
  }

  private cref(valor: unknown): string | null {
    const cref = this.texto(valor, 30)
    return cref && cref.length >= 2 ? cref.toUpperCase() : null
  }

  private bio(valor: unknown): string | undefined | null {
    if (valor === undefined || valor === null || valor === '') return undefined
    return this.texto(valor, 2000)
  }

  private modalidadeIds(valor: unknown): number[] | null {
    if (valor === undefined || valor === null) return []
    if (!Array.isArray(valor)) return null
    const ids = new Set<number>()
    for (const item of valor) {
      const id = Number(item)
      if (!Number.isInteger(id) || id <= 0) return null
      ids.add(id)
    }
    return [...ids]
  }

  validarCriacao(entrada: unknown): { ok: true; dados: CriarFuncionarioInput } | { ok: false; mensagem: string } {
    if (typeof entrada !== 'object' || entrada === null) return { ok: false, mensagem: 'Dados inválidos.' }
    const e = entrada as Record<string, unknown>
    const nome = this.nome(e.nome)
    if (!nome) return { ok: false, mensagem: 'Informe o nome com 2 a 120 caracteres.' }
    const email = this.email(e.email)
    if (!email) return { ok: false, mensagem: 'Informe um e-mail válido.' }
    const senha = this.senha(e.senha)
    if (!senha) return { ok: false, mensagem: 'A senha deve ter de 8 a 128 caracteres, com letras e números.' }
    const cref = this.cref(e.cref)
    if (!cref) return { ok: false, mensagem: 'Informe o CREF com 2 a 30 caracteres.' }
    const bio = this.bio(e.bio)
    if (bio === null) return { ok: false, mensagem: 'A biografia deve ter no máximo 2000 caracteres.' }
    const modalidadeIds = this.modalidadeIds(e.modalidadeIds)
    if (modalidadeIds === null) return { ok: false, mensagem: 'Selecione modalidades válidas.' }
    return { ok: true, dados: { nome, email, senha, cref, bio, modalidadeIds } }
  }

  validarAtualizacao(entrada: unknown): { ok: true; dados: AtualizarFuncionarioInput } | { ok: false; mensagem: string } {
    if (typeof entrada !== 'object' || entrada === null) return { ok: false, mensagem: 'Dados inválidos.' }
    const e = entrada as Record<string, unknown>
    const id = Number(e.id)
    if (!Number.isInteger(id) || id <= 0) return { ok: false, mensagem: 'Funcionário inválido.' }
    const dados: AtualizarFuncionarioInput = { id }
    if (e.nome !== undefined) {
      const nome = this.nome(e.nome)
      if (!nome) return { ok: false, mensagem: 'Nome inválido.' }
      dados.nome = nome
    }
    if (e.email !== undefined) {
      const email = this.email(e.email)
      if (!email) return { ok: false, mensagem: 'E-mail inválido.' }
      dados.email = email
    }
    if (e.novaSenha !== undefined && e.novaSenha !== '') {
      const senha = this.senha(e.novaSenha)
      if (!senha) return { ok: false, mensagem: 'A nova senha deve ter de 8 a 128 caracteres, com letras e números.' }
      dados.novaSenha = senha
    }
    if (e.cref !== undefined) {
      const cref = this.cref(e.cref)
      if (!cref) return { ok: false, mensagem: 'CREF inválido.' }
      dados.cref = cref
    }
    if (e.bio !== undefined) {
      if (e.bio === null || e.bio === '') {
        dados.bio = null
      } else {
        const bio = this.texto(e.bio, 2000)
        if (bio === null) return { ok: false, mensagem: 'A biografia deve ter no máximo 2000 caracteres.' }
        dados.bio = bio
      }
    }
    if (e.modalidadeIds !== undefined) {
      const modalidadeIds = this.modalidadeIds(e.modalidadeIds)
      if (modalidadeIds === null) return { ok: false, mensagem: 'Selecione modalidades válidas.' }
      dados.modalidadeIds = modalidadeIds
    }
    if (e.ativo !== undefined) {
      if (typeof e.ativo !== 'boolean') return { ok: false, mensagem: 'Status inválido.' }
      dados.ativo = e.ativo
    }
    return { ok: true, dados }
  }
}

class ModalidadeValidador {
  private nome(valor: unknown): string | null {
    if (typeof valor !== 'string') return null
    const nome = valor.trim()
    return nome.length >= 2 && nome.length <= 80 ? nome : null
  }

  private descricao(valor: unknown): string | undefined | null {
    if (valor === undefined || valor === null || valor === '') return undefined
    if (typeof valor !== 'string') return null
    const descricao = valor.trim()
    return descricao.length <= 255 ? descricao : null
  }

  validarCriacao(entrada: unknown): { ok: true; dados: CriarModalidadeInput } | { ok: false; mensagem: string } {
    if (typeof entrada !== 'object' || entrada === null) return { ok: false, mensagem: 'Dados inválidos.' }
    const e = entrada as Record<string, unknown>
    const nome = this.nome(e.nome)
    if (!nome) return { ok: false, mensagem: 'Informe o nome da modalidade com 2 a 80 caracteres.' }
    const descricao = this.descricao(e.descricao)
    if (descricao === null) return { ok: false, mensagem: 'A descrição deve ter no máximo 255 caracteres.' }
    return { ok: true, dados: { nome, descricao } }
  }

  validarAtualizacao(entrada: unknown): { ok: true; dados: AtualizarModalidadeInput } | { ok: false; mensagem: string } {
    if (typeof entrada !== 'object' || entrada === null) return { ok: false, mensagem: 'Dados inválidos.' }
    const e = entrada as Record<string, unknown>
    const id = Number(e.id)
    if (!Number.isInteger(id) || id <= 0) return { ok: false, mensagem: 'Modalidade inválida.' }
    const dados: AtualizarModalidadeInput = { id }
    if (e.nome !== undefined) {
      const nome = this.nome(e.nome)
      if (!nome) return { ok: false, mensagem: 'Nome da modalidade inválido.' }
      dados.nome = nome
    }
    if (e.descricao !== undefined) {
      if (e.descricao === null || e.descricao === '') {
        dados.descricao = null
      } else {
        const descricao = this.descricao(e.descricao)
        if (descricao === null) return { ok: false, mensagem: 'A descrição deve ter no máximo 255 caracteres.' }
        dados.descricao = descricao
      }
    }
    if (e.ativo !== undefined) {
      if (typeof e.ativo !== 'boolean') return { ok: false, mensagem: 'Status inválido.' }
      dados.ativo = e.ativo
    }
    return { ok: true, dados }
  }
}

class FuncionarioRepository {
  private readonly pool = Banco.pool

  private readonly sqlListar = `
    SELECT i.id, i.usuario_id, u.nome, u.email, i.cref, i.ativo,
           GROUP_CONCAT(m.nome ORDER BY m.nome SEPARATOR '||') AS modalidades
    FROM instrutores i
    INNER JOIN usuarios u ON u.id = i.usuario_id
    LEFT JOIN instrutores_modalidades im ON im.instrutor_id = i.id
    LEFT JOIN modalidades m ON m.id = im.modalidade_id
    WHERE (? = '' OR u.nome LIKE ? OR u.email LIKE ? OR i.cref LIKE ?)
      AND (? IS NULL OR i.ativo = ?)
    GROUP BY i.id, i.usuario_id, u.nome, u.email, i.cref, i.ativo
    ORDER BY u.nome ASC`

  private readonly sqlObter = `
    SELECT i.id, i.usuario_id, u.nome, u.email, i.cref, i.bio, i.ativo, i.criado_em, i.atualizado_em
    FROM instrutores i
    INNER JOIN usuarios u ON u.id = i.usuario_id
    WHERE i.id = ?
    LIMIT 1`

  private readonly sqlModalidadesDoFuncionario = `
    SELECT m.id, m.nome, m.descricao, m.ativo
    FROM modalidades m
    INNER JOIN instrutores_modalidades im ON im.modalidade_id = m.id
    WHERE im.instrutor_id = ?
    ORDER BY m.nome ASC`

  private validarModalidades = async (conexao: PoolConnection, ids: number[]): Promise<void> => {
    if (!ids.length) return
    const placeholders = ids.map(() => '?').join(', ')
    const [linhas] = await conexao.query<RowDataPacket[]>({
      sql: `SELECT id FROM modalidades WHERE id IN (${placeholders})`,
      values: ids,
      timeout: TIMEOUT
    })
    if (linhas.length !== ids.length) throw new Error('Uma das modalidades selecionadas não existe.')
  }

  private inserirModalidades = async (conexao: PoolConnection, instrutorId: number, ids: number[]): Promise<void> => {
    if (!ids.length) return
    await conexao.query({
      sql: 'INSERT INTO instrutores_modalidades (instrutor_id, modalidade_id) VALUES ?',
      values: [ids.map((id) => [instrutorId, id])],
      timeout: TIMEOUT
    })
  }

  listar = async (filtro: FiltroFuncionarios): Promise<FuncionarioResumo[]> => {
    const busca = typeof filtro.busca === 'string' ? filtro.busca.trim() : ''
    const termo = busca ? `%${busca.replace(/[\\%_]/g, '\\$&')}%` : ''
    const ativo = typeof filtro.ativo === 'boolean' ? (filtro.ativo ? 1 : 0) : null
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: this.sqlListar,
      values: [termo, termo, termo, termo, ativo, ativo],
      timeout: TIMEOUT
    })
    return linhas.map((linha) => ({
      id: Number(linha.id),
      usuarioId: Number(linha.usuario_id),
      nome: String(linha.nome),
      email: String(linha.email),
      cref: String(linha.cref ?? ''),
      modalidades: linha.modalidades ? String(linha.modalidades).split('||').filter(Boolean) : [],
      ativo: Boolean(linha.ativo)
    }))
  }

  obter = async (id: number): Promise<Funcionario | null> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: this.sqlObter,
      values: [id],
      timeout: TIMEOUT
    })
    if (!linhas.length) return null
    const linha = linhas[0]
    const [modalidades] = await this.pool.query<RowDataPacket[]>({
      sql: this.sqlModalidadesDoFuncionario,
      values: [id],
      timeout: TIMEOUT
    })
    return {
      id: Number(linha.id),
      usuarioId: Number(linha.usuario_id),
      nome: String(linha.nome),
      email: String(linha.email),
      cref: String(linha.cref ?? ''),
      bio: linha.bio ? String(linha.bio) : undefined,
      modalidades: modalidades.map((m) => ({
        id: Number(m.id),
        nome: String(m.nome),
        descricao: m.descricao ? String(m.descricao) : undefined,
        ativo: Boolean(m.ativo)
      })),
      ativo: Boolean(linha.ativo),
      criadoEm: dataHora(linha.criado_em),
      atualizadoEm: dataHora(linha.atualizado_em)
    }
  }

  criar = async (dados: CriarFuncionarioInput, senhaHash: string): Promise<number> => {
    const conexao = await this.pool.getConnection()
    try {
      await conexao.beginTransaction()
      await this.validarModalidades(conexao, dados.modalidadeIds)

      const [usuario] = await conexao.query<ResultSetHeader>({
        sql: 'INSERT INTO usuarios (nome, email, senha_hash, perfil, ativo) VALUES (?, ?, ?, ?, 1)',
        values: [dados.nome, dados.email, senhaHash, 'instrutor'],
        timeout: TIMEOUT
      })
      const usuarioId = Number(usuario.insertId)

      const [instrutor] = await conexao.query<ResultSetHeader>({
        sql: `INSERT INTO instrutores (usuario_id, cref, bio, ativo, criado_em, atualizado_em)
              VALUES (?, ?, ?, 1, NOW(), NOW())`,
        values: [usuarioId, dados.cref, textoOuNulo(dados.bio)],
        timeout: TIMEOUT
      })
      const instrutorId = Number(instrutor.insertId)

      await this.inserirModalidades(conexao, instrutorId, dados.modalidadeIds)
      await conexao.commit()
      return instrutorId
    } catch (erro) {
      await conexao.rollback().catch(() => undefined)
      throw erro
    } finally {
      conexao.release()
    }
  }

  atualizar = async (dados: AtualizarFuncionarioInput, senhaHash?: string): Promise<boolean> => {
    const conexao = await this.pool.getConnection()
    try {
      await conexao.beginTransaction()
      const [linhas] = await conexao.query<RowDataPacket[]>({
        sql: 'SELECT usuario_id FROM instrutores WHERE id = ? LIMIT 1',
        values: [dados.id],
        timeout: TIMEOUT
      })
      if (!linhas.length) {
        await conexao.rollback()
        return false
      }
      const usuarioId = Number(linhas[0].usuario_id)

      const camposUsuario: string[] = []
      const valoresUsuario: unknown[] = []
      if (dados.nome !== undefined) { camposUsuario.push('nome = ?'); valoresUsuario.push(dados.nome) }
      if (dados.email !== undefined) { camposUsuario.push('email = ?'); valoresUsuario.push(dados.email) }
      if (dados.ativo !== undefined) { camposUsuario.push('ativo = ?'); valoresUsuario.push(dados.ativo ? 1 : 0) }
      if (senhaHash) { camposUsuario.push('senha_hash = ?'); valoresUsuario.push(senhaHash) }
      if (camposUsuario.length) {
        await conexao.query({
          sql: `UPDATE usuarios SET ${camposUsuario.join(', ')} WHERE id = ?`,
          values: [...valoresUsuario, usuarioId],
          timeout: TIMEOUT
        })
      }

      const camposInstrutor: string[] = []
      const valoresInstrutor: unknown[] = []
      if (dados.cref !== undefined) { camposInstrutor.push('cref = ?'); valoresInstrutor.push(dados.cref) }
      if (dados.bio !== undefined) { camposInstrutor.push('bio = ?'); valoresInstrutor.push(dados.bio) }
      if (dados.ativo !== undefined) { camposInstrutor.push('ativo = ?'); valoresInstrutor.push(dados.ativo ? 1 : 0) }
      if (camposInstrutor.length) {
        camposInstrutor.push('atualizado_em = NOW()')
        await conexao.query({
          sql: `UPDATE instrutores SET ${camposInstrutor.join(', ')} WHERE id = ?`,
          values: [...valoresInstrutor, dados.id],
          timeout: TIMEOUT
        })
      }

      if (dados.modalidadeIds !== undefined) {
        await this.validarModalidades(conexao, dados.modalidadeIds)
        await conexao.query({
          sql: 'DELETE FROM instrutores_modalidades WHERE instrutor_id = ?',
          values: [dados.id],
          timeout: TIMEOUT
        })
        await this.inserirModalidades(conexao, dados.id, dados.modalidadeIds)
      }

      await conexao.commit()
      return true
    } catch (erro) {
      await conexao.rollback().catch(() => undefined)
      throw erro
    } finally {
      conexao.release()
    }
  }

  excluir = async (id: number): Promise<boolean> => {
    const conexao = await this.pool.getConnection()
    try {
      await conexao.beginTransaction()
      const [linhas] = await conexao.query<RowDataPacket[]>({
        sql: 'SELECT usuario_id FROM instrutores WHERE id = ? LIMIT 1',
        values: [id],
        timeout: TIMEOUT
      })
      if (!linhas.length) {
        await conexao.rollback()
        return false
      }
      const usuarioId = Number(linhas[0].usuario_id)

      await conexao.query({
        sql: 'UPDATE instrutores SET ativo = 0, atualizado_em = NOW() WHERE id = ?',
        values: [id],
        timeout: TIMEOUT
      })
      await conexao.query({
        sql: 'UPDATE usuarios SET ativo = 0 WHERE id = ?',
        values: [usuarioId],
        timeout: TIMEOUT
      })
      await conexao.commit()
      return true
    } catch (erro) {
      await conexao.rollback().catch(() => undefined)
      throw erro
    } finally {
      conexao.release()
    }
  }
}

class ModalidadeRepository {
  private readonly pool = Banco.pool

  listar = async (filtro: FiltroModalidades): Promise<Modalidade[]> => {
    const ativo = typeof filtro.ativo === 'boolean' ? (filtro.ativo ? 1 : 0) : null
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT id, nome, descricao, ativo
            FROM modalidades
            WHERE (? IS NULL OR ativo = ?)
            ORDER BY nome ASC`,
      values: [ativo, ativo],
      timeout: TIMEOUT
    })
    return linhas.map((linha) => ({
      id: Number(linha.id),
      nome: String(linha.nome),
      descricao: linha.descricao ? String(linha.descricao) : undefined,
      ativo: Boolean(linha.ativo)
    }))
  }

  criar = async (dados: CriarModalidadeInput): Promise<number> => {
    const [resultado] = await this.pool.query<ResultSetHeader>({
      sql: 'INSERT INTO modalidades (nome, descricao, ativo, criado_em, atualizado_em) VALUES (?, ?, 1, NOW(), NOW())',
      values: [dados.nome, textoOuNulo(dados.descricao)],
      timeout: TIMEOUT
    })
    return Number(resultado.insertId)
  }

  atualizar = async (dados: AtualizarModalidadeInput): Promise<boolean> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: 'SELECT id FROM modalidades WHERE id = ? LIMIT 1',
      values: [dados.id],
      timeout: TIMEOUT
    })
    if (!linhas.length) return false

    const campos: string[] = []
    const valores: unknown[] = []
    if (dados.nome !== undefined) { campos.push('nome = ?'); valores.push(dados.nome) }
    if (dados.descricao !== undefined) { campos.push('descricao = ?'); valores.push(dados.descricao) }
    if (dados.ativo !== undefined) { campos.push('ativo = ?'); valores.push(dados.ativo ? 1 : 0) }
    if (!campos.length) return true

    campos.push('atualizado_em = NOW()')
    await this.pool.query({
      sql: `UPDATE modalidades SET ${campos.join(', ')} WHERE id = ?`,
      values: [...valores, dados.id],
      timeout: TIMEOUT
    })
    return true
  }

  excluir = async (id: number): Promise<boolean> => {
    const [resultado] = await this.pool.query<ResultSetHeader>({
      sql: 'UPDATE modalidades SET ativo = 0, atualizado_em = NOW() WHERE id = ?',
      values: [id],
      timeout: TIMEOUT
    })
    return resultado.affectedRows > 0
  }
}

export class FuncionarioIpc {
  private readonly validador = new FuncionarioValidador()

  constructor(
    private readonly sessao: Sessao,
    private readonly repositorio: FuncionarioRepository = new FuncionarioRepository(),
    private readonly senha: Senha = new Senha()
  ) {}

  private idValido(valor: unknown): number | null {
    const id = typeof valor === 'number' ? valor : typeof valor === 'string' ? Number(valor) : NaN
    return Number.isInteger(id) && id > 0 ? id : null
  }

  private filtroValido(entrada: unknown): FiltroFuncionarios {
    if (typeof entrada !== 'object' || entrada === null) return {}
    const f = entrada as Record<string, unknown>
    const filtro: FiltroFuncionarios = {}
    if (typeof f.busca === 'string') filtro.busca = f.busca.slice(0, 120)
    if (typeof f.ativo === 'boolean') filtro.ativo = f.ativo
    return filtro
  }

  registrar = (): void => {
    ipcMain.handle('instrutores:listar', async (_evento, entrada: unknown): Promise<FuncionarioResumo[]> => {
      this.sessao.exigir(['admin', 'instrutor'])
      return this.repositorio.listar(this.filtroValido(entrada))
    })

    ipcMain.handle('instrutores:obter', async (_evento, entrada: unknown): Promise<Funcionario | null> => {
      this.sessao.exigir(['admin', 'instrutor'])
      const id = this.idValido(entrada)
      if (id === null) throw new Error('Funcionário inválido.')
      return this.repositorio.obter(id)
    })

    ipcMain.handle('instrutores:criar', async (_evento, entrada: unknown): Promise<ResultadoFuncionario> => {
      this.sessao.exigir(['admin'])
      const v = this.validador.validarCriacao(entrada)
      if (!v.ok) return v
      try {
        const hash = await this.senha.gerar(v.dados.senha)
        const id = await this.repositorio.criar(v.dados, hash)
        return { ok: true, id }
      } catch (erro) {
        console.error('[instrutores:criar]', erro)
        return { ok: false, mensagem: BancoErros.mensagem(erro, 'Não foi possível cadastrar o funcionário.') }
      }
    })

    ipcMain.handle('instrutores:atualizar', async (_evento, entrada: unknown): Promise<ResultadoFuncionario> => {
      this.sessao.exigir(['admin'])
      const v = this.validador.validarAtualizacao(entrada)
      if (!v.ok) return v
      try {
        const hash = v.dados.novaSenha ? await this.senha.gerar(v.dados.novaSenha) : undefined
        const ok = await this.repositorio.atualizar(v.dados, hash)
        if (!ok) return { ok: false, mensagem: 'Funcionário não encontrado.' }
        return { ok: true, id: v.dados.id }
      } catch (erro) {
        console.error('[instrutores:atualizar]', erro)
        return { ok: false, mensagem: BancoErros.mensagem(erro, 'Não foi possível atualizar o funcionário.') }
      }
    })

    ipcMain.handle('instrutores:excluir', async (_evento, entrada: unknown): Promise<ResultadoFuncionario> => {
      this.sessao.exigir(['admin'])
      const id = this.idValido(entrada)
      if (id === null) return { ok: false, mensagem: 'Funcionário inválido.' }
      try {
        const ok = await this.repositorio.excluir(id)
        if (!ok) return { ok: false, mensagem: 'Funcionário não encontrado.' }
        return { ok: true, id }
      } catch (erro) {
        console.error('[instrutores:excluir]', erro)
        return { ok: false, mensagem: BancoErros.mensagem(erro, 'Não foi possível desativar o funcionário.') }
      }
    })
  }
}

export class ModalidadeIpc {
  private readonly validador = new ModalidadeValidador()

  constructor(
    private readonly sessao: Sessao,
    private readonly repositorio: ModalidadeRepository = new ModalidadeRepository()
  ) {}

  private idValido(valor: unknown): number | null {
    const id = typeof valor === 'number' ? valor : typeof valor === 'string' ? Number(valor) : NaN
    return Number.isInteger(id) && id > 0 ? id : null
  }

  private filtroValido(entrada: unknown): FiltroModalidades {
    if (typeof entrada !== 'object' || entrada === null) return {}
    const f = entrada as Record<string, unknown>
    return typeof f.ativo === 'boolean' ? { ativo: f.ativo } : {}
  }

  registrar = (): void => {
    ipcMain.handle('modalidades:listar', async (_evento, entrada: unknown): Promise<Modalidade[]> => {
      this.sessao.exigir(['admin', 'instrutor', 'aluno'])
      return this.repositorio.listar(this.filtroValido(entrada))
    })

    ipcMain.handle('modalidades:criar', async (_evento, entrada: unknown): Promise<ResultadoModalidade> => {
      this.sessao.exigir(['admin'])
      const v = this.validador.validarCriacao(entrada)
      if (!v.ok) return v
      try {
        const id = await this.repositorio.criar(v.dados)
        return { ok: true, id }
      } catch (erro) {
        console.error('[modalidades:criar]', erro)
        return { ok: false, mensagem: BancoErros.mensagem(erro, 'Não foi possível cadastrar a modalidade.') }
      }
    })

    ipcMain.handle('modalidades:atualizar', async (_evento, entrada: unknown): Promise<ResultadoModalidade> => {
      this.sessao.exigir(['admin'])
      const v = this.validador.validarAtualizacao(entrada)
      if (!v.ok) return v
      try {
        const ok = await this.repositorio.atualizar(v.dados)
        if (!ok) return { ok: false, mensagem: 'Modalidade não encontrada.' }
        return { ok: true, id: v.dados.id }
      } catch (erro) {
        console.error('[modalidades:atualizar]', erro)
        return { ok: false, mensagem: BancoErros.mensagem(erro, 'Não foi possível atualizar a modalidade.') }
      }
    })

    ipcMain.handle('modalidades:excluir', async (_evento, entrada: unknown): Promise<ResultadoModalidade> => {
      this.sessao.exigir(['admin'])
      const id = this.idValido(entrada)
      if (id === null) return { ok: false, mensagem: 'Modalidade inválida.' }
      try {
        const ok = await this.repositorio.excluir(id)
        if (!ok) return { ok: false, mensagem: 'Modalidade não encontrada.' }
        return { ok: true, id }
      } catch (erro) {
        console.error('[modalidades:excluir]', erro)
        return { ok: false, mensagem: BancoErros.mensagem(erro, 'Não foi possível desativar a modalidade.') }
      }
    })
  }
}
