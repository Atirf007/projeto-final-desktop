import { ipcRenderer } from 'electron'

type UsuarioSessao = { id: number; nome: string; perfil: 'admin' | 'instrutor' | 'aluno' }

type StatusPagamento = 'pendente' | 'pago' | 'atrasado' | 'cancelado'
type MetodoPagamento = 'dinheiro' | 'pix' | 'cartao' | 'boleto' | 'transferencia'

type Pagamento = {
  id: number
  assinaturaId: number
  alunoId: number
  alunoNome: string
  planoNome: string
  competencia: string
  valor: number
  dataVencimento: string
  dataPagamento: string | null
  status: StatusPagamento
  metodo: MetodoPagamento | null
  observacao: string | null
}

type ResumoPagamentos = {
  pendentes: number
  pagos: number
  atrasados: number
  cancelados: number
  totalPendente: number
  totalPago: number
  totalAtrasado: number
}

type FiltroPagamentos = {
  status?: StatusPagamento
  busca?: string
  competencia?: string
}

type ResultadoAcao =
  | { ok: true; id?: number; criados?: number; ignorados?: number }
  | { ok: false; mensagem: string }

class PagamentosView {
  private usuario: UsuarioSessao | null = null
  private pagamentos: Pagamento[] = []
  private pagamentoSelecionado: Pagamento | null = null
  private acaoConfirmar: (() => Promise<void>) | null = null
  private timerBusca: ReturnType<typeof setTimeout> | null = null

  private el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

  private admin = (): boolean => this.usuario?.perfil === 'admin'

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

  private criarSelo = (status: StatusPagamento): HTMLSpanElement => {
    const selo = document.createElement('span')
    selo.className = `selo ${status}`
    selo.textContent = this.statusTexto[status]
    return selo
  }

  private statusTexto: Record<StatusPagamento, string> = {
    pendente: 'Pendente',
    pago: 'Pago',
    atrasado: 'Atrasado',
    cancelado: 'Cancelado'
  }

  private metodoTexto: Record<MetodoPagamento, string> = {
    dinheiro: 'Dinheiro',
    pix: 'PIX',
    cartao: 'Cartão',
    boleto: 'Boleto',
    transferencia: 'Transferência'
  }

  private moeda = (valor: number): string =>
    valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  private dataBr = (valor?: string | null): string => {
    if (!valor) return '—'
    const [ano, mes, dia] = String(valor).slice(0, 10).split('-')
    return ano && mes && dia ? `${dia}/${mes}/${ano}` : String(valor)
  }

  private competenciaTexto = (valor: string): string => {
    const [ano, mes] = valor.slice(0, 7).split('-')
    return ano && mes ? `${mes}/${ano}` : valor
  }

  private hoje = (): string => {
    const agora = new Date()
    const mes = String(agora.getMonth() + 1).padStart(2, '0')
    const dia = String(agora.getDate()).padStart(2, '0')
    return `${agora.getFullYear()}-${mes}-${dia}`
  }

  private status = (texto: string, tipo: 'erro' | 'sucesso' | 'info' = 'info'): void => {
    const el = this.el('status')
    el.textContent = texto
    el.classList.toggle('erro', tipo === 'erro')
    el.classList.toggle('sucesso', tipo === 'sucesso')
  }

  private filtroAtual = (): FiltroPagamentos => {
    const filtro: FiltroPagamentos = {}
    const status = this.el<HTMLSelectElement>('filtro-status').value
    const busca = this.el<HTMLInputElement>('busca').value.trim()
    const competencia = this.el<HTMLInputElement>('filtro-competencia').value

    if (status) filtro.status = status as StatusPagamento
    if (busca) filtro.busca = busca
    if (/^\d{4}-\d{2}$/.test(competencia)) filtro.competencia = competencia

    return filtro
  }

