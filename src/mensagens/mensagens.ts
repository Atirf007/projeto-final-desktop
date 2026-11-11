import { ipcRenderer } from 'electron'

type PrevisaoClima = {
  data: string
  temperaturaMinC: number
  temperaturaMaxC: number
  probabilidadeChuva: number
  probabilidadeDia: number
  horarioPico?: string
  janela?: string
  precipitacaoMm: number
  codigoClima: number
  descricao: string
  vaiChover: boolean
}

type FalhaEmail = {
  email: string
  erro: string
}

type ResultadoEnvioEmail = {
  configurado: boolean
  total: number
  enviados: number
  falhas: FalhaEmail[]
  erroGeral?: string
}

type Mensagem = {
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

type ResultadoVerificacao =
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

type EstadoBot = {
  ativo: boolean
  intervaloMinutos: number
  limiarChuva: number
  verificando: boolean
  emailConfigurado: boolean
  emailRemetente?: string
  ultimaVerificacaoEm?: string
  proximaVerificacaoEm?: string
  ultimoResultado?: ResultadoVerificacao
  mensagens: Mensagem[]
}

type UsuarioSessao = { id: number; nome: string; perfil: 'admin' | 'instrutor' | 'aluno' }

class BotView {
  private el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

  private estadoAtual?: EstadoBot
  private usuario: UsuarioSessao | null = null
  private acaoEmAndamento = false
  private atualizando = false
  private timerAtualizacao: number | null = null

  private admin = (): boolean => this.usuario?.perfil === 'admin'

  private criar = (tag: string, classe?: string, texto?: string): HTMLElement => {
    const elemento = document.createElement(tag)
    if (classe) elemento.className = classe
    if (texto !== undefined) elemento.textContent = texto
    return elemento
  }

  private dataBr = (iso: string): string => {
    const [ano, mes, dia] = iso.split('-')
    return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso
  }

  private diaSemana = (iso: string): string => {
    const [ano, mes, dia] = iso.split('-').map(Number)
    if (!ano || !mes || !dia) return ''
    return new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', { weekday: 'long' })
  }

  private dataHora = (iso: string): string => {
    const data = new Date(iso)
    return Number.isNaN(data.getTime()) ? iso : data.toLocaleString('pt-BR')
  }

  private temperatura = (valor: number): string => `${Math.round(valor)} °C`

  private metrica = (rotulo: string, valor: string): HTMLElement => {
    const caixa = this.criar('div', 'metrica')
    caixa.append(this.criar('span', undefined, rotulo), this.criar('strong', undefined, valor))
    return caixa
  }

  private garantirOpcaoIntervalo = (select: HTMLSelectElement, valor: number): void => {
    const existe = Array.from(select.options).some((opcao) => Number(opcao.value) === valor)
    if (existe) return

    const opcao = document.createElement('option')
    opcao.value = String(valor)
    opcao.textContent = `${valor} minutos`
    select.append(opcao)
  }

  private atualizarBotoes = (): void => {
    const verificando = this.estadoAtual?.verificando ?? false
    const ocupado = this.acaoEmAndamento || verificando

    this.el<HTMLButtonElement>('alternar-bot').disabled = ocupado
    this.el<HTMLButtonElement>('salvar-intervalo').disabled = ocupado
    this.el<HTMLButtonElement>('salvar-limiar').disabled = ocupado
    this.el<HTMLButtonElement>('verificar').disabled = ocupado
  }

  private renderBot = (estado: EstadoBot): void => {
    const selo = this.el('bot-selo')
    selo.textContent = estado.ativo ? 'Ativo' : 'Inativo'
    selo.className = `selo ${estado.ativo ? 'selo-seco' : 'selo-inativo'}`

    const descricao = this.el('bot-descricao')
    descricao.textContent = estado.ativo
      ? `Verificando a previsão a cada ${estado.intervaloMinutos} ${estado.intervaloMinutos === 1 ? 'minuto' : 'minutos'}. ` +
        `Avisos apenas com chance de chuva a partir de ${estado.limiarChuva}%.`
      : `O bot está desativado. Nenhum aviso será enviado automaticamente. Limite atual: ${estado.limiarChuva}% de chance de chuva.`

    const limiar = this.el<HTMLInputElement>('limiar-chuva')
    if (document.activeElement !== limiar) limiar.value = String(estado.limiarChuva)

    const alternar = this.el<HTMLButtonElement>('alternar-bot')
    alternar.textContent = estado.ativo ? 'Desativar bot' : 'Ativar bot'
    alternar.className = estado.ativo ? 'perigo' : ''

    const select = this.el<HTMLSelectElement>('intervalo')
    if (document.activeElement !== select) {
      this.garantirOpcaoIntervalo(select, estado.intervaloMinutos)
      select.value = String(estado.intervaloMinutos)
    }

    this.el('bot-ultima').textContent = estado.ultimaVerificacaoEm
      ? `Última verificação: ${this.dataHora(estado.ultimaVerificacaoEm)}`
      : 'Nenhuma verificação realizada.'

    const proxima = this.el('bot-proxima')
    proxima.textContent =
      estado.ativo && estado.proximaVerificacaoEm
        ? `Próxima verificação: ${this.dataHora(estado.proximaVerificacaoEm)}`
        : ''

    const email = this.el('bot-email')
    email.textContent = estado.emailConfigurado
      ? `E-mail: ${estado.emailRemetente ?? 'configurado'}`
      : 'E-mail: não configurado (defina SMTP_HOST, SMTP_USER e SMTP_PASS no .env)'
    email.className = estado.emailConfigurado ? '' : 'info-alerta'

    this.atualizarBotoes()
  }

  private renderPrevisao = (local: string, previsao: PrevisaoClima, hoje?: PrevisaoClima): void => {
    this.el('local').textContent = `Previsão de amanhã em ${local}`

    const selo = this.criar(
      'span',
      previsao.vaiChover ? 'selo selo-chuva' : 'selo selo-seco',
      previsao.vaiChover ? 'Chuva prevista' : 'Sem chuva prevista'
    )
    const titulo = this.criar(
      'strong',
      'titulo-clima',
      `Amanhã, ${this.dataBr(previsao.data)} (${this.diaSemana(previsao.data)})`
    )
    const descricao = this.criar('span', 'descricao-clima', previsao.descricao)

    const linha = this.criar('div', 'linha-clima')
    linha.append(selo, titulo, descricao)

    const metricas = this.criar('div', 'metricas')
    const rotuloChuva = previsao.janela ? 'Chance de chuva na aula' : 'Probabilidade de chuva'
    metricas.append(
      this.metrica('Temperatura mínima', this.temperatura(previsao.temperaturaMinC)),
      this.metrica('Temperatura máxima', this.temperatura(previsao.temperaturaMaxC)),
      this.metrica(rotuloChuva, `${Math.round(previsao.probabilidadeChuva)}%`),
      this.metrica('Precipitação prevista', `${previsao.precipitacaoMm.toFixed(1)} mm`)
    )

    const probabilidadeDia = previsao.probabilidadeDia ?? previsao.probabilidadeChuva
    if (previsao.janela && probabilidadeDia !== previsao.probabilidadeChuva) {
      const pico = previsao.horarioPico ? ` às ${previsao.horarioPico}` : ''
      metricas.append(this.metrica('Pico do dia', `${Math.round(probabilidadeDia)}%${pico}`))
    }

    const cartao = this.criar('div', 'cartao-clima')
    cartao.append(linha, metricas)

    if (previsao.janela) {
      cartao.append(
        this.criar('span', 'nota-previsao', `Horário considerado na decisão: ${previsao.janela} (aula de amanhã).`)
      )
    }

    if (hoje) {
      const comparacao = this.criar('div', 'comparacao-dias')
      comparacao.append(
        this.criar(
          'span',
          undefined,
          `Hoje (${this.dataBr(hoje.data)}): ${Math.round(hoje.probabilidadeDia ?? hoje.probabilidadeChuva)}% de chance de chuva`
        ),
        this.criar(
          'span',
          undefined,
          `Amanhã (${this.dataBr(previsao.data)}): ${Math.round(probabilidadeDia)}% de chance de chuva`
        )
      )
      cartao.append(comparacao)
    }

    cartao.append(
      this.criar(
        'span',
        'nota-previsao',
        'O bot avisa com 1 dia de antecedência, por isso a decisão de enviar usa a previsão de amanhã.'
      )
    )

    this.el('previsao').replaceChildren(cartao)
  }

  private renderAviso = (resultado: ResultadoVerificacao): void => {
    const aviso = this.el('aviso')

    if (!resultado.ok) {
      aviso.replaceChildren(
        this.criar('div', 'vazio', 'A previsão não está disponível, então nenhuma mensagem foi enviada.')
      )
      return
    }

    if (!resultado.mensagem) {
      aviso.replaceChildren(this.criar('div', 'vazio', resultado.motivo))
      return
    }

    const mensagem = resultado.mensagem
    const enviado = mensagem.status === 'enviado'
    const caixa = this.criar('div', enviado ? 'aviso aviso-enviado' : 'aviso aviso-falha')

    const topo = this.criar('div', 'aviso-topo')
    const selo = this.criar('span', enviado ? 'selo-mini ok' : 'selo-mini falha', enviado ? 'Enviado' : 'Falhou')
    topo.append(this.criar('strong', undefined, mensagem.assunto), selo)

    const rodape = this.criar('div', 'aviso-rodape')
    rodape.append(
      this.criar('span', undefined, `${enviado ? 'Enviado' : 'Registrado'} em ${this.dataHora(mensagem.criadaEm)}`)
    )
    rodape.append(
      resultado.emails.configurado
        ? this.criar('span', undefined, `E-mails: ${resultado.emails.enviados} de ${resultado.emails.total} enviados`)
        : this.criar('span', 'aviso-erro', 'Envio por e-mail não configurado')
    )
    if (resultado.emails.falhas.length > 0) {
      rodape.append(this.criar('span', 'aviso-erro', `${resultado.emails.falhas.length} falha(s) de envio`))
    }
    if (mensagem.erro) rodape.append(this.criar('span', 'aviso-erro', mensagem.erro))

    caixa.append(topo, this.criar('p', 'aviso-texto', mensagem.texto), rodape)

    if (!resultado.enviada) {
      caixa.append(
        this.criar(
          'span',
          'aviso-nota',
          resultado.consolidar
            ? 'Aviso já registrado para esta data; não foi reenviado.'
            : 'Nenhum e-mail foi entregue. O bot tentará novamente na próxima verificação.'
        )
      )
    }

    aviso.replaceChildren(caixa)
  }

  private renderResultado = (resultado?: ResultadoVerificacao): void => {
    const status = this.el('status')

    if (!resultado) {
      this.el('local').textContent = 'Nenhuma verificação realizada ainda.'
      this.el('previsao').replaceChildren(
        this.criar('div', 'vazio', 'Clique em "Verificar agora" ou ative o bot para consultar a previsão.')
      )
      this.el('aviso').replaceChildren(this.criar('div', 'vazio', 'Nenhuma mensagem foi enviada.'))
      status.textContent = ''
      status.className = 'status'
      return
    }

    if (!resultado.ok) {
      this.el('local').textContent = 'Previsão indisponível'
      this.el('previsao').replaceChildren(this.criar('div', 'vazio', resultado.mensagem))
      this.renderAviso(resultado)
      status.textContent = resultado.mensagem
      status.className = 'status erro'
      return
    }

    this.renderPrevisao(resultado.local, resultado.previsao, resultado.hoje)
    this.renderAviso(resultado)

    const falhou = resultado.mensagem?.status === 'falhou'
    status.textContent = resultado.motivo
    status.className = `status ${falhou ? 'erro' : resultado.previsao.vaiChover ? 'sucesso' : 'neutro'}`
  }

  private renderHistorico = (historico: Mensagem[]): void => {
    const lista = this.el('historico')

    if (historico.length === 0) {
      lista.replaceChildren(
        this.criar(
          'div',
          'vazio',
          'Nenhuma mensagem enviada pelo bot ainda. Quando houver previsão de chuva, o aviso aparecerá aqui.'
        )
      )
      return
    }

    const itens = historico.map((mensagem) => {
      const item = this.criar('article', 'historico-item')
      const topo = this.criar('div', 'historico-topo')
      topo.append(
        this.criar('strong', undefined, mensagem.assunto),
        this.criar(
          'span',
          mensagem.status === 'enviado' ? 'selo-mini ok' : 'selo-mini falha',
          mensagem.status === 'enviado' ? 'Enviado' : 'Falhou'
        )
      )

      const email =
        mensagem.emailConfigurado
          ? `E-mails: ${mensagem.emailsEnviados} de ${mensagem.destinatarios}`
          : 'E-mail não configurado'

      const detalhe =
        `Aula de ${this.dataBr(mensagem.dataAula)} • ` +
        `${this.temperatura(mensagem.previsao.temperaturaMinC)} a ${this.temperatura(mensagem.previsao.temperaturaMaxC)} • ` +
        `${Math.round(mensagem.previsao.probabilidadeChuva)}% de chuva • ` +
        `${email} • ` +
        `Registrado em ${this.dataHora(mensagem.criadaEm)}`

      item.append(
        topo,
        this.criar('p', 'historico-texto', mensagem.texto),
        this.criar('span', 'historico-data', detalhe)
      )
      return item
    })

    lista.replaceChildren(...itens)
  }

  private renderEstado = (estado: EstadoBot): void => {
    this.estadoAtual = estado
    this.renderBot(estado)
    this.renderResultado(estado.ultimoResultado)
    this.renderHistorico(estado.mensagens)
  }

  private mostrarStatusBot = (texto: string, tipo: '' | 'sucesso' | 'erro' | 'neutro'): void => {
    const status = this.el('status-bot')
    status.textContent = texto
    status.className = `status ${tipo}`
  }

  private carregarEstado = async (silencioso = false): Promise<void> => {
    if (this.atualizando || this.acaoEmAndamento) return

    this.atualizando = true
    try {
      const estado: EstadoBot = await ipcRenderer.invoke('bot:estado')
      this.renderEstado(estado)
    } catch {
      if (!silencioso) this.mostrarStatusBot('Não foi possível carregar o estado do bot.', 'erro')
    } finally {
      this.atualizando = false
    }
  }

  private executarAcao = async (
    acao: () => Promise<EstadoBot>,
    mensagemCarregando: string,
    mensagemSucesso: string
  ): Promise<void> => {
    if (this.acaoEmAndamento) return

    this.acaoEmAndamento = true
    this.mostrarStatusBot(mensagemCarregando, 'neutro')
    this.atualizarBotoes()

    try {
      const estado = await acao()
      this.renderEstado(estado)
      this.mostrarStatusBot(mensagemSucesso, mensagemSucesso ? 'sucesso' : '')
    } catch {
      this.mostrarStatusBot('Não foi possível concluir a ação.', 'erro')
    } finally {
      this.acaoEmAndamento = false
      this.atualizarBotoes()
    }
  }

  private alternarBot = async (): Promise<void> => {
    const novoAtivo = !(this.estadoAtual?.ativo ?? false)

    await this.executarAcao(
      () => ipcRenderer.invoke('bot:definir-ativo', novoAtivo),
      novoAtivo ? 'Ativando o bot e verificando a previsão...' : 'Desativando o bot...',
      novoAtivo
        ? 'Bot ativado. Ele enviará avisos automaticamente quando houver previsão de chuva.'
        : 'Bot desativado. Nenhum aviso automático será enviado.'
    )
  }

  private salvarIntervalo = async (): Promise<void> => {
    const valor = Number(this.el<HTMLSelectElement>('intervalo').value)

    if (!Number.isInteger(valor) || valor < 1 || valor > 1440) {
      this.mostrarStatusBot('Selecione um intervalo válido.', 'erro')
      return
    }

    await this.executarAcao(
      () => ipcRenderer.invoke('bot:definir-intervalo', valor),
      'Salvando intervalo...',
      'Intervalo atualizado.'
    )
  }

  private salvarLimiar = async (): Promise<void> => {
    const valor = Number(this.el<HTMLInputElement>('limiar-chuva').value)

    if (!Number.isInteger(valor) || valor < 0 || valor > 100) {
      this.mostrarStatusBot('Informe uma porcentagem inteira entre 0 e 100.', 'erro')
      return
    }

    await this.executarAcao(
      () => ipcRenderer.invoke('bot:definir-limiar', valor),
      'Salvando limite de chuva...',
      `Limite atualizado: o bot enviará avisos quando a chance de chuva for de ${valor}% ou mais.`
    )
  }

  private verificarAgora = async (): Promise<void> => {
    await this.executarAcao(
      () => ipcRenderer.invoke('bot:verificar'),
      'Consultando a previsão do tempo...',
      ''
    )
  }

  private voltar = async (): Promise<void> => {
    try {
      await ipcRenderer.invoke('menu:voltar')
    } catch {
      this.mostrarStatusBot('Não foi possível voltar ao menu.', 'erro')
    }
  }

  encerrar = (): void => {
    if (this.timerAtualizacao !== null) {
      window.clearInterval(this.timerAtualizacao)
      this.timerAtualizacao = null
    }
  }

  iniciar = async (): Promise<void> => {
    try {
      this.usuario = (await ipcRenderer.invoke('auth:me')) as UsuarioSessao | null
    } catch {
      this.usuario = null
    }

    this.el('controle-limiar').hidden = !this.admin()

    this.el('alternar-bot').addEventListener('click', this.alternarBot)
    this.el('salvar-intervalo').addEventListener('click', this.salvarIntervalo)
    this.el('salvar-limiar').addEventListener('click', this.salvarLimiar)
    this.el('verificar').addEventListener('click', this.verificarAgora)
    this.el('voltar').addEventListener('click', this.voltar)

    await this.carregarEstado()

    this.timerAtualizacao = window.setInterval(() => {
      void this.carregarEstado(true)
    }, 15000)
  }
}

const view = new BotView()

window.addEventListener('DOMContentLoaded', () => view.iniciar())
window.addEventListener('beforeunload', () => view.encerrar())
