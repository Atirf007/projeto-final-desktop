import { ipcRenderer } from 'electron'

type UsuarioSessao = { id: number; nome: string; perfil: 'admin' | 'instrutor' | 'aluno' }

type Categoria = 'aula' | 'aluguel' | 'outros'

type Lancamento = {
  id: number
  categoria: Categoria
  descricao: string | null
  valor: number
  dataLancamento: string
}

type Resultado = { ok: true; id?: number } | { ok: false; mensagem: string }

class LancamentosView {
  private usuario: UsuarioSessao | null = null
  private editandoId: number | null = null
  private excluindoId: number | null = null
  private timer: ReturnType<typeof setTimeout> | null = null

  private readonly categorias: Record<Categoria, string> = {
    aula: 'Aulas',
    aluguel: 'Aluguel',
    outros: 'Outros'
  }

  private readonly moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

  private el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

  private abrirDialogo = (id: string): void => {
    const dialogo = this.el<HTMLDialogElement>(id)
    if (!dialogo.open) dialogo.showModal()
  }

  private admin = (): boolean => this.usuario?.perfil === 'admin'

  private status = (mensagem: string, erro = false): void => {
    const elemento = this.el('status')
    elemento.textContent = mensagem
    elemento.classList.toggle('erro', erro)
  }

  private data = (valor: string): string => {
    const [ano, mes, dia] = valor.split('-')
    return dia && mes && ano ? `${dia}/${mes}/${ano}` : valor
  }

  private hoje = (): string => {
    const agora = new Date()
    const dois = (numero: number): string => String(numero).padStart(2, '0')
    return `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`
  }

  private celula = (texto: string, classe?: string): HTMLTableCellElement => {
    const celula = document.createElement('td')
    celula.textContent = texto
    if (classe) celula.className = classe
    return celula
  }

  private botao = (texto: string, classe: string, acao: () => void): HTMLButtonElement => {
    const botao = document.createElement('button')
    botao.type = 'button'
    botao.className = `pequeno ${classe}`
    botao.textContent = texto
    botao.addEventListener('click', acao)
    return botao
  }

  private criarLinha = (lancamento: Lancamento): HTMLTableRowElement => {
    const linha = document.createElement('tr')

    const categoria = document.createElement('td')
    const selo = document.createElement('span')
    selo.className = `selo ${lancamento.categoria}`
    selo.textContent = this.categorias[lancamento.categoria] ?? lancamento.categoria
    categoria.append(selo)

    const acoes = document.createElement('td')
    acoes.className = 'col-acoes'
    const grupo = document.createElement('div')
    grupo.className = 'acoes-linha'
    grupo.append(
      this.botao('Editar', 'secundario', () => this.abrirFormulario(lancamento)),
      this.botao('Excluir', 'perigo', () => this.abrirExclusao(lancamento))
    )
    acoes.append(grupo)

    linha.append(
      this.celula(String(lancamento.id), 'col-id'),
      categoria,
      this.celula(lancamento.descricao ?? '—'),
      this.celula(this.moeda.format(lancamento.valor), 'col-valor'),
      this.celula(this.data(lancamento.dataLancamento), 'col-data'),
      acoes
    )

    return linha
  }

  private carregar = async (): Promise<void> => {
    const corpo = this.el<HTMLTableSectionElement>('corpo')
    const filtro = {
      categoria: this.el<HTMLSelectElement>('filtro-categoria').value,
      inicio: this.el<HTMLInputElement>('filtro-inicio').value,
      fim: this.el<HTMLInputElement>('filtro-fim').value,
      busca: this.el<HTMLInputElement>('busca').value.trim()
    }

    this.status('Carregando lançamentos...')

    try {
      const lancamentos: Lancamento[] = await ipcRenderer.invoke('lancamentos:listar', filtro)
      corpo.replaceChildren(...lancamentos.map(this.criarLinha))

      if (lancamentos.length === 0) {
        const vazio = document.createElement('tr')
        const celula = document.createElement('td')
        celula.colSpan = 6
        celula.className = 'vazio'
        celula.textContent = 'Nenhum lançamento encontrado para os filtros informados.'
        vazio.append(celula)
        corpo.replaceChildren(vazio)
      }

      this.status('')
    } catch (erro) {
      console.error('[lancamentos:listar]', erro)
      corpo.replaceChildren()
      const mensagem = erro instanceof Error && erro.message ? erro.message : 'Não foi possível carregar os lançamentos.'
      this.status(mensagem, true)
    }
  }

