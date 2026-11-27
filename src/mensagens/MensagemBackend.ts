import { Notification } from 'electron'
import { OpenMeteoClient, PrevisaoClima } from '../integracoes/ClimaBackend'
import { EmailServico, FalhaEmail, ResultadoEnvioEmail } from '../integracoes/EmailBackend'
import { AlunoDestinatarios } from './DestinatariosAlunos'
import { AulaExternaAmanha, AulasAmanha } from './AulasAmanha'
import { NotificacaoChuvaRepositorio } from './NotificacaoChuva'
import { AssinadorDecisao, obterAssinadorDecisao } from './DecisaoClima'

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

type AvisoPreparado = {
  id: number
  aula: AulaExternaAmanha
  email: string
}

const chaveAviso = (aulaId: number, email: string): string => `${aulaId}|${email.trim().toLowerCase()}`

export const textoNotificacaoChuva = (previsao: PrevisaoClima): string => {
  const [ano, mes, dia] = previsao.data.split('-')
  const data = ano && mes && dia ? `${dia}/${mes}/${ano}` : previsao.data
  const janela = previsao.janela ? ` no horário das aulas (${previsao.janela})` : ''
  const percentual = Math.round(previsao.probabilidadeChuva)

  return (
    `Caro instrutor, a previsão para amanhã (${data}) indica ${percentual}% de chance de chuva${janela}. ` +
    'Por favor, avise os alunos: cada um poderá cancelar a aula ou movê-la para a área interna.'
  )
}

export class MensagemServico {
  private readonly historico: Mensagem[] = []
  private readonly datasAvisadas = new Set<string>()
  private proximoId = 1

  constructor(
    private readonly clima: OpenMeteoClient = new OpenMeteoClient(),
    private readonly emails: EmailServico = new EmailServico(),
    private readonly destinatarios: AlunoDestinatarios = new AlunoDestinatarios(),
    private readonly aulas: AulasAmanha = new AulasAmanha(),
    private readonly notificacoes: NotificacaoChuvaRepositorio = new NotificacaoChuvaRepositorio(),
    private readonly assinador: AssinadorDecisao = obterAssinadorDecisao()
  ) {}

  marcarAvisoAnterior = (data: string): void => {
    if (data) this.datasAvisadas.add(data)
  }

  emailConfigurado = (): boolean => this.emails.configurado()

  emailRemetente = (): string => this.emails.remetenteFormatado()

  testarEmail = async (destinatario: string): Promise<ResultadoEnvioEmail> =>
    this.emails.enviar(
      [destinatario],
      'Teste do bot de clima - Academia Cotil',
      'Se você recebeu esta mensagem, o envio de e-mail do bot está funcionando.'
    )

  private dataBr = (iso: string): string => {
    const [ano, mes, dia] = iso.split('-')
    return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso
  }

  private horarioAula = (aula: AulaExternaAmanha): string => {
    const hora = `${String(Math.floor(aula.inicioMin / 60)).padStart(2, '0')}:${String(
      aula.inicioMin % 60
    ).padStart(2, '0')}`
    return `${this.dataBr(aula.data)} às ${hora}`
  }

  private textoDoAviso = (previsao: PrevisaoClima, aula: AulaExternaAmanha): string => {
    const janela = previsao.janela ? ` no horário das aulas (${previsao.janela})` : ''
    return (
      `Atenção aluno: a previsão para amanhã (${this.dataBr(previsao.data)}) indica chuva${janela} ` +
      `nas aulas ao ar livre. A aula "${aula.titulo}" de ${this.horarioAula(aula)} pode ser ` +
      'cancelada ou transferida para a área interna. A decisão vale para toda a turma.'
    )
  }

  private textoResumo = (previsao: PrevisaoClima): string =>
    `Aviso de chuva para as aulas ao ar livre de amanhã (${this.dataBr(previsao.data)}). ` +
    'O e-mail enviado contém um link para cada aluno escolher entre cancelar a aula ou movê-la para a área interna; a decisão vale para toda a turma.'

