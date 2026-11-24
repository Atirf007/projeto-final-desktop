import { Notification } from 'electron'
import { OpenMeteoClient, PrevisaoClima } from '../integracoes/ClimaBackend'
import { EmailServico, FalhaEmail, ResultadoEnvioEmail } from '../integracoes/EmailBackend'
import { AlunoDestinatarios } from './DestinatariosAlunos'
import { AulaExternaAmanha, AulasAmanha } from './AulasAmanha'
import { NotificacaoChuvaRepositorio, RegistroNotificacaoChuva } from './NotificacaoChuva'

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

const chaveAviso = (aulaId: number, email: string): string => `${aulaId}|${email.trim().toLowerCase()}`

export class MensagemServico {
  private readonly historico: Mensagem[] = []
  private readonly datasAvisadas = new Set<string>()
  private proximoId = 1

  constructor(
    private readonly clima: OpenMeteoClient = new OpenMeteoClient(),
    private readonly emails: EmailServico = new EmailServico(),
    private readonly destinatarios: AlunoDestinatarios = new AlunoDestinatarios(),
    private readonly aulas: AulasAmanha = new AulasAmanha(),
    private readonly notificacoes: NotificacaoChuvaRepositorio = new NotificacaoChuvaRepositorio()
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
      `Atenção alunos: a previsão para amanhã (${this.dataBr(previsao.data)}) indica chuva${janela} ` +
      'nas aulas ao ar livre. Por isso, a academia poderá transferir a aula para a área interna ou remarcá-la. ' +
      'Aguarde a confirmação da equipe.'
    )
  }

  private carregarAulasExternas = async (): Promise<
    { ok: true; aulas: AulaExternaAmanha[] } | { ok: false; mensagem: string }
  > => {
    try {
      return { ok: true, aulas: await this.aulas.listar() }
    } catch {
      return { ok: false, mensagem: 'Não foi possível carregar as aulas ao ar livre de amanhã.' }
    }
  }

  private enviarNotificacao = (assunto: string, texto: string): { status: 'enviado' | 'falhou'; erro?: string } => {
    if (!Notification.isSupported()) {
      return { status: 'falhou', erro: 'Notificações do sistema não estão disponíveis.' }
    }

    try {
      new Notification({ title: assunto, body: texto }).show()
      return { status: 'enviado' }
    } catch {
      return { status: 'falhou', erro: 'Falha ao enviar a notificação do sistema.' }
    }
  }

  private montarMotivo = (emails: ResultadoEnvioEmail, previsao: PrevisaoClima): string => {
    const quando = `para as aulas ao ar livre de amanhã (${this.dataBr(previsao.data)})`

    if (!emails.configurado) {
      return `Previsão de chuva ${quando}, mas o envio por e-mail não está configurado.`
    }

    if (emails.total === 0) {
      return `Previsão de chuva ${quando}, mas não há alunos inscritos nas aulas ao ar livre.`
    }

    const alunos = emails.total === 1 ? 'aluno inscrito' : 'alunos inscritos'
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

  private semEnvio = (
    local: string,
    previsao: PrevisaoClima,
    hoje: PrevisaoClima | undefined,
    motivo: string
  ): ResultadoVerificacao => ({
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
    motivo,
    historico: this.listar()
  })

  listar = (): Mensagem[] => [...this.historico].sort((a, b) => b.id - a.id)

  verificar = async (limiarChuva = 50): Promise<ResultadoVerificacao> => {
    const numeroLimiar = Number(limiarChuva)
    const limiar = Number.isFinite(numeroLimiar)
      ? Math.min(100, Math.max(0, Math.round(numeroLimiar)))
      : 50

    const aulasResultado = await this.carregarAulasExternas()
    if (!aulasResultado.ok) {
      return { ok: false, mensagem: aulasResultado.mensagem, historico: this.listar() }
    }
    const aulas = aulasResultado.aulas

    const resultado = await this.clima.buscar(limiar, aulas.length > 0 ? aulas : undefined)
    if (!resultado.ok) {
      return { ok: false, mensagem: resultado.mensagem, historico: this.listar() }
    }

    const { previsao, local, hoje } = resultado

    if (aulas.length === 0) {
      return this.semEnvio(local, previsao, hoje, 'Não há aulas ao ar livre amanhã. Nenhum aviso foi enviado.')
    }

    if (!previsao.vaiChover) {
      return this.semEnvio(
        local,
        previsao,
        hoje,
        `Chance de chuva de ${Math.round(previsao.probabilidadeChuva)}%` +
          (previsao.janela ? ` no horário das aulas ao ar livre (${previsao.janela})` : '') +
          ` para amanhã (${this.dataBr(previsao.data)}) abaixo do mínimo configurado (${limiar}%). ` +
          'Nenhuma mensagem foi enviada.'
      )
    }

    const destinatarios = await this.destinatarios.listarPorAulas(aulas.map((aula) => aula.id))
    if (!destinatarios.ok) {
      return { ok: false, mensagem: destinatarios.mensagem, historico: this.listar() }
    }

    if (destinatarios.alunos.length === 0) {
      return this.semEnvio(
        local,
        previsao,
        hoje,
        `Previsão de chuva para amanhã (${this.dataBr(previsao.data)}), mas nenhum aluno está inscrito nas aulas ao ar livre. ` +
          'Nenhum aviso foi enviado.'
      )
    }

    const existentes = await this.notificacoes.existentes(aulas.map((aula) => aula.id))
    const pendentes = destinatarios.alunos.filter(
      (aluno) => !existentes.enviados.has(chaveAviso(aluno.aulaId, aluno.email))
    )

    if (pendentes.length === 0) {
      return {
        ok: true,
        local,
        previsao,
        hoje,
        enviada: false,
        consolidar: true,
        emails: {
          configurado: this.emails.configurado(),
          total: destinatarios.alunos.length,
          enviados: 0,
          falhas: []
        },
        motivo:
          `Os avisos de chuva para as aulas ao ar livre de amanhã (${this.dataBr(previsao.data)}) ` +
          'já foram enviados.',
        historico: this.listar()
      }
    }

    if (!this.emails.configurado()) {
      return this.semEnvio(
        local,
        previsao,
        hoje,
        `Previsão de chuva para amanhã (${this.dataBr(previsao.data)}), mas o envio por e-mail não está configurado. ` +
          'Defina SMTP_HOST, SMTP_USER e SMTP_PASS no .env. Nenhum aviso foi registrado como enviado.'
      )
    }

    const assunto = 'Aulas ao ar livre de amanhã: risco de chuva'
    const texto = this.textoDoAviso(previsao)
    const emailsUnicos = [...new Set(pendentes.map((aluno) => aluno.email.trim().toLowerCase()))]

    const notificacao: { status: 'enviado' | 'falhou'; erro?: string } = this.datasAvisadas.has(previsao.data)
      ? { status: 'enviado' }
      : this.enviarNotificacao(assunto, texto)

    const emails = await this.emails.enviar(emailsUnicos, assunto, texto)
    const falhasPorEmail = new Map(
      emails.falhas.map((falha) => [falha.email.trim().toLowerCase(), falha.erro])
    )
    const sucesso = (email: string): boolean => !falhasPorEmail.has(email.trim().toLowerCase())

    const registros: RegistroNotificacaoChuva[] = []
    for (const aluno of pendentes) {
      const email = aluno.email.trim().toLowerCase()
      const enviado = sucesso(email)
      if (!enviado && existentes.falhas.has(chaveAviso(aluno.aulaId, email))) continue

      registros.push({
        aulaId: aluno.aulaId,
        usuarioId: aluno.usuarioId,
        email,
        assunto,
        mensagem: texto,
        status: enviado ? 'enviado' : 'falhou',
        erro: enviado ? undefined : falhasPorEmail.get(email) ?? 'Falha ao enviar o e-mail.'
      })
    }

    if (registros.length > 0) {
      await this.notificacoes.registrar(registros)
    }

    const consolidar = emails.total > 0 && emails.enviados === emails.total
    const enviada = emails.enviados > 0
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
    if (consolidar) this.datasAvisadas.add(previsao.data)

    return {
      ok: true,
      local,
      previsao,
      hoje,
      enviada,
      consolidar,
      emails,
      motivo: this.montarMotivo(emails, previsao),
      mensagem,
      historico: this.listar()
    }
  }
}
