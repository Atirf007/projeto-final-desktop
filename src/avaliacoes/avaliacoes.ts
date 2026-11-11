import { ipcRenderer } from 'electron'

type UsuarioSessao = { id: number; nome: string; perfil: 'admin' | 'instrutor' | 'aluno' }

type Avaliacao = {
  id: number
  alunoId: number
  alunoNome: string
  instrutorId?: number
  instrutorNome?: string
  dataAvaliacao: string
  pesoKg: number
  alturaCm: number
  imc: number
  percentualGordura?: number
  cinturaCm?: number
  quadrilCm?: number
  peitoCm?: number
  bracoCm?: number
  coxaCm?: number
  observacoes?: string
  criadoEm: string
  atualizadoEm: string
  podeEditar?: boolean
}

type AlunoResumo = { id: number; nome: string; ativo: boolean }

type PontoEvolucao = {
  data: string
  pesoKg: number
  imc: number
  percentualGordura?: number
  cinturaCm?: number
}

type SerieEvolucao = { alunoId: number; alunoNome: string; pontos: PontoEvolucao[] }

type ResultadoAvaliacao = { ok: true; id?: number } | { ok: false; mensagem: string }

class AvaliacoesView {
  private usuario: UsuarioSessao | null = null
  private avaliacoes: Avaliacao[] = []
  private alunos: AlunoResumo[] = []
  private detalheAtual: Avaliacao | null = null
  private avaliacaoParaExcluir: Avaliacao | null = null

  private el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

  private gestor = (): boolean => this.usuario?.perfil === 'admin' || this.usuario?.perfil === 'instrutor'

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

  private dataBr = (valor?: string): string => {
    if (!valor) return '—'
    const [ano, mes, dia] = String(valor).slice(0, 10).split('-')
    return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor
  }

  private dataCurta = (valor: string): string => {
    const [, mes, dia] = String(valor).slice(0, 10).split('-')
    return dia && mes ? `${dia}/${mes}` : valor
  }

  private dataHoraFmt = (valor?: string): string => {
    if (!valor) return '—'
    const [data, hora] = String(valor).split(/[ T]/)
    const [ano, mes, dia] = data.split('-')
    if (!ano || !mes || !dia) return valor
    return hora ? `${dia}/${mes}/${ano} ${hora.slice(0, 5)}` : `${dia}/${mes}/${ano}`
  }

  private numeroFmt = (valor: number, sufixo = ''): string =>
    `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${sufixo}`

  private numeroOpcaoFmt = (valor: number | undefined, sufixo = ''): string =>
    valor === undefined ? '—' : this.numeroFmt(valor, sufixo)

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

  private criarLinha = (avaliacao: Avaliacao): HTMLTableRowElement => {
    const tr = document.createElement('tr')

    const tdAluno = document.createElement('td')
    tdAluno.className = 'col-nome'
    const nome = document.createElement('strong')
    nome.textContent = avaliacao.alunoNome
    const instrutor = document.createElement('small')
    instrutor.textContent = avaliacao.instrutorNome
      ? `Avaliado por ${avaliacao.instrutorNome}`
      : 'Sem instrutor vinculado'
    tdAluno.append(nome, instrutor)

    const tdData = document.createElement('td')
    tdData.className = 'col-data'
    tdData.textContent = this.dataBr(avaliacao.dataAvaliacao)

    const tdPeso = document.createElement('td')
    tdPeso.className = 'destaque'
    tdPeso.textContent = this.numeroFmt(avaliacao.pesoKg, ' kg')

    const tdAltura = document.createElement('td')
    tdAltura.textContent = this.numeroFmt(avaliacao.alturaCm, ' cm')

    const tdImc = document.createElement('td')
    tdImc.textContent = this.numeroFmt(avaliacao.imc)

    const tdGordura = document.createElement('td')
    tdGordura.textContent = this.numeroOpcaoFmt(avaliacao.percentualGordura, '%')

    const tdCintura = document.createElement('td')
    tdCintura.textContent = this.numeroOpcaoFmt(avaliacao.cinturaCm, ' cm')

    const tdAcoes = document.createElement('td')
    const acoes = document.createElement('div')
    acoes.className = 'acoes-linha'
    const btnVer = this.criarBotao('Ver', 'botao secundario pequeno')
    btnVer.addEventListener('click', () => void this.abrirDetalhe(avaliacao.id))
    acoes.append(btnVer)
    if (avaliacao.podeEditar) {
      const btnEditar = this.criarBotao('Editar', 'botao secundario pequeno')
      btnEditar.addEventListener('click', () => void this.abrirEdicao(avaliacao.id))
      const btnExcluir = this.criarBotao('Excluir', 'botao perigo pequeno')
      btnExcluir.addEventListener('click', () => this.abrirExclusao(avaliacao))
      acoes.append(btnEditar, btnExcluir)
    }
    tdAcoes.append(acoes)

    tr.append(tdAluno, tdData, tdPeso, tdAltura, tdImc, tdGordura, tdCintura, tdAcoes)
    return tr
  }

