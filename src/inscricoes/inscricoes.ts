import { ipcRenderer } from 'electron'

type UsuarioSessao = { id: number; nome: string; perfil: 'admin' | 'instrutor' | 'aluno' }

type StatusInscricao = 'confirmada' | 'cancelada' | 'presente' | 'falta'

type Inscricao = {
  id: number
  aulaId: number
  alunoId: number
  alunoNome: string
  aulaTitulo: string
  dataHoraInicio: string
  status: StatusInscricao
}

type Opcao = { id: number; nome: string }

type ResultadoAcao = { ok: true; id: number } | { ok: false; mensagem: string }

class InscricoesView {
  private usuario: UsuarioSessao | null = null
  private alunos: Opcao[] = []
  private aulas: Opcao[] = []
  private inscricaoParaExcluir: Inscricao | null = null
  private timer: ReturnType<typeof setTimeout> | null = null

  private el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

  private abrirDialogo = (id: string): void => {
    const dialogo = this.el<HTMLDialogElement>(id)
    if (!dialogo.open) dialogo.showModal()
  }

  private botao = (texto: string, classe: string): HTMLButtonElement => {
    const elemento = document.createElement('button')
    elemento.type = 'button'
    elemento.className = classe
    elemento.textContent = texto
    return elemento
  }

