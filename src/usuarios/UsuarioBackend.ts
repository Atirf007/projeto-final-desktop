import { registrarCanal } from '../SegurancaIpc'
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { Banco } from '../Banco'
import { BancoErros } from '../BancoErros'
import { Senha } from '../autenticacao/AutenticacaoBackend'
import { Perfil, Sessao } from '../Sessao'

export type UsuarioLista = {
  id: number
  nome: string
  email: string
  perfil: Perfil
  ativo: boolean
  ultimoLogin: string | null
  criadoEm: string
}

export type ResultadoCriacao = { ok: true; id: number; aviso?: string } | { ok: false; mensagem: string }

type NovoUsuario = { nome: string; email: string; senha: string; perfil: Perfil }

type AtualizarUsuario = {
  id: number
  nome?: string
  email?: string
  perfil?: Perfil
  ativo?: boolean
  senhaHash?: string
}

type EntradaValidada = { valido: true; dados: NovoUsuario } | { valido: false; mensagem: string }

type EntradaAtualizacao = { valido: true; dados: AtualizarUsuario } | { valido: false; mensagem: string }

const TIMEOUT = 15000

export class UsuarioRepository {
  private readonly pool = Banco.pool

  private readonly sqlCriar = 'INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (?, ?, ?, ?)'

  private readonly sqlListar = `
    SELECT id, nome, email, perfil, ativo, ultimo_login, criado_em
    FROM usuarios
    WHERE (? = '' OR nome LIKE ? OR email LIKE ?)
    ORDER BY nome ASC`

