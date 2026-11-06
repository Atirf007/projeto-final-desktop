import { randomBytes, scrypt, timingSafeEqual } from 'crypto'
import { ipcMain } from 'electron'
import { RowDataPacket } from 'mysql2/promise'
import { Banco } from '../Banco'
import { Perfil, Sessao, UsuarioSessao } from '../Sessao'

export type ResultadoLogin = { ok: boolean; mensagem?: string }

type UsuarioBanco = { id: number; nome: string; senha_hash: string; perfil: Perfil }

export class ErroAutenticacao extends Error {}

export class Senha {
  private derivar = (senha: string, sal: Buffer, tamanho: number): Promise<Buffer> =>
    new Promise((resolver, rejeitar) => {
      scrypt(senha, sal, tamanho, (erro, chave) => (erro ? rejeitar(erro) : resolver(chave)))
    })

  gerar = async (senha: string): Promise<string> => {
    const sal = randomBytes(16)
    const hash = await this.derivar(senha, sal, 64)
    return `scrypt:${sal.toString('hex')}:${hash.toString('hex')}`
  }

  verificar = async (senha: string, armazenado: string): Promise<boolean> => {
    try {
      const [algoritmo, salHex, hashHex] = armazenado.split(':')
      if (algoritmo !== 'scrypt' || !salHex || !hashHex) return false

      const esperado = Buffer.from(hashHex, 'hex')
      const calculado = await this.derivar(senha, Buffer.from(salHex, 'hex'), esperado.length)
      return esperado.length === calculado.length && timingSafeEqual(esperado, calculado)
    } catch {
      return false
    }
  }
}

export class LimitadorTentativas {
  private readonly registros = new Map<string, { quantidade: number; bloqueadoAte: number }>()

  constructor(
    private readonly maximo: number = 5,
    private readonly bloqueioMs: number = 5 * 60 * 1000
  ) {}

  bloqueado = (chave: string): boolean => (this.registros.get(chave)?.bloqueadoAte ?? 0) > Date.now()

  minutosRestantes = (chave: string): number =>
    Math.max(1, Math.ceil(((this.registros.get(chave)?.bloqueadoAte ?? 0) - Date.now()) / 60000))

  falhou = (chave: string): void => {
    const registro = this.registros.get(chave) ?? { quantidade: 0, bloqueadoAte: 0 }
    registro.quantidade += 1

    if (registro.quantidade >= this.maximo) {
      registro.quantidade = 0
      registro.bloqueadoAte = Date.now() + this.bloqueioMs
    }

    this.registros.set(chave, registro)
  }

  sucesso = (chave: string): void => {
    this.registros.delete(chave)
  }
}

export class UsuarioRepository {
  buscarPorEmail = async (email: string): Promise<UsuarioBanco | null> => {
    const [linhas] = await Banco.pool.query<RowDataPacket[]>(
      'SELECT id, nome, senha_hash, perfil FROM usuarios WHERE email = ? AND ativo = 1 LIMIT 1',
      [email]
    )
    return linhas.length ? (linhas[0] as UsuarioBanco) : null
  }

  registrarLogin = async (id: number): Promise<void> => {
    await Banco.pool.query('UPDATE usuarios SET ultimo_login = NOW() WHERE id = ?', [id])
  }
}

export class AutenticacaoServico {
  private hashFalso: Promise<string> | null = null

  constructor(
    private readonly repositorio: UsuarioRepository = new UsuarioRepository(),
    private readonly senha: Senha = new Senha(),
    private readonly limitador: LimitadorTentativas = new LimitadorTentativas()
  ) {}

  private obterHashFalso = (): Promise<string> => {
    this.hashFalso ??= this.senha.gerar(randomBytes(8).toString('hex'))
    return this.hashFalso
  }

  entrar = async (email: string, senha: string): Promise<UsuarioSessao> => {
    const chave = email.trim().toLowerCase()

    if (this.limitador.bloqueado(chave)) {
      throw new ErroAutenticacao(`Muitas tentativas. Tente novamente em ${this.limitador.minutosRestantes(chave)} min.`)
    }

    const usuario = await this.repositorio.buscarPorEmail(chave)
    const hash = usuario ? usuario.senha_hash : await this.obterHashFalso()
    const valida = await this.senha.verificar(senha, hash)

    if (!usuario || !valida) {
      this.limitador.falhou(chave)
      throw new ErroAutenticacao('E-mail ou senha inválidos.')
    }

    this.limitador.sucesso(chave)
    await this.repositorio.registrarLogin(usuario.id)
    return { id: Number(usuario.id), nome: usuario.nome, perfil: usuario.perfil }
  }
}

export class AutenticacaoIpc {
  constructor(
    private readonly servico: AutenticacaoServico,
    private readonly sessao: Sessao,
    private readonly aoEntrar: () => void,
    private readonly aoSair: () => void
  ) {}

  private emailValido = (email: string): boolean => email.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  registrar = (): void => {
    ipcMain.handle('auth:login', async (_evento, email: unknown, senha: unknown): Promise<ResultadoLogin> => {
      if (typeof email !== 'string' || typeof senha !== 'string') return { ok: false, mensagem: 'Dados inválidos.' }

      const emailLimpo = email.trim()
      if (!this.emailValido(emailLimpo) || !senha || senha.length > 128) {
        return { ok: false, mensagem: 'E-mail ou senha inválidos.' }
      }

      try {
        const usuario = await this.servico.entrar(emailLimpo, senha)
        this.sessao.iniciar(usuario)
        setImmediate(this.aoEntrar)
        return { ok: true }
      } catch (erro) {
        const mensagem =
          erro instanceof ErroAutenticacao ? erro.message : 'Não foi possível entrar. Verifique a conexão com o banco.'
        return { ok: false, mensagem }
      }
    })

    ipcMain.handle('auth:sair', () => {
      this.sessao.encerrar()
      setImmediate(this.aoSair)
    })
  }
}
