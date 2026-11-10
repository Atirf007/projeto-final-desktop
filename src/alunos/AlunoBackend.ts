import { ipcMain } from 'electron'
import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { Banco } from '../Banco'
import { BancoErros } from '../BancoErros'
import { Senha } from '../autenticacao/AutenticacaoBackend'
import { Perfil, Sessao, UsuarioSessao } from '../Sessao'

export type Endereco = {
  cep?: string
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  cidade?: string
  estado?: string
}

export type AlunoResumo = {
  id: number
  usuarioId: number
  nome: string
  email: string
  telefone: string
  cpf: string
  ativo: boolean
  cidade?: string
  estado?: string
}

export type Aluno = {
  id: number
  usuarioId: number
  nome: string
  email: string
  cpf: string
  dataNascimento: string
  telefone: string
  endereco: Endereco
  contatoEmergencia?: string
  observacoesSaude?: string
  ativo: boolean
  criadoEm: string
  atualizadoEm: string
}

export type CriarAlunoInput = {
  nome: string
  email: string
  senha: string
  cpf: string
  dataNascimento: string
  telefone: string
  endereco: Endereco
  contatoEmergencia?: string
  observacoesSaude?: string
}

export type AtualizarAlunoInput = {
  id: number
  nome?: string
  email?: string
  novaSenha?: string
  cpf?: string
  dataNascimento?: string
  telefone?: string
  endereco?: Endereco
  contatoEmergencia?: string | null
  observacoesSaude?: string | null
  ativo?: boolean
}

export type ResultadoAluno = { ok: true; id?: number } | { ok: false; mensagem: string }

type FiltroAlunos = { busca?: string; ativo?: boolean }

const TIMEOUT = 15000

class AlunoValidador {
  private texto(valor: unknown, max: number): string | null {
    if (typeof valor !== 'string') return null
    const limpo = valor.trim()
    return limpo.length <= max ? limpo : null
  }

  private opcional(valor: unknown, max: number): string | undefined | null {
    if (valor === undefined || valor === null || valor === '') return undefined
    return this.texto(valor, max)
  }

  nome(valor: unknown): string | null {
    const nome = this.texto(valor, 120)
    return nome && nome.length >= 2 ? nome : null
  }

  email(valor: unknown): string | null {
    const email = this.texto(valor, 160)?.toLowerCase() ?? null
    return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
  }

  senha(valor: unknown): string | null {
    if (typeof valor !== 'string') return null
    return valor.length >= 8 && valor.length <= 128 && /[A-Za-z]/.test(valor) && /\d/.test(valor) ? valor : null
  }

  cpf(valor: unknown): { ok: true; valor: string } | { ok: false; mensagem: string } {
    if (typeof valor !== 'string' || !valor.trim()) {
      return { ok: false, mensagem: 'Informe o CPF.' }
    }
    const digitos = valor.replace(/\D/g, '')
    if (digitos.length !== 11) {
      return { ok: false, mensagem: `O CPF deve ter 11 dígitos. Foram informados ${digitos.length}.` }
    }
    if (/^(\d)\1{10}$/.test(digitos)) {
      return { ok: false, mensagem: 'CPF inválido: todos os dígitos são iguais.' }
    }
    const calc = (base: string, fator: number): number => {
      let soma = 0
      for (const c of base) soma += Number(c) * fator--
      const resto = (soma * 10) % 11
      return resto === 10 ? 0 : resto
    }
    if (
      calc(digitos.slice(0, 9), 10) !== Number(digitos[9]) ||
      calc(digitos.slice(0, 10), 11) !== Number(digitos[10])
    ) {
      return { ok: false, mensagem: 'CPF inválido: o dígito verificador não confere. Confira os números digitados.' }
    }
    return { ok: true, valor: digitos }
  }

