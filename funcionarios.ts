import { ipcRenderer } from 'electron'

type FuncionarioResumo = {
  id: number
  usuarioId: number
  nome: string
  email: string
  cref: string
  modalidades: string[]
  ativo: boolean
}

type Modalidade = {
  id: number
  nome: string
  descricao?: string
  ativo: boolean
}

type Funcionario = {
  id: number
  usuarioId: number
  nome: string
  email: string
  cref: string
  bio?: string
  modalidades: Modalidade[]
  ativo: boolean
  criadoEm: string
  atualizadoEm: string
}

type ResultadoFuncionario = { ok: true; id?: number } | { ok: false; mensagem: string }
type ResultadoModalidade = { ok: true; id?: number } | { ok: false; mensagem: string }

class FuncionariosView {
  private funcionarios: FuncionarioResumo[] = []
  private modalidades: Modalidade[] = []
  private detalheAtual: Funcionario | null = null
  private funcionarioParaExcluir: FuncionarioResumo | null = null
  private timer: ReturnType<typeof setTimeout> | null = null

  private el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

  private dataFmt = (valor?: string): string => {
    if (!valor) return '—'
    const [data, hora] = String(valor).split(/[ T]/)
    const [ano, mes, dia] = data.split('-')
    if (!ano || !mes || !dia) return valor
    return hora ? `${dia}/${mes}/${ano} ${hora.slice(0, 5)}` : `${dia}/${mes}/${ano}`
  }

  private status = (texto: string, erro = false): void => {
    const el = this.el('status')
    el.textContent = texto
    el.classList.toggle('erro', erro)
  }

  private modalidadesTexto = (funcionario: FuncionarioResumo): string =>
    funcionario.modalidades.length ? funcionario.modalidades.join(', ') : '—'

  private criarLinha = (funcionario: FuncionarioResumo): HTMLTableRowElement => {
    const tr = document.createElement('tr')
    const td = (texto: string, classe?: string): HTMLTableCellElement => {
      const cel = document.createElement('td')
      cel.textContent = texto
      if (classe) cel.className = classe
      return cel
    }

    const seloTd = document.createElement('td')
    const selo = document.createElement('span')
    selo.className = funcionario.ativo ? 'selo ativo' : 'selo inativo'
    selo.textContent = funcionario.ativo ? 'Ativo' : 'Inativo'
    seloTd.append(selo)

    const acoesTd = document.createElement('td')
    const acoes = document.createElement('div')
    acoes.className = 'acoes-linha'

    const btnVer = document.createElement('button')
    btnVer.type = 'button'
    btnVer.className = 'botao secundario pequeno'
    btnVer.textContent = 'Ver'
    btnVer.addEventListener('click', () => void this.abrirDetalhe(funcionario.id))

    const btnEditar = document.createElement('button')
    btnEditar.type = 'button'
    btnEditar.className = 'botao secundario pequeno'
    btnEditar.textContent = 'Editar'
    btnEditar.addEventListener('click', () => void this.abrirEdicao(funcionario.id))

    const btnExcluir = document.createElement('button')
    btnExcluir.type = 'button'
    btnExcluir.className = 'botao perigo pequeno'
    btnExcluir.textContent = 'Desativar'
    btnExcluir.disabled = !funcionario.ativo
    btnExcluir.addEventListener('click', () => this.abrirExclusao(funcionario))

    acoes.append(btnVer, btnEditar, btnExcluir)
    acoesTd.append(acoes)

    tr.append(
      td(funcionario.nome, 'col-nome'),
      td(funcionario.email),
      td(funcionario.cref || '—'),
      td(this.modalidadesTexto(funcionario), 'col-modalidades'),
      seloTd,
      acoesTd
    )
    return tr
  }

