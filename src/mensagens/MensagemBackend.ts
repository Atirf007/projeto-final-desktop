import { Notification } from 'electron'
import { HorarioAula, OpenMeteoClient, PrevisaoClima } from '../integracoes/ClimaBackend'
import { EmailServico, FalhaEmail, ResultadoEnvioEmail } from '../integracoes/EmailBackend'
import { AlunoDestinatarios, ResultadoDestinatarios } from './DestinatariosAlunos'
import { AulasAmanha } from './AulasAmanha'

export type Mensagem = {
  id: number
  criadaEm: string
  tipo: 'chuva'
  assunto: string
  texto: string
  status: 'enviado' | 'falhou'
  erro?: string
  dataAula: string
  previsao: PrevisaoClima
  emailConfigurado: boolean
  destinatarios: number
  emailsEnviados: number
  falhasEmail: FalhaEmail[]
}

export type ResultadoVerificacao =
  | {
      ok: true
      local: string
      previsao: PrevisaoClima
      hoje?: PrevisaoClima
      enviada: boolean
      consolidar: boolean
      emails: ResultadoEnvioEmail
      motivo: string
      mensagem?: Mensagem
      historico: Mensagem[]
    }
  | { ok: false; mensagem: string; historico: Mensagem[] }

export class MensagemServico {
  private readonly historico: Mensagem[] = []
  private readonly avisosPorData = new Map<string, Mensagem>()
  private readonly datasAvisadas = new Set<string>()
  private proximoId = 1

  constructor(
    private readonly clima: OpenMeteoClient = new OpenMeteoClient(),
    private readonly emails: EmailServico = new EmailServico(),
    private readonly destinatarios: AlunoDestinatarios = new AlunoDestinatarios(),
    private readonly aulas: AulasAmanha = new AulasAmanha()
  ) {}

  marcarAvisoAnterior = (data: string): void => {
    if (data) this.datasAvisadas.add(data)
  }

  emailConfigurado = (): boolean => this.emails.configurado()

  emailRemetente = (): string => this.emails.remetenteFormatado()

  private dataBr = (iso: string): string => {
    const [ano, mes, dia] = iso.split('-')
    return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso
  }

  private textoDoAviso = (previsao: PrevisaoClima): string => {
    const janela = previsao.janela ? ` no horário das aulas (${previsao.janela})` : ''
    return (
      `Atenção alunos: a previsão para amanhã (${this.dataBr(previsao.data)}) indica chuva${janela}. ` +
      'Por isso, a aula será realizada dentro da academia, no espaço coberto. ' +
      'Compareça no horário habitual.'
    )
  }

  private horariosDasAulas = async (): Promise<HorarioAula[] | undefined> => {
    try {
      const horarios = await this.aulas.listar()
      return horarios.length > 0 ? horarios : undefined
    } catch {
      return undefined
    }
  }

  private enviarNotificacao = (assunto: string, texto: string): { status: 'enviado' | 'falhou'; erro?: string } => {
    if (!Notification.isSupported()) {
      return { status: 'falhou', erro: 'Notificações do sistema não estão disponíveis.' }
    }

    try {
      new Notification({ title: assunto, body: texto }).show()
      return { status: 'enviado' }
    } catch (erro) {
      return {
        status: 'falhou',
        erro: erro instanceof Error ? erro.message : 'Falha ao enviar a notificação.'
      }
    }
  }

  private enviarEmails = async (assunto: string, texto: string): Promise<ResultadoEnvioEmail> => {
    const lista: ResultadoDestinatarios = await this.destinatarios.listar()

    if (!lista.ok) {
      return {
        configurado: this.emails.configurado(),
        total: 0,
        enviados: 0,
        falhas: [],
        erroGeral: lista.mensagem
      }
    }

    return this.emails.enviar(lista.emails, assunto, texto)
  }

