import { ipcRenderer } from 'electron'

type UsuarioSessao = { id: number; nome: string; perfil: 'admin' | 'instrutor' | 'aluno' }

type CategoriaLancamento = 'aula' | 'aluguel' | 'outros'

type Lancamento = {
  id: number
  categoria: CategoriaLancamento
  descricao: string | null
  valor: number
  dataLancamento: string
}

type ResultadoAcao = { ok: true; id: number } | { ok: false; mensagem: string }

class LancamentosView {
  private usuario: UsuarioSessao | null = null
  private lancamentoParaExcluir: Lancamento | null = null
  private timer: ReturnType<typeof setTimeout> | null = null

  private el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

  private botao = (texto: string, classe: string): HTMLButtonElement => {
    const elemento = document.createElement('button')
    elemento.type = 'button'
    elemento.className = classe
    elemento.textContent = texto
    return elemento
  }

  private hoje = (): string => {
    const agora = new Date()
    const mes = String(agora.getMonth() + 1).padStart(2, '0')
    const dia = String(agora.getDate()).padStart(2, '0')
    return `${agora.getFullYear()}-${mes}-${dia}`
  }

  private dataBr = (valor: string): string => {
    const [ano, mes, dia] = String(valor).slice(0, 10).split('-')
    return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor
  }

  private moeda = (valor: number): string =>
    Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  private status = (texto: string, tipo: 'erro' | 'sucesso' | 'info' = 'info'): void => {
    const el = this.el('status')
    el.textContent = texto
    el.classList.toggle('erro', tipo === 'erro')
    el.classList.toggle('sucesso', tipo === 'sucesso')
  }

  private filtro = (): Record<string, unknown> => {
    const entrada: Record<string, unknown> = {}
    const busca = this.el<HTMLInputElement>('busca').value.trim()
    const categoria = this.el<HTMLSelectElement>('filtro-categoria').value
    const inicio = this.el<HTMLInputElement>('filtro-inicio').value
    const fim = this.el<HTMLInputElement>('filtro-fim').value
    if (busca) entrada.busca = busca
    if (categoria) entrada.categoria = categoria
    if (inicio) entrada.inicio = inicio
    if (fim) entrada.fim = fim
    return entrada
  }

  private criarLinha = (lancamento: Lancamento): HTMLTableRowElement => {
    const tr = document.createElement('tr')
    const td = (texto: string, classe?: string): HTMLTableCellElement => {
      const celula = document.createElement('td')
      celula.textContent = texto
      if (classe) celula.className = classe
      return celula
    }

    const categoriaTd = document.createElement('td')
    const selo = document.createElement('span')
    const categoriaTexto: Record<CategoriaLancamento, string> = {
      aula: 'Aula',
      aluguel: 'Aluguel',
      outros: 'Outros'
    }
    selo.className = `selo ${lancamento.categoria}`
    selo.textContent = categoriaTexto[lancamento.categoria] ?? lancamento.categoria
    categoriaTd.append(selo)

    const acoes = document.createElement('div')
    acoes.className = 'acoes-linha'
    const editar = this.botao('Editar', 'botao secundario pequeno')
    editar.addEventListener('click', () => void this.abrirEdicao(lancamento.id))
    const excluir = this.botao('Excluir', 'botao perigo pequeno')
    excluir.addEventListener('click', () => this.abrirExclusao(lancamento))
    acoes.append(editar, excluir)
    const acoesTd = document.createElement('td')
    acoesTd.append(acoes)

    tr.append(
      td(this.dataBr(lancamento.dataLancamento), 'col-data'),
      categoriaTd,
      td(lancamento.descricao ?? '—'),
      td(this.moeda(lancamento.valor), 'col-valor'),
      acoesTd
    )
    return tr
  }

  private carregar = async (): Promise<void> => {
    try {
      const lancamentos = (await ipcRenderer.invoke('lancamentos:listar', this.filtro())) as Lancamento[]
      const corpo = this.el<HTMLTableSectionElement>('corpo')
      corpo.replaceChildren()
      this.el('titulo').textContent = `Lançamentos (${Array.isArray(lancamentos) ? lancamentos.length : 0})`
      if (Array.isArray(lancamentos)) lancamentos.forEach((lancamento) => corpo.append(this.criarLinha(lancamento)))
      this.status('')
    } catch {
      this.el<HTMLTableSectionElement>('corpo').replaceChildren()
      this.status('Não foi possível carregar os lançamentos.', 'erro')
    }
  }