  private preencherResumo = (resumo: ResumoPagamentos): void => {
    this.el('resumo-pendente').textContent = this.moeda(Number(resumo.totalPendente) || 0)
    this.el('qtd-pendente').textContent = `${resumo.pendentes} pagamento(s)`

    this.el('resumo-pago').textContent = this.moeda(Number(resumo.totalPago) || 0)
    this.el('qtd-pago').textContent = `${resumo.pagos} pagamento(s)`

    this.el('resumo-atrasado').textContent = this.moeda(Number(resumo.totalAtrasado) || 0)
    this.el('qtd-atrasado').textContent = `${resumo.atrasados} pagamento(s)`
  }

  private criarLinha = (pagamento: Pagamento): HTMLTableRowElement => {
    const tr = document.createElement('tr')
    if (pagamento.status === 'cancelado') tr.className = 'linha-cancelada'

    const td = (texto: string, classe?: string): HTMLTableCellElement => {
      const cel = document.createElement('td')
      cel.textContent = texto
      if (classe) cel.className = classe
      return cel
    }

    const tituloTd = document.createElement('td')
    tituloTd.className = 'col-titulo'
    const aluno = document.createElement('strong')
    aluno.textContent = pagamento.alunoNome
    const plano = document.createElement('small')
    plano.textContent = pagamento.planoNome
    tituloTd.append(aluno, plano)

    const competenciaTd = td(this.competenciaTexto(pagamento.competencia), 'col-data')

    const vencimentoTd = document.createElement('td')
    vencimentoTd.className = 'col-data'
    vencimentoTd.textContent = this.dataBr(pagamento.dataVencimento)

    const valorTd = td(this.moeda(pagamento.valor), 'col-valor')

    const statusTd = document.createElement('td')
    statusTd.append(this.criarSelo(pagamento.status))

    const pagamentoTd = document.createElement('td')
    pagamentoTd.className = 'col-data'
    if (pagamento.dataPagamento) {
      const data = document.createElement('span')
      data.textContent = this.dataBr(pagamento.dataPagamento)
      const metodo = document.createElement('small')
      metodo.textContent = pagamento.metodo ? this.metodoTexto[pagamento.metodo] : '—'
      pagamentoTd.append(data, metodo)
      if (pagamento.observacao) pagamentoTd.title = pagamento.observacao
    } else {
      pagamentoTd.textContent = '—'
    }

    const acoesTd = document.createElement('td')
    const acoes = document.createElement('div')
    acoes.className = 'acoes-linha'

    const podeValidar = pagamento.status === 'pendente' || pagamento.status === 'atrasado'
    if (podeValidar) {
      const btnValidar = this.criarBotao('Validar', 'botao verde pequeno')
      btnValidar.addEventListener('click', () => this.abrirValidacao(pagamento))
      acoes.append(btnValidar)

      const btnCancelar = this.criarBotao('Cancelar', 'botao secundario pequeno')
      btnCancelar.addEventListener('click', () => this.cancelarPagamento(pagamento))
      acoes.append(btnCancelar)
    } else if (pagamento.status === 'pago') {
      const btnCancelar = this.criarBotao('Cancelar', 'botao secundario pequeno')
      btnCancelar.disabled = true
      btnCancelar.title = 'Pagamentos já validados não podem ser cancelados.'
      acoes.append(btnCancelar)
    }

    acoesTd.append(acoes)

    tr.append(tituloTd, competenciaTd, vencimentoTd, valorTd, statusTd, pagamentoTd, acoesTd)
    return tr
  }

  private renderizar = (): void => {
    const corpo = this.el<HTMLTableSectionElement>('corpo')
    corpo.replaceChildren()

    this.el('titulo').textContent =
      this.pagamentos.length === 1 ? 'Pagamentos (1)' : `Pagamentos (${this.pagamentos.length})`

    if (!this.pagamentos.length) {
      const tr = document.createElement('tr')
      const td = document.createElement('td')
      td.colSpan = 7
      td.textContent = 'Nenhum pagamento encontrado. Use "Gerar mensalidades" para criar as parcelas das assinaturas ativas.'
      td.style.textAlign = 'center'
      td.style.padding = '24px 14px'
      td.style.color = 'var(--primaria-500)'
      tr.append(td)
      corpo.append(tr)
      return
    }

    this.pagamentos.forEach((pagamento) => corpo.append(this.criarLinha(pagamento)))
  }

