import { ipcMain } from 'electron'
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { Banco } from '../Banco'
import { BancoErros } from '../BancoErros'
import { EmailServico } from '../integracoes/EmailBackend'
import { Sessao } from '../Sessao'

export type TipoNotificacao = 'vencimento' | 'chuva' | 'experimental' | 'geral'
export type StatusNotificacao = 'pendente' | 'enviado' | 'falhou'

export type Notificacao = {
  id: number
  usuarioId?: number
  usuarioNome?: string
  aulaId?: number
  pagamentoId?: number
  destinatarioEmail: string
  tipo: TipoNotificacao
  canal: 'email' | 'sistema'
  assunto: string
  mensagem: string
  status: StatusNotificacao
  erro?: string
  criadoEm: string
  enviadoEm?: string
}

export type FiltroNotificacoes = {
  tipo?: TipoNotificacao
  status?: StatusNotificacao
  busca?: string
}

export type FalhaNotificacao = {
  notificacaoId: number
  email: string
  erro: string
}

export type ResultadoEnvioVencimentos = {
  configurado: boolean
  total: number
  enviados: number
  semEmail: number
  falhas: FalhaNotificacao[]
  notificacoes: Notificacao[]
}

export type SituacaoNotificacoes = {
  smtpConfigurado: boolean
  remetente?: string
  enviadasHoje: number
  falhasHoje: number
  pendentes: number
}

export type EstadoAgendadorVencimento = {
  ativo: boolean
  diasAntes: number
  executando: boolean
  ultimaExecucaoEm?: string
  proximaExecucaoEm?: string
  ultimoResultado?: ResultadoEnvioVencimentos
}

export interface AgendadorVencimento {
  estado(): EstadoAgendadorVencimento
}

const TIMEOUT = 15000
const DIAS_ANTES_PADRAO = 7
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TIPOS: TipoNotificacao[] = ['vencimento', 'chuva', 'experimental', 'geral']
const STATUS: StatusNotificacao[] = ['pendente', 'enviado', 'falhou']

const dataStr = (valor: unknown): string => String(valor ?? '').slice(0, 10)

const dataBr = (valor: string): string => {
  const [ano, mes, dia] = dataStr(valor).split('-')
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor
}

const competenciaBr = (valor: string): string => {
  const [ano, mes] = dataStr(valor).split('-')
  return ano && mes ? `${mes}/${ano}` : valor
}