  private carregarAlunos = async (): Promise<void> => {
    const filtro = this.el<HTMLSelectElement>('filtro-aluno')
    const formulario = this.el<HTMLSelectElement>('aluno')
    try {
      this.alunos = (await ipcRenderer.invoke('alunos:listar', { ativo: true })) as AlunoResumo[]
      filtro.replaceChildren(
        this.criarOpcao('', 'Todos os alunos'),
        ...this.alunos.map((aluno) => this.criarOpcao(String(aluno.id), aluno.nome))
      )
      formulario.replaceChildren(
        this.criarOpcao('', 'Selecione o aluno'),
        ...this.alunos.map((aluno) => this.criarOpcao(String(aluno.id), aluno.nome))
      )
    } catch (erro) {
      console.error(erro)
      const opcao = this.criarOpcao('', 'Não foi possível carregar os alunos')
      filtro.replaceChildren(opcao)
      formulario.replaceChildren(this.criarOpcao('', 'Não foi possível carregar os alunos'))
    }
  }

  private carregar = async (): Promise<void> => {
    this.statusPagina('Carregando avaliações...')
    try {
      const filtro: { alunoId?: number; inicio?: string; fim?: string } = {}
      const aluno = this.el<HTMLSelectElement>('filtro-aluno').value
      const inicio = this.el<HTMLInputElement>('filtro-inicio').value
      const fim = this.el<HTMLInputElement>('filtro-fim').value
      if (aluno) filtro.alunoId = Number(aluno)
      if (inicio) filtro.inicio = inicio
      if (fim) filtro.fim = fim

      this.avaliacoes = (await ipcRenderer.invoke('avaliacoes:listar', filtro)) as Avaliacao[]
      this.el<HTMLTableSectionElement>('corpo').replaceChildren(...this.avaliacoes.map(this.criarLinha))
      this.statusPagina(this.avaliacoes.length ? '' : 'Nenhuma avaliação encontrada para os filtros escolhidos.')
      await this.carregarEvolucao(aluno ? Number(aluno) : null)
    } catch (erro) {
      console.error(erro)
      this.el<HTMLTableSectionElement>('corpo').replaceChildren()
      this.statusPagina('Não foi possível carregar as avaliações.', true)
    }
  }

  private svg = (tag: string, atributos: Record<string, string | number>): SVGElement => {
    const elemento = document.createElementNS('http://www.w3.org/2000/svg', tag)
    for (const [nome, valor] of Object.entries(atributos)) {
      elemento.setAttribute(nome, String(valor))
    }
    return elemento
  }