  private carregar = async (): Promise<void> => {
    const filtro = this.filtroAtual()
    try {
      const [pagamentos, resumo] = await Promise.all([
        ipcRenderer.invoke('pagamentos:listar', filtro) as Promise<Pagamento[]>,
        ipcRenderer.invoke('pagamentos:resumo', filtro) as Promise<ResumoPagamentos>
      ])

      this.pagamentos = Array.isArray(pagamentos) ? pagamentos : []
      this.preencherResumo(resumo)
      this.renderizar()
      this.status('')
    } catch {
      this.pagamentos = []
      this.renderizar()
      this.status('Não foi possível carregar os pagamentos.', 'erro')
    }
  }

  private agendarBusca = (): void => {
    if (this.timerBusca) clearTimeout(this.timerBusca)
    this.timerBusca = setTimeout(() => void this.carregar(), 300)
  }

  private abrirValidacao = (pagamento: Pagamento): void => {
    this.pagamentoSelecionado = pagamento
    this.el('resumo-validar').textContent =
      `${pagamento.alunoNome} • ${pagamento.planoNome} • competência ${this.competenciaTexto(pagamento.competencia)} • ${this.moeda(pagamento.valor)}`
    this.el<HTMLInputElement>('validar-data').value = this.hoje()
    this.el<HTMLSelectElement>('validar-metodo').value = 'pix'
    this.el<HTMLTextAreaElement>('validar-observacao').value = ''
    this.el('erro-validar').textContent = ''
    this.el<HTMLDialogElement>('dialogo-validar').showModal()
  }

  private salvarValidacao = async (evento: Event): Promise<void> => {
    evento.preventDefault()
    if (!this.pagamentoSelecionado) return

    const botao = this.el<HTMLButtonElement>('salvar-validar')
    const erro = this.el('erro-validar')
    erro.textContent = ''

    const dados = {
      id: this.pagamentoSelecionado.id,
      dataPagamento: this.el<HTMLInputElement>('validar-data').value,
      metodo: this.el<HTMLSelectElement>('validar-metodo').value,
      observacao: this.el<HTMLTextAreaElement>('validar-observacao').value
    }

    if (!dados.dataPagamento) {
      erro.textContent = 'Informe a data do pagamento.'
      return
    }

    botao.disabled = true
    try {
      const resultado = (await ipcRenderer.invoke('pagamentos:registrar', dados)) as ResultadoAcao
      if (!resultado.ok) {
        erro.textContent = resultado.mensagem
        return
      }

      this.pagamentoSelecionado = null
      this.el<HTMLDialogElement>('dialogo-validar').close()
      await this.carregar()
      this.status('Pagamento validado com sucesso.', 'sucesso')
    } catch {
      erro.textContent = 'Não foi possível validar o pagamento.'
    } finally {
      botao.disabled = false
    }
  }

  private abrirConfirmacao = (
    titulo: string,
    texto: string,
    rotulo: string,
    perigo: boolean,
    acao: () => Promise<void>
  ): void => {
    this.acaoConfirmar = acao
    this.el('titulo-confirmar').textContent = titulo
    this.el('texto-confirmar').textContent = texto
    this.el('erro-confirmar').textContent = ''
    const botao = this.el<HTMLButtonElement>('confirmar-acao')
    botao.textContent = rotulo
    botao.className = perigo ? 'botao perigo' : 'botao'
    this.el<HTMLDialogElement>('dialogo-confirmar').showModal()
  }

