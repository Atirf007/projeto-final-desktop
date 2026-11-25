import { ipcRenderer } from 'electron'

type UsuarioSessao = { id: number; nome: string; perfil: 'admin' | 'instrutor' | 'aluno' }

type TipoVisitante = 'experimental' | 'visitante'
type StatusVisitante = 'agendado' | 'compareceu' | 'faltou' | 'convertido'

type Visitante = {
  id: number
  nome: string
  telefone: string
  email?: string
  aulaId?: number
  aulaTitulo?: string
  aulaDataHoraInicio?: string
  dataVisita: string
  tipo: TipoVisitante
  status: StatusVisitante
  observacoes?: string
  criadoEm: string
  atualizadoEm: string
}

type Aula = {
  id: number
  titulo: string
  dataHoraInicio: string
  status: string
}

type ResultadoVisitante = { ok: true; id?: number } | { ok: false; mensagem: string }

class VisitantesView {
  private usuario: UsuarioSessao | null = null
  private visitantes: Visitante[] = []
  private detalheAtual: Visitante | null = null
  private visitanteParaExcluir: Visitante | null = null

  private el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

  private admin = (): boolean => this.usuario?.perfil === 'admin'

  private gestor = (): boolean => this.usuario?.perfil === 'admin' || this.usuario?.perfil === 'instrutor'

  private tipoTexto: Record<TipoVisitante, string> = {
    experimental: 'Aula experimental',
    visitante: 'Visitante'
  }