  private dataHoraBr = (valor: string): string => {
    if (!valor) return '—'
    const [ano, mes, dia] = valor.slice(0, 10).split('-')
    const hora = valor.slice(11, 16)
    return ano && mes && dia ? `${dia}/${mes}/${ano}${hora ? ` ${hora}` : ''}` : valor
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
    const aulaId = Number(this.el<HTMLSelectElement>('filtro-aula').value || '0')
    const alunoId = Number(this.el<HTMLSelectElement>('filtro-aluno').value || '0')
    const status = this.el<HTMLSelectElement>('filtro-status').value
    if (busca) entrada.busca = busca
    if (aulaId) entrada.aulaId = aulaId
    if (alunoId) entrada.alunoId = alunoId
    if (status) entrada.status = status
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

      for (const [id, opcoes] of [['filtro-aluno', this.alunos], ['filtro-aula', this.aulas]] as const) {
        const select = this.el<HTMLSelectElement>(id)
        opcoes.forEach((opcao) => {
          const elemento = document.createElement('option')
          elemento.value = String(opcao.id)
          elemento.textContent = opcao.nome
          select.append(elemento)
        })
      }
      this.preencherSelect(this.el<HTMLSelectElement>('form-aluno'), this.alunos)
      this.preencherSelect(this.el<HTMLSelectElement>('form-aula'), this.aulas)
    } catch {
      this.status('Não foi possível carregar alunos e aulas.', 'erro')
    }
  }

  private preencherSelect = (select: HTMLSelectElement, opcoes: Opcao[]): void => {
    select.replaceChildren()
    opcoes.forEach((opcao) => {
      const elemento = document.createElement('option')
      elemento.value = String(opcao.id)
      elemento.textContent = opcao.nome
      select.append(elemento)
    })
  }

  private criarLinha = (inscricao: Inscricao): HTMLTableRowElement => {
    const tr = document.createElement('tr')
    const td = (texto: string, classe?: string): HTMLTableCellElement => {
      const celula = document.createElement('td')
      celula.textContent = texto
      if (classe) celula.className = classe
      return celula
    }

    const selo = document.createElement('span')
    selo.className = `selo ${inscricao.status}`
    const statusTexto: Record<StatusInscricao, string> = {
      confirmada: 'Confirmada',
      cancelada: 'Cancelada',
      presente: 'Presente',
      falta: 'Falta'
    }
    selo.textContent = statusTexto[inscricao.status] ?? inscricao.status
    const statusTd = document.createElement('td')
    statusTd.append(selo)

    const acoes = document.createElement('div')
    acoes.className = 'acoes-linha'
    const editar = this.botao('Editar', 'botao secundario pequeno')
    editar.addEventListener('click', () => void this.abrirEdicao(inscricao.id, editar))
    const excluir = this.botao('Excluir', 'botao perigo pequeno')
    if (inscricao.status === 'presente') {
      excluir.disabled = true
      excluir.title = 'Não é possível excluir inscrição com presença registrada.'
    } else {
      excluir.addEventListener('click', () => this.abrirExclusao(inscricao))
    }
    acoes.append(editar, excluir)
    const acoesTd = document.createElement('td')
    acoesTd.append(acoes)

    tr.append(
      td(inscricao.alunoNome),
      td(inscricao.aulaTitulo),
      td(this.dataHoraBr(inscricao.dataHoraInicio), 'col-data'),
      statusTd,
      acoesTd
    )
    return tr
  }

  private carregar = async (): Promise<void> => {
    try {
      const inscricoes = (await ipcRenderer.invoke('inscricoes:listar', this.filtro())) as Inscricao[]
      const corpo = this.el<HTMLTableSectionElement>('corpo')
      corpo.replaceChildren()
      this.el('titulo').textContent = `Inscrições (${Array.isArray(inscricoes) ? inscricoes.length : 0})`
      if (Array.isArray(inscricoes)) inscricoes.forEach((inscricao) => corpo.append(this.criarLinha(inscricao)))
      this.status('')
    } catch {
      this.el<HTMLTableSectionElement>('corpo').replaceChildren()
      this.status('Não foi possível carregar as inscrições.', 'erro')
    }
  }

  private agendar = (): void => {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.carregar()
    }, 300)
  }

  private abrirFormulario = (inscricao: Inscricao | null): void => {
    this.el<HTMLFormElement>('formulario').reset()
    this.el('erro-formulario').textContent = ''
    const edicao = inscricao !== null
    this.el<HTMLInputElement>('inscricao-id').value = edicao ? String(inscricao.id) : ''
    this.el('titulo-formulario').textContent = edicao ? 'Editar inscrição' : 'Nova inscrição'
    this.el<HTMLButtonElement>('salvar').textContent = edicao ? 'Salvar alterações' : 'Cadastrar'
    this.preencherSelect(this.el<HTMLSelectElement>('form-aluno'), this.alunos)
    this.preencherSelect(this.el<HTMLSelectElement>('form-aula'), this.aulas)
    this.el<HTMLSelectElement>('form-aluno').value = edicao ? String(inscricao.alunoId) : ''
    this.el<HTMLSelectElement>('form-aula').value = edicao ? String(inscricao.aulaId) : ''
    this.el<HTMLSelectElement>('form-status').value = edicao ? inscricao.status : 'confirmada'
    this.el<HTMLSelectElement>('form-aluno').disabled = edicao
    this.el<HTMLSelectElement>('form-aula').disabled = edicao
    this.el<HTMLSelectElement>('form-status').disabled = !edicao
    this.abrirDialogo('dialogo-formulario')
  }

  private abrirEdicao = async (id: number, botao?: HTMLButtonElement): Promise<void> => {
    if (botao) botao.disabled = true
    try {
      const inscricao = (await ipcRenderer.invoke('inscricoes:obter', id)) as Inscricao | null
      if (!inscricao) {
        this.status('Inscrição não encontrada.', 'erro')
        return
      }
      this.abrirFormulario(inscricao)
    } catch {
      this.status('Não foi possível carregar a inscrição.', 'erro')
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
    const id = Number(this.el<HTMLInputElement>('inscricao-id').value || '0')
    const alunoId = Number(this.el<HTMLSelectElement>('form-aluno').value || '0')
    const aulaId = Number(this.el<HTMLSelectElement>('form-aula').value || '0')
    const status = this.el<HTMLSelectElement>('form-status').value

    if (!id && (!alunoId || !aulaId)) {
      erro.textContent = 'Selecione um aluno e uma aula.'
      return
    }
    if (id && !status) {
      erro.textContent = 'Selecione um status.'
      return
    }

    botao.disabled = true
    erro.textContent = ''
    try {
      const resultado = (await ipcRenderer.invoke(
        id ? 'inscricoes:atualizar' : 'inscricoes:criar',
        id ? { id, status } : { alunoId, aulaId }
      )) as ResultadoAcao
      if (!resultado.ok) {
        erro.textContent = resultado.mensagem
        return
      }
      this.fecharFormulario()
      await this.carregar()
      this.status(id ? 'Inscrição atualizada com sucesso.' : 'Inscrição criada com sucesso.', 'sucesso')
    } catch {
      erro.textContent = 'Não foi possível salvar a inscrição.'
    } finally {
      botao.disabled = false
    }
  }

  private abrirExclusao = (inscricao: Inscricao): void => {
    this.inscricaoParaExcluir = inscricao
    this.el('texto-excluir').textContent =
      `Deseja excluir a inscrição de ${inscricao.alunoNome} na aula "${inscricao.aulaTitulo}"?`
    this.el('erro-excluir').textContent = ''
    this.abrirDialogo('dialogo-excluir')
  }

  private confirmarExclusao = async (): Promise<void> => {
    if (!this.inscricaoParaExcluir) return
    const botao = this.el<HTMLButtonElement>('confirmar-excluir')
    botao.disabled = true
    this.el('erro-excluir').textContent = ''
    try {
      const resultado = (await ipcRenderer.invoke('inscricoes:excluir', this.inscricaoParaExcluir.id)) as ResultadoAcao
      if (!resultado.ok) {
        this.el('erro-excluir').textContent = resultado.mensagem
        return
      }
      this.el<HTMLDialogElement>('dialogo-excluir').close()
      this.inscricaoParaExcluir = null
      await this.carregar()
      this.status('Inscrição excluída com sucesso.', 'sucesso')
    } catch {
      this.el('erro-excluir').textContent = 'Não foi possível excluir a inscrição.'
    } finally {
      botao.disabled = false
    }
  }

  private limpar = async (): Promise<void> => {
    this.el<HTMLInputElement>('busca').value = ''
    this.el<HTMLSelectElement>('filtro-aula').value = ''
    this.el<HTMLSelectElement>('filtro-aluno').value = ''
    this.el<HTMLSelectElement>('filtro-status').value = ''
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
    this.el('filtro-aula').addEventListener('change', () => void this.carregar())
    this.el('filtro-aluno').addEventListener('change', () => void this.carregar())
    this.el('filtro-status').addEventListener('change', () => void this.carregar())
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
  void new InscricoesView().iniciar()
})