  private executarConfirmacao = async (): Promise<void> => {
    if (!this.acaoConfirmar) return
    const botao = this.el<HTMLButtonElement>('confirmar-acao')
    botao.disabled = true
    this.el('erro-confirmar').textContent = ''
    try {
      await this.acaoConfirmar()
      this.acaoConfirmar = null
      this.el<HTMLDialogElement>('dialogo-confirmar').close()
    } catch (erro) {
      this.el('erro-confirmar').textContent =
        erro instanceof Error ? erro.message : 'Não foi possível concluir a ação.'
    } finally {
      botao.disabled = false
    }
  }

  private cancelarPagamento = (pagamento: Pagamento): void => {
    this.abrirConfirmacao(
      'Cancelar pagamento',
      `Deseja cancelar a cobrança de ${this.moeda(pagamento.valor)} de ${pagamento.alunoNome} referente a ${this.competenciaTexto(pagamento.competencia)}?`,
      'Cancelar cobrança',
      true,
      async () => {
        const resultado = (await ipcRenderer.invoke('pagamentos:cancelar', pagamento.id)) as ResultadoAcao
        if (!resultado.ok) throw new Error(resultado.mensagem)
        await this.carregar()
        this.status('Cobrança cancelada.', 'sucesso')
      }
    )
  }

  private gerar = async (): Promise<void> => {
    const botao = this.el<HTMLButtonElement>('gerar')
    botao.disabled = true
    this.status('Gerando mensalidades...')
    try {
      const resultado = (await ipcRenderer.invoke('pagamentos:gerar')) as ResultadoAcao
      if (!resultado.ok) {
        this.status(resultado.mensagem, 'erro')
        return
      }

      await this.carregar()
      const criados = resultado.criados ?? 0
      const ignorados = resultado.ignorados ?? 0
      this.status(
        criados > 0
          ? `${criados} mensalidade(s) gerada(s)${ignorados > 0 ? ` • ${ignorados} já existente(s)` : ''}.`
          : 'Nenhuma mensalidade nova. As parcelas das assinaturas ativas já estão geradas.',
        'sucesso'
      )
    } catch {
      this.status('Não foi possível gerar as mensalidades.', 'erro')
    } finally {
      botao.disabled = false
    }
  }

  private limpar = async (): Promise<void> => {
    this.el<HTMLInputElement>('busca').value = ''
    this.el<HTMLSelectElement>('filtro-status').value = ''
    this.el<HTMLInputElement>('filtro-competencia').value = ''
    await this.carregar()
  }

  private voltar = async (): Promise<void> => {
    try {
      await ipcRenderer.invoke('menu:voltar')
    } catch {
      this.status('Não foi possível voltar ao menu.', 'erro')
    }
  }

  private configurarEventos = (): void => {
    this.el<HTMLInputElement>('busca').addEventListener('input', this.agendarBusca)
    this.el('filtro-status').addEventListener('change', () => void this.carregar())
    this.el('filtro-competencia').addEventListener('change', () => void this.carregar())
    this.el('limpar').addEventListener('click', () => void this.limpar())
    this.el('gerar').addEventListener('click', () => void this.gerar())

    this.el('cancelar-validar').addEventListener('click', () =>
      this.el<HTMLDialogElement>('dialogo-validar').close()
    )
    this.el('formulario-validar').addEventListener('submit', (evento) =>
      void this.salvarValidacao(evento)
    )

    this.el('cancelar-confirmar').addEventListener('click', () =>
      this.el<HTMLDialogElement>('dialogo-confirmar').close()
    )
    this.el('confirmar-acao').addEventListener('click', () => void this.executarConfirmacao())
  }

  iniciar = async (): Promise<void> => {
    try {
      this.usuario = (await ipcRenderer.invoke('auth:me')) as UsuarioSessao | null
    } catch {
      this.usuario = null
    }

    this.el('voltar').addEventListener('click', () => void this.voltar())

    if (!this.admin()) {
      this.el('painel-pagamentos').classList.add('oculto')
      this.el('acesso-negado').classList.remove('oculto')
      return
    }

    this.configurarEventos()
    await this.carregar()
  }
}

window.addEventListener('DOMContentLoaded', () => {
  void new PagamentosView().iniciar()
})
