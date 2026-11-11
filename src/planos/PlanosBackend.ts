import { ipcMain } from 'electron'
import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { Banco } from '../Banco'
import { BancoErros } from '../BancoErros'
import { gerarMensalidades } from '../pagamentos/Mensalidades'
import { Sessao } from '../Sessao'

export type TipoPlano = 'mensal' | 'trimestral' | 'semestral' | 'anual'
export type StatusAssinatura = 'ativa' | 'vencida' | 'cancelada' | 'suspensa'

export type Plano = {
  id: number
  nome: string
  tipo: TipoPlano
  duracaoMeses: number
  valor: number
  descricao?: string
  ativo: boolean
  assinaturasAtivas: number
}

export type CriarPlanoInput = {
  nome: string
  tipo: TipoPlano
  duracaoMeses: number
  valor: number
  descricao?: string
}

export type AtualizarPlanoInput = {
  id: number
  nome?: string
  tipo?: TipoPlano
  duracaoMeses?: number
  valor?: number
  descricao?: string | null
  ativo?: boolean
}

export type Assinatura = {
  id: number
  alunoId: number
  alunoNome: string
  planoId: number
  planoNome: string
  dataInicio: string
  dataFim: string
  valorContratado: number
  status: StatusAssinatura
}

export type MinhaAssinatura = {
  planoNome: string
  status: StatusAssinatura
  dataInicio: string
  dataFim: string
}

export type CriarAssinaturaInput = {
  alunoId: number
  planoId: number
  dataInicio: string
  valorContratado?: number
}

export type AtualizarAssinaturaInput = {
  id: number
  status?: StatusAssinatura
  dataFim?: string
  valorContratado?: number
}

export type RenovarAssinaturaInput = {
  id: number
  planoId?: number
  dataInicio?: string
}

export type FiltroPlanos = {
  busca?: string
  ativo?: boolean
}

export type FiltroAssinaturas = {
  alunoId?: number
  status?: StatusAssinatura
  busca?: string
}

export type ResultadoPlano =
  | { ok: true; id?: number; acao?: 'excluida' | 'cancelada' }
  | { ok: false; mensagem: string }

const TIMEOUT = 15000
const TIPOS_PLANO: TipoPlano[] = ['mensal', 'trimestral', 'semestral', 'anual']
const STATUS_ASSINATURA: StatusAssinatura[] = ['ativa', 'vencida', 'cancelada', 'suspensa']

class ErroPlano extends Error {}

const textoOuNulo = (valor: unknown): string | null => (typeof valor === 'string' && valor.trim() ? valor.trim() : null)
const dataISO = (valor: unknown): string => String(valor ?? '').slice(0, 10)