  listar = async (busca: string): Promise<UsuarioLista[]> => {
    const termo = busca ? `%${busca.replace(/[\\%_]/g, '\\$&')}%` : ''

    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: this.sqlListar,
      values: [termo, termo, termo],
      timeout: 10000
    })

    return linhas.map((linha) => ({
      id: Number(linha.id),
      nome: String(linha.nome),
      email: String(linha.email),
      perfil: linha.perfil as Perfil,
      ativo: Boolean(linha.ativo),
      ultimoLogin: linha.ultimo_login ?? null,
      criadoEm: String(linha.criado_em)
    }))
  }

  criar = async (nome: string, email: string, senhaHash: string, perfil: Perfil): Promise<number> => {
    const [resultado] = await this.pool.query<ResultSetHeader>({
      sql: this.sqlCriar,
      values: [nome, email, senhaHash, perfil],
      timeout: TIMEOUT
    })
    return Number(resultado.insertId)
  }

  obter = async (id: number): Promise<UsuarioLista | null> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT id, nome, email, perfil, ativo, ultimo_login, criado_em
            FROM usuarios WHERE id = ? LIMIT 1`,
      values: [id],
      timeout: TIMEOUT
    })
    if (!linhas.length) return null
    const linha = linhas[0]
    return {
      id: Number(linha.id),
      nome: String(linha.nome),
      email: String(linha.email),
      perfil: linha.perfil as Perfil,
      ativo: Boolean(linha.ativo),
      ultimoLogin: linha.ultimo_login ?? null,
      criadoEm: String(linha.criado_em)
    }
  }

  atualizar = async (dados: AtualizarUsuario): Promise<boolean> => {
    const [existentes] = await this.pool.query<RowDataPacket[]>({
      sql: 'SELECT id FROM usuarios WHERE id = ? LIMIT 1',
      values: [dados.id],
      timeout: TIMEOUT
    })
    if (!existentes.length) return false

    const campos: string[] = []
    const valores: unknown[] = []
    if (dados.nome !== undefined) { campos.push('nome = ?'); valores.push(dados.nome) }
    if (dados.email !== undefined) { campos.push('email = ?'); valores.push(dados.email) }
    if (dados.perfil !== undefined) { campos.push('perfil = ?'); valores.push(dados.perfil) }
    if (dados.ativo !== undefined) { campos.push('ativo = ?'); valores.push(dados.ativo ? 1 : 0) }
    if (dados.senhaHash !== undefined) { campos.push('senha_hash = ?'); valores.push(dados.senhaHash) }
    if (!campos.length) return true

    campos.push('atualizado_em = NOW()')
    await this.pool.query({
      sql: `UPDATE usuarios SET ${campos.join(', ')} WHERE id = ?`,
      values: [...valores, dados.id],
      timeout: TIMEOUT
    })
    return true
  }

  excluir = async (id: number): Promise<{ excluido: boolean; mensagem?: string }> => {
    const conexao = await this.pool.getConnection()
    try {
      await conexao.beginTransaction()
      const [linhas] = await conexao.query<RowDataPacket[]>({
        sql: `SELECT
                (SELECT COUNT(*) FROM alunos WHERE usuario_id = ?) AS alunos,
                (SELECT COUNT(*) FROM instrutores WHERE usuario_id = ?) AS instrutores`,
        values: [id, id],
        timeout: TIMEOUT
      })
      if (!linhas.length) {
        await conexao.rollback()
        return { excluido: false }
      }

      const vinculos: string[] = []
      if (Number(linhas[0].alunos) > 0) vinculos.push('cadastro de aluno')
      if (Number(linhas[0].instrutores) > 0) vinculos.push('cadastro de instrutor')
      if (vinculos.length) {
        await conexao.rollback()
        return {
          excluido: false,
          mensagem: `Não é possível excluir este usuário porque possui ${vinculos.join(' e ')}. Desative a conta ou remova o vínculo antes.`
        }
      }

      const [resultado] = await conexao.query<ResultSetHeader>({
        sql: 'DELETE FROM usuarios WHERE id = ?',
        values: [id],
        timeout: TIMEOUT
      })
      await conexao.commit()
      return { excluido: resultado.affectedRows > 0 }
    } catch (erro) {
      await conexao.rollback().catch(() => undefined)
      throw erro
    } finally {
      conexao.release()
    }
  }
}

export class UsuarioIpc {
  private readonly perfisValidos: Perfil[] = ['admin', 'instrutor', 'aluno']

  constructor(
    private readonly sessao: Sessao,
    private readonly repositorio: UsuarioRepository = new UsuarioRepository(),
    private readonly senha: Senha = new Senha()
  ) {}

  private idValido = (valor: unknown): number | null => {
    const id = typeof valor === 'number' || typeof valor === 'string' ? Number(valor) : NaN
    return Number.isInteger(id) && id > 0 ? id : null
  }

  private nomeValido = (valor: unknown): string | null => {
    if (typeof valor !== 'string') return null
    const nome = valor.trim()
    return nome.length >= 2 && nome.length <= 120 ? nome : null
  }

  private emailValido = (valor: unknown): string | null => {
    if (typeof valor !== 'string') return null
    const email = valor.trim().toLowerCase()
    return email.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
  }

  private senhaValida = (valor: unknown): string | null => {
    if (typeof valor !== 'string') return null
    return valor.length >= 8 && valor.length <= 128 && /[A-Za-z]/.test(valor) && /\d/.test(valor) ? valor : null
  }

  private perfilValido = (valor: unknown): Perfil | null =>
    typeof valor === 'string' && this.perfisValidos.includes(valor as Perfil) ? (valor as Perfil) : null

  private validar = (entrada: unknown): EntradaValidada => {
    if (typeof entrada !== 'object' || entrada === null) return { valido: false, mensagem: 'Dados inválidos.' }

    const e = entrada as Record<string, unknown>
    const nome = this.nomeValido(e.nome)
    if (!nome) return { valido: false, mensagem: 'Informe o nome com 2 a 120 caracteres.' }

    const email = this.emailValido(e.email)
    if (!email) return { valido: false, mensagem: 'Informe um e-mail válido.' }

    const senha = this.senhaValida(e.senha)
    if (!senha) return { valido: false, mensagem: 'A senha deve ter de 8 a 128 caracteres, com letras e números.' }

    const perfil = this.perfilValido(e.perfil)
    if (!perfil) return { valido: false, mensagem: 'Selecione um perfil válido.' }

    return { valido: true, dados: { nome, email, senha, perfil } }
  }

  private validarAtualizacao = (entrada: unknown): EntradaAtualizacao => {
    if (typeof entrada !== 'object' || entrada === null) return { valido: false, mensagem: 'Dados inválidos.' }

    const e = entrada as Record<string, unknown>
    const id = this.idValido(e.id)
    if (id === null) return { valido: false, mensagem: 'Usuário inválido.' }

    const dados: AtualizarUsuario = { id }

    if (e.nome !== undefined) {
      const nome = this.nomeValido(e.nome)
      if (!nome) return { valido: false, mensagem: 'Informe o nome com 2 a 120 caracteres.' }
      dados.nome = nome
    }
    if (e.email !== undefined) {
      const email = this.emailValido(e.email)
      if (!email) return { valido: false, mensagem: 'Informe um e-mail válido.' }
      dados.email = email
    }
    if (e.perfil !== undefined) {
      const perfil = this.perfilValido(e.perfil)
      if (!perfil) return { valido: false, mensagem: 'Selecione um perfil válido.' }
      dados.perfil = perfil
    }
    if (e.ativo !== undefined) {
      if (typeof e.ativo !== 'boolean') return { valido: false, mensagem: 'Status inválido.' }
      dados.ativo = e.ativo
    }
    if (e.novaSenha !== undefined && e.novaSenha !== null && e.novaSenha !== '') {
      const senha = this.senhaValida(e.novaSenha)
      if (!senha) return { valido: false, mensagem: 'A nova senha deve ter de 8 a 128 caracteres, com letras e números.' }
      dados.senhaHash = senha
    }

    return { valido: true, dados }
  }

  registrar = (): void => {
    registrarCanal('usuarios:listar', async (_evento, busca: unknown): Promise<UsuarioLista[]> => {
      this.sessao.exigir(['admin'])

      if (busca !== undefined && typeof busca !== 'string') throw new Error('Consulta inválida')
      if (typeof busca === 'string' && busca.length > 120) throw new Error('Consulta inválida')

      return this.repositorio.listar(typeof busca === 'string' ? busca.trim() : '')
    })

    registrarCanal('usuarios:criar', async (_evento, entrada: unknown): Promise<ResultadoCriacao> => {
      this.sessao.exigir(['admin'])

      const validacao = this.validar(entrada)
      if (!validacao.valido) return { ok: false, mensagem: validacao.mensagem }

      const { nome, email, senha, perfil } = validacao.dados

      try {
        const hash = await this.senha.gerar(senha)
        const id = await this.repositorio.criar(nome, email, hash, perfil)
        return { ok: true, id }
      } catch (erro) {
        console.error('[usuarios:criar]', erro)
        return { ok: false, mensagem: BancoErros.mensagem(erro, 'Não foi possível cadastrar o usuário.') }
      }
    })

    registrarCanal('usuarios:obter', async (_evento, entrada: unknown): Promise<UsuarioLista | null> => {
      this.sessao.exigir(['admin'])
      const id = this.idValido(entrada)
      if (id === null) throw new Error('Usuário inválido.')
      return this.repositorio.obter(id)
    })

    registrarCanal('usuarios:atualizar', async (_evento, entrada: unknown): Promise<ResultadoCriacao> => {
      const usuario = this.sessao.exigir(['admin'])
      const validacao = this.validarAtualizacao(entrada)
      if (!validacao.valido) return { ok: false, mensagem: validacao.mensagem }

      const { id, senhaHash, ...campos } = validacao.dados
      if (id === usuario.id && (campos.perfil !== undefined || campos.ativo !== undefined)) {
        return { ok: false, mensagem: 'Você não pode alterar seu próprio perfil ou status nesta tela.' }
      }

      try {
        const hash = senhaHash ? await this.senha.gerar(senhaHash) : undefined
        const atualizado = await this.repositorio.atualizar({ id, ...campos, senhaHash: hash })
        if (!atualizado) return { ok: false, mensagem: 'Usuário não encontrado.' }
        return { ok: true, id }
      } catch (erro) {
        console.error('[usuarios:atualizar]', erro)
        return { ok: false, mensagem: BancoErros.mensagem(erro, 'Não foi possível atualizar o usuário.') }
      }
    })

    registrarCanal('usuarios:excluir', async (_evento, entrada: unknown): Promise<ResultadoCriacao> => {
      const usuario = this.sessao.exigir(['admin'])
      const id = this.idValido(entrada)
      if (id === null) return { ok: false, mensagem: 'Usuário inválido.' }
      if (id === usuario.id) return { ok: false, mensagem: 'Você não pode excluir sua própria conta.' }

      try {
        const resultado = await this.repositorio.excluir(id)
        if (!resultado.excluido) {
          return { ok: false, mensagem: resultado.mensagem ?? 'Usuário não encontrado.' }
        }
        return { ok: true, id }
      } catch (erro) {
        console.error('[usuarios:excluir]', erro)
        return { ok: false, mensagem: BancoErros.mensagem(erro, 'Não foi possível excluir o usuário.') }
      }
    })
  }
}
