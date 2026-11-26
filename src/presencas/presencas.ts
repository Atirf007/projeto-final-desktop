import { ipcRenderer } from 'electron'

type UsuarioSessao = { id: number; nome: string; perfil: 'admin' | 'instrutor' | 'aluno' }

type OrigemPresenca = 'aula' | 'livre' | 'experimental'

type Presenca = {
  id: number
  alunoId: number
  alunoNome: string
  aulaId?: number
  aulaTitulo?: string
  dataPresenca: string
  origem: OrigemPresenca
  criadoEm: string
}

type Opcao = { id: number; nome: string }

type ResultadoAcao = { ok: true; id: number } | { ok: false; mensagem: string }

class PresencasView {
  private usuario: UsuarioSessao | null = null
  private alunos: Opcao[] = []
  private aulas: Opcao[] = []
  private presencaParaExcluir: Presenca | null = null
  private timer: ReturnType<typeof setTimeout> | null = null

  private el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

  private abrirDialogo = (id: string): void => {
    const dialogo = this.el<HTMLDialogElement>(id)
    if (!dialogo.open) dialogo.showModal()
  }

  private criar = (tag: string, classe?: string, texto?: string): HTMLElement => {
    const elemento = document.createElement(tag)
    if (classe) elemento.className = classe
    if (texto !== undefined) elemento.textContent = texto
    return elemento
  }

  private botao = (texto: string, classe: string): HTMLButtonElement => {
    const elemento = document.createElement('button')
    elemento.type = 'button'
    elemento.className = classe
    elemento.textContent = texto
    return elemento
  }

  private dataBr = (valor?: string): string => {
    if (!valor) return '—'
    const [ano, mes, dia] = valor.slice(0, 10).split('-')
    return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor
  }

