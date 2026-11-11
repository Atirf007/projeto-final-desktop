import { ipcRenderer } from 'electron'

type UsuarioSessao = { id: number; nome: string; perfil: 'admin' | 'instrutor' | 'aluno' }

type TipoPlano = 'mensal' | 'trimestral' | 'semestral' | 'anual'
type StatusAssinatura = 'ativa' | 'vencida' | 'cancelada' | 'suspensa'

type Plano = {
  id: number
  nome: string
  tipo: TipoPlano
  duracaoMeses: number
  valor: number
  descricao?: string
  ativo: boolean
  assinaturasAtivas: number
}

type Assinatura = {
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

type AlunoResumo = {
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

type ResultadoAcao =
  | { ok: true; id?: number; acao?: 'excluida' | 'cancelada' }
  | { ok: false; mensagem: string }

class PlanosView {
  private usuario: UsuarioSessao | null = null
  private planos: Plano[] = []
  private assinaturas: Assinatura[] = []
  private alunosAtivos: AlunoResumo[] = []
  private planosAtivos: Plano[] = []
  private assinaturaEdicao: Assinatura | null = null
  private assinaturaRenovacao: Assinatura | null = null
  private acaoConfirmar: (() => Promise<void>) | null = null
  private timerPlanos: ReturnType<typeof setTimeout> | null = null
  private timerAssinaturas: ReturnType<typeof setTimeout> | null = null
  private apenasVencendo = false

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

  private criarOpcao = (valor: string, texto: string): HTMLOptionElement => {
    const opcao = document.createElement('option')
    opcao.value = valor
    opcao.textContent = texto
    return opcao
  }

  private criarSelo = (status: string, texto: string): HTMLSpanElement => {
    const selo = document.createElement('span')
    selo.className = `selo ${status}`
    selo.textContent = texto
    return selo
  }

  private tipoTexto: Record<TipoPlano, string> = {
    mensal: 'Mensal',
    trimestral: 'Trimestral',
    semestral: 'Semestral',
    anual: 'Anual'
  }

  private statusTexto: Record<StatusAssinatura, string> = {
    ativa: 'Ativa',
    vencida: 'Vencida',
    cancelada: 'Cancelada',
    suspensa: 'Suspensa'
  }

  private duracaoPadrao: Record<TipoPlano, number> = {
    mensal: 1,
    trimestral: 3,
    semestral: 6,
    anual: 12
  }

  private moeda = (valor: number): string =>
    valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  private dataBr = (valor?: string): string => {
    if (!valor) return '—'
    const [ano, mes, dia] = String(valor).slice(0, 10).split('-')
    return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor
  }

  private hoje = (): string => {
    const agora = new Date()
    const mes = String(agora.getMonth() + 1).padStart(2, '0')
    const dia = String(agora.getDate()).padStart(2, '0')
    return `${agora.getFullYear()}-${mes}-${dia}`
  }

  private somarDias = (data: string, dias: number): string => {
    const [ano, mes, dia] = data.split('-').map(Number)
    return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10)
  }

  private somarMeses = (data: string, meses: number): string => {
    const [ano, mes, dia] = data.split('-').map(Number)
    const alvoMes = mes - 1 + meses
    const alvoAno = ano + Math.floor(alvoMes / 12)
    const mesNormalizado = ((alvoMes % 12) + 12) % 12
    const ultimoDia = new Date(Date.UTC(alvoAno, mesNormalizado + 1, 0)).getUTCDate()
    const diaFinal = Math.min(dia, ultimoDia)
    return new Date(Date.UTC(alvoAno, mesNormalizado, diaFinal)).toISOString().slice(0, 10)
  }

  private diasParaVencer = (dataFim: string): number => {
    const [ano, mes, dia] = dataFim.slice(0, 10).split('-').map(Number)
    const fim = Date.UTC(ano, mes - 1, dia)
    const agora = new Date()
    const hoje = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate())
    return Math.round((fim - hoje) / 86400000)
  }

  private vencimentoTexto = (assinatura: Assinatura): string => {
    const dias = this.diasParaVencer(assinatura.dataFim)
    if (assinatura.status === 'vencida') {
      const atraso = Math.abs(dias)
      return atraso === 0 ? 'Venceu hoje' : `Vencida há ${atraso} ${atraso === 1 ? 'dia' : 'dias'}`
    }
    if (assinatura.status !== 'ativa') return ''
    if (dias === 0) return 'Vence hoje'
    if (dias <= 30) return `Vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}`
    return ''
  }

  private statusPlanos = (texto: string, erro = false): void => {
    const el = this.el('status-planos')
    el.textContent = texto
    el.classList.toggle('erro', erro)
  }

  private statusAssinaturas = (texto: string, erro = false): void => {
    const el = this.el('status-assinaturas')
    el.textContent = texto
    el.classList.toggle('erro', erro)
  }

  private criarLinhaPlano = (plano: Plano): HTMLTableRowElement => {
    const tr = document.createElement('tr')
    const td = (texto: string, classe?: string): HTMLTableCellElement => {
      const cel = document.createElement('td')
      cel.textContent = texto
      if (classe) cel.className = classe
      return cel
    }

    const nomeTd = document.createElement('td')
    nomeTd.className = 'col-titulo'
    const nome = document.createElement('strong')
    nome.textContent = plano.nome
    nomeTd.append(nome)
    if (plano.descricao) {
      const descricao = document.createElement('small')
      descricao.textContent = plano.descricao
      nomeTd.append(descricao)
    }

    const tipoTd = document.createElement('td')
    const tipo = document.createElement('span')
    tipo.className = 'tipo-plano'
    tipo.textContent = this.tipoTexto[plano.tipo]
    tipoTd.append(tipo)

    const duracaoTd = td(`${plano.duracaoMeses} ${plano.duracaoMeses === 1 ? 'mês' : 'meses'}`)
    const valorTd = td(this.moeda(plano.valor), 'col-valor')
    const ativasTd = td(String(plano.assinaturasAtivas))

    const statusTd = document.createElement('td')
    statusTd.append(this.criarSelo(plano.ativo ? 'ativo' : 'inativo', plano.ativo ? 'Ativo' : 'Inativo'))

    const acoesTd = document.createElement('td')
    const acoes = document.createElement('div')
    acoes.className = 'acoes-linha'
    const btnEditar = this.criarBotao('Editar', 'botao secundario pequeno')
    btnEditar.addEventListener('click', () => void this.abrirEdicaoPlano(plano.id))
    const btnDesativar = this.criarBotao('Desativar', 'botao perigo pequeno')
    btnDesativar.disabled = !plano.ativo
    btnDesativar.addEventListener('click', () => this.desativarPlano(plano))
    acoes.append(btnEditar, btnDesativar)
    acoesTd.append(acoes)

    tr.append(nomeTd, tipoTd, duracaoTd, valorTd, ativasTd, statusTd, acoesTd)
    return tr
  }

  private criarLinhaAssinatura = (assinatura: Assinatura): HTMLTableRowElement => {
    const tr = document.createElement('tr')
    if (assinatura.status === 'cancelada') tr.className = 'linha-cancelada'

    const td = (texto: string, classe?: string): HTMLTableCellElement => {
      const cel = document.createElement('td')
      cel.textContent = texto
      if (classe) cel.className = classe
      return cel
    }

    const tituloTd = document.createElement('td')
    tituloTd.className = 'col-titulo'
    const aluno = document.createElement('strong')
    aluno.textContent = assinatura.alunoNome
    const plano = document.createElement('small')
    plano.textContent = assinatura.planoNome
    tituloTd.append(aluno, plano)

    const inicioTd = td(this.dataBr(assinatura.dataInicio), 'col-data')
    const fimTd = td(this.dataBr(assinatura.dataFim), 'col-data')
    const vencimento = this.vencimentoTexto(assinatura)
    if (vencimento) {
      const aviso = document.createElement('small')
      aviso.textContent = vencimento
      fimTd.append(aviso)
    }

    const valorTd = td(this.moeda(assinatura.valorContratado), 'col-valor')

    const statusTd = document.createElement('td')
    statusTd.append(this.criarSelo(assinatura.status, this.statusTexto[assinatura.status]))

    const acoesTd = document.createElement('td')
    const acoes = document.createElement('div')
    acoes.className = 'acoes-linha'

    const btnRenovar = this.criarBotao('Renovar', 'botao verde pequeno')
    btnRenovar.addEventListener('click', () => void this.abrirRenovacao(assinatura))
    const btnEditar = this.criarBotao('Editar', 'botao secundario pequeno')
    btnEditar.addEventListener('click', () => this.abrirEdicaoAssinatura(assinatura))
    acoes.append(btnRenovar, btnEditar)

    if (assinatura.status !== 'cancelada') {
      const btnCancelar = this.criarBotao('Cancelar', 'botao secundario pequeno')
      btnCancelar.addEventListener('click', () => this.cancelarAssinatura(assinatura))
      acoes.append(btnCancelar)
    }

    const btnExcluir = this.criarBotao('Excluir', 'botao perigo pequeno')
    btnExcluir.addEventListener('click', () => this.excluirAssinatura(assinatura))
    acoes.append(btnExcluir)

    acoesTd.append(acoes)
    tr.append(tituloTd, inicioTd, fimTd, valorTd, statusTd, acoesTd)
    return tr
  }

  private carregarPlanos = async (): Promise<void> => {
    this.statusPlanos('Carregando planos...')
    try {
      const busca = this.el<HTMLInputElement>('busca-planos').value.trim()
      const ativoRaw = this.el<HTMLSelectElement>('filtro-plano-ativo').value
      const filtro: { busca?: string; ativo?: boolean } = {}
      if (busca) filtro.busca = busca
      if (ativoRaw === 'true') filtro.ativo = true
      if (ativoRaw === 'false') filtro.ativo = false

      this.planos = (await ipcRenderer.invoke('planos:listar', filtro)) as Plano[]
      this.el<HTMLTableSectionElement>('corpo-planos').replaceChildren(...this.planos.map(this.criarLinhaPlano))
      this.el('titulo-planos').textContent = `Planos cadastrados (${this.planos.length})`
      this.statusPlanos(this.planos.length ? '' : 'Nenhum plano encontrado.')
    } catch (erro) {
      console.error(erro)
      this.el<HTMLTableSectionElement>('corpo-planos').replaceChildren()
      this.el('titulo-planos').textContent = 'Planos cadastrados'
      this.statusPlanos('Não foi possível carregar os planos.', true)
    }
  }

  private carregarAssinaturas = async (): Promise<void> => {
    this.statusAssinaturas('Carregando assinaturas...')
    try {
      let lista: Assinatura[]
      if (this.apenasVencendo) {
        lista = (await ipcRenderer.invoke('assinaturas:vencendo', { dias: 30 })) as Assinatura[]
      } else {
        const busca = this.el<HTMLInputElement>('busca-assinaturas').value.trim()
        const status = this.el<HTMLSelectElement>('filtro-assinatura-status').value
        const filtro: { busca?: string; status?: StatusAssinatura } = {}
        if (busca) filtro.busca = busca
        if (status) filtro.status = status as StatusAssinatura
        lista = (await ipcRenderer.invoke('assinaturas:listar', filtro)) as Assinatura[]
      }

      this.assinaturas = lista
      this.el<HTMLTableSectionElement>('corpo-assinaturas').replaceChildren(
        ...this.assinaturas.map(this.criarLinhaAssinatura)
      )
      this.el('titulo-assinaturas').textContent = `Assinaturas (${this.assinaturas.length})`
      this.el('vencendo').className = this.apenasVencendo ? 'botao verde' : 'botao secundario'

      if (this.apenasVencendo) {
        this.statusAssinaturas(
          this.assinaturas.length
            ? `${this.assinaturas.length} assinatura(s) vencendo em até 30 dias.`
            : 'Nenhuma assinatura vencendo nos próximos 30 dias.'
        )
      } else {
        this.statusAssinaturas(this.assinaturas.length ? '' : 'Nenhuma assinatura encontrada.')
      }
    } catch (erro) {
      console.error(erro)
      this.el<HTMLTableSectionElement>('corpo-assinaturas').replaceChildren()
      this.el('titulo-assinaturas').textContent = 'Assinaturas'
      this.statusAssinaturas('Não foi possível carregar as assinaturas.', true)
    }
  }

  private agendarPlanos = (): void => {
    if (this.timerPlanos) clearTimeout(this.timerPlanos)
    this.timerPlanos = setTimeout(() => {
      this.timerPlanos = null
      void this.carregarPlanos()
    }, 300)
  }

  private agendarAssinaturas = (): void => {
    if (this.timerAssinaturas) clearTimeout(this.timerAssinaturas)
    this.timerAssinaturas = setTimeout(() => {
      this.timerAssinaturas = null
      this.apenasVencendo = false
      void this.carregarAssinaturas()
    }, 300)
  }

  private limparFormularioPlano = (): void => {
    this.el<HTMLFormElement>('formulario-plano').reset()
    this.el<HTMLInputElement>('plano-id').value = ''
    this.el('erro-plano').textContent = ''
  }

  private abrirNovoPlano = (): void => {
    this.limparFormularioPlano()
    this.el('titulo-plano').textContent = 'Novo plano'
    this.el<HTMLButtonElement>('salvar-plano').textContent = 'Cadastrar'
    this.el('campo-plano-ativo').classList.add('oculto')
    this.el<HTMLSelectElement>('plano-tipo').value = 'mensal'
    this.el<HTMLInputElement>('plano-duracao').value = '1'
    this.el<HTMLDialogElement>('dialogo-plano').showModal()
    this.el<HTMLInputElement>('plano-nome').focus()
  }

  private abrirEdicaoPlano = async (id: number): Promise<void> => {
    try {
      const plano = (await ipcRenderer.invoke('planos:obter', id)) as Plano | null
      if (!plano) {
        this.statusPlanos('Plano não encontrado.', true)
        return
      }
      this.limparFormularioPlano()
      this.el<HTMLInputElement>('plano-id').value = String(plano.id)
      this.el<HTMLInputElement>('plano-nome').value = plano.nome
      this.el<HTMLSelectElement>('plano-tipo').value = plano.tipo
      this.el<HTMLInputElement>('plano-duracao').value = String(plano.duracaoMeses)
      this.el<HTMLInputElement>('plano-valor').value = plano.valor.toFixed(2)
      this.el<HTMLTextAreaElement>('plano-descricao').value = plano.descricao ?? ''
      this.el<HTMLSelectElement>('plano-ativo').value = String(plano.ativo)
      this.el('titulo-plano').textContent = `Editar plano — ${plano.nome}`
      this.el<HTMLButtonElement>('salvar-plano').textContent = 'Salvar alterações'
      this.el('campo-plano-ativo').classList.remove('oculto')
      this.el<HTMLDialogElement>('dialogo-plano').showModal()
    } catch (erro) {
      console.error(erro)
      this.statusPlanos('Não foi possível carregar o plano.', true)
    }
  }

  private salvarPlano = async (evento: Event): Promise<void> => {
    evento.preventDefault()
    const erro = this.el('erro-plano')
    erro.textContent = ''
    const botao = this.el<HTMLButtonElement>('salvar-plano')
    const id = Number(this.el<HTMLInputElement>('plano-id').value || '0')
    const nome = this.el<HTMLInputElement>('plano-nome').value.trim()
    const duracao = Number(this.el<HTMLInputElement>('plano-duracao').value)
    const valor = Number(this.el<HTMLInputElement>('plano-valor').value)

    if (nome.length < 2) { erro.textContent = 'Informe o nome do plano com pelo menos 2 caracteres.'; return }
    if (!Number.isInteger(duracao) || duracao < 1 || duracao > 120) {
      erro.textContent = 'A duração deve ser entre 1 e 120 meses.'
      return
    }
    if (!this.el<HTMLInputElement>('plano-valor').value || !Number.isFinite(valor) || valor < 0) {
      erro.textContent = 'Informe um valor válido para o plano.'
      return
    }

    const payload = {
      nome,
      tipo: this.el<HTMLSelectElement>('plano-tipo').value,
      duracaoMeses: duracao,
      valor,
      descricao: this.el<HTMLTextAreaElement>('plano-descricao').value.trim() || undefined
    }

    botao.disabled = true
    try {
      const resultado = (id > 0
        ? await ipcRenderer.invoke('planos:atualizar', {
            id,
            ...payload,
            descricao: this.el<HTMLTextAreaElement>('plano-descricao').value.trim() || null,
            ativo: this.el<HTMLSelectElement>('plano-ativo').value === 'true'
          })
        : await ipcRenderer.invoke('planos:criar', payload)) as ResultadoAcao

      if (!resultado.ok) {
        erro.textContent = resultado.mensagem
        return
      }
      this.el<HTMLDialogElement>('dialogo-plano').close()
      await Promise.all([this.carregarPlanos(), this.carregarAssinaturas()])
      this.statusPlanos(id > 0 ? 'Plano atualizado com sucesso.' : 'Plano cadastrado com sucesso.')
    } catch (e) {
      console.error(e)
      erro.textContent = 'Não foi possível salvar o plano.'
    } finally {
      botao.disabled = false
    }
  }

  private carregarAuxiliares = async (): Promise<boolean> => {
    try {
      const [alunos, planos] = await Promise.all([
        ipcRenderer.invoke('alunos:listar', { ativo: true }),
        ipcRenderer.invoke('planos:listar', { ativo: true })
      ])
      this.alunosAtivos = alunos as AlunoResumo[]
      this.planosAtivos = planos as Plano[]
      return true
    } catch (erro) {
      console.error(erro)
      return false
    }
  }

  private preencherSelectAlunos = (select: HTMLSelectElement): void => {
    select.replaceChildren()
    if (!this.alunosAtivos.length) {
      select.append(this.criarOpcao('', 'Nenhum aluno ativo'))
      select.disabled = true
      return
    }
    select.disabled = false
    for (const aluno of this.alunosAtivos) {
      const detalhe = aluno.email ? ` — ${aluno.email}` : ''
      select.append(this.criarOpcao(String(aluno.id), `${aluno.nome}${detalhe}`))
    }
  }

  private preencherSelectPlanos = (select: HTMLSelectElement, selecionado?: number): void => {
    select.replaceChildren()
    if (!this.planosAtivos.length) {
      select.append(this.criarOpcao('', 'Nenhum plano ativo'))
      select.disabled = true
      return
    }
    select.disabled = false
    for (const plano of this.planosAtivos) {
      select.append(
        this.criarOpcao(
          String(plano.id),
          `${plano.nome} — ${this.tipoTexto[plano.tipo]} — ${this.moeda(plano.valor)}`
        )
      )
    }
    if (selecionado && this.planosAtivos.some((plano) => plano.id === selecionado)) {
      select.value = String(selecionado)
    }
  }

  private atualizarPreviewAssinatura = (): void => {
    const planoId = Number(this.el<HTMLSelectElement>('assinatura-plano').value)
    const plano = this.planosAtivos.find((item) => item.id === planoId)
    const msg = this.el('msg-assinatura')
    if (!plano) {
      msg.textContent = ''
      return
    }
    const inicio = this.el<HTMLInputElement>('assinatura-inicio').value
    if (!inicio) {
      msg.className = 'msg-info span2'
      msg.textContent = `${this.tipoTexto[plano.tipo]} · ${plano.duracaoMeses} ${plano.duracaoMeses === 1 ? 'mês' : 'meses'}. Informe a data de início.`
      return
    }
    const fim = this.somarMeses(inicio, plano.duracaoMeses)
    msg.className = 'msg-info span2'
    msg.textContent = `${this.tipoTexto[plano.tipo]} · ${plano.duracaoMeses} ${plano.duracaoMeses === 1 ? 'mês' : 'meses'} · término previsto em ${this.dataBr(fim)}.`
  }

  private atualizarPreviewRenovacao = (): void => {
    const planoId = Number(this.el<HTMLSelectElement>('renovar-plano').value)
    const plano = this.planosAtivos.find((item) => item.id === planoId)
    const msg = this.el('msg-renovar')
    if (!plano) {
      msg.textContent = ''
      return
    }
    const inicio = this.el<HTMLInputElement>('renovar-inicio').value
    if (!inicio) {
      msg.className = 'msg-info span2'
      msg.textContent = `${this.tipoTexto[plano.tipo]} · ${plano.duracaoMeses} ${plano.duracaoMeses === 1 ? 'mês' : 'meses'}. Informe a nova data de início.`
      return
    }
    const fim = this.somarMeses(inicio, plano.duracaoMeses)
    msg.className = 'msg-info span2'
    msg.textContent = `${this.tipoTexto[plano.tipo]} · ${plano.duracaoMeses} ${plano.duracaoMeses === 1 ? 'mês' : 'meses'} · novo término em ${this.dataBr(fim)} · valor ${this.moeda(plano.valor)}.`
  }

  private abrirNovaAssinatura = async (): Promise<void> => {
    const ok = await this.carregarAuxiliares()
    if (!ok) {
      this.statusAssinaturas('Não foi possível carregar alunos e planos.', true)
      return
    }

    this.el<HTMLFormElement>('formulario-assinatura').reset()
    this.el('erro-assinatura').textContent = ''
    this.el('msg-assinatura').className = 'msg-info span2'
    this.el<HTMLInputElement>('assinatura-inicio').value = this.hoje()
    this.preencherSelectAlunos(this.el<HTMLSelectElement>('assinatura-aluno'))
    this.preencherSelectPlanos(this.el<HTMLSelectElement>('assinatura-plano'))

    const botao = this.el<HTMLButtonElement>('salvar-assinatura')
    const msg = this.el('msg-assinatura')
    if (!this.alunosAtivos.length || !this.planosAtivos.length) {
      botao.disabled = true
      msg.className = 'msg-info span2 aviso'
      msg.textContent = !this.alunosAtivos.length
        ? 'Cadastre um aluno ativo antes de criar assinaturas.'
        : 'Cadastre um plano ativo antes de criar assinaturas.'
    } else {
      botao.disabled = false
      const plano = this.planosAtivos.find((item) => item.id === Number(this.el<HTMLSelectElement>('assinatura-plano').value))
      if (plano) this.el<HTMLInputElement>('assinatura-valor').value = plano.valor.toFixed(2)
      this.atualizarPreviewAssinatura()
    }

    this.el<HTMLDialogElement>('dialogo-assinatura').showModal()
  }

  private salvarAssinatura = async (evento: Event): Promise<void> => {
    evento.preventDefault()
    const erro = this.el('erro-assinatura')
    erro.textContent = ''
    const botao = this.el<HTMLButtonElement>('salvar-assinatura')
    const alunoId = Number(this.el<HTMLSelectElement>('assinatura-aluno').value)
    const planoId = Number(this.el<HTMLSelectElement>('assinatura-plano').value)
    const dataInicio = this.el<HTMLInputElement>('assinatura-inicio').value
    const valorRaw = this.el<HTMLInputElement>('assinatura-valor').value
    const valorContratado = valorRaw ? Number(valorRaw) : undefined

    if (!alunoId || !planoId) { erro.textContent = 'Selecione o aluno e o plano.'; return }
    if (!dataInicio) { erro.textContent = 'Informe a data de início.'; return }
    if (valorContratado !== undefined && (!Number.isFinite(valorContratado) || valorContratado < 0)) {
      erro.textContent = 'Informe um valor contratado válido.'
      return
    }

    botao.disabled = true
    try {
      const resultado = (await ipcRenderer.invoke('assinaturas:criar', {
        alunoId,
        planoId,
        dataInicio,
        valorContratado
      })) as ResultadoAcao
      if (!resultado.ok) {
        erro.textContent = resultado.mensagem
        return
      }
      this.el<HTMLDialogElement>('dialogo-assinatura').close()
      await Promise.all([this.carregarPlanos(), this.carregarAssinaturas()])
      this.statusAssinaturas('Assinatura criada com sucesso.')
    } catch (e) {
      console.error(e)
      erro.textContent = 'Não foi possível criar a assinatura.'
    } finally {
      botao.disabled = false
    }
  }

  private abrirEdicaoAssinatura = (assinatura: Assinatura): void => {
    this.assinaturaEdicao = assinatura
    this.el('resumo-editar').textContent = `${assinatura.alunoNome} — ${assinatura.planoNome}`
    this.el<HTMLSelectElement>('editar-status').value = assinatura.status
    this.el<HTMLInputElement>('editar-fim').value = assinatura.dataFim
    this.el<HTMLInputElement>('editar-valor').value = assinatura.valorContratado.toFixed(2)
    this.el('erro-editar').textContent = ''
    this.el<HTMLDialogElement>('dialogo-editar-assinatura').showModal()
  }

  private salvarEdicaoAssinatura = async (evento: Event): Promise<void> => {
    evento.preventDefault()
    if (!this.assinaturaEdicao) return
    const erro = this.el('erro-editar')
    erro.textContent = ''
    const botao = this.el<HTMLButtonElement>('salvar-editar')
    const dataFim = this.el<HTMLInputElement>('editar-fim').value
    const valorRaw = this.el<HTMLInputElement>('editar-valor').value
    const valorContratado = Number(valorRaw)
    const status = this.el<HTMLSelectElement>('editar-status').value as StatusAssinatura

    if (!dataFim) { erro.textContent = 'Informe a data de fim.'; return }
    if (!valorRaw || !Number.isFinite(valorContratado) || valorContratado < 0) {
      erro.textContent = 'Informe um valor contratado válido.'
      return
    }

    botao.disabled = true
    try {
      const resultado = (await ipcRenderer.invoke('assinaturas:atualizar', {
        id: this.assinaturaEdicao.id,
        status,
        dataFim,
        valorContratado
      })) as ResultadoAcao
      if (!resultado.ok) {
        erro.textContent = resultado.mensagem
        return
      }
      this.el<HTMLDialogElement>('dialogo-editar-assinatura').close()
      this.assinaturaEdicao = null
      await Promise.all([this.carregarPlanos(), this.carregarAssinaturas()])
      this.statusAssinaturas('Assinatura atualizada com sucesso.')
    } catch (e) {
      console.error(e)
      erro.textContent = 'Não foi possível atualizar a assinatura.'
    } finally {
      botao.disabled = false
    }
  }

  private abrirRenovacao = async (assinatura: Assinatura): Promise<void> => {
    const ok = await this.carregarAuxiliares()
    if (!ok) {
      this.statusAssinaturas('Não foi possível carregar os planos.', true)
      return
    }

    this.assinaturaRenovacao = assinatura
    this.el('erro-renovar').textContent = ''
    this.el('msg-renovar').className = 'msg-info span2'
    this.el('resumo-renovar').textContent =
      `${assinatura.alunoNome} — ${assinatura.planoNome} · ${this.dataBr(assinatura.dataInicio)} a ${this.dataBr(assinatura.dataFim)}`
    this.preencherSelectPlanos(this.el<HTMLSelectElement>('renovar-plano'), assinatura.planoId)

    const proximoInicio =
      assinatura.status === 'cancelada' || assinatura.dataFim < this.hoje()
        ? this.hoje()
        : this.somarDias(assinatura.dataFim, 1)
    this.el<HTMLInputElement>('renovar-inicio').value = proximoInicio

    const botao = this.el<HTMLButtonElement>('salvar-renovar')
    const msg = this.el('msg-renovar')
    if (!this.planosAtivos.length) {
      botao.disabled = true
      msg.className = 'msg-info span2 aviso'
      msg.textContent = 'Nenhum plano ativo disponível para renovação.'
    } else {
      botao.disabled = false
      this.atualizarPreviewRenovacao()
      if (!this.planosAtivos.some((plano) => plano.id === assinatura.planoId)) {
        msg.className = 'msg-info span2 aviso'
        msg.textContent = `O plano original está inativo. Selecione um novo plano para renovar. ${msg.textContent}`
      }
    }

    this.el<HTMLDialogElement>('dialogo-renovar').showModal()
  }

  private salvarRenovacao = async (evento: Event): Promise<void> => {
    evento.preventDefault()
    if (!this.assinaturaRenovacao) return
    const erro = this.el('erro-renovar')
    erro.textContent = ''
    const botao = this.el<HTMLButtonElement>('salvar-renovar')
    const planoId = Number(this.el<HTMLSelectElement>('renovar-plano').value)
    const dataInicio = this.el<HTMLInputElement>('renovar-inicio').value

    if (!planoId) { erro.textContent = 'Selecione um plano para renovar.'; return }
    if (!dataInicio) { erro.textContent = 'Informe a nova data de início.'; return }

    botao.disabled = true
    try {
      const resultado = (await ipcRenderer.invoke('assinaturas:renovar', {
        id: this.assinaturaRenovacao.id,
        planoId,
        dataInicio
      })) as ResultadoAcao
      if (!resultado.ok) {
        erro.textContent = resultado.mensagem
        return
      }
      this.el<HTMLDialogElement>('dialogo-renovar').close()
      this.assinaturaRenovacao = null
      await Promise.all([this.carregarPlanos(), this.carregarAssinaturas()])
      this.statusAssinaturas('Assinatura renovada com sucesso.')
    } catch (e) {
      console.error(e)
      erro.textContent = 'Não foi possível renovar a assinatura.'
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

  private desativarPlano = (plano: Plano): void => {
    const aviso =
      plano.assinaturasAtivas > 0
        ? ` Há ${plano.assinaturasAtivas} assinatura(s) ativa(s) vinculada(s) a este plano.`
        : ''
    this.abrirConfirmacao(
      'Desativar plano',
      `Deseja desativar o plano "${plano.nome}"? O histórico de assinaturas é preservado.${aviso}`,
      'Desativar',
      true,
      async () => {
        const resultado = (await ipcRenderer.invoke('planos:excluir', plano.id)) as ResultadoAcao
        if (!resultado.ok) throw new Error(resultado.mensagem)
        await Promise.all([this.carregarPlanos(), this.carregarAssinaturas()])
        this.statusPlanos(`Plano "${plano.nome}" desativado.`)
      }
    )
  }

  private cancelarAssinatura = (assinatura: Assinatura): void => {
    this.abrirConfirmacao(
      'Cancelar assinatura',
      `Cancelar a assinatura de "${assinatura.alunoNome}" referente ao plano "${assinatura.planoNome}"?`,
      'Cancelar assinatura',
      true,
      async () => {
        const resultado = (await ipcRenderer.invoke('assinaturas:atualizar', {
          id: assinatura.id,
          status: 'cancelada'
        })) as ResultadoAcao
        if (!resultado.ok) throw new Error(resultado.mensagem)
        await Promise.all([this.carregarPlanos(), this.carregarAssinaturas()])
        this.statusAssinaturas('Assinatura cancelada.')
      }
    )
  }

  private excluirAssinatura = (assinatura: Assinatura): void => {
    this.abrirConfirmacao(
      'Excluir assinatura',
      `Excluir a assinatura de "${assinatura.alunoNome}"? Se houver pagamentos vinculados, ela será cancelada para preservar o histórico.`,
      'Excluir',
      true,
      async () => {
        const resultado = (await ipcRenderer.invoke('assinaturas:excluir', assinatura.id)) as ResultadoAcao
        if (!resultado.ok) throw new Error(resultado.mensagem)
        await Promise.all([this.carregarPlanos(), this.carregarAssinaturas()])
        this.statusAssinaturas(
          resultado.acao === 'cancelada'
            ? 'Assinatura cancelada para preservar o histórico de pagamentos.'
            : 'Assinatura excluída.'
        )
      }
    )
  }

  private voltar = async (): Promise<void> => {
    try {
      await ipcRenderer.invoke('menu:voltar')
    } catch {
      this.statusPlanos('Não foi possível voltar ao menu.', true)
    }
  }

  private configurarEventos = (): void => {
    this.el<HTMLInputElement>('busca-planos').addEventListener('input', this.agendarPlanos)
    this.el('filtro-plano-ativo').addEventListener('change', () => void this.carregarPlanos())
    this.el('limpar-planos').addEventListener('click', () => {
      this.el<HTMLInputElement>('busca-planos').value = ''
      this.el<HTMLSelectElement>('filtro-plano-ativo').value = ''
      void this.carregarPlanos()
    })
    this.el('novo-plano').addEventListener('click', this.abrirNovoPlano)
    this.el('cancelar-plano').addEventListener('click', () => this.el<HTMLDialogElement>('dialogo-plano').close())
    this.el('formulario-plano').addEventListener('submit', (evento) => void this.salvarPlano(evento))
    this.el<HTMLSelectElement>('plano-tipo').addEventListener('change', () => {
      const tipo = this.el<HTMLSelectElement>('plano-tipo').value as TipoPlano
      this.el<HTMLInputElement>('plano-duracao').value = String(this.duracaoPadrao[tipo])
    })

    this.el<HTMLInputElement>('busca-assinaturas').addEventListener('input', this.agendarAssinaturas)
    this.el('filtro-assinatura-status').addEventListener('change', () => {
      this.apenasVencendo = false
      void this.carregarAssinaturas()
    })
    this.el('vencendo').addEventListener('click', () => {
      this.apenasVencendo = true
      this.el<HTMLInputElement>('busca-assinaturas').value = ''
      this.el<HTMLSelectElement>('filtro-assinatura-status').value = ''
      void this.carregarAssinaturas()
    })
    this.el('limpar-assinaturas').addEventListener('click', () => {
      this.apenasVencendo = false
      this.el<HTMLInputElement>('busca-assinaturas').value = ''
      this.el<HTMLSelectElement>('filtro-assinatura-status').value = ''
      void this.carregarAssinaturas()
    })
    this.el('nova-assinatura').addEventListener('click', () => void this.abrirNovaAssinatura())
    this.el('cancelar-assinatura').addEventListener('click', () =>
      this.el<HTMLDialogElement>('dialogo-assinatura').close()
    )
    this.el('formulario-assinatura').addEventListener('submit', (evento) => void this.salvarAssinatura(evento))
    this.el<HTMLSelectElement>('assinatura-plano').addEventListener('change', () => {
      const planoId = Number(this.el<HTMLSelectElement>('assinatura-plano').value)
      const plano = this.planosAtivos.find((item) => item.id === planoId)
      if (plano) this.el<HTMLInputElement>('assinatura-valor').value = plano.valor.toFixed(2)
      this.atualizarPreviewAssinatura()
    })
    this.el<HTMLInputElement>('assinatura-inicio').addEventListener('change', this.atualizarPreviewAssinatura)

    this.el('cancelar-editar').addEventListener('click', () =>
      this.el<HTMLDialogElement>('dialogo-editar-assinatura').close()
    )
    this.el('formulario-editar-assinatura').addEventListener('submit', (evento) =>
      void this.salvarEdicaoAssinatura(evento)
    )

    this.el('cancelar-renovar').addEventListener('click', () =>
      this.el<HTMLDialogElement>('dialogo-renovar').close()
    )
    this.el('formulario-renovar').addEventListener('submit', (evento) => void this.salvarRenovacao(evento))
    this.el<HTMLSelectElement>('renovar-plano').addEventListener('change', this.atualizarPreviewRenovacao)
    this.el<HTMLInputElement>('renovar-inicio').addEventListener('change', this.atualizarPreviewRenovacao)

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
      this.el('painel-planos').classList.add('oculto')
      this.el('painel-assinaturas').classList.add('oculto')
      this.el('acesso-negado').classList.remove('oculto')
      return
    }

    this.configurarEventos()
    await Promise.all([this.carregarPlanos(), this.carregarAssinaturas()])
  }
}

window.addEventListener('DOMContentLoaded', () => {
  void new PlanosView().iniciar()
})