  private carregar = async (): Promise<void> => {
    this.status('Carregando funcionários...')
    try {
      const busca = this.el<HTMLInputElement>('busca').value.trim()
      const ativoRaw = this.el<HTMLSelectElement>('filtro-ativo').value
      const filtro: { busca?: string; ativo?: boolean } = {}
      if (busca) filtro.busca = busca
      if (ativoRaw === 'true') filtro.ativo = true
      if (ativoRaw === 'false') filtro.ativo = false

      this.funcionarios = await ipcRenderer.invoke('instrutores:listar', filtro)
      this.el<HTMLTableSectionElement>('corpo').replaceChildren(...this.funcionarios.map(this.criarLinha))
      this.status(this.funcionarios.length ? '' : 'Nenhum funcionário encontrado.')
    } catch (erro) {
      console.error(erro)
      this.el<HTMLTableSectionElement>('corpo').replaceChildren()
      this.status('Não foi possível carregar os funcionários.', true)
    }
  }

  private agendarBusca = (): void => {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.carregar()
    }, 300)
  }

  private limparForm = (): void => {
    this.el<HTMLFormElement>('formulario').reset()
    this.el<HTMLInputElement>('funcionario-id').value = ''
    this.el('erro-formulario').textContent = ''
  }

  private renderModalidades = (selecionadas: number[]): void => {
    const container = this.el('modalidades-check')
    const selecionadasSet = new Set(selecionadas)
    const visiveis = this.modalidades.filter((m) => m.ativo || selecionadasSet.has(m.id))

    if (!visiveis.length) {
      const aviso = document.createElement('p')
      aviso.className = 'msg-info'
      aviso.textContent = 'Nenhuma modalidade cadastrada. Use "Gerenciar modalidades" para cadastrar.'
      container.replaceChildren(aviso)
      return
    }

    const itens = visiveis.map((modalidade) => {
      const label = document.createElement('label')
      label.className = 'check'

      const input = document.createElement('input')
      input.type = 'checkbox'
      input.value = String(modalidade.id)
      input.checked = selecionadasSet.has(modalidade.id)

      const nome = document.createElement('span')
      nome.textContent = modalidade.ativo ? modalidade.nome : `${modalidade.nome} (inativa)`

      label.append(input, nome)
      return label
    })

    container.replaceChildren(...itens)
  }

  private modalidadesSelecionadas = (): number[] =>
    Array.from(this.el('modalidades-check').querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
      .filter((input) => input.checked)
      .map((input) => Number(input.value))

  private abrirNovo = (): void => {
    this.limparForm()
    this.el('titulo-form').textContent = 'Novo funcionário'
    this.el<HTMLButtonElement>('salvar').textContent = 'Cadastrar'
    this.el('campo-senha').classList.remove('oculto')
    this.el('campo-nova-senha').classList.add('oculto')
    this.el('campo-ativo').classList.add('oculto')
    this.renderModalidades([])
    this.el<HTMLDialogElement>('dialogo-form').showModal()
    this.el<HTMLInputElement>('nome').focus()
  }

  private preencherForm = (funcionario: Funcionario): void => {
    this.limparForm()
    this.el<HTMLInputElement>('funcionario-id').value = String(funcionario.id)
    this.el<HTMLInputElement>('nome').value = funcionario.nome
    this.el<HTMLInputElement>('email').value = funcionario.email
    this.el<HTMLInputElement>('cref').value = funcionario.cref
    this.el<HTMLTextAreaElement>('bio').value = funcionario.bio ?? ''
    this.el<HTMLSelectElement>('ativo').value = String(funcionario.ativo)
    this.renderModalidades(funcionario.modalidades.map((m) => m.id))
  }

  private abrirEdicao = async (id: number): Promise<void> => {
    try {
      const funcionario: Funcionario | null = await ipcRenderer.invoke('instrutores:obter', id)
      if (!funcionario) { this.status('Funcionário não encontrado.', true); return }
      this.preencherForm(funcionario)
      this.el('titulo-form').textContent = `Editar funcionário — ${funcionario.nome}`
      this.el<HTMLButtonElement>('salvar').textContent = 'Salvar alterações'
      this.el('campo-senha').classList.add('oculto')
      this.el('campo-nova-senha').classList.remove('oculto')
      this.el('campo-ativo').classList.remove('oculto')
      this.el<HTMLDialogElement>('dialogo-form').showModal()
    } catch {
      this.status('Não foi possível carregar o funcionário.', true)
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

  private abrirDetalhe = async (id: number): Promise<void> => {
    try {
      const funcionario: Funcionario | null = await ipcRenderer.invoke('instrutores:obter', id)
      if (!funcionario) { this.status('Funcionário não encontrado.', true); return }
      this.detalheAtual = funcionario
      this.el('titulo-detalhe').textContent = funcionario.nome
      const dl = this.el('detalhes')
      dl.replaceChildren()
      this.detalheItem(dl, 'E-mail', funcionario.email)
      this.detalheItem(dl, 'CREF', funcionario.cref)
      this.detalheItem(dl, 'Status', funcionario.ativo ? 'Ativo' : 'Inativo')
      this.detalheItem(dl, 'Modalidades', funcionario.modalidades.map((m) => m.nome).join(', '))
      this.detalheItem(dl, 'Biografia', funcionario.bio, true)
      this.detalheItem(dl, 'Cadastrado em', this.dataFmt(funcionario.criadoEm))
      this.detalheItem(dl, 'Atualizado em', this.dataFmt(funcionario.atualizadoEm))
      this.el<HTMLDialogElement>('dialogo-detalhe').showModal()
    } catch {
      this.status('Não foi possível carregar o funcionário.', true)
    }
  }

  private salvar = async (evento: Event): Promise<void> => {
    evento.preventDefault()
    const erro = this.el('erro-formulario')
    const botao = this.el<HTMLButtonElement>('salvar')
    erro.textContent = ''

    const id = Number(this.el<HTMLInputElement>('funcionario-id').value || '0')
    const nome = this.el<HTMLInputElement>('nome').value.trim()
    const email = this.el<HTMLInputElement>('email').value.trim()
    const cref = this.el<HTMLInputElement>('cref').value.trim()
    const bio = this.el<HTMLTextAreaElement>('bio').value.trim()
    const modalidadeIds = this.modalidadesSelecionadas()

    if (!id && !this.el<HTMLInputElement>('senha').value) {
      erro.textContent = 'Informe a senha de acesso do funcionário.'
      return
    }

    botao.disabled = true
    try {
      let resultado: ResultadoFuncionario
      if (id > 0) {
        const novaSenha = this.el<HTMLInputElement>('nova-senha').value
        resultado = await ipcRenderer.invoke('instrutores:atualizar', {
          id,
          nome,
          email,
          cref,
          bio: bio || null,
          modalidadeIds,
          novaSenha: novaSenha || undefined,
          ativo: this.el<HTMLSelectElement>('ativo').value === 'true'
        })
      } else {
        resultado = await ipcRenderer.invoke('instrutores:criar', {
          nome,
          email,
          cref,
          bio: bio || undefined,
          modalidadeIds,
          senha: this.el<HTMLInputElement>('senha').value
        })
      }

      if (!resultado.ok) { erro.textContent = resultado.mensagem; return }
      this.el<HTMLDialogElement>('dialogo-form').close()
      await this.carregar()
      this.status(id > 0 ? 'Funcionário atualizado com sucesso.' : 'Funcionário cadastrado com sucesso.')
    } catch (e) {
      console.error(e)
      erro.textContent = 'Não foi possível salvar o funcionário.'
    } finally {
      botao.disabled = false
    }
  }

  private abrirExclusao = (funcionario: FuncionarioResumo): void => {
    this.funcionarioParaExcluir = funcionario
    this.el('texto-excluir').textContent = `Deseja desativar o funcionário "${funcionario.nome}"? O cadastro e o acesso de login serão desativados (exclusão lógica).`
    this.el('erro-excluir').textContent = ''
    this.el<HTMLDialogElement>('dialogo-excluir').showModal()
  }

  private confirmarExclusao = async (): Promise<void> => {
    if (!this.funcionarioParaExcluir) return
    const botao = this.el<HTMLButtonElement>('confirmar-excluir')
    botao.disabled = true
    this.el('erro-excluir').textContent = ''
    try {
      const resultado: ResultadoFuncionario = await ipcRenderer.invoke('instrutores:excluir', this.funcionarioParaExcluir.id)
      if (!resultado.ok) { this.el('erro-excluir').textContent = resultado.mensagem; return }
      this.el<HTMLDialogElement>('dialogo-excluir').close()
      await this.carregar()
      this.status(`Funcionário "${this.funcionarioParaExcluir.nome}" desativado.`)
    } catch {
      this.el('erro-excluir').textContent = 'Não foi possível desativar o funcionário.'
    } finally {
      botao.disabled = false
    }
  }

  private carregarModalidades = async (): Promise<void> => {
    this.modalidades = await ipcRenderer.invoke('modalidades:listar', {})
  }

  private criarLinhaModalidade = (modalidade: Modalidade): HTMLTableRowElement => {
    const tr = document.createElement('tr')
    const td = (texto: string): HTMLTableCellElement => {
      const cel = document.createElement('td')
      cel.textContent = texto
      return cel
    }

    const seloTd = document.createElement('td')
    const selo = document.createElement('span')
    selo.className = modalidade.ativo ? 'selo ativo' : 'selo inativo'
    selo.textContent = modalidade.ativo ? 'Ativa' : 'Inativa'
    seloTd.append(selo)

    const acoesTd = document.createElement('td')
    const acoes = document.createElement('div')
    acoes.className = 'acoes-linha'

    const btnEditar = document.createElement('button')
    btnEditar.type = 'button'
    btnEditar.className = 'botao secundario pequeno'
    btnEditar.textContent = 'Editar'
    btnEditar.addEventListener('click', () => this.editarModalidade(modalidade))

    const btnAlternar = document.createElement('button')
    btnAlternar.type = 'button'
    btnAlternar.className = modalidade.ativo ? 'botao perigo pequeno' : 'botao pequeno'
    btnAlternar.textContent = modalidade.ativo ? 'Desativar' : 'Reativar'
    btnAlternar.addEventListener('click', () => void this.alternarModalidade(modalidade))

    acoes.append(btnEditar, btnAlternar)
    acoesTd.append(acoes)

    tr.append(td(modalidade.nome), td(modalidade.descricao || '—'), seloTd, acoesTd)
    return tr
  }

  private renderTabelaModalidades = (): void => {
    this.el<HTMLTableSectionElement>('corpo-modalidades').replaceChildren(...this.modalidades.map(this.criarLinhaModalidade))
  }

  private limparFormModalidade = (): void => {
    this.el<HTMLFormElement>('form-modalidade').reset()
    this.el<HTMLInputElement>('modalidade-id').value = ''
    this.el('campo-modalidade-ativo').classList.add('oculto')
    this.el<HTMLButtonElement>('salvar-modalidade').textContent = 'Cadastrar modalidade'
    this.el('erro-modalidade').textContent = ''
  }

  private editarModalidade = (modalidade: Modalidade): void => {
    this.el<HTMLInputElement>('modalidade-id').value = String(modalidade.id)
    this.el<HTMLInputElement>('modalidade-nome').value = modalidade.nome
    this.el<HTMLInputElement>('modalidade-descricao').value = modalidade.descricao ?? ''
    this.el<HTMLSelectElement>('modalidade-ativo').value = String(modalidade.ativo)
    this.el('campo-modalidade-ativo').classList.remove('oculto')
    this.el<HTMLButtonElement>('salvar-modalidade').textContent = 'Salvar alterações'
    this.el('erro-modalidade').textContent = ''
    this.el<HTMLInputElement>('modalidade-nome').focus()
  }

  private recarregarModalidades = async (): Promise<void> => {
    const status = this.el('status-modalidades')
    try {
      await this.carregarModalidades()
      this.renderTabelaModalidades()
      status.classList.remove('erro')
      status.textContent = this.modalidades.length ? '' : 'Nenhuma modalidade cadastrada.'
    } catch {
      status.classList.add('erro')
      status.textContent = 'Não foi possível carregar as modalidades.'
    }
  }

  private abrirModalidades = async (): Promise<void> => {
    this.limparFormModalidade()
    this.el<HTMLDialogElement>('dialogo-modalidades').showModal()
    await this.recarregarModalidades()
  }

  private salvarModalidade = async (evento: Event): Promise<void> => {
    evento.preventDefault()
    const erro = this.el('erro-modalidade')
    const botao = this.el<HTMLButtonElement>('salvar-modalidade')
    erro.textContent = ''

    const id = Number(this.el<HTMLInputElement>('modalidade-id').value || '0')
    const nome = this.el<HTMLInputElement>('modalidade-nome').value.trim()
    const descricao = this.el<HTMLInputElement>('modalidade-descricao').value.trim()

    if (!nome) { erro.textContent = 'Informe o nome da modalidade.'; return }

    botao.disabled = true
    try {
      const resultado: ResultadoModalidade = id > 0
        ? await ipcRenderer.invoke('modalidades:atualizar', {
            id,
            nome,
            descricao: descricao || null,
            ativo: this.el<HTMLSelectElement>('modalidade-ativo').value === 'true'
          })
        : await ipcRenderer.invoke('modalidades:criar', { nome, descricao: descricao || undefined })

      if (!resultado.ok) { erro.textContent = resultado.mensagem; return }

      this.limparFormModalidade()
      await this.recarregarModalidades()
      this.el('status-modalidades').textContent = id > 0 ? 'Modalidade atualizada.' : 'Modalidade cadastrada.'
    } catch {
      erro.textContent = 'Não foi possível salvar a modalidade.'
    } finally {
      botao.disabled = false
    }
  }

  private alternarModalidade = async (modalidade: Modalidade): Promise<void> => {
    const status = this.el('status-modalidades')
    status.classList.remove('erro')
    try {
      const resultado: ResultadoModalidade = modalidade.ativo
        ? await ipcRenderer.invoke('modalidades:excluir', modalidade.id)
        : await ipcRenderer.invoke('modalidades:atualizar', { id: modalidade.id, ativo: true })

      if (!resultado.ok) {
        status.classList.add('erro')
        status.textContent = resultado.mensagem
        return
      }

      await this.recarregarModalidades()
      this.el('status-modalidades').textContent = modalidade.ativo ? 'Modalidade desativada.' : 'Modalidade reativada.'
    } catch {
      status.classList.add('erro')
      status.textContent = 'Não foi possível alterar a modalidade.'
    }
  }

  private voltar = async (): Promise<void> => {
    try { await ipcRenderer.invoke('menu:voltar') } catch { this.status('Não foi possível voltar ao menu.', true) }
  }

  iniciar = async (): Promise<void> => {
    this.el('voltar').addEventListener('click', () => void this.voltar())
    this.el('novo').addEventListener('click', this.abrirNovo)
    this.el<HTMLInputElement>('busca').addEventListener('input', this.agendarBusca)
    this.el('filtro-ativo').addEventListener('change', () => void this.carregar())
    this.el('formulario').addEventListener('submit', (e) => void this.salvar(e))
    this.el('cancelar-form').addEventListener('click', () => this.el<HTMLDialogElement>('dialogo-form').close())
    this.el('fechar-detalhe').addEventListener('click', () => this.el<HTMLDialogElement>('dialogo-detalhe').close())
    this.el('editar-detalhe').addEventListener('click', () => {
      if (this.detalheAtual) {
        this.el<HTMLDialogElement>('dialogo-detalhe').close()
        void this.abrirEdicao(this.detalheAtual.id)
      }
    })
    this.el('cancelar-excluir').addEventListener('click', () => this.el<HTMLDialogElement>('dialogo-excluir').close())
    this.el('confirmar-excluir').addEventListener('click', () => void this.confirmarExclusao())
    this.el('gerenciar-modalidades').addEventListener('click', () => void this.abrirModalidades())
    this.el('form-modalidade').addEventListener('submit', (e) => void this.salvarModalidade(e))
    this.el('limpar-modalidade').addEventListener('click', this.limparFormModalidade)
    this.el('fechar-modalidades').addEventListener('click', () => {
      this.el<HTMLDialogElement>('dialogo-modalidades').close()
      void this.carregar()
    })

    try {
      await this.carregarModalidades()
    } catch {
      this.modalidades = []
    }

    await this.carregar()
  }
}

window.addEventListener('DOMContentLoaded', () => { void new FuncionariosView().iniciar() })