  private montarMotivo = (emails: ResultadoEnvioEmail, previsao: PrevisaoClima): string => {
    const quando = `para amanhã (${this.dataBr(previsao.data)})`

    if (!emails.configurado) {
      return (
        `Previsão de chuva ${quando}: aviso exibido como notificação do sistema. ` +
        'O envio por e-mail não está configurado (defina SMTP_HOST, SMTP_USER e SMTP_PASS no .env).'
      )
    }

    if (emails.total === 0) {
      return `Previsão de chuva ${quando}, mas nenhum aluno ativo possui e-mail cadastrado.`
    }

    const alunos = emails.total === 1 ? 'aluno' : 'alunos'
    if (emails.enviados === emails.total) {
      return `Previsão de chuva ${quando}: aviso enviado por e-mail para ${emails.enviados} ${alunos}.`
    }

    if (emails.enviados > 0) {
      return (
        `Previsão de chuva ${quando}: aviso enviado para ${emails.enviados} de ${emails.total} ${alunos}. ` +
        `${emails.falhas.length} envio(s) falharam.`
      )
    }

    return (
      `Previsão de chuva ${quando}, mas nenhum e-mail pôde ser enviado. ` +
      (emails.erroGeral ?? 'Verifique as configurações de SMTP.')
    )
  }

  listar = (): Mensagem[] => [...this.historico].sort((a, b) => b.id - a.id)

  verificar = async (limiarChuva = 50): Promise<ResultadoVerificacao> => {
    const numeroLimiar = Number(limiarChuva)
    const limiar = Number.isFinite(numeroLimiar)
      ? Math.min(100, Math.max(0, Math.round(numeroLimiar)))
      : 50
    const resultado = await this.clima.buscar(limiar, await this.horariosDasAulas())
    if (!resultado.ok) {
      return { ok: false, mensagem: resultado.mensagem, historico: this.listar() }
    }

    const { previsao, local, hoje } = resultado

    if (!previsao.vaiChover) {
      return {
        ok: true,
        local,
        previsao,
        hoje,
        enviada: false,
        consolidar: false,
        emails: {
          configurado: this.emails.configurado(),
          total: 0,
          enviados: 0,
          falhas: []
        },
        motivo:
          `Chance de chuva de ${Math.round(previsao.probabilidadeChuva)}%` +
          (previsao.janela ? ` no horário das aulas (${previsao.janela})` : '') +
          ` para amanhã (${this.dataBr(previsao.data)}) abaixo do mínimo configurado (${limiar}%). ` +
          'Nenhuma mensagem foi enviada.',
        historico: this.listar()
      }
    }

    const jaEnviada = this.avisosPorData.get(previsao.data)
    if (jaEnviada) {
      return {
        ok: true,
        local,
        previsao,
        hoje,
        enviada: false,
        consolidar: true,
        emails: {
          configurado: this.emails.configurado(),
          total: jaEnviada.destinatarios,
          enviados: 0,
          falhas: []
        },
        motivo: `O aviso para ${this.dataBr(previsao.data)} já foi enviado nesta sessão.`,
        mensagem: jaEnviada,
        historico: this.listar()
      }
    }

    if (this.datasAvisadas.has(previsao.data)) {
      return {
        ok: true,
        local,
        previsao,
        hoje,
        enviada: false,
        consolidar: true,
        emails: {
          configurado: this.emails.configurado(),
          total: 0,
          enviados: 0,
          falhas: []
        },
        motivo: `O aviso para ${this.dataBr(previsao.data)} já foi enviado anteriormente.`,
        historico: this.listar()
      }
    }

    const assunto = 'Aula de amanhã será dentro da academia'
    const texto = this.textoDoAviso(previsao)

    const notificacao = this.enviarNotificacao(assunto, texto)
    const emails = await this.enviarEmails(assunto, texto)

    const enviada = emails.configurado ? emails.enviados > 0 : notificacao.status === 'enviado'
    const consolidar = !emails.configurado || emails.total === 0 || emails.enviados > 0
    const status: 'enviado' | 'falhou' = enviada ? 'enviado' : 'falhou'

    const mensagem: Mensagem = {
      id: this.proximoId++,
      criadaEm: new Date().toISOString(),
      tipo: 'chuva',
      assunto,
      texto,
      status,
      erro: status === 'falhou' ? emails.erroGeral ?? notificacao.erro : undefined,
      dataAula: previsao.data,
      previsao,
      emailConfigurado: emails.configurado,
      destinatarios: emails.total,
      emailsEnviados: emails.enviados,
      falhasEmail: emails.falhas
    }

    this.historico.push(mensagem)
    this.avisosPorData.set(previsao.data, mensagem)
    if (consolidar) this.datasAvisadas.add(previsao.data)

    return {
      ok: true,
      local,
      previsao,
      hoje,
      enviada: status === 'enviado',
      consolidar,
      emails,
      motivo: this.montarMotivo(emails, previsao),
      mensagem,
      historico: this.listar()
    }
  }
}