const hojeISO = (): string => {
  const agora = new Date()
  const ano = agora.getFullYear()
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const dia = String(agora.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

const somarDias = (data: string, dias: number): string => {
  const [ano, mes, dia] = data.split('-').map(Number)
  const resultado = new Date(Date.UTC(ano, mes - 1, dia + dias))
  return resultado.toISOString().slice(0, 10)
}

const somarMeses = (data: string, meses: number): string => {
  const [ano, mes, dia] = data.split('-').map(Number)
  const alvoMes = mes - 1 + meses
  const alvoAno = ano + Math.floor(alvoMes / 12)
  const mesNormalizado = ((alvoMes % 12) + 12) % 12
  const ultimoDia = new Date(Date.UTC(alvoAno, mesNormalizado + 1, 0)).getUTCDate()
  const diaFinal = Math.min(dia, ultimoDia)
  return new Date(Date.UTC(alvoAno, mesNormalizado, diaFinal)).toISOString().slice(0, 10)
}

class PlanoValidador {
  private texto(valor: unknown, max: number): string | null {
    if (typeof valor !== 'string') return null
    const limpo = valor.trim()
    return limpo.length <= max ? limpo : null
  }

  private nome(valor: unknown): string | null {
    const nome = this.texto(valor, 80)
    return nome && nome.length >= 2 ? nome : null
  }

  private tipo(valor: unknown): TipoPlano | null {
    return typeof valor === 'string' && TIPOS_PLANO.includes(valor as TipoPlano) ? (valor as TipoPlano) : null
  }

  private inteiro(valor: unknown, minimo: number, maximo: number): number | null {
    const numero = Number(valor)
    if (!Number.isInteger(numero) || numero < minimo || numero > maximo) return null
    return numero
  }

  private valor(valor: unknown): number | null {
    const numero = typeof valor === 'number' ? valor : typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : NaN
    if (!Number.isFinite(numero) || numero < 0 || numero > 99999999.99) return null
    return Math.round(numero * 100) / 100
  }

  private descricao(valor: unknown): string | undefined | null {
    if (valor === undefined || valor === null || valor === '') return undefined
    if (typeof valor !== 'string') return null
    const limpo = valor.trim()
    return limpo.length <= 255 ? limpo : null
  }

  validarCriacao(entrada: unknown): { ok: true; dados: CriarPlanoInput } | { ok: false; mensagem: string } {
    if (typeof entrada !== 'object' || entrada === null) return { ok: false, mensagem: 'Dados inválidos.' }
    const e = entrada as Record<string, unknown>
    const nome = this.nome(e.nome)
    if (!nome) return { ok: false, mensagem: 'Informe o nome do plano com 2 a 80 caracteres.' }
    const tipo = this.tipo(e.tipo)
    if (!tipo) return { ok: false, mensagem: 'Selecione um tipo de plano válido.' }
    const duracaoMeses = this.inteiro(e.duracaoMeses, 1, 120)
    if (duracaoMeses === null) return { ok: false, mensagem: 'A duração deve ser entre 1 e 120 meses.' }
    const valor = this.valor(e.valor)
    if (valor === null) return { ok: false, mensagem: 'Informe um valor válido para o plano.' }
    const descricao = this.descricao(e.descricao)
    if (descricao === null) return { ok: false, mensagem: 'A descrição deve ter no máximo 255 caracteres.' }
    return { ok: true, dados: { nome, tipo, duracaoMeses, valor, descricao } }
  }

  validarAtualizacao(entrada: unknown): { ok: true; dados: AtualizarPlanoInput } | { ok: false; mensagem: string } {
    if (typeof entrada !== 'object' || entrada === null) return { ok: false, mensagem: 'Dados inválidos.' }
    const e = entrada as Record<string, unknown>
    const id = Number(e.id)
    if (!Number.isInteger(id) || id <= 0) return { ok: false, mensagem: 'Plano inválido.' }

    const dados: AtualizarPlanoInput = { id }
    if (e.nome !== undefined) {
      const nome = this.nome(e.nome)
      if (!nome) return { ok: false, mensagem: 'Nome do plano inválido.' }
      dados.nome = nome
    }
    if (e.tipo !== undefined) {
      const tipo = this.tipo(e.tipo)
      if (!tipo) return { ok: false, mensagem: 'Tipo de plano inválido.' }
      dados.tipo = tipo
    }
    if (e.duracaoMeses !== undefined) {
      const duracaoMeses = this.inteiro(e.duracaoMeses, 1, 120)
      if (duracaoMeses === null) return { ok: false, mensagem: 'A duração deve ser entre 1 e 120 meses.' }
      dados.duracaoMeses = duracaoMeses
    }
    if (e.valor !== undefined) {
      const valor = this.valor(e.valor)
      if (valor === null) return { ok: false, mensagem: 'Valor do plano inválido.' }
      dados.valor = valor
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

class AssinaturaValidador {
  private id(valor: unknown): number | null {
    const numero = Number(valor)
    return Number.isInteger(numero) && numero > 0 ? numero : null
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
    if (ano < 2000 || ano > 2100) return null
    return `${m[1]}-${m[2]}-${m[3]}`
  }

  private status(valor: unknown): StatusAssinatura | null {
    return typeof valor === 'string' && STATUS_ASSINATURA.includes(valor as StatusAssinatura)
      ? (valor as StatusAssinatura)
      : null
  }

  private valor(valor: unknown): number | null {
    const numero = typeof valor === 'number' ? valor : typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : NaN
    if (!Number.isFinite(numero) || numero < 0 || numero > 99999999.99) return null
    return Math.round(numero * 100) / 100
  }

  validarCriacao(entrada: unknown): { ok: true; dados: CriarAssinaturaInput } | { ok: false; mensagem: string } {
    if (typeof entrada !== 'object' || entrada === null) return { ok: false, mensagem: 'Dados inválidos.' }
    const e = entrada as Record<string, unknown>
    const alunoId = this.id(e.alunoId)
    if (alunoId === null) return { ok: false, mensagem: 'Selecione um aluno válido.' }
    const planoId = this.id(e.planoId)
    if (planoId === null) return { ok: false, mensagem: 'Selecione um plano válido.' }
    const dataInicio = this.data(e.dataInicio)
    if (!dataInicio) return { ok: false, mensagem: 'Informe uma data de início válida.' }

    const dados: CriarAssinaturaInput = { alunoId, planoId, dataInicio }
    if (e.valorContratado !== undefined && e.valorContratado !== null && e.valorContratado !== '') {
      const valorContratado = this.valor(e.valorContratado)
      if (valorContratado === null) return { ok: false, mensagem: 'Valor contratado inválido.' }
      dados.valorContratado = valorContratado
    }
    return { ok: true, dados }
  }

  validarAtualizacao(entrada: unknown): { ok: true; dados: AtualizarAssinaturaInput } | { ok: false; mensagem: string } {
    if (typeof entrada !== 'object' || entrada === null) return { ok: false, mensagem: 'Dados inválidos.' }
    const e = entrada as Record<string, unknown>
    const id = this.id(e.id)
    if (id === null) return { ok: false, mensagem: 'Assinatura inválida.' }

    const dados: AtualizarAssinaturaInput = { id }
    if (e.status !== undefined) {
      const status = this.status(e.status)
      if (!status) return { ok: false, mensagem: 'Status de assinatura inválido.' }
      dados.status = status
    }
    if (e.dataFim !== undefined) {
      const dataFim = this.data(e.dataFim)
      if (!dataFim) return { ok: false, mensagem: 'Informe uma data de fim válida.' }
      dados.dataFim = dataFim
    }
    if (e.valorContratado !== undefined) {
      const valorContratado = this.valor(e.valorContratado)
      if (valorContratado === null) return { ok: false, mensagem: 'Valor contratado inválido.' }
      dados.valorContratado = valorContratado
    }
    return { ok: true, dados }
  }

  validarRenovacao(entrada: unknown): { ok: true; dados: RenovarAssinaturaInput } | { ok: false; mensagem: string } {
    if (typeof entrada !== 'object' || entrada === null) return { ok: false, mensagem: 'Dados inválidos.' }
    const e = entrada as Record<string, unknown>
    const id = this.id(e.id)
    if (id === null) return { ok: false, mensagem: 'Assinatura inválida.' }

    const dados: RenovarAssinaturaInput = { id }
    if (e.planoId !== undefined) {
      const planoId = this.id(e.planoId)
      if (planoId === null) return { ok: false, mensagem: 'Plano inválido.' }
      dados.planoId = planoId
    }
    if (e.dataInicio !== undefined) {
      const dataInicio = this.data(e.dataInicio)
      if (!dataInicio) return { ok: false, mensagem: 'Informe uma data de início válida.' }
      dados.dataInicio = dataInicio
    }
    return { ok: true, dados }
  }

  filtro(entrada: unknown): FiltroAssinaturas {
    if (typeof entrada !== 'object' || entrada === null) return {}
    const f = entrada as Record<string, unknown>
    const filtro: FiltroAssinaturas = {}
    const alunoId = this.id(f.alunoId)
    if (alunoId !== null) filtro.alunoId = alunoId
    const status = this.status(f.status)
    if (status) filtro.status = status
    if (typeof f.busca === 'string') filtro.busca = f.busca.slice(0, 120)
    return filtro
  }

  dias(entrada: unknown): number {
    if (typeof entrada !== 'object' || entrada === null) return 30
    const valor = Number((entrada as Record<string, unknown>).dias)
    return Number.isInteger(valor) && valor > 0 && valor <= 3650 ? valor : 30
  }
}

class PlanoRepository {
  private readonly pool = Banco.pool

  listar = async (filtro: FiltroPlanos): Promise<Plano[]> => {
    const busca = typeof filtro.busca === 'string' ? filtro.busca.trim() : ''
    const termo = busca ? `%${busca.replace(/[\\%_]/g, '\\$&')}%` : ''
    const ativo = typeof filtro.ativo === 'boolean' ? (filtro.ativo ? 1 : 0) : null
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT p.id, p.nome, p.tipo, p.duracao_meses, p.valor, p.descricao, p.ativo,
                   (SELECT COUNT(*) FROM assinaturas a
                     WHERE a.plano_id = p.id AND a.status = 'ativa' AND a.data_fim >= CURDATE()) AS assinaturas_ativas
            FROM planos p
            WHERE (? = '' OR p.nome LIKE ? OR p.descricao LIKE ?)
              AND (? IS NULL OR p.ativo = ?)
            ORDER BY p.ativo DESC, p.nome ASC`,
      values: [termo, termo, termo, ativo, ativo],
      timeout: TIMEOUT
    })
    return linhas.map((linha) => ({
      id: Number(linha.id),
      nome: String(linha.nome),
      tipo: String(linha.tipo) as TipoPlano,
      duracaoMeses: Number(linha.duracao_meses),
      valor: Number(linha.valor),
      descricao: linha.descricao ? String(linha.descricao) : undefined,
      ativo: Boolean(linha.ativo),
      assinaturasAtivas: Number(linha.assinaturas_ativas ?? 0)
    }))
  }

  obter = async (id: number): Promise<Plano | null> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT p.id, p.nome, p.tipo, p.duracao_meses, p.valor, p.descricao, p.ativo,
                   (SELECT COUNT(*) FROM assinaturas a
                     WHERE a.plano_id = p.id AND a.status = 'ativa' AND a.data_fim >= CURDATE()) AS assinaturas_ativas
            FROM planos p
            WHERE p.id = ?
            LIMIT 1`,
      values: [id],
      timeout: TIMEOUT
    })
    if (!linhas.length) return null
    const linha = linhas[0]
    return {
      id: Number(linha.id),
      nome: String(linha.nome),
      tipo: String(linha.tipo) as TipoPlano,
      duracaoMeses: Number(linha.duracao_meses),
      valor: Number(linha.valor),
      descricao: linha.descricao ? String(linha.descricao) : undefined,
      ativo: Boolean(linha.ativo),
      assinaturasAtivas: Number(linha.assinaturas_ativas ?? 0)
    }
  }

  criar = async (dados: CriarPlanoInput): Promise<number> => {
    const [resultado] = await this.pool.query<ResultSetHeader>({
      sql: `INSERT INTO planos (nome, tipo, duracao_meses, valor, descricao, ativo, criado_em, atualizado_em)
            VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      values: [dados.nome, dados.tipo, dados.duracaoMeses, dados.valor, textoOuNulo(dados.descricao)],
      timeout: TIMEOUT
    })
    return Number(resultado.insertId)
  }

  atualizar = async (dados: AtualizarPlanoInput): Promise<boolean> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: 'SELECT id FROM planos WHERE id = ? LIMIT 1',
      values: [dados.id],
      timeout: TIMEOUT
    })
    if (!linhas.length) return false

    const campos: string[] = []
    const valores: unknown[] = []
    if (dados.nome !== undefined) { campos.push('nome = ?'); valores.push(dados.nome) }
    if (dados.tipo !== undefined) { campos.push('tipo = ?'); valores.push(dados.tipo) }
    if (dados.duracaoMeses !== undefined) { campos.push('duracao_meses = ?'); valores.push(dados.duracaoMeses) }
    if (dados.valor !== undefined) { campos.push('valor = ?'); valores.push(dados.valor) }
    if (dados.descricao !== undefined) { campos.push('descricao = ?'); valores.push(dados.descricao) }
    if (dados.ativo !== undefined) { campos.push('ativo = ?'); valores.push(dados.ativo ? 1 : 0) }
    if (!campos.length) return true

    campos.push('atualizado_em = NOW()')
    await this.pool.query({
      sql: `UPDATE planos SET ${campos.join(', ')} WHERE id = ?`,
      values: [...valores, dados.id],
      timeout: TIMEOUT
    })
    return true
  }

  excluir = async (id: number): Promise<boolean> => {
    const [resultado] = await this.pool.query<ResultSetHeader>({
      sql: 'UPDATE planos SET ativo = 0, atualizado_em = NOW() WHERE id = ?',
      values: [id],
      timeout: TIMEOUT
    })
    return resultado.affectedRows > 0
  }
}

class AssinaturaRepository {
  private readonly pool = Banco.pool

  private readonly selectBase = `
    SELECT a.id, a.aluno_id, au.nome AS aluno_nome, a.plano_id, p.nome AS plano_nome,
           a.data_inicio, a.data_fim, a.valor_contratado,
           CASE WHEN a.status = 'ativa' AND a.data_fim < CURDATE() THEN 'vencida' ELSE a.status END AS status_efetivo
    FROM assinaturas a
    INNER JOIN alunos al ON al.id = a.aluno_id
    INNER JOIN usuarios au ON au.id = al.usuario_id
    INNER JOIN planos p ON p.id = a.plano_id`

  private mapear = (linha: RowDataPacket): Assinatura => ({
    id: Number(linha.id),
    alunoId: Number(linha.aluno_id),
    alunoNome: String(linha.aluno_nome),
    planoId: Number(linha.plano_id),
    planoNome: String(linha.plano_nome),
    dataInicio: dataISO(linha.data_inicio),
    dataFim: dataISO(linha.data_fim),
    valorContratado: Number(linha.valor_contratado),
    status: String(linha.status_efetivo) as StatusAssinatura
  })

  private bloquearAluno = async (conexao: PoolConnection, alunoId: number): Promise<void> => {
    const [linhas] = await conexao.query<RowDataPacket[]>({
      sql: 'SELECT id FROM alunos WHERE id = ? AND ativo = 1 LIMIT 1 FOR UPDATE',
      values: [alunoId],
      timeout: TIMEOUT
    })
    if (!linhas.length) throw new ErroPlano('Aluno não encontrado ou inativo.')
  }

  private carregarPlano = async (
    conexao: PoolConnection,
    planoId: number
  ): Promise<{ duracaoMeses: number; valor: number }> => {
    const [linhas] = await conexao.query<RowDataPacket[]>({
      sql: 'SELECT id, duracao_meses, valor FROM planos WHERE id = ? AND ativo = 1 LIMIT 1 FOR UPDATE',
      values: [planoId],
      timeout: TIMEOUT
    })
    if (!linhas.length) throw new ErroPlano('Plano não encontrado ou inativo.')
    return { duracaoMeses: Number(linhas[0].duracao_meses), valor: Number(linhas[0].valor) }
  }

  private garantirSemAtiva = async (conexao: PoolConnection, alunoId: number, ignorarId?: number): Promise<void> => {
    const [linhas] = await conexao.query<RowDataPacket[]>({
      sql: `SELECT id FROM assinaturas
            WHERE aluno_id = ?
              AND status = 'ativa'
              AND data_fim >= CURDATE()
              AND (? IS NULL OR id <> ?)
            LIMIT 1 FOR UPDATE`,
      values: [alunoId, ignorarId ?? null, ignorarId ?? null],
      timeout: TIMEOUT
    })
    if (linhas.length) throw new ErroPlano('Este aluno já possui uma assinatura ativa.')
  }

  listar = async (filtro: FiltroAssinaturas): Promise<Assinatura[]> => {
    const alunoId = filtro.alunoId ?? null
    const status = filtro.status ?? ''
    const busca = typeof filtro.busca === 'string' ? filtro.busca.trim() : ''
    const termo = busca ? `%${busca.replace(/[\\%_]/g, '\\$&')}%` : ''
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `${this.selectBase}
            WHERE (? IS NULL OR a.aluno_id = ?)
              AND (? = '' OR (CASE WHEN a.status = 'ativa' AND a.data_fim < CURDATE() THEN 'vencida' ELSE a.status END) = ?)
              AND (? = '' OR au.nome LIKE ? OR p.nome LIKE ?)
            ORDER BY (a.status = 'ativa' AND a.data_fim >= CURDATE()) DESC, a.data_fim ASC, au.nome ASC`,
      values: [alunoId, alunoId, status, status, termo, termo, termo],
      timeout: TIMEOUT
    })
    return linhas.map(this.mapear)
  }

  obter = async (id: number): Promise<Assinatura | null> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `${this.selectBase} WHERE a.id = ? LIMIT 1`,
      values: [id],
      timeout: TIMEOUT
    })
    return linhas.length ? this.mapear(linhas[0]) : null
  }

  vencendo = async (dias: number): Promise<Assinatura[]> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `${this.selectBase}
            WHERE a.status = 'ativa'
              AND a.data_fim >= CURDATE()
              AND a.data_fim <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
            ORDER BY a.data_fim ASC, au.nome ASC`,
      values: [dias],
      timeout: TIMEOUT
    })
    return linhas.map(this.mapear)
  }

  minha = async (alunoId: number): Promise<MinhaAssinatura | null> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT p.nome AS plano_nome,
                   CASE WHEN a.status = 'ativa' AND a.data_fim < CURDATE() THEN 'vencida' ELSE a.status END AS status_efetivo,
                   a.data_inicio, a.data_fim
            FROM assinaturas a
            INNER JOIN planos p ON p.id = a.plano_id
            WHERE a.aluno_id = ?
            ORDER BY (a.status = 'ativa' AND a.data_fim >= CURDATE()) DESC, a.data_inicio DESC
            LIMIT 1`,
      values: [alunoId],
      timeout: TIMEOUT
    })
    if (!linhas.length) return null
    const linha = linhas[0]
    return {
      planoNome: String(linha.plano_nome),
      status: String(linha.status_efetivo) as StatusAssinatura,
      dataInicio: dataISO(linha.data_inicio),
      dataFim: dataISO(linha.data_fim)
    }
  }

  alunoIdPorUsuario = async (usuarioId: number): Promise<number | null> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: 'SELECT id FROM alunos WHERE usuario_id = ? LIMIT 1',
      values: [usuarioId],
      timeout: TIMEOUT
    })
    return linhas.length ? Number(linhas[0].id) : null
  }

  criar = async (dados: CriarAssinaturaInput): Promise<number> => {
    const conexao = await this.pool.getConnection()
    try {
      await conexao.beginTransaction()
      await this.bloquearAluno(conexao, dados.alunoId)
      const plano = await this.carregarPlano(conexao, dados.planoId)
      await this.garantirSemAtiva(conexao, dados.alunoId)

      const dataFim = somarMeses(dados.dataInicio, plano.duracaoMeses)
      const valor = dados.valorContratado ?? plano.valor
      const [resultado] = await conexao.query<ResultSetHeader>({
        sql: `INSERT INTO assinaturas
                (aluno_id, plano_id, data_inicio, data_fim, valor_contratado, status, criado_em, atualizado_em)
              VALUES (?, ?, ?, ?, ?, 'ativa', NOW(), NOW())`,
        values: [dados.alunoId, dados.planoId, dados.dataInicio, dataFim, valor],
        timeout: TIMEOUT
      })
      const assinaturaId = Number(resultado.insertId)
      await gerarMensalidades(conexao, {
        assinaturaId,
        dataInicio: dados.dataInicio,
        valorContratado: valor,
        duracaoMeses: plano.duracaoMeses
      })
      await conexao.commit()
      return assinaturaId
    } catch (erro) {
      await conexao.rollback().catch(() => undefined)
      throw erro
    } finally {
      conexao.release()
    }
  }

  atualizar = async (dados: AtualizarAssinaturaInput): Promise<boolean> => {
    const conexao = await this.pool.getConnection()
    try {
      await conexao.beginTransaction()
      const [linhas] = await conexao.query<RowDataPacket[]>({
        sql: 'SELECT aluno_id, data_inicio, data_fim, status FROM assinaturas WHERE id = ? LIMIT 1 FOR UPDATE',
        values: [dados.id],
        timeout: TIMEOUT
      })
      if (!linhas.length) {
        await conexao.rollback()
        return false
      }

      const alunoId = Number(linhas[0].aluno_id)
      const dataInicio = dataISO(linhas[0].data_inicio)
      const dataFimFinal = dados.dataFim ?? dataISO(linhas[0].data_fim)

      if (dataFimFinal < dataInicio) {
        throw new ErroPlano('A data de fim não pode ser anterior à data de início.')
      }
      if (dados.status === 'ativa') {
        if (dataFimFinal < hojeISO()) {
          throw new ErroPlano('Não é possível ativar uma assinatura com data de fim no passado.')
        }
        await this.bloquearAluno(conexao, alunoId)
        await this.garantirSemAtiva(conexao, alunoId, dados.id)
      }

      const campos: string[] = []
      const valores: unknown[] = []
      if (dados.status !== undefined) { campos.push('status = ?'); valores.push(dados.status) }
      if (dados.dataFim !== undefined) { campos.push('data_fim = ?'); valores.push(dados.dataFim) }
      if (dados.valorContratado !== undefined) { campos.push('valor_contratado = ?'); valores.push(dados.valorContratado) }
      if (!campos.length) {
        await conexao.commit()
        return true
      }

      campos.push('atualizado_em = NOW()')
      await conexao.query({
        sql: `UPDATE assinaturas SET ${campos.join(', ')} WHERE id = ?`,
        values: [...valores, dados.id],
        timeout: TIMEOUT
      })
      if (dados.status === 'cancelada') {
        await conexao.query({
          sql: `UPDATE pagamentos SET status = 'cancelado', atualizado_em = NOW()
                WHERE assinatura_id = ? AND status IN ('pendente', 'atrasado')`,
          values: [dados.id],
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

  excluir = async (id: number): Promise<'excluida' | 'cancelada' | null> => {
    const conexao = await this.pool.getConnection()
    try {
      await conexao.beginTransaction()
      const [linhas] = await conexao.query<RowDataPacket[]>({
        sql: 'SELECT id FROM assinaturas WHERE id = ? LIMIT 1 FOR UPDATE',
        values: [id],
        timeout: TIMEOUT
      })
      if (!linhas.length) {
        await conexao.rollback()
        return null
      }

      const [pagamentos] = await conexao.query<RowDataPacket[]>({
        sql: 'SELECT COUNT(*) AS total FROM pagamentos WHERE assinatura_id = ?',
        values: [id],
        timeout: TIMEOUT
      })

      if (Number(pagamentos[0].total) > 0) {
        await conexao.query({
          sql: "UPDATE assinaturas SET status = 'cancelada', atualizado_em = NOW() WHERE id = ?",
          values: [id],
          timeout: TIMEOUT
        })
        await conexao.query({
          sql: `UPDATE pagamentos SET status = 'cancelado', atualizado_em = NOW()
                WHERE assinatura_id = ? AND status IN ('pendente', 'atrasado')`,
          values: [id],
          timeout: TIMEOUT
        })
        await conexao.commit()
        return 'cancelada'
      }

      await conexao.query({
        sql: 'DELETE FROM assinaturas WHERE id = ?',
        values: [id],
        timeout: TIMEOUT
      })
      await conexao.commit()
      return 'excluida'
    } catch (erro) {
      await conexao.rollback().catch(() => undefined)
      throw erro
    } finally {
      conexao.release()
    }
  }

  renovar = async (dados: RenovarAssinaturaInput): Promise<number | null> => {
    const conexao = await this.pool.getConnection()
    try {
      await conexao.beginTransaction()
      const [linhas] = await conexao.query<RowDataPacket[]>({
        sql: 'SELECT id, aluno_id, plano_id, data_fim, status FROM assinaturas WHERE id = ? LIMIT 1 FOR UPDATE',
        values: [dados.id],
        timeout: TIMEOUT
      })
      if (!linhas.length) {
        await conexao.rollback()
        return null
      }

      const alunoId = Number(linhas[0].aluno_id)
      const planoId = dados.planoId ?? Number(linhas[0].plano_id)
      const statusAtual = String(linhas[0].status)
      const dataFimAtual = dataISO(linhas[0].data_fim)

      await this.bloquearAluno(conexao, alunoId)
      const plano = await this.carregarPlano(conexao, planoId)
      await this.garantirSemAtiva(conexao, alunoId, dados.id)

      const inicioPadrao =
        statusAtual === 'cancelada' || dataFimAtual < hojeISO() ? hojeISO() : somarDias(dataFimAtual, 1)
      const dataInicio = dados.dataInicio ?? inicioPadrao
      const dataFim = somarMeses(dataInicio, plano.duracaoMeses)

      if (statusAtual !== 'cancelada') {
        await conexao.query({
          sql: "UPDATE assinaturas SET status = 'vencida', atualizado_em = NOW() WHERE id = ?",
          values: [dados.id],
          timeout: TIMEOUT
        })
      }

      const [resultado] = await conexao.query<ResultSetHeader>({
        sql: `INSERT INTO assinaturas
                (aluno_id, plano_id, data_inicio, data_fim, valor_contratado, status, criado_em, atualizado_em)
              VALUES (?, ?, ?, ?, ?, 'ativa', NOW(), NOW())`,
        values: [alunoId, planoId, dataInicio, dataFim, plano.valor],
        timeout: TIMEOUT
      })
      const assinaturaId = Number(resultado.insertId)
      await gerarMensalidades(conexao, {
        assinaturaId,
        dataInicio,
        valorContratado: plano.valor,
        duracaoMeses: plano.duracaoMeses
      })
      await conexao.commit()
      return assinaturaId
    } catch (erro) {
      await conexao.rollback().catch(() => undefined)
      throw erro
    } finally {
      conexao.release()
    }
  }
}

export class PlanoIpc {
  private readonly validador = new PlanoValidador()

  constructor(
    private readonly sessao: Sessao,
    private readonly repositorio: PlanoRepository = new PlanoRepository()
  ) {}

  private idValido(valor: unknown): number | null {
    const id = typeof valor === 'number' ? valor : typeof valor === 'string' ? Number(valor) : NaN
    return Number.isInteger(id) && id > 0 ? id : null
  }

  private filtroValido(entrada: unknown): FiltroPlanos {
    if (typeof entrada !== 'object' || entrada === null) return {}
    const f = entrada as Record<string, unknown>
    const filtro: FiltroPlanos = {}
    if (typeof f.busca === 'string') filtro.busca = f.busca.slice(0, 120)
    if (typeof f.ativo === 'boolean') filtro.ativo = f.ativo
    return filtro
  }

  private erro = (contexto: string, erro: unknown, padrao: string): ResultadoPlano => {
    if (erro instanceof ErroPlano) return { ok: false, mensagem: erro.message }
    if (erro instanceof Error && erro.message === 'Acesso negado') {
      return { ok: false, mensagem: 'Acesso negado para esta operação.' }
    }
    console.error(`[${contexto}]`, erro)
    return { ok: false, mensagem: BancoErros.mensagem(erro, padrao) }
  }

  registrar = (): void => {
    ipcMain.handle('planos:listar', async (_evento, entrada: unknown): Promise<Plano[]> => {
      this.sessao.exigir(['admin'])
      return this.repositorio.listar(this.filtroValido(entrada))
    })

    ipcMain.handle('planos:obter', async (_evento, entrada: unknown): Promise<Plano | null> => {
      this.sessao.exigir(['admin'])
      const id = this.idValido(entrada)
      if (id === null) throw new Error('Plano inválido.')
      return this.repositorio.obter(id)
    })

    ipcMain.handle('planos:criar', async (_evento, entrada: unknown): Promise<ResultadoPlano> => {
      this.sessao.exigir(['admin'])
      const v = this.validador.validarCriacao(entrada)
      if (!v.ok) return v
      try {
        const id = await this.repositorio.criar(v.dados)
        return { ok: true, id }
      } catch (erro) {
        return this.erro('planos:criar', erro, 'Não foi possível cadastrar o plano.')
      }
    })

    ipcMain.handle('planos:atualizar', async (_evento, entrada: unknown): Promise<ResultadoPlano> => {
      this.sessao.exigir(['admin'])
      const v = this.validador.validarAtualizacao(entrada)
      if (!v.ok) return v
      try {
        const ok = await this.repositorio.atualizar(v.dados)
        if (!ok) return { ok: false, mensagem: 'Plano não encontrado.' }
        return { ok: true, id: v.dados.id }
      } catch (erro) {
        return this.erro('planos:atualizar', erro, 'Não foi possível atualizar o plano.')
      }
    })

    ipcMain.handle('planos:excluir', async (_evento, entrada: unknown): Promise<ResultadoPlano> => {
      this.sessao.exigir(['admin'])
      const id = this.idValido(entrada)
      if (id === null) return { ok: false, mensagem: 'Plano inválido.' }
      try {
        const ok = await this.repositorio.excluir(id)
        if (!ok) return { ok: false, mensagem: 'Plano não encontrado.' }
        return { ok: true, id }
      } catch (erro) {
        return this.erro('planos:excluir', erro, 'Não foi possível desativar o plano.')
      }
    })
  }
}

export class AssinaturaIpc {
  private readonly validador = new AssinaturaValidador()

  constructor(
    private readonly sessao: Sessao,
    private readonly repositorio: AssinaturaRepository = new AssinaturaRepository()
  ) {}

  private idValido(valor: unknown): number | null {
    const id = typeof valor === 'number' ? valor : typeof valor === 'string' ? Number(valor) : NaN
    return Number.isInteger(id) && id > 0 ? id : null
  }

  private erro = (contexto: string, erro: unknown, padrao: string): ResultadoPlano => {
    if (erro instanceof ErroPlano) return { ok: false, mensagem: erro.message }
    if (erro instanceof Error && erro.message === 'Acesso negado') {
      return { ok: false, mensagem: 'Acesso negado para esta operação.' }
    }
    console.error(`[${contexto}]`, erro)
    return { ok: false, mensagem: BancoErros.mensagem(erro, padrao) }
  }

  registrar = (): void => {
    ipcMain.handle('assinaturas:listar', async (_evento, entrada: unknown): Promise<Assinatura[]> => {
      this.sessao.exigir(['admin'])
      return this.repositorio.listar(this.validador.filtro(entrada))
    })

    ipcMain.handle('assinaturas:obter', async (_evento, entrada: unknown): Promise<Assinatura | null> => {
      this.sessao.exigir(['admin'])
      const id = this.idValido(entrada)
      if (id === null) throw new Error('Assinatura inválida.')
      return this.repositorio.obter(id)
    })

    ipcMain.handle('assinaturas:criar', async (_evento, entrada: unknown): Promise<ResultadoPlano> => {
      this.sessao.exigir(['admin'])
      const v = this.validador.validarCriacao(entrada)
      if (!v.ok) return v
      try {
        const id = await this.repositorio.criar(v.dados)
        return { ok: true, id }
      } catch (erro) {
        return this.erro('assinaturas:criar', erro, 'Não foi possível criar a assinatura.')
      }
    })

    ipcMain.handle('assinaturas:atualizar', async (_evento, entrada: unknown): Promise<ResultadoPlano> => {
      this.sessao.exigir(['admin'])
      const v = this.validador.validarAtualizacao(entrada)
      if (!v.ok) return v
      try {
        const ok = await this.repositorio.atualizar(v.dados)
        if (!ok) return { ok: false, mensagem: 'Assinatura não encontrada.' }
        return { ok: true, id: v.dados.id }
      } catch (erro) {
        return this.erro('assinaturas:atualizar', erro, 'Não foi possível atualizar a assinatura.')
      }
    })

    ipcMain.handle('assinaturas:excluir', async (_evento, entrada: unknown): Promise<ResultadoPlano> => {
      this.sessao.exigir(['admin'])
      const id = this.idValido(entrada)
      if (id === null) return { ok: false, mensagem: 'Assinatura inválida.' }
      try {
        const acao = await this.repositorio.excluir(id)
        if (!acao) return { ok: false, mensagem: 'Assinatura não encontrada.' }
        return { ok: true, id, acao }
      } catch (erro) {
        return this.erro('assinaturas:excluir', erro, 'Não foi possível excluir a assinatura.')
      }
    })

    ipcMain.handle('assinaturas:renovar', async (_evento, entrada: unknown): Promise<ResultadoPlano> => {
      this.sessao.exigir(['admin'])
      const v = this.validador.validarRenovacao(entrada)
      if (!v.ok) return v
      try {
        const id = await this.repositorio.renovar(v.dados)
        if (id === null) return { ok: false, mensagem: 'Assinatura não encontrada.' }
        return { ok: true, id }
      } catch (erro) {
        return this.erro('assinaturas:renovar', erro, 'Não foi possível renovar a assinatura.')
      }
    })

    ipcMain.handle('assinaturas:vencendo', async (_evento, entrada: unknown): Promise<Assinatura[]> => {
      this.sessao.exigir(['admin'])
      return this.repositorio.vencendo(this.validador.dias(entrada))
    })

    ipcMain.handle('assinaturas:minha', async (): Promise<MinhaAssinatura | null> => {
      const usuario = this.sessao.exigir(['aluno'])
      const alunoId = await this.repositorio.alunoIdPorUsuario(usuario.id)
      if (alunoId === null) return null
      return this.repositorio.minha(alunoId)
    })
  }
}