  private desenharGrafico = (pontos: PontoEvolucao[]): void => {
    const container = this.el<HTMLDivElement>('grafico')
    container.replaceChildren()
    if (!pontos.length) return

    const largura = 900
    const altura = 230
    const margem = { esquerda: 56, direita: 24, topo: 20, base: 36 }
    const larguraUtil = largura - margem.esquerda - margem.direita
    const alturaUtil = altura - margem.topo - margem.base
    const pesos = pontos.map((ponto) => ponto.pesoKg)
    let minimo = Math.min(...pesos)
    let maximo = Math.max(...pesos)
    if (minimo === maximo) {
      minimo -= 1
      maximo += 1
    }
    const folga = (maximo - minimo) * 0.15
    minimo -= folga
    maximo += folga

    const x = (indice: number): number =>
      pontos.length === 1
        ? margem.esquerda + larguraUtil / 2
        : margem.esquerda + (indice / (pontos.length - 1)) * larguraUtil
    const y = (valor: number): number =>
      margem.topo + (1 - (valor - minimo) / (maximo - minimo)) * alturaUtil

    const svg = this.svg('svg', {
      viewBox: `0 0 ${largura} ${altura}`,
      role: 'img',
      'aria-label': 'Gráfico de evolução do peso do aluno'
    })

    for (let i = 0; i <= 4; i++) {
      const valor = minimo + ((maximo - minimo) * i) / 4
      const linhaY = y(valor)
      svg.append(
        this.svg('line', {
          x1: margem.esquerda,
          x2: largura - margem.direita,
          y1: linhaY,
          y2: linhaY,
          stroke: '#e5e7eb',
          'stroke-width': 1
        }),
        this.svg('text', {
          x: margem.esquerda - 10,
          y: linhaY + 4,
          'text-anchor': 'end',
          'font-size': 11,
          fill: '#6b7280'
        })
      )
      const rotulo = svg.lastElementChild as SVGTextElement
      rotulo.textContent = valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
    }

    const pontosTexto = pontos.map((ponto, indice) => `${x(indice)},${y(ponto.pesoKg)}`).join(' ')
    svg.append(
      this.svg('polyline', {
        points: pontosTexto,
        fill: 'none',
        stroke: '#059669',
        'stroke-width': 2.5,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      })
    )

    const passo = pontos.length <= 6 ? 1 : Math.ceil(pontos.length / 6)
    pontos.forEach((ponto, indice) => {
      const circulo = this.svg('circle', {
        cx: x(indice),
        cy: y(ponto.pesoKg),
        r: 4,
        fill: '#ffffff',
        stroke: '#059669',
        'stroke-width': 2
      })
      const titulo = this.svg('title', {})
      titulo.textContent = `${this.dataBr(ponto.data)} — ${this.numeroFmt(ponto.pesoKg, ' kg')}`
      circulo.append(titulo)
      svg.append(circulo)

      if (indice % passo === 0 || indice === pontos.length - 1) {
        const rotulo = this.svg('text', {
          x: x(indice),
          y: altura - 12,
          'text-anchor': 'middle',
          'font-size': 11,
          fill: '#6b7280'
        })
        rotulo.textContent = this.dataCurta(ponto.data)
        svg.append(rotulo)
      }
    })

    container.append(svg)
  }

  private carregarEvolucao = async (alunoId: number | null): Promise<void> => {
    const painel = this.el<HTMLDivElement>('evolucao-painel')
    if (alunoId === null) {
      painel.classList.add('oculto')
      return
    }

    painel.classList.remove('oculto')
    this.el('titulo-evolucao').textContent = 'Evolução do aluno'
    this.el('resumo-evolucao').textContent = ''

    try {
      const serie = (await ipcRenderer.invoke('avaliacoes:evolucao', alunoId)) as SerieEvolucao | null
      if (!serie) {
        this.el('grafico').replaceChildren()
        this.el('grafico-vazio').classList.remove('oculto')
        return
      }

      this.el('titulo-evolucao').textContent = `Evolução de ${serie.alunoNome}`
      const pontos = serie.pontos
      if (pontos.length < 2) {
        this.el('grafico').replaceChildren()
        this.el('grafico-vazio').classList.remove('oculto')
        this.el('resumo-evolucao').textContent = `${pontos.length} avaliação registrada`
        return
      }

      const variacao = pontos[pontos.length - 1].pesoKg - pontos[0].pesoKg
      const sinal = variacao > 0 ? '+' : ''
      this.el('resumo-evolucao').textContent =
        `${pontos.length} avaliações • variação de ${sinal}${this.numeroFmt(variacao)} kg no período`
      this.el('grafico-vazio').classList.add('oculto')
      this.desenharGrafico(pontos)
    } catch (erro) {
      console.error(erro)
      this.el('grafico').replaceChildren()
      this.el('grafico-vazio').classList.remove('oculto')
    }
  }

  private limparForm = (): void => {
    this.el<HTMLFormElement>('formulario').reset()
    this.el<HTMLInputElement>('avaliacao-id').value = ''
    this.el('erro-formulario').textContent = ''
    this.el<HTMLInputElement>('data-avaliacao').value = this.hoje()
    this.el<HTMLSelectElement>('aluno').disabled = false
  }

