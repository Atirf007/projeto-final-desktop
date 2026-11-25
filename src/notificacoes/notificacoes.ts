import { ipcRenderer } from 'electron'

type UsuarioSessao = { id: number; nome: string; perfil: 'admin' | 'instrutor' | 'aluno' }

type TipoNotificacao = 'vencimento' | 'chuva' | 'experimental' | 'geral'
type StatusNotificacao = 'pendente' | 'enviado' | 'falhou'

type Notificacao = {
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

type EstadoAgendador = {
  ativo: boolean
  diasAntes: number
  executando: boolean
  ultimaExecucaoEm?: string
  proximaExecucaoEm?: string
}

type Situacao = {
  smtpConfigurado: boolean
  remetente?: string
  enviadasHoje: number
  falhasHoje: number
  pendentes: number
  agendador?: EstadoAgendador
}

type ResultadoExclusao = { ok: boolean; mensagem?: string }

class NotificacoesView {
  private usuario: UsuarioSessao | null = null
  private notificacoes: Notificacao[] = []
  private notificacaoParaExcluir: Notificacao | null = null
  private debounceBusca: number | null = null

  private el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

  private tipoTexto: Record<TipoNotificacao, string> = {
    vencimento: 'Vencimento',
    chuva: 'Chuva',
    experimental: 'Experimental',
    geral: 'Geral'
  }

  private statusTexto: Record<StatusNotificacao, string> = {
    enviado: 'Enviado',
    falhou: 'Falhou',
    pendente: 'Pendente'
  }

  private criar = (tag: string, classe?: string, texto?: string): HTMLElement => {
    const elemento = document.createElement(tag)
    if (classe) elemento.className = classe
    if (texto !== undefined) elemento.textContent = texto
    return elemento
  }

  private criarBotao = (texto: string, classe: string): HTMLButtonElement => {
    const botao = document.createElement('button')
    botao.type = 'button'
    botao.className = classe
    botao.textContent = texto
    return botao
  }

  private dataHoraFmt = (valor?: string): string => {
    if (!valor) return '—'
    if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(valor)) {
      const data = new Date(valor)
      return Number.isNaN(data.getTime()) ? valor : data.toLocaleString('pt-BR')
    }
    const [data, hora] = String(valor).split(/[ T]/)
    const [ano, mes, dia] = (data ?? '').split('-')
    if (!ano || !mes || !dia) return valor
    return hora ? `${dia}/${mes}/${ano} ${hora.slice(0, 5)}` : `${dia}/${mes}/${ano}`
  }

  private statusPagina = (texto: string, erro = false): void => {
    const el = this.el('status')
    el.textContent = texto
    el.classList.toggle('erro', erro)
  }

  private carregarSituacao = async (): Promise<void> => {
    try {
      const situacao = (await ipcRenderer.invoke('notificacoes:situacao')) as Situacao
      this.el('situacao-smtp').textContent = situacao.smtpConfigurado ? 'Configurado' : 'Não configurado'
      this.el('situacao-remetente').textContent = situacao.remetente ?? ''
      this.el('situacao-ultima').textContent = situacao.agendador?.ultimaExecucaoEm
        ? this.dataHoraFmt(situacao.agendador.ultimaExecucaoEm)
        : 'Nenhuma execução registrada'
      this.el('situacao-proxima').textContent = situacao.agendador?.proximaExecucaoEm
        ? `Próxima: ${this.dataHoraFmt(situacao.agendador.proximaExecucaoEm)}`
        : ''
      this.el('situacao-dias').textContent = `${situacao.agendador?.diasAntes ?? 7} dias`
      this.el('situacao-hoje').textContent = `${situacao.enviadasHoje} enviada(s)`
      this.el('situacao-falhas').textContent =
        `${situacao.falhasHoje} falha(s) • ${situacao.pendentes} pendente(s)`
      this.el('aviso-smtp').classList.toggle('oculto', situacao.smtpConfigurado)
    } catch (erro) {
      console.error(erro)
      this.el('situacao-smtp').textContent = 'Indisponível'
      this.el('situacao-ultima').textContent = 'Indisponível'
      this.el('situacao-dias').textContent = '—'
      this.el('situacao-hoje').textContent = '—'
    }
  }

  private criarLinha = (notificacao: Notificacao): HTMLTableRowElement => {
    const tr = document.createElement('tr')

    const tdData = document.createElement('td')
    tdData.className = 'col-data'
    tdData.textContent = this.dataHoraFmt(notificacao.criadoEm)

    const tdDest = document.createElement('td')
    tdDest.className = 'col-dest'
    const nome = document.createElement('strong')
    nome.textContent = notificacao.usuarioNome || 'Destinatário'
    const email = document.createElement('small')
    email.textContent = notificacao.destinatarioEmail
    tdDest.append(nome, email)

    const tdTipo = document.createElement('td')
    tdTipo.append(
      this.criar(
        'span',
        `tipo${notificacao.tipo === 'vencimento' ? ' vencimento' : ''}`,
        this.tipoTexto[notificacao.tipo]
      )
    )

    const tdAssunto = document.createElement('td')
    tdAssunto.className = 'col-assunto'
    const assunto = document.createElement('span')
    assunto.textContent = notificacao.assunto
    assunto.title = notificacao.assunto
    tdAssunto.append(assunto)

    const tdStatus = document.createElement('td')
    tdStatus.append(this.criar('span', `selo ${notificacao.status}`, this.statusTexto[notificacao.status]))

    const tdErro = document.createElement('td')
    tdErro.className = 'col-erro'
    if (notificacao.erro) {
      const erro = document.createElement('span')
      erro.textContent = notificacao.erro
      erro.title = notificacao.erro
      tdErro.append(erro)
    } else {
      tdErro.textContent = '—'
    }

    const tdAcoes = document.createElement('td')
    const acoes = document.createElement('div')
    acoes.className = 'acoes-linha'
    const btnVer = this.criarBotao('Ver', 'botao secundario pequeno')
    btnVer.addEventListener('click', () => this.abrirDetalhe(notificacao))
    const btnExcluir = this.criarBotao('Excluir', 'botao perigo pequeno')
    btnExcluir.addEventListener('click', () => this.abrirExclusao(notificacao))
    acoes.append(btnVer, btnExcluir)
    tdAcoes.append(acoes)

    tr.append(tdData, tdDest, tdTipo, tdAssunto, tdStatus, tdErro, tdAcoes)
    return tr
  }

  private carregar = async (): Promise<void> => {
    this.statusPagina('Carregando notificações...')
    try {
      const filtro: { tipo?: TipoNotificacao; status?: StatusNotificacao; busca?: string } = {}
      const tipo = this.el<HTMLSelectElement>('filtro-tipo').value
      const status = this.el<HTMLSelectElement>('filtro-status').value
      const busca = this.el<HTMLInputElement>('filtro-busca').value.trim()
      if (tipo) filtro.tipo = tipo as TipoNotificacao
      if (status) filtro.status = status as StatusNotificacao
      if (busca) filtro.busca = busca

      this.notificacoes = (await ipcRenderer.invoke('notificacoes:listar', filtro)) as Notificacao[]
      this.el<HTMLTableSectionElement>('corpo').replaceChildren(...this.notificacoes.map(this.criarLinha))
      this.statusPagina(
        this.notificacoes.length ? '' : 'Nenhuma notificação encontrada para os filtros escolhidos.'
      )
    } catch (erro) {
      console.error(erro)
      this.el<HTMLTableSectionElement>('corpo').replaceChildren()
      this.statusPagina('Não foi possível carregar as notificações.', true)
    }
  }

  private detalheItem = (dl: HTMLElement, titulo: string, valor: string | undefined, span2 = false): void => {
    const div = document.createElement('div')
    if (span2) div.className = 'span2'
    const dt = document.createElement('dt')
    dt.textContent = titulo
    const dd = document.createElement('dd')
    dd.textContent = valor && valor.trim() ? valor : '—'
    div.append(dt, dd)
    dl.append(div)
  }

  private abrirDetalhe = (notificacao: Notificacao): void => {
    this.el('titulo-detalhe').textContent = this.tipoTexto[notificacao.tipo]
    const dl = this.el('detalhes')
    dl.replaceChildren()
    this.detalheItem(dl, 'Destinatário', notificacao.usuarioNome)
    this.detalheItem(dl, 'E-mail', notificacao.destinatarioEmail)
    this.detalheItem(dl, 'Status', this.statusTexto[notificacao.status])
    this.detalheItem(dl, 'Canal', notificacao.canal)
    this.detalheItem(dl, 'Criada em', this.dataHoraFmt(notificacao.criadoEm))
    this.detalheItem(dl, 'Enviada em', this.dataHoraFmt(notificacao.enviadoEm))
    if (notificacao.pagamentoId) {
      this.detalheItem(dl, 'Pagamento', `#${notificacao.pagamentoId}`)
    }
    if (notificacao.erro) this.detalheItem(dl, 'Erro', notificacao.erro, true)
    this.el('mensagem').textContent = notificacao.mensagem
    const dialogo = this.el<HTMLDialogElement>('dialogo-detalhe')
    if (!dialogo.open) dialogo.showModal()
  }

  private abrirExclusao = (notificacao: Notificacao): void => {
    this.notificacaoParaExcluir = notificacao
    this.el('texto-excluir').textContent =
      `Deseja excluir a notificação "${notificacao.assunto}" enviada para ${notificacao.destinatarioEmail}?`
    this.el('erro-excluir').textContent = ''
    this.el<HTMLDialogElement>('dialogo-excluir').showModal()
  }

  private confirmarExclusao = async (): Promise<void> => {
    if (!this.notificacaoParaExcluir) return
    const botao = this.el<HTMLButtonElement>('confirmar-excluir')
    botao.disabled = true
    this.el('erro-excluir').textContent = ''
    try {
      const resultado = (await ipcRenderer.invoke(
        'notificacoes:excluir',
        this.notificacaoParaExcluir.id
      )) as ResultadoExclusao
      if (!resultado.ok) {
        this.el('erro-excluir').textContent = resultado.mensagem ?? 'Não foi possível excluir.'
        return
      }
      this.el<HTMLDialogElement>('dialogo-excluir').close()
      await this.carregar()
      await this.carregarSituacao()
      this.statusPagina('Notificação excluída.')
    } catch (erro) {
      console.error(erro)
      this.el('erro-excluir').textContent = 'Não foi possível excluir a notificação.'
    } finally {
      botao.disabled = false
    }
  }

  private limparFiltros = (): void => {
    this.el<HTMLSelectElement>('filtro-tipo').value = ''
    this.el<HTMLSelectElement>('filtro-status').value = ''
    this.el<HTMLInputElement>('filtro-busca').value = ''
    void this.carregar()
  }

  private voltar = async (): Promise<void> => {
    try {
      await ipcRenderer.invoke('menu:voltar')
    } catch {
      this.statusPagina('Não foi possível voltar ao menu.', true)
    }
  }

  iniciar = async (): Promise<void> => {
    try {
      this.usuario = (await ipcRenderer.invoke('auth:me')) as UsuarioSessao | null
    } catch {
      this.usuario = null
    }

    if (!this.usuario) {
      this.statusPagina('Sessão inválida. Faça login novamente.', true)
      return
    }
    if (this.usuario.perfil !== 'admin') {
      this.statusPagina('Acesso negado para este perfil.', true)
      return
    }

    this.el('voltar').addEventListener('click', () => void this.voltar())
    this.el('atualizar').addEventListener('click', () => {
      void this.carregarSituacao()
      void this.carregar()
    })
    this.el('limpar-filtros').addEventListener('click', this.limparFiltros)
    this.el('filtro-tipo').addEventListener('change', () => void this.carregar())
    this.el('filtro-status').addEventListener('change', () => void this.carregar())
    this.el('filtro-busca').addEventListener('input', () => {
      if (this.debounceBusca !== null) window.clearTimeout(this.debounceBusca)
      this.debounceBusca = window.setTimeout(() => void this.carregar(), 350)
    })
    this.el('fechar-detalhe').addEventListener('click', () =>
      this.el<HTMLDialogElement>('dialogo-detalhe').close()
    )
    this.el('cancelar-excluir').addEventListener('click', () =>
      this.el<HTMLDialogElement>('dialogo-excluir').close()
    )
    this.el('confirmar-excluir').addEventListener('click', () => void this.confirmarExclusao())

    await this.carregarSituacao()
    await this.carregar()
  }
}

window.addEventListener('DOMContentLoaded', () => {
  void new NotificacoesView().iniciar()
})