  private agendar = (): void => {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.carregar()
    }, 300)
  }

  private abrirFormulario = (lancamento: Lancamento | null): void => {
    this.el<HTMLFormElement>('formulario').reset()
    this.el('erro-formulario').textContent = ''
    const edicao = lancamento !== null
    this.el<HTMLInputElement>('lancamento-id').value = edicao ? String(lancamento.id) : ''
    this.el('titulo-formulario').textContent = edicao ? 'Editar lançamento' : 'Novo lançamento'
    this.el<HTMLButtonElement>('salvar').textContent = edicao ? 'Salvar alterações' : 'Cadastrar'
    this.el<HTMLInputElement>('form-data').value = edicao ? lancamento.dataLancamento : this.hoje()
    this.el<HTMLSelectElement>('form-categoria').value = edicao ? lancamento.categoria : 'aula'
    this.el<HTMLInputElement>('form-valor').value = edicao ? String(lancamento.valor) : ''
    this.el<HTMLInputElement>('form-descricao').value = edicao ? (lancamento.descricao ?? '') : ''
    this.el<HTMLDialogElement>('dialogo-formulario').showModal()
  }

  private abrirEdicao = async (id: number): Promise<void> => {
    try {
      const lancamento = (await ipcRenderer.invoke('lancamentos:obter', id)) as Lancamento | null
      if (!lancamento) {
        this.status('Lançamento não encontrado.', 'erro')
        return
      }
      this.abrirFormulario(lancamento)
    } catch {
      this.status('Não foi possível carregar o lançamento.', 'erro')
    }
  }

  private fecharFormulario = (): void => {
    this.el<HTMLDialogElement>('dialogo-formulario').close()
  }

  private salvar = async (evento: Event): Promise<void> => {
    evento.preventDefault()
    const erro = this.el('erro-formulario')
    const botao = this.el<HTMLButtonElement>('salvar')
    const id = Number(this.el<HTMLInputElement>('lancamento-id').value || '0')
    const dataLancamento = this.el<HTMLInputElement>('form-data').value
    const categoria = this.el<HTMLSelectElement>('form-categoria').value
    const valor = Number(this.el<HTMLInputElement>('form-valor').value)
    const descricao = this.el<HTMLInputElement>('form-descricao').value

    if (!dataLancamento) {
      erro.textContent = 'Informe a data do lançamento.'
      return
    }
    if (!Number.isFinite(valor) || valor <= 0) {
      erro.textContent = 'Informe um valor maior que zero.'
      return
    }

    botao.disabled = true
    erro.textContent = ''
    try {
      const resultado = (await ipcRenderer.invoke(id ? 'lancamentos:atualizar' : 'lancamentos:criar', {
        id: id || undefined,
        categoria,
        descricao,
        valor,
        dataLancamento
      })) as ResultadoAcao
      if (!resultado.ok) {
        erro.textContent = resultado.mensagem
        return
      }
      this.fecharFormulario()
      await this.carregar()
      this.status(id ? 'Lançamento atualizado com sucesso.' : 'Lançamento registrado com sucesso.', 'sucesso')
    } catch {
      erro.textContent = 'Não foi possível salvar o lançamento.'
    } finally {
      botao.disabled = false
    }
  }

  private abrirExclusao = (lancamento: Lancamento): void => {
    this.lancamentoParaExcluir = lancamento
    this.el('texto-excluir').textContent =
      `Deseja excluir o lançamento de ${this.moeda(lancamento.valor)} em ${this.dataBr(lancamento.dataLancamento)}?`
    this.el('erro-excluir').textContent = ''
    this.el<HTMLDialogElement>('dialogo-excluir').showModal()
  }

  private confirmarExclusao = async (): Promise<void> => {
    if (!this.lancamentoParaExcluir) return
    const botao = this.el<HTMLButtonElement>('confirmar-excluir')
    botao.disabled = true
    this.el('erro-excluir').textContent = ''
    try {
      const resultado = (await ipcRenderer.invoke('lancamentos:excluir', this.lancamentoParaExcluir.id)) as ResultadoAcao
      if (!resultado.ok) {
        this.el('erro-excluir').textContent = resultado.mensagem
        return
      }
      this.el<HTMLDialogElement>('dialogo-excluir').close()
      this.lancamentoParaExcluir = null
      await this.carregar()
      this.status('Lançamento excluído com sucesso.', 'sucesso')
    } catch {
      this.el('erro-excluir').textContent = 'Não foi possível excluir o lançamento.'
    } finally {
      botao.disabled = false
    }
  }

  private limpar = async (): Promise<void> => {
    this.el<HTMLInputElement>('busca').value = ''
    this.el<HTMLSelectElement>('filtro-categoria').value = ''
    this.el<HTMLInputElement>('filtro-inicio').value = ''
    this.el<HTMLInputElement>('filtro-fim').value = ''
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
    if (!this.usuario || this.usuario.perfil !== 'admin') {
      this.el('painel').classList.add('oculto')
      this.el('acesso-negado').classList.remove('oculto')
      return
    }

    this.el('busca').addEventListener('input', this.agendar)
    this.el('filtro-categoria').addEventListener('change', () => void this.carregar())
    this.el('filtro-inicio').addEventListener('change', () => void this.carregar())
    this.el('filtro-fim').addEventListener('change', () => void this.carregar())
    this.el('limpar').addEventListener('click', () => void this.limpar())
    this.el('novo').addEventListener('click', () => this.abrirFormulario(null))
    this.el('cancelar').addEventListener('click', this.fecharFormulario)
    this.el('formulario').addEventListener('submit', (evento) => void this.salvar(evento))
    this.el('cancelar-excluir').addEventListener('click', () =>
      this.el<HTMLDialogElement>('dialogo-excluir').close()
    )
    this.el('confirmar-excluir').addEventListener('click', () => void this.confirmarExclusao())

    await this.carregar()
  }
}

window.addEventListener('DOMContentLoaded', () => {
  void new LancamentosView().iniciar()
})