  private dataHoraBr = (valor?: string): string => {
    if (!valor) return '—'
    const [ano, mes, dia] = valor.slice(0, 10).split('-')
    const hora = valor.slice(11, 16)
    return ano && mes && dia ? `${dia}/${mes}/${ano}${hora ? ` ${hora}` : ''}` : valor
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

  private filtro = (): Record<string, unknown> => {
    const entrada: Record<string, unknown> = {}
    const busca = this.el<HTMLInputElement>('busca').value.trim()
    const alunoId = Number(this.el<HTMLSelectElement>('filtro-aluno').value || '0')
    const inicio = this.el<HTMLInputElement>('filtro-inicio').value
    const fim = this.el<HTMLInputElement>('filtro-fim').value
    const origem = this.el<HTMLSelectElement>('filtro-origem').value
    if (busca) entrada.busca = busca
    if (alunoId) entrada.alunoId = alunoId
    if (inicio) entrada.inicio = inicio
    if (fim) entrada.fim = fim
    if (origem) entrada.origem = origem
    return entrada
  }

  private carregarOpcoes = async (): Promise<void> => {
    try {
      const [alunos, aulas] = await Promise.all([
        ipcRenderer.invoke('alunos:listar', {}) as Promise<Array<{ id: number; nome: string }>>,
        ipcRenderer.invoke('aulas:listar', {}) as Promise<Array<{ id: number; titulo: string; dataHoraInicio: string }>>
      ])
      this.alunos = (Array.isArray(alunos) ? alunos : []).map((aluno) => ({ id: aluno.id, nome: aluno.nome }))
      this.aulas = (Array.isArray(aulas) ? aulas : []).map((aula) => ({
        id: aula.id,
        nome: `${aula.titulo} — ${this.dataHoraBr(aula.dataHoraInicio)}`
      }))

      const filtroAluno = this.el<HTMLSelectElement>('filtro-aluno')
      this.alunos.forEach((aluno) => {
        const opcao = document.createElement('option')
        opcao.value = String(aluno.id)
        opcao.textContent = aluno.nome
        filtroAluno.append(opcao)
      })
      this.preencherSelect(this.el<HTMLSelectElement>('form-aluno'), false)
      this.preencherSelect(this.el<HTMLSelectElement>('form-aula'), true)
    } catch {
      this.status('Não foi possível carregar alunos e aulas.', 'erro')
    }
  }

  private preencherSelect = (select: HTMLSelectElement, opcional: boolean): void => {
    const atual = select.value
    select.replaceChildren()
    if (opcional) {
      const vazio = document.createElement('option')
      vazio.value = ''
      vazio.textContent = 'Nenhuma'
      select.append(vazio)
    }
    const opcoes = opcional ? this.aulas : this.alunos
    opcoes.forEach((opcao) => {
      const elemento = document.createElement('option')
      elemento.value = String(opcao.id)
      elemento.textContent = opcao.nome
      select.append(elemento)
    })
    if (atual) select.value = atual
  }

  private criarLinha = (presenca: Presenca): HTMLTableRowElement => {
    const tr = document.createElement('tr')
    const td = (texto: string, classe?: string): HTMLTableCellElement => {
      const celula = document.createElement('td')
      celula.textContent = texto
      if (classe) celula.className = classe
      return celula
    }

    const acoes = this.criar('div', 'acoes-linha')
    const editar = this.botao('Editar', 'botao secundario pequeno')
    editar.addEventListener('click', () => void this.abrirEdicao(presenca.id, editar))
    const excluir = this.botao('Excluir', 'botao perigo pequeno')
    excluir.addEventListener('click', () => this.abrirExclusao(presenca))
    acoes.append(editar, excluir)
    const acoesTd = document.createElement('td')
    acoesTd.append(acoes)

    const origemTexto: Record<OrigemPresenca, string> = {
      aula: 'Aula',
      livre: 'Livre',
      experimental: 'Experimental'
    }

    tr.append(
      td(presenca.alunoNome),
      td(presenca.aulaTitulo ?? '—'),
      td(this.dataBr(presenca.dataPresenca), 'col-data'),
      td(origemTexto[presenca.origem] ?? presenca.origem),
      td(this.dataHoraBr(presenca.criadoEm), 'col-data'),
      acoesTd
    )
    return tr
  }

  private carregar = async (): Promise<void> => {
    try {
      const presencas = (await ipcRenderer.invoke('presencas:listarTodos', this.filtro())) as Presenca[]
      const corpo = this.el<HTMLTableSectionElement>('corpo')
      corpo.replaceChildren()
      this.el('titulo').textContent = `Presenças (${Array.isArray(presencas) ? presencas.length : 0})`
      if (Array.isArray(presencas)) presencas.forEach((presenca) => corpo.append(this.criarLinha(presenca)))
      this.status('')
    } catch {
      this.el<HTMLTableSectionElement>('corpo').replaceChildren()
      this.status('Não foi possível carregar as presenças.', 'erro')
    }
  }

  private agendar = (): void => {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.carregar()
    }, 300)
  }

  private abrirFormulario = (presenca: Presenca | null): void => {
    this.el<HTMLFormElement>('formulario').reset()
    this.el('erro-formulario').textContent = ''
    const edicao = presenca !== null
    this.el<HTMLInputElement>('presenca-id').value = edicao ? String(presenca.id) : ''
    this.el('titulo-formulario').textContent = edicao ? 'Editar presença' : 'Nova presença'
    this.el<HTMLButtonElement>('salvar').textContent = edicao ? 'Salvar alterações' : 'Cadastrar'
    this.preencherSelect(this.el<HTMLSelectElement>('form-aluno'), false)
    this.preencherSelect(this.el<HTMLSelectElement>('form-aula'), true)
    this.el<HTMLInputElement>('form-data').value = edicao ? presenca.dataPresenca : this.hoje()
    this.el<HTMLSelectElement>('form-origem').value = edicao ? presenca.origem : 'aula'
    this.el<HTMLSelectElement>('form-aluno').value = edicao ? String(presenca.alunoId) : ''
    this.el<HTMLSelectElement>('form-aula').value = edicao && presenca.aulaId ? String(presenca.aulaId) : ''
    this.abrirDialogo('dialogo-formulario')
  }

  private abrirEdicao = async (id: number, botao?: HTMLButtonElement): Promise<void> => {
    if (botao) botao.disabled = true
    try {
      const presenca = (await ipcRenderer.invoke('presencas:obter', id)) as Presenca | null
      if (!presenca) {
        this.status('Presença não encontrada.', 'erro')
        return
      }
      this.abrirFormulario(presenca)
    } catch {
      this.status('Não foi possível carregar a presença.', 'erro')
    } finally {
      if (botao) botao.disabled = false
    }
  }

  private fecharFormulario = (): void => {
    this.el<HTMLDialogElement>('dialogo-formulario').close()
  }

  private salvar = async (evento: Event): Promise<void> => {
    evento.preventDefault()
    const erro = this.el('erro-formulario')
    const botao = this.el<HTMLButtonElement>('salvar')
    const id = Number(this.el<HTMLInputElement>('presenca-id').value || '0')
    const alunoId = Number(this.el<HTMLSelectElement>('form-aluno').value || '0')
    const aulaId = Number(this.el<HTMLSelectElement>('form-aula').value || '0')
    const dataPresenca = this.el<HTMLInputElement>('form-data').value
    const origem = this.el<HTMLSelectElement>('form-origem').value as OrigemPresenca

    if (!alunoId) {
      erro.textContent = 'Selecione um aluno.'
      return
    }
    if (!dataPresenca) {
      erro.textContent = 'Informe a data da presença.'
      return
    }
    if (origem === 'aula' && !aulaId) {
      erro.textContent = 'Selecione a aula desta presença.'
      return
    }

    botao.disabled = true
    erro.textContent = ''
    try {
      const resultado = (await ipcRenderer.invoke(id ? 'presencas:atualizar' : 'presencas:criar', {
        id: id || undefined,
        alunoId,
        aulaId: aulaId || null,
        dataPresenca,
        origem
      })) as ResultadoAcao
      if (!resultado.ok) {
        erro.textContent = resultado.mensagem
        return
      }
      this.fecharFormulario()
      await this.carregar()
      this.status(id ? 'Presença atualizada com sucesso.' : 'Presença registrada com sucesso.', 'sucesso')
    } catch {
      erro.textContent = 'Não foi possível salvar a presença.'
    } finally {
      botao.disabled = false
    }
  }

  private abrirExclusao = (presenca: Presenca): void => {
    this.presencaParaExcluir = presenca
    this.el('texto-excluir').textContent =
      `Deseja excluir a presença de ${presenca.alunoNome} em ${this.dataBr(presenca.dataPresenca)}?`
    this.el('erro-excluir').textContent = ''
    this.abrirDialogo('dialogo-excluir')
  }

  private confirmarExclusao = async (): Promise<void> => {
    if (!this.presencaParaExcluir) return
    const botao = this.el<HTMLButtonElement>('confirmar-excluir')
    botao.disabled = true
    this.el('erro-excluir').textContent = ''
    try {
      const resultado = (await ipcRenderer.invoke('presencas:excluir', this.presencaParaExcluir.id)) as ResultadoAcao
      if (!resultado.ok) {
        this.el('erro-excluir').textContent = resultado.mensagem
        return
      }
      this.el<HTMLDialogElement>('dialogo-excluir').close()
      this.presencaParaExcluir = null
      await this.carregar()
      this.status('Presença excluída com sucesso.', 'sucesso')
    } catch {
      this.el('erro-excluir').textContent = 'Não foi possível excluir a presença.'
    } finally {
      botao.disabled = false
    }
  }

  private limpar = async (): Promise<void> => {
    this.el<HTMLInputElement>('busca').value = ''
    this.el<HTMLSelectElement>('filtro-aluno').value = ''
    this.el<HTMLInputElement>('filtro-inicio').value = ''
    this.el<HTMLInputElement>('filtro-fim').value = ''
    this.el<HTMLSelectElement>('filtro-origem').value = ''
    await this.carregar()
  }

  private voltar = async (): Promise<void> => {
    try {
      await ipcRenderer.invoke('menu:voltar')
    } catch {
      this.status('Não foi possível voltar ao menu.', 'erro')
    }
  }

  iniciar = async (): Promise<void> => {
    try {
      this.usuario = (await ipcRenderer.invoke('auth:me')) as UsuarioSessao | null
    } catch {
      this.usuario = null
    }

    this.el('voltar').addEventListener('click', () => void this.voltar())
    if (!this.usuario || !['admin', 'instrutor'].includes(this.usuario.perfil)) {
      this.el('painel').classList.add('oculto')
      this.el('acesso-negado').classList.remove('oculto')
      return
    }

    this.el('busca').addEventListener('input', this.agendar)
    this.el('filtro-aluno').addEventListener('change', () => void this.carregar())
    this.el('filtro-inicio').addEventListener('change', () => void this.carregar())
    this.el('filtro-fim').addEventListener('change', () => void this.carregar())
    this.el('filtro-origem').addEventListener('change', () => void this.carregar())
    this.el('limpar').addEventListener('click', () => void this.limpar())
    this.el('novo').addEventListener('click', () => this.abrirFormulario(null))
    this.el('cancelar').addEventListener('click', this.fecharFormulario)
    this.el('formulario').addEventListener('submit', (evento) => void this.salvar(evento))
    this.el('cancelar-excluir').addEventListener('click', () =>
      this.el<HTMLDialogElement>('dialogo-excluir').close()
    )
    this.el('confirmar-excluir').addEventListener('click', () => void this.confirmarExclusao())

    await this.carregarOpcoes()
    await this.carregar()
  }
}

window.addEventListener('DOMContentLoaded', () => {
  void new PresencasView().iniciar()
})