  private abrirNovo = (): void => {
    if (!this.gestor()) return
    this.limparForm()
    const filtroAluno = this.el<HTMLSelectElement>('filtro-aluno').value
    if (filtroAluno) this.el<HTMLSelectElement>('aluno').value = filtroAluno
    this.el('titulo-form').textContent = 'Nova avaliação'
    this.el<HTMLButtonElement>('salvar').textContent = 'Registrar'
    this.el<HTMLDialogElement>('dialogo-form').showModal()
    this.el<HTMLSelectElement>('aluno').focus()
  }

  private preencherForm = (avaliacao: Avaliacao): void => {
    this.limparForm()
    this.el<HTMLInputElement>('avaliacao-id').value = String(avaliacao.id)
    const selectAluno = this.el<HTMLSelectElement>('aluno')
    selectAluno.value = String(avaliacao.alunoId)
    if (!selectAluno.value) {
      selectAluno.append(this.criarOpcao(String(avaliacao.alunoId), avaliacao.alunoNome))
      selectAluno.value = String(avaliacao.alunoId)
    }
    selectAluno.disabled = true
    this.el<HTMLInputElement>('data-avaliacao').value = avaliacao.dataAvaliacao
    this.el<HTMLInputElement>('peso').value = String(avaliacao.pesoKg)
    this.el<HTMLInputElement>('altura').value = String(avaliacao.alturaCm)
    this.el<HTMLInputElement>('percentual-gordura').value =
      avaliacao.percentualGordura === undefined ? '' : String(avaliacao.percentualGordura)
    this.el<HTMLInputElement>('cintura').value =
      avaliacao.cinturaCm === undefined ? '' : String(avaliacao.cinturaCm)
    this.el<HTMLInputElement>('quadril').value =
      avaliacao.quadrilCm === undefined ? '' : String(avaliacao.quadrilCm)
    this.el<HTMLInputElement>('peito').value =
      avaliacao.peitoCm === undefined ? '' : String(avaliacao.peitoCm)
    this.el<HTMLInputElement>('braco').value =
      avaliacao.bracoCm === undefined ? '' : String(avaliacao.bracoCm)
    this.el<HTMLInputElement>('coxa').value =
      avaliacao.coxaCm === undefined ? '' : String(avaliacao.coxaCm)
    this.el<HTMLTextAreaElement>('observacoes').value = avaliacao.observacoes ?? ''
  }

  private abrirEdicao = async (id: number): Promise<void> => {
    try {
      const avaliacao = (await ipcRenderer.invoke('avaliacoes:obter', id)) as Avaliacao | null
      if (!avaliacao) {
        this.statusPagina('Avaliação não encontrada.', true)
        return
      }
      if (!avaliacao.podeEditar) {
        this.statusPagina('Você só pode editar avaliações que registrou.', true)
        return
      }
      this.preencherForm(avaliacao)
      this.el('titulo-form').textContent = `Editar avaliação — ${avaliacao.alunoNome}`
      this.el<HTMLButtonElement>('salvar').textContent = 'Salvar alterações'
      this.el<HTMLDialogElement>('dialogo-form').showModal()
    } catch (erro) {
      console.error(erro)
      this.statusPagina('Não foi possível carregar a avaliação.', true)
    }
  }

  private numeroDoCampo = (id: string): number | null => {
    const valor = this.el<HTMLInputElement>(id).value.trim()
    if (!valor) return null
    const numero = Number(valor)
    return Number.isFinite(numero) ? numero : null
  }