  private agendarBusca = (): void => {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.carregar()
    }, 300)
  }

  private abrirFormulario = (lancamento?: Lancamento): void => {
    this.editandoId = lancamento?.id ?? null

    this.el<HTMLFormElement>('formulario').reset()
    this.el('erro-formulario').textContent = ''
    this.el('titulo-form').textContent = lancamento ? 'Editar lançamento' : 'Novo lançamento'
    this.el<HTMLButtonElement>('salvar').textContent = lancamento ? 'Salvar alterações' : 'Cadastrar'

    this.el<HTMLSelectElement>('categoria').value = lancamento?.categoria ?? 'aula'
    this.el<HTMLInputElement>('descricao').value = lancamento?.descricao ?? ''
    this.el<HTMLInputElement>('valor').value = lancamento ? String(lancamento.valor) : ''
    this.el<HTMLInputElement>('data').value = lancamento?.dataLancamento ?? this.hoje()

    this.abrirDialogo('dialogo-form')
    this.el<HTMLInputElement>('descricao').focus()
  }

  private fecharFormulario = (): void => {
    this.el<HTMLDialogElement>('dialogo-form').close()
    this.editandoId = null
  }

  private salvar = async (evento: Event): Promise<void> => {
    evento.preventDefault()

    const erro = this.el('erro-formulario')
    const botao = this.el<HTMLButtonElement>('salvar')
    const categoria = this.el<HTMLSelectElement>('categoria').value
    const descricao = this.el<HTMLInputElement>('descricao').value.trim()
    const valorTexto = this.el<HTMLInputElement>('valor').value
    const dataLancamento = this.el<HTMLInputElement>('data').value
    const valor = Number(valorTexto)
    const eraEdicao = this.editandoId !== null

    if (!categoria || !valorTexto || !dataLancamento || !Number.isFinite(valor) || valor <= 0) {
      erro.textContent = 'Preencha categoria, valor e data do lançamento.'
      return
    }

    botao.disabled = true
    erro.textContent = ''

    const dados = { categoria, descricao, valor, dataLancamento }

    try {
      const resultado: Resultado = this.editandoId === null
        ? await ipcRenderer.invoke('lancamentos:criar', dados)
        : await ipcRenderer.invoke('lancamentos:atualizar', { id: this.editandoId, ...dados })

      if (!resultado.ok) {
        erro.textContent = resultado.mensagem
        return
      }

      this.fecharFormulario()
      await this.carregar()
      this.status(eraEdicao ? 'Lançamento atualizado com sucesso.' : 'Lançamento cadastrado com sucesso.')
    } catch (erroIpc) {
      console.error('[lancamentos:salvar]', erroIpc)
      erro.textContent = 'Não foi possível salvar o lançamento.'
    } finally {
      botao.disabled = false
    }
  }

  private abrirExclusao = (lancamento: Lancamento): void => {
    this.excluindoId = lancamento.id
    this.el('texto-excluir').textContent =
      `Excluir o lançamento "${lancamento.descricao || this.categorias[lancamento.categoria]}" de ${this.data(lancamento.dataLancamento)}?`
    this.el('erro-excluir').textContent = ''
    this.abrirDialogo('dialogo-excluir')
  }

  private confirmarExclusao = async (): Promise<void> => {
    if (this.excluindoId === null) return

    const botao = this.el<HTMLButtonElement>('confirmar-excluir')
    botao.disabled = true
    this.el('erro-excluir').textContent = ''

    try {
      const resultado: Resultado = await ipcRenderer.invoke('lancamentos:excluir', this.excluindoId)
      if (!resultado.ok) {
        this.el('erro-excluir').textContent = resultado.mensagem
        return
      }

      this.el<HTMLDialogElement>('dialogo-excluir').close()
      this.excluindoId = null
      await this.carregar()
      this.status('Lançamento excluído. Os relatórios foram atualizados.')
    } catch (erroIpc) {
      console.error('[lancamentos:excluir]', erroIpc)
      this.el('erro-excluir').textContent = 'Não foi possível excluir o lançamento.'
    } finally {
      botao.disabled = false
    }
  }

  private voltar = async (): Promise<void> => {
    try {
      await ipcRenderer.invoke('menu:voltar')
    } catch {
      this.status('Não foi possível voltar ao menu.', true)
    }
  }

  iniciar = async (): Promise<void> => {
    try {
      this.usuario = (await ipcRenderer.invoke('auth:me')) as UsuarioSessao | null
    } catch {
      this.usuario = null
    }

    this.el('voltar').addEventListener('click', () => void this.voltar())

    if (!this.admin()) {
      this.el('painel-lancamentos').hidden = true
      this.el('acesso-negado').hidden = false
      return
    }

    this.el('novo').addEventListener('click', () => this.abrirFormulario())
    this.el('filtro-categoria').addEventListener('change', () => void this.carregar())
    this.el('filtro-inicio').addEventListener('change', () => void this.carregar())
    this.el('filtro-fim').addEventListener('change', () => void this.carregar())
    this.el('busca').addEventListener('input', this.agendarBusca)
    this.el('formulario').addEventListener('submit', (evento) => void this.salvar(evento))
    this.el('cancelar-form').addEventListener('click', this.fecharFormulario)
    this.el('cancelar-excluir').addEventListener('click', () => {
      this.el<HTMLDialogElement>('dialogo-excluir').close()
      this.excluindoId = null
    })
    this.el('confirmar-excluir').addEventListener('click', () => void this.confirmarExclusao())

    await this.carregar()
  }
}

window.addEventListener('DOMContentLoaded', () => {
  void new LancamentosView().iniciar()
})