  private montarCorpoEmail = (previsao: PrevisaoClima, itens: AvisoPreparado[]): string => {
    const linhas = itens.map((item) => {
      const link = this.assinador.gerarLink(item.id)
      return `- ${item.aula.titulo} (${this.horarioAula(item.aula)}): ${link}`
    })

    return (
      `Atenção aluno: a previsão para amanhã (${this.dataBr(previsao.data)}) indica chuva nas aulas ao ar livre.\n\n` +
      'Escolha, para cada aula abaixo, se deseja cancelar a aula ou movê-la para a área interna. A decisão vale para toda a turma:\n\n' +
      `${linhas.join('\n')}\n\n` +
      'Se você não responder, a aula permanece como está.'
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
    if (typeof Notification === 'undefined' || !Notification.isSupported()) {
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
      (aluno) => existentes.get(chaveAviso(aluno.aulaId, aluno.email))?.status !== 'enviado'
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
    const aulasPorId = new Map(aulas.map((aula) => [aula.id, aula]))
    const preparados: AvisoPreparado[] = []

    for (const aluno of pendentes) {
      const aula = aulasPorId.get(aluno.aulaId)
      if (!aula) continue

      const existente = existentes.get(chaveAviso(aluno.aulaId, aluno.email))
      try {
        const id = await this.notificacoes.preparar(
          {
            aulaId: aluno.aulaId,
            usuarioId: aluno.usuarioId,
            email: aluno.email,
            assunto,
            mensagem: this.textoDoAviso(previsao, aula)
          },
          existente
        )
        if (id !== null) {
          preparados.push({ id, aula, email: aluno.email.trim().toLowerCase() })
        }
      } catch {
        // Sem registro no banco não há link confiável: este aluno fica para a próxima tentativa.
      }
    }

    if (preparados.length === 0) {
      return {
        ok: false,
        mensagem: 'Não foi possível preparar os avisos de chuva no banco de dados.',
        historico: this.listar()
      }
    }

    const preparacaoCompleta = preparados.length === pendentes.length
    const porEmail = new Map<string, AvisoPreparado[]>()
    for (const item of preparados) {
      const lista = porEmail.get(item.email) ?? []
      lista.push(item)
      porEmail.set(item.email, lista)
    }

    if (!this.datasAvisadas.has(previsao.data)) {
      this.enviarNotificacao(assunto, this.textoResumo(previsao))
    }

    const falhas: FalhaEmail[] = []
    let enviados = 0

    for (const [email, itens] of porEmail) {
      const corpo = this.montarCorpoEmail(previsao, itens)
      const resultado = await this.emails.enviar([email], assunto, corpo)

      if (resultado.enviados > 0) {
        enviados += 1
        for (const item of itens) {
          await this.notificacoes.atualizarResultado(item.id, 'enviado')
        }
      } else {
        const erro = resultado.falhas[0]?.erro ?? resultado.erroGeral ?? 'Falha ao enviar o e-mail.'
        falhas.push({ email, erro })
        for (const item of itens) {
          await this.notificacoes.atualizarResultado(item.id, 'falhou', erro)
        }
      }
    }

    const emails: ResultadoEnvioEmail = {
      configurado: this.emails.configurado(),
      total: porEmail.size,
      enviados,
      falhas,
      erroGeral:
        enviados === 0 ? 'Nenhum e-mail pôde ser enviado. Verifique as configurações de SMTP.' : undefined
    }

    const consolidar = preparacaoCompleta && emails.total > 0 && emails.enviados === emails.total
    const enviada = emails.enviados > 0
    const status: 'enviado' | 'falhou' = enviada ? 'enviado' : 'falhou'

    const mensagem: Mensagem = {
      id: this.proximoId++,
      criadaEm: new Date().toISOString(),
      tipo: 'chuva',
      assunto,
      texto: this.textoResumo(previsao),
      status,
      erro: status === 'falhou' ? emails.erroGeral ?? falhas[0]?.erro : undefined,
      dataAula: previsao.data,
      previsao,
      emailConfigurado: emails.configurado,
      destinatarios: emails.total,
      emailsEnviados: emails.enviados,
      falhasEmail: falhas
    }

    this.historico.push(mensagem)
    if (consolidar) this.datasAvisadas.add(previsao.data)

    const motivoBase = this.montarMotivo(emails, previsao)
    return {
      ok: true,
      local,
      previsao,
      hoje,
      enviada,
      consolidar,
      emails,
      motivo: preparacaoCompleta
        ? motivoBase
        : `${motivoBase} Alguns avisos não puderam ser preparados e serão tentados novamente.`,
      mensagem,
      historico: this.listar()
    }
  }
}