  private salvar = async (evento: Event): Promise<void> => {
    evento.preventDefault()
    const erro = this.el('erro-formulario')
    const botao = this.el<HTMLButtonElement>('salvar')
    erro.textContent = ''

    const id = Number(this.el<HTMLInputElement>('avaliacao-id').value || '0')
    const alunoId = Number(this.el<HTMLSelectElement>('aluno').value || '0')
    const dataAvaliacao = this.el<HTMLInputElement>('data-avaliacao').value
    const pesoKg = this.numeroDoCampo('peso')
    const alturaCm = this.numeroDoCampo('altura')

    if (!alunoId) {
      erro.textContent = 'Selecione o aluno da avaliação.'
      return
    }
    if (!dataAvaliacao) {
      erro.textContent = 'Informe a data da avaliação.'
      return
    }
    if (pesoKg === null || pesoKg < 20 || pesoKg > 400) {
      erro.textContent = 'Informe o peso entre 20 e 400 kg.'
      return
    }
    if (alturaCm === null || alturaCm < 80 || alturaCm > 250) {
      erro.textContent = 'Informe a altura entre 80 e 250 cm.'
      return
    }

    const opcionais: Record<string, number | null> = {}
    for (const [campo, idCampo] of [
      ['percentualGordura', 'percentual-gordura'],
      ['cinturaCm', 'cintura'],
      ['quadrilCm', 'quadril'],
      ['peitoCm', 'peito'],
      ['bracoCm', 'braco'],
      ['coxaCm', 'coxa']
    ] as const) {
      const valor = this.numeroDoCampo(idCampo)
      if (this.el<HTMLInputElement>(idCampo).value.trim() && valor === null) {
        erro.textContent = 'Preencha as medidas com números válidos ou deixe em branco.'
        return
      }
      opcionais[campo] = valor
    }

    const observacoes = this.el<HTMLTextAreaElement>('observacoes').value.trim()
    botao.disabled = true
    try {
      let resultado: ResultadoAvaliacao
      if (id > 0) {
        resultado = (await ipcRenderer.invoke('avaliacoes:atualizar', {
          id,
          dataAvaliacao,
          pesoKg,
          alturaCm,
          ...opcionais,
          observacoes: observacoes || null
        })) as ResultadoAvaliacao
      } else {
        const dados: Record<string, unknown> = {
          alunoId,
          dataAvaliacao,
          pesoKg,
          alturaCm,
          observacoes: observacoes || undefined
        }
        for (const [campo, valor] of Object.entries(opcionais)) {
          if (valor !== null) dados[campo] = valor
        }
        resultado = (await ipcRenderer.invoke('avaliacoes:criar', dados)) as ResultadoAvaliacao
      }

      if (!resultado.ok) {
        erro.textContent = resultado.mensagem
        return
      }
      this.el<HTMLDialogElement>('dialogo-form').close()
      await this.carregar()
      if (this.detalheAtual?.id === id) await this.atualizarDetalhe()
      this.statusPagina(id > 0 ? 'Avaliação atualizada com sucesso.' : 'Avaliação registrada com sucesso.')
    } catch (e) {
      console.error(e)
      erro.textContent = 'Não foi possível salvar a avaliação.'
    } finally {
      botao.disabled = false
    }
  }

  private detalheItem = (dl: HTMLElement, titulo: string, valor: string | undefined, span3 = false): void => {
    const div = document.createElement('div')
    if (span3) div.className = 'span3'
    const dt = document.createElement('dt')
    dt.textContent = titulo
    const dd = document.createElement('dd')
    dd.textContent = valor && valor.trim() ? valor : '—'
    div.append(dt, dd)
    dl.append(div)
  }

  private preencherDetalhe = (avaliacao: Avaliacao): void => {
    this.el('titulo-detalhe').textContent = `${avaliacao.alunoNome} — ${this.dataBr(avaliacao.dataAvaliacao)}`
    const dl = this.el('detalhes')
    dl.replaceChildren()
    this.detalheItem(dl, 'Peso', this.numeroFmt(avaliacao.pesoKg, ' kg'))
    this.detalheItem(dl, 'Altura', this.numeroFmt(avaliacao.alturaCm, ' cm'))
    this.detalheItem(dl, 'IMC', this.numeroFmt(avaliacao.imc))
    this.detalheItem(dl, '% de gordura', this.numeroOpcaoFmt(avaliacao.percentualGordura, '%'))
    this.detalheItem(dl, 'Cintura', this.numeroOpcaoFmt(avaliacao.cinturaCm, ' cm'))
    this.detalheItem(dl, 'Quadril', this.numeroOpcaoFmt(avaliacao.quadrilCm, ' cm'))
    this.detalheItem(dl, 'Peito', this.numeroOpcaoFmt(avaliacao.peitoCm, ' cm'))
    this.detalheItem(dl, 'Braço', this.numeroOpcaoFmt(avaliacao.bracoCm, ' cm'))
    this.detalheItem(dl, 'Coxa', this.numeroOpcaoFmt(avaliacao.coxaCm, ' cm'))
    this.detalheItem(dl, 'Instrutor', avaliacao.instrutorNome)
    this.detalheItem(dl, 'Registrada em', this.dataHoraFmt(avaliacao.criadoEm))
    this.detalheItem(dl, 'Observações', avaliacao.observacoes, true)
    this.el('editar-detalhe').classList.toggle('oculto', !avaliacao.podeEditar)
  }