  data(valor: unknown): string | null {
    if (typeof valor !== 'string') return null
    const m = valor.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!m) return null
    const ano = Number(m[1])
    const mes = Number(m[2])
    const dia = Number(m[3])
    const d = new Date(Date.UTC(ano, mes - 1, dia))
    if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null
    if (ano < 1900 || ano > new Date().getFullYear()) return null
    return `${m[1]}-${m[2]}-${m[3]}`
  }

  telefone(valor: unknown): string | null {
    const t = this.texto(valor, 20)
    return t && t.replace(/\D/g, '').length >= 8 ? t : null
  }

  cep(valor: unknown): string | undefined | null {
    if (valor === undefined || valor === null || valor === '') return undefined
    if (typeof valor !== 'string') return null
    const digitos = valor.replace(/\D/g, '')
    if (digitos === '') return undefined
    return /^\d{8}$/.test(digitos) ? digitos : null
  }

  estado(valor: unknown): string | undefined | null {
    if (valor === undefined || valor === null || valor === '') return undefined
    const uf = this.texto(valor, 2)?.toUpperCase() ?? null
    return uf && /^[A-Z]{2}$/.test(uf) ? uf : null
  }

  endereco(valor: unknown): Endereco | null {
    if (valor === undefined || valor === null) return {}
    if (typeof valor !== 'object') return null
    const e = valor as Record<string, unknown>
    const cep = this.cep(e.cep)
    const estado = this.estado(e.estado)
    if (cep === null || estado === null) return null
    const logradouro = this.opcional(e.logradouro, 160)
    const numero = this.opcional(e.numero, 20)
    const complemento = this.opcional(e.complemento, 80)
    const bairro = this.opcional(e.bairro, 80)
    const cidade = this.opcional(e.cidade, 80)
    if ([logradouro, numero, complemento, bairro, cidade].includes(null)) return null
    return {
      cep: cep ?? undefined,
      logradouro: logradouro ?? undefined,
      numero: numero ?? undefined,
      complemento: complemento ?? undefined,
      bairro: bairro ?? undefined,
      cidade: cidade ?? undefined,
      estado: estado ?? undefined
    }
  }

  contatoEmergencia(valor: unknown): string | undefined | null {
    return this.opcional(valor, 120)
  }

  observacoesSaude(valor: unknown): string | undefined | null {
    if (valor === undefined || valor === null || valor === '') return undefined
    return this.texto(valor, 2000)
  }

  validarCriacao(entrada: unknown): { ok: true; dados: CriarAlunoInput } | { ok: false; mensagem: string } {
    if (typeof entrada !== 'object' || entrada === null) return { ok: false, mensagem: 'Dados inválidos.' }
    const e = entrada as Record<string, unknown>
    const nome = this.nome(e.nome)
    if (!nome) return { ok: false, mensagem: 'Informe o nome com 2 a 120 caracteres.' }
    const email = this.email(e.email)
    if (!email) return { ok: false, mensagem: 'Informe um e-mail válido.' }
    const senha = this.senha(e.senha)
    if (!senha) return { ok: false, mensagem: 'A senha deve ter de 8 a 128 caracteres, com letras e números.' }
    const cpf = this.cpf(e.cpf)
    if (!cpf.ok) return { ok: false, mensagem: cpf.mensagem }
    const dataNascimento = this.data(e.dataNascimento)
    if (!dataNascimento) return { ok: false, mensagem: 'Informe uma data de nascimento válida (AAAA-MM-DD).' }
    const telefone = this.telefone(e.telefone)
    if (!telefone) return { ok: false, mensagem: 'Informe um telefone válido.' }
    const endereco = this.endereco(e.endereco)
    if (!endereco) return { ok: false, mensagem: 'Endereço inválido. Verifique CEP e UF.' }
    const contatoEmergencia = this.contatoEmergencia(e.contatoEmergencia)
    if (contatoEmergencia === null) return { ok: false, mensagem: 'Contato de emergência inválido.' }
    const observacoesSaude = this.observacoesSaude(e.observacoesSaude)
    if (observacoesSaude === null) return { ok: false, mensagem: 'Observações de saúde inválidas.' }
    return {
      ok: true,
      dados: { nome, email, senha, cpf: cpf.valor, dataNascimento, telefone, endereco, contatoEmergencia, observacoesSaude }
    }
  }

  validarAtualizacao(entrada: unknown): { ok: true; dados: AtualizarAlunoInput } | { ok: false; mensagem: string } {
    if (typeof entrada !== 'object' || entrada === null) return { ok: false, mensagem: 'Dados inválidos.' }
    const e = entrada as Record<string, unknown>
    const id = Number(e.id)
    if (!Number.isInteger(id) || id <= 0) return { ok: false, mensagem: 'Aluno inválido.' }
    const dados: AtualizarAlunoInput = { id }
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
    if (e.cpf !== undefined) {
      const cpf = this.cpf(e.cpf)
      if (!cpf.ok) return { ok: false, mensagem: cpf.mensagem }
      dados.cpf = cpf.valor
    }
    if (e.dataNascimento !== undefined) {
      const dataNascimento = this.data(e.dataNascimento)
      if (!dataNascimento) return { ok: false, mensagem: 'Data de nascimento inválida.' }
      dados.dataNascimento = dataNascimento
    }
    if (e.telefone !== undefined) {
      const telefone = this.telefone(e.telefone)
      if (!telefone) return { ok: false, mensagem: 'Telefone inválido.' }
      dados.telefone = telefone
    }
    if (e.endereco !== undefined) {
      const endereco = this.endereco(e.endereco)
      if (!endereco) return { ok: false, mensagem: 'Endereço inválido.' }
      dados.endereco = endereco
    }
    if (e.contatoEmergencia !== undefined) {
      const v = e.contatoEmergencia === null || e.contatoEmergencia === '' ? null : this.texto(e.contatoEmergencia, 120)
      if (v === null && e.contatoEmergencia !== null && e.contatoEmergencia !== '') return { ok: false, mensagem: 'Contato de emergência inválido.' }
      dados.contatoEmergencia = e.contatoEmergencia === null || e.contatoEmergencia === '' ? null : v
    }
    if (e.observacoesSaude !== undefined) {
      const v = e.observacoesSaude === null || e.observacoesSaude === '' ? null : this.texto(e.observacoesSaude, 2000)
      if (v === null && e.observacoesSaude !== null && e.observacoesSaude !== '') return { ok: false, mensagem: 'Observações de saúde inválidas.' }
      dados.observacoesSaude = e.observacoesSaude === null || e.observacoesSaude === '' ? null : v
    }
    if (e.ativo !== undefined) {
      if (typeof e.ativo !== 'boolean') return { ok: false, mensagem: 'Status inválido.' }
      dados.ativo = e.ativo
    }
    return { ok: true, dados }
  }
}