const moedaBr = (valor: unknown): string =>
  Number(valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type PagamentoVencendo = {
  pagamentoId: number
  alunoId: number
  usuarioId: number
  alunoNome: string
  email: string
  planoNome: string
  competencia: string
  valor: number
  dataVencimento: string
  statusPagamento: string
}

const mapear = (linha: RowDataPacket): Notificacao => ({
  id: Number(linha.id),
  usuarioId: linha.usuario_id === null || linha.usuario_id === undefined ? undefined : Number(linha.usuario_id),
  usuarioNome: linha.usuario_nome ? String(linha.usuario_nome) : undefined,
  aulaId: linha.aula_id === null || linha.aula_id === undefined ? undefined : Number(linha.aula_id),
  pagamentoId:
    linha.pagamento_id === null || linha.pagamento_id === undefined ? undefined : Number(linha.pagamento_id),
  destinatarioEmail: String(linha.destinatario_email ?? ''),
  tipo: String(linha.tipo) as TipoNotificacao,
  canal: String(linha.canal) as 'email' | 'sistema',
  assunto: String(linha.assunto ?? ''),
  mensagem: String(linha.mensagem ?? ''),
  status: String(linha.status) as StatusNotificacao,
  erro: linha.erro ? String(linha.erro) : undefined,
  criadoEm: String(linha.criado_em ?? ''),
  enviadoEm: linha.enviado_em ? String(linha.enviado_em) : undefined
})

class NotificacaoRepository {
  private readonly pool = Banco.pool

  pagamentosVencendo = async (diasAntes: number): Promise<PagamentoVencendo[]> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT pg.id AS pagamento_id, al.id AS aluno_id, u.id AS usuario_id,
                   u.nome AS aluno_nome, u.email AS aluno_email, pl.nome AS plano_nome,
                   pg.competencia, pg.valor, pg.data_vencimento, pg.status AS status_pagamento
            FROM pagamentos pg
            INNER JOIN assinaturas a ON a.id = pg.assinatura_id
            INNER JOIN alunos al ON al.id = a.aluno_id
            INNER JOIN usuarios u ON u.id = al.usuario_id
            INNER JOIN planos pl ON pl.id = a.plano_id
            WHERE pg.status IN ('pendente', 'atrasado')
              AND al.ativo = 1
              AND u.ativo = 1
              AND pg.data_vencimento BETWEEN DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                                         AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
              AND NOT EXISTS (
                SELECT 1 FROM notificacoes n
                WHERE n.pagamento_id = pg.id
                  AND n.tipo = 'vencimento'
                  AND n.status = 'enviado'
                  AND n.criado_em >= DATE_SUB(NOW(), INTERVAL 7 DAY)
              )
            ORDER BY pg.data_vencimento ASC, u.nome ASC
            LIMIT 500`,
      values: [diasAntes],
      timeout: TIMEOUT
    })
    return linhas.map((linha) => ({
      pagamentoId: Number(linha.pagamento_id),
      alunoId: Number(linha.aluno_id),
      usuarioId: Number(linha.usuario_id),
      alunoNome: String(linha.aluno_nome ?? ''),
      email: String(linha.aluno_email ?? ''),
      planoNome: String(linha.plano_nome ?? ''),
      competencia: dataStr(linha.competencia),
      valor: Number(linha.valor ?? 0),
      dataVencimento: dataStr(linha.data_vencimento),
      statusPagamento: String(linha.status_pagamento ?? 'pendente')
    }))
  }

  criar = async (dados: {
    usuarioId: number
    pagamentoId: number
    destinatarioEmail: string
    assunto: string
    mensagem: string
  }): Promise<number> => {
    const [resultado] = await this.pool.query<ResultSetHeader>({
      sql: `INSERT INTO notificacoes
        (usuario_id, pagamento_id, destinatario_email, tipo, canal, assunto, mensagem, status, criado_em)
        VALUES (?, ?, ?, 'vencimento', 'email', ?, ?, 'pendente', NOW())`,
      values: [
        dados.usuarioId,
        dados.pagamentoId,
        dados.destinatarioEmail,
        dados.assunto,
        dados.mensagem
      ],
      timeout: TIMEOUT
    })
    return Number(resultado.insertId)
  }

  atualizarStatus = async (id: number, status: StatusNotificacao, erro: string | null): Promise<void> => {
    await this.pool.query({
      sql: `UPDATE notificacoes
            SET status = ?, erro = ?, enviado_em = CASE WHEN ? = 'enviado' THEN NOW() ELSE NULL END
            WHERE id = ?`,
      values: [status, erro ? erro.slice(0, 255) : null, status, id],
      timeout: TIMEOUT
    })
  }

  obter = async (id: number): Promise<Notificacao | null> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT n.*, u.nome AS usuario_nome
            FROM notificacoes n
            LEFT JOIN usuarios u ON u.id = n.usuario_id
            WHERE n.id = ?
            LIMIT 1`,
      values: [id],
      timeout: TIMEOUT
    })
    return linhas.length ? mapear(linhas[0]) : null
  }

  listar = async (filtro: FiltroNotificacoes): Promise<Notificacao[]> => {
    const condicoes: string[] = []
    const valores: unknown[] = []
    if (filtro.tipo) {
      condicoes.push('n.tipo = ?')
      valores.push(filtro.tipo)
    }
    if (filtro.status) {
      condicoes.push('n.status = ?')
      valores.push(filtro.status)
    }
    if (filtro.busca) {
      const termo = `%${filtro.busca.replace(/[\\%_]/g, '\\$&')}%`
      condicoes.push('(n.destinatario_email LIKE ? OR n.assunto LIKE ? OR u.nome LIKE ?)')
      valores.push(termo, termo, termo)
    }
    const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : ''
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT n.*, u.nome AS usuario_nome
            FROM notificacoes n
            LEFT JOIN usuarios u ON u.id = n.usuario_id
            ${where}
            ORDER BY n.criado_em DESC, n.id DESC
            LIMIT 500`,
      values: valores,
      timeout: TIMEOUT
    })
    return linhas.map(mapear)
  }

  minhas = async (usuarioId: number): Promise<Notificacao[]> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT n.*, u.nome AS usuario_nome
            FROM notificacoes n
            LEFT JOIN usuarios u ON u.id = n.usuario_id
            WHERE n.usuario_id = ?
            ORDER BY n.criado_em DESC, n.id DESC
            LIMIT 200`,
      values: [usuarioId],
      timeout: TIMEOUT
    })
    return linhas.map(mapear)
  }

  excluir = async (id: number): Promise<boolean> => {
    const [resultado] = await this.pool.query<ResultSetHeader>({
      sql: 'DELETE FROM notificacoes WHERE id = ?',
      values: [id],
      timeout: TIMEOUT
    })
    return resultado.affectedRows > 0
  }

  contagens = async (): Promise<{ enviadasHoje: number; falhasHoje: number; pendentes: number }> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT
              COALESCE(SUM(status = 'enviado' AND DATE(criado_em) = CURDATE()), 0) AS enviadas_hoje,
              COALESCE(SUM(status = 'falhou' AND DATE(criado_em) = CURDATE()), 0) AS falhas_hoje,
              COALESCE(SUM(status = 'pendente'), 0) AS pendentes
            FROM notificacoes
            WHERE tipo = 'vencimento'`,
      timeout: TIMEOUT
    })
    const linha = linhas[0] ?? {}
    return {
      enviadasHoje: Number(linha.enviadas_hoje ?? 0),
      falhasHoje: Number(linha.falhas_hoje ?? 0),
      pendentes: Number(linha.pendentes ?? 0)
    }
  }
}

export class NotificacaoServico {
  private readonly repositorio: NotificacaoRepository

  constructor(
    private readonly email: EmailServico = new EmailServico(),
    repositorio?: NotificacaoRepository
  ) {
    this.repositorio = repositorio ?? new NotificacaoRepository()
  }

  emailConfigurado = (): boolean => this.email.configurado()

  emailRemetente = (): string => this.email.remetenteFormatado()

  situacao = async (): Promise<SituacaoNotificacoes> => {
    const contagens = await this.repositorio.contagens()
    return {
      smtpConfigurado: this.email.configurado(),
      remetente: this.email.configurado() ? this.email.remetenteFormatado() : undefined,
      ...contagens
    }
  }

  listar = async (filtro: FiltroNotificacoes): Promise<Notificacao[]> => this.repositorio.listar(filtro)

  minhas = async (usuarioId: number): Promise<Notificacao[]> => this.repositorio.minhas(usuarioId)

  excluir = async (id: number): Promise<boolean> => this.repositorio.excluir(id)

  enviarVencimentos = async (diasAntes = DIAS_ANTES_PADRAO): Promise<ResultadoEnvioVencimentos> => {
    const dias = Math.min(60, Math.max(1, Math.round(diasAntes)))
    if (!this.email.configurado()) {
      return {
        configurado: false,
        total: 0,
        enviados: 0,
        semEmail: 0,
        falhas: [],
        notificacoes: []
      }
    }

    const pagamentos = await this.repositorio.pagamentosVencendo(dias)
    const falhas: FalhaNotificacao[] = []
    const notificacoes: Notificacao[] = []
    let enviados = 0
    let semEmail = 0

    for (const pagamento of pagamentos) {
      const email = pagamento.email.trim().toLowerCase()
      if (!EMAIL_VALIDO.test(email)) {
        semEmail++
        continue
      }

      const competencia = competenciaBr(pagamento.competencia)
      const assunto = `Lembrete de vencimento — ${pagamento.planoNome} (${competencia})`
      const situacao = pagamento.statusPagamento === 'atrasado' ? 'em atraso' : 'em aberto'
      const mensagem = [
        `Olá, ${pagamento.alunoNome}!`,
        '',
        `Este é um lembrete automático do seu plano ${pagamento.planoNome} na Academia Cotil.`,
        '',
        `Mensalidade: ${competencia}`,
        `Valor: ${moedaBr(pagamento.valor)}`,
        `Vencimento: ${dataBr(pagamento.dataVencimento)}`,
        `Situação: ${situacao}`,
        '',
        'Se o pagamento já foi realizado, desconsidere este aviso.',
        '',
        'Academia Cotil'
      ].join('\n')

      const notificacaoId = await this.repositorio.criar({
        usuarioId: pagamento.usuarioId,
        pagamentoId: pagamento.pagamentoId,
        destinatarioEmail: email,
        assunto,
        mensagem
      })

      const resultado = await this.email.enviar([email], assunto, mensagem)
      const enviado = resultado.enviados > 0
      const erro = enviado
        ? null
        : resultado.falhas[0]?.erro ?? resultado.erroGeral ?? 'Não foi possível enviar o e-mail.'
      await this.repositorio.atualizarStatus(notificacaoId, enviado ? 'enviado' : 'falhou', erro)

      if (enviado) {
        enviados++
      } else {
        falhas.push({ notificacaoId, email, erro: erro ?? 'Falha ao enviar o e-mail.' })
      }

      const criada = await this.repositorio.obter(notificacaoId)
      if (criada) notificacoes.push(criada)
    }

    return {
      configurado: true,
      total: pagamentos.length,
      enviados,
      semEmail,
      falhas,
      notificacoes
    }
  }
}

class NotificacaoValidador {
  private id(valor: unknown): number | null {
    const numero = typeof valor === 'number' ? valor : typeof valor === 'string' ? Number(valor) : NaN
    return Number.isInteger(numero) && numero > 0 ? numero : null
  }

  filtro(entrada: unknown): FiltroNotificacoes {
    if (typeof entrada !== 'object' || entrada === null) return {}
    const e = entrada as Record<string, unknown>
    const filtro: FiltroNotificacoes = {}
    if (typeof e.tipo === 'string' && TIPOS.includes(e.tipo as TipoNotificacao)) {
      filtro.tipo = e.tipo as TipoNotificacao
    }
    if (typeof e.status === 'string' && STATUS.includes(e.status as StatusNotificacao)) {
      filtro.status = e.status as StatusNotificacao
    }
    if (typeof e.busca === 'string') {
      const busca = e.busca.trim()
      if (busca) filtro.busca = busca.slice(0, 120)
    }
    return filtro
  }

  idValido(valor: unknown): number | null {
    return this.id(valor)
  }
}

export class NotificacaoIpc {
  private readonly validador = new NotificacaoValidador()

  constructor(
    private readonly sessao: Sessao,
    private readonly agendador?: AgendadorVencimento,
    private readonly servico: NotificacaoServico = new NotificacaoServico()
  ) {}

  private erro = (contexto: string, erro: unknown, padrao: string): { ok: false; mensagem: string } => {
    console.error(`[${contexto}]`, erro)
    return { ok: false, mensagem: BancoErros.mensagem(erro, padrao) }
  }

  registrar = (): void => {
    ipcMain.handle('notificacoes:listar', async (_evento, entrada: unknown): Promise<Notificacao[]> => {
      this.sessao.exigir(['admin'])
      return this.servico.listar(this.validador.filtro(entrada))
    })

    ipcMain.handle('notificacoes:minhas', async (): Promise<Notificacao[]> => {
      const usuario = this.sessao.exigir(['aluno'])
      return this.servico.minhas(usuario.id)
    })

    ipcMain.handle(
      'notificacoes:situacao',
      async (): Promise<SituacaoNotificacoes & { agendador?: EstadoAgendadorVencimento }> => {
        this.sessao.exigir(['admin'])
        const situacao = await this.servico.situacao()
        return { ...situacao, agendador: this.agendador?.estado() }
      }
    )

    ipcMain.handle('notificacoes:excluir', async (_evento, entrada: unknown): Promise<{ ok: boolean; mensagem?: string }> => {
      this.sessao.exigir(['admin'])
      const id = this.validador.idValido(entrada)
      if (id === null) return { ok: false, mensagem: 'Notificação inválida.' }
      try {
        const ok = await this.servico.excluir(id)
        return ok ? { ok: true } : { ok: false, mensagem: 'Notificação não encontrada.' }
      } catch (erro) {
        return this.erro('notificacoes:excluir', erro, 'Não foi possível excluir a notificação.')
      }
    })
  }
}

export { DIAS_ANTES_PADRAO }