  private statusTexto: Record<StatusVisitante, string> = {
    agendado: 'Agendado',
    compareceu: 'Compareceu',
    faltou: 'Faltou',
    convertido: 'Convertido'
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

  private criarOpcao = (valor: string, texto: string): HTMLOptionElement => {
    const opcao = document.createElement('option')
    opcao.value = valor
    opcao.textContent = texto
    return opcao
  }

  private criarSelo = (status: StatusVisitante): HTMLSpanElement => {
    const selo = document.createElement('span')
    selo.className = `selo ${status}`
    selo.textContent = this.statusTexto[status]
    return selo
  }

  private dataBr = (valor?: string): string => {
    if (!valor) return '—'
    const [ano, mes, dia] = String(valor).slice(0, 10).split('-')
    return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor
  }

  private dataHoraFmt = (valor?: string): string => {
    if (!valor) return '—'
    const [data, hora] = String(valor).split(/[ T]/)
    const [ano, mes, dia] = data.split('-')
    if (!ano || !mes || !dia) return valor
    return hora ? `${dia}/${mes}/${ano} ${hora.slice(0, 5)}` : `${dia}/${mes}/${ano}`
  }

  private hoje = (): string => {
    const d = new Date()
    const pad = (n: number): string => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }

  private statusPagina = (texto: string, erro = false): void => {
    const el = this.el('status')
    el.textContent = texto
    el.classList.toggle('erro', erro)
  }

  private criarLinha = (visitante: Visitante): HTMLTableRowElement => {
    const tr = document.createElement('tr')

    const tdNome = document.createElement('td')
    tdNome.className = 'col-nome'
    const nome = document.createElement('strong')
    nome.textContent = visitante.nome
    const email = document.createElement('small')
    email.textContent = visitante.email || 'Sem e-mail'
    tdNome.append(nome, email)

    const tdTelefone = document.createElement('td')
    tdTelefone.textContent = visitante.telefone || '—'

    const tdData = document.createElement('td')
    tdData.className = 'col-data'
    tdData.textContent = this.dataBr(visitante.dataVisita)

    const tdAula = document.createElement('td')
    tdAula.className = 'col-aula'
    if (visitante.aulaTitulo) {
      const titulo = document.createElement('strong')
      titulo.textContent = visitante.aulaTitulo
      const horario = document.createElement('small')
      horario.textContent = this.dataHoraFmt(visitante.aulaDataHoraInicio)
      tdAula.append(titulo, horario)
    } else {
      const vazio = document.createElement('small')
      vazio.textContent = visitante.aulaId ? 'Aula não encontrada' : 'Sem aula vinculada'
      tdAula.append(vazio)
    }

    const tdTipo = document.createElement('td')
    tdTipo.append(
      this.criar('span', `tipo${visitante.tipo === 'experimental' ? ' experimental' : ''}`, this.tipoTexto[visitante.tipo])
    )

    const tdStatus = document.createElement('td')
    tdStatus.append(this.criarSelo(visitante.status))

    const tdAcoes = document.createElement('td')
    const acoes = document.createElement('div')
    acoes.className = 'acoes-linha'
    const btnVer = this.criarBotao('Ver', 'botao secundario pequeno')
    btnVer.addEventListener('click', () => void this.abrirDetalhe(visitante.id))
    const btnEditar = this.criarBotao('Editar', 'botao secundario pequeno')
    btnEditar.addEventListener('click', () => void this.abrirEdicao(visitante.id))
    acoes.append(btnVer, btnEditar)
    if (this.admin()) {
      const btnExcluir = this.criarBotao('Excluir', 'botao perigo pequeno')
      btnExcluir.addEventListener('click', () => this.abrirExclusao(visitante))
      acoes.append(btnExcluir)
    }
    tdAcoes.append(acoes)

    tr.append(tdNome, tdTelefone, tdData, tdAula, tdTipo, tdStatus, tdAcoes)
    return tr
  }

  private carregar = async (): Promise<void> => {
    this.statusPagina('Carregando visitantes...')
    try {
      const filtro: { data?: string; tipo?: TipoVisitante; status?: StatusVisitante } = {}
      const data = this.el<HTMLInputElement>('filtro-data').value
      const tipo = this.el<HTMLSelectElement>('filtro-tipo').value
      const status = this.el<HTMLSelectElement>('filtro-status').value
      if (data) filtro.data = data
      if (tipo) filtro.tipo = tipo as TipoVisitante
      if (status) filtro.status = status as StatusVisitante

      this.visitantes = (await ipcRenderer.invoke('visitantes:listar', filtro)) as Visitante[]
      this.el<HTMLTableSectionElement>('corpo').replaceChildren(...this.visitantes.map(this.criarLinha))
      this.statusPagina(
        this.visitantes.length ? '' : 'Nenhum visitante encontrado para os filtros escolhidos.'
      )
    } catch (erro) {
      console.error(erro)
      this.el<HTMLTableSectionElement>('corpo').replaceChildren()
      this.statusPagina('Não foi possível carregar os visitantes.', true)
    }
  }

  private carregarAuxiliares = async (): Promise<void> => {
    const select = this.el<HTMLSelectElement>('aula')
    try {
      const aulas = (await ipcRenderer.invoke('aulas:listar', {})) as Aula[]
      const opcoes: HTMLOptionElement[] = [this.criarOpcao('', 'Sem aula vinculada')]
      for (const aula of aulas) {
        opcoes.push(
          this.criarOpcao(String(aula.id), `${aula.titulo} — ${this.dataHoraFmt(aula.dataHoraInicio)}`)
        )
      }
      select.replaceChildren(...opcoes)
    } catch (erro) {
      console.error(erro)
      select.replaceChildren(this.criarOpcao('', 'Não foi possível carregar as aulas'))
    }
  }

  private limparForm = (): void => {
    this.el<HTMLFormElement>('formulario').reset()
    this.el<HTMLInputElement>('visitante-id').value = ''
    this.el('erro-formulario').textContent = ''
    this.el<HTMLInputElement>('data-visita').value = this.hoje()
    this.el<HTMLSelectElement>('tipo').value = 'experimental'
    this.el<HTMLSelectElement>('aula').value = ''
  }

  private abrirNovo = (): void => {
    if (!this.gestor()) return
    this.limparForm()
    this.el('titulo-form').textContent = 'Novo visitante'
    this.el<HTMLButtonElement>('salvar').textContent = 'Cadastrar'
    this.el('campo-status').classList.add('oculto')
    this.el<HTMLDialogElement>('dialogo-form').showModal()
    this.el<HTMLInputElement>('nome').focus()
  }

  private preencherForm = (visitante: Visitante): void => {
    this.limparForm()
    this.el<HTMLInputElement>('visitante-id').value = String(visitante.id)
    this.el<HTMLInputElement>('nome').value = visitante.nome
    this.el<HTMLInputElement>('telefone').value = visitante.telefone
    this.el<HTMLInputElement>('email').value = visitante.email ?? ''
    this.el<HTMLInputElement>('data-visita').value = visitante.dataVisita
    this.el<HTMLSelectElement>('tipo').value = visitante.tipo
    const selectAula = this.el<HTMLSelectElement>('aula')
    if (
      visitante.aulaId &&
      !Array.from(selectAula.options).some((opcao) => opcao.value === String(visitante.aulaId))
    ) {
      const rotulo = visitante.aulaTitulo
        ? `${visitante.aulaTitulo} — ${this.dataHoraFmt(visitante.aulaDataHoraInicio)}`
        : `Aula #${visitante.aulaId}`
      selectAula.append(this.criarOpcao(String(visitante.aulaId), rotulo))
    }
    selectAula.value = visitante.aulaId ? String(visitante.aulaId) : ''
    this.el<HTMLTextAreaElement>('observacoes').value = visitante.observacoes ?? ''
    this.el<HTMLSelectElement>('visitante-status').value = visitante.status
  }

  private abrirEdicao = async (id: number): Promise<void> => {
    try {
      const visitante = (await ipcRenderer.invoke('visitantes:obter', id)) as Visitante | null
      if (!visitante) {
        this.statusPagina('Visitante não encontrado.', true)
        return
      }
      this.preencherForm(visitante)
      this.el('titulo-form').textContent = `Editar visitante — ${visitante.nome}`
      this.el<HTMLButtonElement>('salvar').textContent = 'Salvar alterações'
      this.el('campo-status').classList.remove('oculto')
      this.el<HTMLDialogElement>('dialogo-form').showModal()
    } catch (erro) {
      console.error(erro)
      this.statusPagina('Não foi possível carregar o visitante.', true)
    }
  }

  private salvar = async (evento: Event): Promise<void> => {
    evento.preventDefault()
    const erro = this.el('erro-formulario')
    const botao = this.el<HTMLButtonElement>('salvar')
    erro.textContent = ''

    const id = Number(this.el<HTMLInputElement>('visitante-id').value || '0')
    const nome = this.el<HTMLInputElement>('nome').value.trim()
    const telefone = this.el<HTMLInputElement>('telefone').value.trim()
    const email = this.el<HTMLInputElement>('email').value.trim()
    const dataVisita = this.el<HTMLInputElement>('data-visita').value
    const tipo = this.el<HTMLSelectElement>('tipo').value as TipoVisitante
    const aulaValor = this.el<HTMLSelectElement>('aula').value
    const aulaId = aulaValor ? Number(aulaValor) : undefined
    const observacoes = this.el<HTMLTextAreaElement>('observacoes').value.trim()

    if (nome.length < 2) {
      erro.textContent = 'Informe o nome do visitante com pelo menos 2 caracteres.'
      return
    }
    if (telefone.replace(/\D/g, '').length < 8) {
      erro.textContent = 'Informe um telefone válido com pelo menos 8 dígitos.'
      return
    }
    if (!dataVisita) {
      erro.textContent = 'Informe a data da visita.'
      return
    }

    botao.disabled = true
    try {
      let resultado: ResultadoVisitante
      if (id > 0) {
        resultado = (await ipcRenderer.invoke('visitantes:atualizar', {
          id,
          nome,
          telefone,
          email: email || null,
          aulaId: aulaId ?? null,
          dataVisita,
          tipo,
          status: this.el<HTMLSelectElement>('visitante-status').value as StatusVisitante,
          observacoes: observacoes || null
        })) as ResultadoVisitante
      } else {
        resultado = (await ipcRenderer.invoke('visitantes:criar', {
          nome,
          telefone,
          email: email || undefined,
          aulaId,
          dataVisita,
          tipo,
          observacoes: observacoes || undefined
        })) as ResultadoVisitante
      }
      if (!resultado.ok) {
        erro.textContent = resultado.mensagem
        return
      }
      this.el<HTMLDialogElement>('dialogo-form').close()
      await this.carregar()
      if (this.detalheAtual?.id === id) await this.atualizarDetalhe()
      this.statusPagina(id > 0 ? 'Visitante atualizado com sucesso.' : 'Visitante cadastrado com sucesso.')
    } catch (e) {
      console.error(e)
      erro.textContent = 'Não foi possível salvar o visitante.'
    } finally {
      botao.disabled = false
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

  private preencherDetalhe = (visitante: Visitante): void => {
    this.el('titulo-detalhe').textContent = visitante.nome
    const dl = this.el('detalhes')
    dl.replaceChildren()
    this.detalheItem(dl, 'Telefone', visitante.telefone)
    this.detalheItem(dl, 'E-mail', visitante.email)
    this.detalheItem(dl, 'Data da visita', this.dataBr(visitante.dataVisita))
    this.detalheItem(dl, 'Tipo', this.tipoTexto[visitante.tipo])
    this.detalheItem(dl, 'Status', this.statusTexto[visitante.status])
    this.detalheItem(dl, 'Aula', visitante.aulaTitulo)
    this.detalheItem(dl, 'Horário da aula', this.dataHoraFmt(visitante.aulaDataHoraInicio))
    this.detalheItem(dl, 'Observações', visitante.observacoes, true)
    this.detalheItem(dl, 'Cadastrado em', this.dataHoraFmt(visitante.criadoEm))

    const convertido = visitante.status === 'convertido'
    this.el('marcar-compareceu').classList.toggle('oculto', convertido || visitante.status === 'compareceu')
    this.el('marcar-faltou').classList.toggle('oculto', convertido || visitante.status === 'faltou')
    this.el('marcar-agendado').classList.toggle('oculto', convertido || visitante.status === 'agendado')
    const msg = this.el('msg-presenca')
    msg.className = 'msg-info'
    msg.textContent = convertido ? 'Este visitante foi convertido em aluno.' : ''
  }

  private abrirDetalhe = async (id: number): Promise<void> => {
    try {
      const visitante = (await ipcRenderer.invoke('visitantes:obter', id)) as Visitante | null
      if (!visitante) {
        this.statusPagina('Visitante não encontrado.', true)
        return
      }
      this.detalheAtual = visitante
      this.preencherDetalhe(visitante)
      const dialogo = this.el<HTMLDialogElement>('dialogo-detalhe')
      if (!dialogo.open) dialogo.showModal()
    } catch (erro) {
      console.error(erro)
      this.statusPagina('Não foi possível carregar o visitante.', true)
    }
  }

  private atualizarDetalhe = async (): Promise<void> => {
    if (!this.detalheAtual) return
    try {
      const visitante = (await ipcRenderer.invoke('visitantes:obter', this.detalheAtual.id)) as Visitante | null
      if (!visitante) return
      this.detalheAtual = visitante
      this.preencherDetalhe(visitante)
    } catch (erro) {
      console.error(erro)
    }
  }

  private marcarStatus = async (status: StatusVisitante): Promise<void> => {
    const visitante = this.detalheAtual
    if (!visitante) return
    const msg = this.el('msg-presenca')
    msg.className = 'msg-info'
    msg.textContent = 'Atualizando presença...'
    try {
      const resultado = (await ipcRenderer.invoke('visitantes:atualizar', {
        id: visitante.id,
        status
      })) as ResultadoVisitante
      if (!resultado.ok) {
        msg.className = 'msg-info erro'
        msg.textContent = resultado.mensagem
        return
      }
      await this.carregar()
      await this.atualizarDetalhe()
      const atualizada = this.el('msg-presenca')
      atualizada.className = 'msg-info sucesso'
      atualizada.textContent = `Status atualizado para "${this.statusTexto[status]}".`
    } catch (erro) {
      console.error(erro)
      msg.className = 'msg-info erro'
      msg.textContent = 'Não foi possível atualizar a presença.'
    }
  }

  private abrirExclusao = (visitante: Visitante): void => {
    if (!this.admin()) return
    this.visitanteParaExcluir = visitante
    this.el('texto-excluir').textContent = `Deseja excluir o visitante "${visitante.nome}" da visita de ${this.dataBr(visitante.dataVisita)}?`
    this.el('erro-excluir').textContent = ''
    this.el<HTMLDialogElement>('dialogo-excluir').showModal()
  }

  private confirmarExclusao = async (): Promise<void> => {
    if (!this.visitanteParaExcluir) return
    const botao = this.el<HTMLButtonElement>('confirmar-excluir')
    botao.disabled = true
    this.el('erro-excluir').textContent = ''
    try {
      const resultado = (await ipcRenderer.invoke(
        'visitantes:excluir',
        this.visitanteParaExcluir.id
      )) as ResultadoVisitante
      if (!resultado.ok) {
        this.el('erro-excluir').textContent = resultado.mensagem
        return
      }
      const excluido = this.visitanteParaExcluir
      this.el<HTMLDialogElement>('dialogo-excluir').close()
      if (this.detalheAtual?.id === excluido.id) {
        this.el<HTMLDialogElement>('dialogo-detalhe').close()
        this.detalheAtual = null
      }
      await this.carregar()
      this.statusPagina(`Visitante "${excluido.nome}" excluído.`)
    } catch (erro) {
      console.error(erro)
      this.el('erro-excluir').textContent = 'Não foi possível excluir o visitante.'
    } finally {
      botao.disabled = false
    }
  }

  private limparFiltros = (): void => {
    this.el<HTMLInputElement>('filtro-data').value = ''
    this.el<HTMLSelectElement>('filtro-tipo').value = ''
    this.el<HTMLSelectElement>('filtro-status').value = ''
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
    if (!this.gestor()) {
      this.statusPagina('Acesso negado para este perfil.', true)
      return
    }

    this.el('novo').classList.remove('oculto')
    this.el('voltar').addEventListener('click', () => void this.voltar())
    this.el('novo').addEventListener('click', this.abrirNovo)
    this.el('limpar-filtros').addEventListener('click', this.limparFiltros)
    this.el('filtro-data').addEventListener('change', () => void this.carregar())
    this.el('filtro-tipo').addEventListener('change', () => void this.carregar())
    this.el('filtro-status').addEventListener('change', () => void this.carregar())
    this.el('formulario').addEventListener('submit', (evento) => void this.salvar(evento))
    this.el('cancelar-form').addEventListener('click', () =>
      this.el<HTMLDialogElement>('dialogo-form').close()
    )
    this.el('fechar-detalhe').addEventListener('click', () =>
      this.el<HTMLDialogElement>('dialogo-detalhe').close()
    )
    this.el('editar-detalhe').addEventListener('click', () => {
      if (!this.detalheAtual) return
      this.el<HTMLDialogElement>('dialogo-detalhe').close()
      void this.abrirEdicao(this.detalheAtual.id)
    })
    this.el('marcar-compareceu').addEventListener('click', () => void this.marcarStatus('compareceu'))
    this.el('marcar-faltou').addEventListener('click', () => void this.marcarStatus('faltou'))
    this.el('marcar-agendado').addEventListener('click', () => void this.marcarStatus('agendado'))
    this.el('cancelar-excluir').addEventListener('click', () =>
      this.el<HTMLDialogElement>('dialogo-excluir').close()
    )
    this.el('confirmar-excluir').addEventListener('click', () => void this.confirmarExclusao())

    await this.carregarAuxiliares()
    await this.carregar()
  }
}

window.addEventListener('DOMContentLoaded', () => {
  void new VisitantesView().iniciar()
})