  private abrirDetalhe = async (id: number): Promise<void> => {
    try {
      const avaliacao = (await ipcRenderer.invoke('avaliacoes:obter', id)) as Avaliacao | null
      if (!avaliacao) {
        this.statusPagina('Avaliação não encontrada.', true)
        return
      }
      this.detalheAtual = avaliacao
      this.preencherDetalhe(avaliacao)
      const dialogo = this.el<HTMLDialogElement>('dialogo-detalhe')
      if (!dialogo.open) dialogo.showModal()
    } catch (erro) {
      console.error(erro)
      this.statusPagina('Não foi possível carregar a avaliação.', true)
    }
  }

  private atualizarDetalhe = async (): Promise<void> => {
    if (!this.detalheAtual) return
    try {
      const avaliacao = (await ipcRenderer.invoke('avaliacoes:obter', this.detalheAtual.id)) as Avaliacao | null
      if (!avaliacao) return
      this.detalheAtual = avaliacao
      this.preencherDetalhe(avaliacao)
    } catch (erro) {
      console.error(erro)
    }
  }

  private abrirExclusao = (avaliacao: Avaliacao): void => {
    if (!avaliacao.podeEditar) return
    this.avaliacaoParaExcluir = avaliacao
    this.el('texto-excluir').textContent =
      `Deseja excluir a avaliação de ${avaliacao.alunoNome} registrada em ${this.dataBr(avaliacao.dataAvaliacao)}?`
    this.el('erro-excluir').textContent = ''
    this.el<HTMLDialogElement>('dialogo-excluir').showModal()
  }

  private confirmarExclusao = async (): Promise<void> => {
    if (!this.avaliacaoParaExcluir) return
    const botao = this.el<HTMLButtonElement>('confirmar-excluir')
    botao.disabled = true
    this.el('erro-excluir').textContent = ''
    try {
      const resultado = (await ipcRenderer.invoke(
        'avaliacoes:excluir',
        this.avaliacaoParaExcluir.id
      )) as ResultadoAvaliacao
      if (!resultado.ok) {
        this.el('erro-excluir').textContent = resultado.mensagem
        return
      }
      const excluida = this.avaliacaoParaExcluir
      this.el<HTMLDialogElement>('dialogo-excluir').close()
      if (this.detalheAtual?.id === excluida.id) {
        this.el<HTMLDialogElement>('dialogo-detalhe').close()
        this.detalheAtual = null
      }
      await this.carregar()
      this.statusPagina(`Avaliação de ${excluida.alunoNome} excluída.`)
    } catch (erro) {
      console.error(erro)
      this.el('erro-excluir').textContent = 'Não foi possível excluir a avaliação.'
    } finally {
      botao.disabled = false
    }
  }

  private limparFiltros = (): void => {
    this.el<HTMLSelectElement>('filtro-aluno').value = ''
    this.el<HTMLInputElement>('filtro-inicio').value = ''
    this.el<HTMLInputElement>('filtro-fim').value = ''
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

    this.el('nova').classList.remove('oculto')
    this.el('voltar').addEventListener('click', () => void this.voltar())
    this.el('nova').addEventListener('click', this.abrirNovo)
    this.el('limpar-filtros').addEventListener('click', this.limparFiltros)
    this.el('filtro-aluno').addEventListener('change', () => void this.carregar())
    this.el('filtro-inicio').addEventListener('change', () => void this.carregar())
    this.el('filtro-fim').addEventListener('change', () => void this.carregar())
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
    this.el('cancelar-excluir').addEventListener('click', () =>
      this.el<HTMLDialogElement>('dialogo-excluir').close()
    )
    this.el('confirmar-excluir').addEventListener('click', () => void this.confirmarExclusao())

    await this.carregarAlunos()
    await this.carregar()
  }
}

window.addEventListener('DOMContentLoaded', () => {
  void new AvaliacoesView().iniciar()
})