const end = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const dataStr = (v: unknown): string => String(v ?? '').slice(0, 10)

class AlunoRepository {
  private readonly pool = Banco.pool
  private readonly sqlListar = `
    SELECT a.id, a.usuario_id, u.nome, u.email, a.cpf, a.telefone, a.cidade, a.estado, a.ativo
    FROM alunos a
    INNER JOIN usuarios u ON u.id = a.usuario_id
    WHERE (? = '' OR u.nome LIKE ? OR u.email LIKE ? OR a.cpf LIKE ?)
      AND (? IS NULL OR a.ativo = ?)
    ORDER BY u.nome ASC`
  private readonly sqlObter = `
    SELECT a.id, a.usuario_id, u.nome, u.email, a.cpf, a.data_nascimento, a.telefone,
           a.cep, a.logradouro, a.numero, a.complemento, a.bairro, a.cidade, a.estado,
           a.contato_emergencia, a.observacoes_saude, a.ativo, a.criado_em, a.atualizado_em
    FROM alunos a
    INNER JOIN usuarios u ON u.id = a.usuario_id
    WHERE a.id = ?
    LIMIT 1`

  listar = async (filtro: FiltroAlunos): Promise<AlunoResumo[]> => {
    const busca = typeof filtro.busca === 'string' ? filtro.busca.trim() : ''
    const termo = busca ? `%${busca.replace(/[\\%_]/g, '\\$&')}%` : ''
    const cpfTermo = busca ? `%${busca.replace(/\D/g, '') || busca}%` : ''
    const ativo = typeof filtro.ativo === 'boolean' ? (filtro.ativo ? 1 : 0) : null
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: this.sqlListar,
      values: [termo, termo, termo, cpfTermo, ativo, ativo],
      timeout: TIMEOUT
    })
    return linhas.map((l) => ({
      id: Number(l.id),
      usuarioId: Number(l.usuario_id),
      nome: String(l.nome),
      email: String(l.email),
      telefone: String(l.telefone ?? ''),
      cpf: String(l.cpf ?? ''),
      ativo: Boolean(l.ativo),
      cidade: l.cidade ? String(l.cidade) : undefined,
      estado: l.estado ? String(l.estado) : undefined
    }))
  }

  obter = async (id: number, incluirSaude: boolean): Promise<Aluno | null> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: this.sqlObter,
      values: [id],
      timeout: TIMEOUT
    })
    if (!linhas.length) return null
    const l = linhas[0]
    const aluno: Aluno = {
      id: Number(l.id),
      usuarioId: Number(l.usuario_id),
      nome: String(l.nome),
      email: String(l.email),
      cpf: String(l.cpf ?? ''),
      dataNascimento: dataStr(l.data_nascimento),
      telefone: String(l.telefone ?? ''),
      endereco: {
        cep: l.cep ? String(l.cep) : undefined,
        logradouro: l.logradouro ? String(l.logradouro) : undefined,
        numero: l.numero ? String(l.numero) : undefined,
        complemento: l.complemento ? String(l.complemento) : undefined,
        bairro: l.bairro ? String(l.bairro) : undefined,
        cidade: l.cidade ? String(l.cidade) : undefined,
        estado: l.estado ? String(l.estado) : undefined
      },
      contatoEmergencia: l.contato_emergencia ? String(l.contato_emergencia) : undefined,
      ativo: Boolean(l.ativo),
      criadoEm: String(l.criado_em ?? ''),
      atualizadoEm: String(l.atualizado_em ?? '')
    }
    if (incluirSaude && l.observacoes_saude) aluno.observacoesSaude = String(l.observacoes_saude)
    return aluno
  }

  obterUsuarioId = async (alunoId: number, conexao?: PoolConnection): Promise<number | null> => {
    const db = conexao ?? this.pool
    const [linhas] = await (db as PoolConnection).query<RowDataPacket[]>({
      sql: 'SELECT usuario_id FROM alunos WHERE id = ? LIMIT 1',
      values: [alunoId],
      timeout: TIMEOUT
    })
    return linhas.length ? Number(linhas[0].usuario_id) : null
  }

  criar = async (dados: CriarAlunoInput, senhaHash: string): Promise<number> => {
    const conexao = await this.pool.getConnection()
    try {
      await conexao.beginTransaction()
      const [usuario] = await conexao.query<ResultSetHeader>({
        sql: 'INSERT INTO usuarios (nome, email, senha_hash, perfil, ativo) VALUES (?, ?, ?, ?, 1)',
        values: [dados.nome, dados.email, senhaHash, 'aluno'],
        timeout: TIMEOUT
      })
      const usuarioId = Number(usuario.insertId)
      const e = dados.endereco
      const [aluno] = await conexao.query<ResultSetHeader>({
        sql: `INSERT INTO alunos
          (usuario_id, cpf, data_nascimento, telefone, cep, logradouro, numero, complemento, bairro, cidade, estado, contato_emergencia, observacoes_saude, ativo, criado_em, atualizado_em)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
        values: [
          usuarioId, dados.cpf, dados.dataNascimento, dados.telefone,
          end(e.cep), end(e.logradouro), end(e.numero), end(e.complemento), end(e.bairro), end(e.cidade), end(e.estado),
          end(dados.contatoEmergencia), end(dados.observacoesSaude)
        ],
        timeout: TIMEOUT
      })
      await conexao.commit()
      return Number(aluno.insertId)
    } catch (erro) {
      await conexao.rollback().catch(() => undefined)
      throw erro
    } finally {
      conexao.release()
    }
  }

  atualizar = async (dados: AtualizarAlunoInput, senhaHash?: string): Promise<boolean> => {
    const conexao = await this.pool.getConnection()
    try {
      await conexao.beginTransaction()
      const [linhas] = await conexao.query<RowDataPacket[]>({
        sql: 'SELECT usuario_id FROM alunos WHERE id = ? LIMIT 1',
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

      const camposAluno: string[] = []
      const valoresAluno: unknown[] = []
      const set = (col: string, val: unknown) => { camposAluno.push(`${col} = ?`); valoresAluno.push(val) }
      if (dados.cpf !== undefined) set('cpf', dados.cpf)
      if (dados.dataNascimento !== undefined) set('data_nascimento', dados.dataNascimento)
      if (dados.telefone !== undefined) set('telefone', dados.telefone)
      if (dados.ativo !== undefined) set('ativo', dados.ativo ? 1 : 0)
      if (dados.contatoEmergencia !== undefined) set('contato_emergencia', dados.contatoEmergencia)
      if (dados.observacoesSaude !== undefined) set('observacoes_saude', dados.observacoesSaude)
      if (dados.endereco !== undefined) {
        const e = dados.endereco
        set('cep', end(e.cep))
        set('logradouro', end(e.logradouro))
        set('numero', end(e.numero))
        set('complemento', end(e.complemento))
        set('bairro', end(e.bairro))
        set('cidade', end(e.cidade))
        set('estado', end(e.estado))
      }
      if (camposAluno.length) {
        camposAluno.push('atualizado_em = NOW()')
        await conexao.query({
          sql: `UPDATE alunos SET ${camposAluno.join(', ')} WHERE id = ?`,
          values: [...valoresAluno, dados.id],
          timeout: TIMEOUT
        })
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
        sql: 'SELECT usuario_id FROM alunos WHERE id = ? LIMIT 1',
        values: [id],
        timeout: TIMEOUT
      })
      if (!linhas.length) {
        await conexao.rollback()
        return false
      }
      const usuarioId = Number(linhas[0].usuario_id)
      await conexao.query({ sql: 'UPDATE alunos SET ativo = 0, atualizado_em = NOW() WHERE id = ?', values: [id], timeout: TIMEOUT })
      await conexao.query({ sql: 'UPDATE usuarios SET ativo = 0 WHERE id = ?', values: [usuarioId], timeout: TIMEOUT })
      await conexao.commit()
      return true
    } catch (erro) {
      await conexao.rollback().catch(() => undefined)
      throw erro
    } finally {
      conexao.release()
    }
  }

  obterPorUsuario = async (usuarioId: number, incluirSaude: boolean): Promise<Aluno | null> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: 'SELECT id FROM alunos WHERE usuario_id = ? LIMIT 1',
      values: [usuarioId],
      timeout: TIMEOUT
    })
    if (!linhas.length) return null
    return this.obter(Number(linhas[0].id), incluirSaude)
  }
}

export class AlunoIpc {
  private readonly validador = new AlunoValidador()

  constructor(
    private readonly sessao: Sessao,
    private readonly repositorio: AlunoRepository = new AlunoRepository(),
    private readonly senha: Senha = new Senha()
  ) {}

  private podeVerSaude(usuario: UsuarioSessao): boolean {
    return usuario.perfil === 'admin'
  }

  private idValido(v: unknown): number | null {
    const id = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
    return Number.isInteger(id) && id > 0 ? id : null
  }

  private filtroValido(entrada: unknown): FiltroAlunos {
    if (typeof entrada !== 'object' || entrada === null) return {}
    const f = entrada as Record<string, unknown>
    const filtro: FiltroAlunos = {}
    if (typeof f.busca === 'string') filtro.busca = f.busca.slice(0, 120)
    if (typeof f.ativo === 'boolean') filtro.ativo = f.ativo
    return filtro
  }

  registrar = (): void => {
    ipcMain.handle('alunos:listar', async (_evento, entrada: unknown): Promise<AlunoResumo[]> => {
      this.sessao.exigir(['admin', 'instrutor'])
      return this.repositorio.listar(this.filtroValido(entrada))
    })

    ipcMain.handle('alunos:obter', async (_evento, entrada: unknown): Promise<Aluno | null> => {
      const usuario = this.sessao.exigir(['admin', 'instrutor'])
      const id = this.idValido(entrada)
      if (id === null) throw new Error('Aluno inválido.')
      return this.repositorio.obter(id, this.podeVerSaude(usuario))
    })

    ipcMain.handle('alunos:criar', async (_evento, entrada: unknown): Promise<ResultadoAluno> => {
      this.sessao.exigir(['admin'])
      const v = this.validador.validarCriacao(entrada)
      if (!v.ok) return v
      try {
        const hash = await this.senha.gerar(v.dados.senha)
        const id = await this.repositorio.criar(v.dados, hash)
        return { ok: true, id }
      } catch (erro) {
        console.error('[alunos:criar]', erro)
        return { ok: false, mensagem: BancoErros.mensagem(erro, 'Não foi possível cadastrar o aluno.') }
      }
    })

    ipcMain.handle('alunos:atualizar', async (_evento, entrada: unknown): Promise<ResultadoAluno> => {
      this.sessao.exigir(['admin'])
      const v = this.validador.validarAtualizacao(entrada)
      if (!v.ok) return v
      try {
        const hash = v.dados.novaSenha ? await this.senha.gerar(v.dados.novaSenha) : undefined
        const ok = await this.repositorio.atualizar(v.dados, hash)
        if (!ok) return { ok: false, mensagem: 'Aluno não encontrado.' }
        return { ok: true, id: v.dados.id }
      } catch (erro) {
        console.error('[alunos:atualizar]', erro)
        return { ok: false, mensagem: BancoErros.mensagem(erro, 'Não foi possível atualizar o aluno.') }
      }
    })

    ipcMain.handle('alunos:excluir', async (_evento, entrada: unknown): Promise<ResultadoAluno> => {
      this.sessao.exigir(['admin'])
      const id = this.idValido(entrada)
      if (id === null) return { ok: false, mensagem: 'Aluno inválido.' }
      try {
        const ok = await this.repositorio.excluir(id)
        if (!ok) return { ok: false, mensagem: 'Aluno não encontrado.' }
        return { ok: true, id }
      } catch (erro) {
        console.error('[alunos:excluir]', erro)
        return { ok: false, mensagem: BancoErros.mensagem(erro, 'Não foi possível desativar o aluno.') }
      }
    })

    ipcMain.handle('alunos:meuPerfil', async (): Promise<Aluno | null> => {
      const usuario = this.sessao.exigir(['aluno'])
      return this.repositorio.obterPorUsuario(usuario.id, true)
    })

    ipcMain.handle('alunos:atualizarMeuPerfil', async (): Promise<ResultadoAluno> => {
      this.sessao.exigir(['aluno'])
      return { ok: false, mensagem: 'Atualização do próprio perfil ainda não está disponível nesta tela.' }
    })
  }
}
