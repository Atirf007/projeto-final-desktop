import { ipcMain } from 'electron'
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

export type ResultadoCriacao = { ok: true; id: number } | { ok: false; mensagem: string }

type NovoUsuario = { nome: string; email: string; senha: string; perfil: Perfil }

type EntradaValidada = { valido: true; dados: NovoUsuario } | { valido: false; mensagem: string }

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
      timeout: 15000
    })
    return Number(resultado.insertId)
  }
}

export class UsuarioIpc {
  private readonly perfisValidos: Perfil[] = ['admin', 'instrutor', 'aluno']

  constructor(
    private readonly sessao: Sessao,
    private readonly repositorio: UsuarioRepository = new UsuarioRepository(),
    private readonly senha: Senha = new Senha()
  ) {}

  private validar = (entrada: unknown): EntradaValidada => {
    if (typeof entrada !== 'object' || entrada === null) return { valido: false, mensagem: 'Dados inválidos.' }

    const { nome, email, senha, perfil } = entrada as Record<string, unknown>
    if (typeof nome !== 'string' || typeof email !== 'string' || typeof senha !== 'string' || typeof perfil !== 'string') {
      return { valido: false, mensagem: 'Dados inválidos.' }
    }

    const nomeLimpo = nome.trim()
    if (nomeLimpo.length < 2 || nomeLimpo.length > 120) {
      return { valido: false, mensagem: 'Informe o nome com 2 a 120 caracteres.' }
    }

    const emailLimpo = email.trim().toLowerCase()
    if (emailLimpo.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo)) {
      return { valido: false, mensagem: 'Informe um e-mail válido.' }
    }

    if (senha.length < 8 || senha.length > 128 || !/[A-Za-z]/.test(senha) || !/\d/.test(senha)) {
      return { valido: false, mensagem: 'A senha deve ter de 8 a 128 caracteres, com letras e números.' }
    }

    if (!this.perfisValidos.includes(perfil as Perfil)) return { valido: false, mensagem: 'Selecione um perfil válido.' }

    return { valido: true, dados: { nome: nomeLimpo, email: emailLimpo, senha, perfil: perfil as Perfil } }
  }

  registrar = (): void => {
    ipcMain.handle('usuarios:listar', async (_evento, busca: unknown): Promise<UsuarioLista[]> => {
      this.sessao.exigir(['admin'])

      if (busca !== undefined && typeof busca !== 'string') throw new Error('Consulta inválida')
      if (typeof busca === 'string' && busca.length > 120) throw new Error('Consulta inválida')

      return this.repositorio.listar(typeof busca === 'string' ? busca.trim() : '')
    })

    ipcMain.handle('usuarios:criar', async (_evento, entrada: unknown): Promise<ResultadoCriacao> => {
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
  }
}
