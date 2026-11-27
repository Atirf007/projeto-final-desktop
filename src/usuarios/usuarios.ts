import { ipcRenderer } from 'electron'

type UsuarioLista = {
  id: number
  nome: string
  email: string
  perfil: 'admin' | 'instrutor' | 'aluno'
  ativo: boolean
  ultimoLogin: string | null
  criadoEm: string
}

type ResultadoCriacao = { ok: true; id: number; aviso?: string } | { ok: false; mensagem: string }

class UsuariosView {
  private readonly perfis: Record<string, string> = {
    admin: 'Administrador',
    instrutor: 'Instrutor',
    aluno: 'Aluno'
  }

  private timer: ReturnType<typeof setTimeout> | null = null

  private usuarioParaExcluir: { id: number; nome: string } | null = null

  private el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

  private abrirDialogo = (id: string): void => {
    const dialogo = this.el<HTMLDialogElement>(id)
    if (!dialogo.open) dialogo.showModal()
  }

  private criarBotao = (texto: string, classe: string): HTMLButtonElement => {
    const botao = document.createElement('button')
    botao.type = 'button'
    botao.className = classe
    botao.textContent = texto
    return botao
  }

  private dataHora = (valor: string | null): string => {
    if (!valor) return '—'

    const [data, hora] = valor.split(' ')
    const [ano, mes, dia] = data.split('-')
    if (!ano || !mes || !dia) return valor

    return hora ? `${dia}/${mes}/${ano} ${hora.slice(0, 5)}` : `${dia}/${mes}/${ano}`
  }

  private celula = (valor: string, classe?: string): HTMLTableCellElement => {
    const celula = document.createElement('td')
    celula.textContent = valor
    if (classe) celula.className = classe
    return celula
  }

  private criarLinha = (usuario: UsuarioLista): HTMLTableRowElement => {
    const linha = document.createElement('tr')

    const perfil = document.createElement('td')
    perfil.textContent = this.perfis[usuario.perfil] ?? usuario.perfil

    const status = document.createElement('td')
    const selo = document.createElement('span')
    selo.className = usuario.ativo ? 'selo ativo' : 'selo inativo'
    selo.textContent = usuario.ativo ? 'Ativo' : 'Inativo'
    status.append(selo)

    const acoesTd = document.createElement('td')
    const acoes = document.createElement('div')
    acoes.className = 'acoes-linha'
    const btnEditar = this.criarBotao('Editar', 'botao secundario pequeno')
    btnEditar.addEventListener('click', () => void this.abrirEdicao(usuario.id, btnEditar))
    const btnExcluir = this.criarBotao('Excluir', 'botao perigo pequeno')
    btnExcluir.addEventListener('click', () => this.abrirExclusao(usuario))
    acoes.append(btnEditar, btnExcluir)
    acoesTd.append(acoes)

    linha.append(
      this.celula(String(usuario.id), 'col-id'),
      this.celula(usuario.nome, 'col-nome'),
      this.celula(usuario.email),
      perfil,
      status,
      this.celula(this.dataHora(usuario.ultimoLogin), 'col-data'),
      this.celula(this.dataHora(usuario.criadoEm), 'col-data'),
      acoesTd
    )

    return linha
  }

  private atualizar = async (): Promise<void> => {
    const status = this.el('status')
    const corpo = this.el<HTMLTableSectionElement>('corpo')
    const busca = this.el<HTMLInputElement>('busca').value.trim()

    status.classList.remove('erro')
    status.textContent = 'Carregando usuários...'

    try {
      const usuarios: UsuarioLista[] = await ipcRenderer.invoke('usuarios:listar', busca)

      corpo.replaceChildren(...usuarios.map(this.criarLinha))

      status.classList.remove('erro')
      status.textContent = usuarios.length
        ? ''
        : busca
          ? 'Nenhum usuário encontrado para a busca informada.'
          : 'Nenhum usuário cadastrado.'
    } catch {
      corpo.replaceChildren()
      status.classList.add('erro')
      status.textContent = 'Não foi possível carregar os usuários.'
    }
  }

  private agendarBusca = (): void => {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.atualizar()
    }, 300)
  }

  private limparFormulario = (): void => {
    this.el<HTMLFormElement>('formulario').reset()
    this.el<HTMLInputElement>('usuario-id').value = ''
    this.el('erro-formulario').textContent = ''
    this.el('titulo-dialogo').textContent = 'Novo usuário'
    this.el<HTMLButtonElement>('salvar').textContent = 'Cadastrar'
    this.el('campo-senha').textContent = 'Senha'
    this.el('campo-confirmacao').textContent = 'Confirmar senha'
    this.el('campo-ativo').classList.add('oculto')
  }

  private abrirFormulario = (): void => {
    this.limparFormulario()
    this.abrirDialogo('dialogo')
    this.el<HTMLInputElement>('nome').focus()
  }

  private abrirEdicao = async (id: number, botao?: HTMLButtonElement): Promise<void> => {
    if (botao) botao.disabled = true
    try {
      const usuario: UsuarioLista | null = await ipcRenderer.invoke('usuarios:obter', id)
      if (!usuario) {
        this.el('status').textContent = 'Usuário não encontrado.'
        return
      }

      this.limparFormulario()
      this.el<HTMLInputElement>('usuario-id').value = String(usuario.id)
      this.el<HTMLInputElement>('nome').value = usuario.nome
      this.el<HTMLInputElement>('email').value = usuario.email
      this.el<HTMLSelectElement>('perfil').value = usuario.perfil
      this.el<HTMLSelectElement>('ativo').value = usuario.ativo ? '1' : '0'
      this.el('titulo-dialogo').textContent = `Editar usuário — ${usuario.nome}`
      this.el<HTMLButtonElement>('salvar').textContent = 'Salvar alterações'
      this.el('campo-senha').textContent = 'Nova senha (opcional)'
      this.el('campo-confirmacao').textContent = 'Confirmar nova senha'
      this.el('campo-ativo').classList.remove('oculto')
      this.abrirDialogo('dialogo')
      this.el<HTMLInputElement>('nome').focus()
    } catch {
      this.el('status').textContent = 'Não foi possível carregar o usuário.'
    } finally {
      if (botao) botao.disabled = false
    }
  }

  private fecharFormulario = (): void => {
    this.el<HTMLFormElement>('formulario').reset()
    this.el<HTMLDialogElement>('dialogo').close()
  }

  private salvar = async (evento: Event): Promise<void> => {
    evento.preventDefault()

    const erro = this.el('erro-formulario')
    const botao = this.el<HTMLButtonElement>('salvar')
    const id = Number(this.el<HTMLInputElement>('usuario-id').value || '0')
    const nome = this.el<HTMLInputElement>('nome').value.trim()
    const email = this.el<HTMLInputElement>('email').value.trim()
    const perfil = this.el<HTMLSelectElement>('perfil').value
    const senha = this.el<HTMLInputElement>('senha').value
    const confirmacao = this.el<HTMLInputElement>('confirmacao').value

    if (!nome || !email) {
      erro.textContent = 'Preencha nome e e-mail.'
      return
    }
    if (id === 0 && !senha) {
      erro.textContent = 'Informe a senha do novo usuário.'
      return
    }
    if (senha || confirmacao) {
      if (senha !== confirmacao) {
        erro.textContent = 'A confirmação da senha não confere.'
        return
      }
    }

    botao.disabled = true
    erro.textContent = ''

    try {
      const entrada = id === 0
        ? { nome, email, senha, perfil }
        : {
            id,
            nome,
            email,
            perfil,
            ativo: this.el<HTMLSelectElement>('ativo').value === '1',
            novaSenha: senha || undefined
          }
      const resultado: ResultadoCriacao = await ipcRenderer.invoke(
        id === 0 ? 'usuarios:criar' : 'usuarios:atualizar',
        entrada
      )

      if (!resultado.ok) {
        erro.textContent = resultado.mensagem
        return
      }

      this.fecharFormulario()
      await this.atualizar()
      this.el('status').classList.remove('erro')
      this.el('status').textContent = id === 0
        ? `Usuário ${nome} cadastrado com sucesso.`
        : `Usuário ${nome} atualizado com sucesso.`
    } catch {
      erro.textContent = 'Não foi possível salvar o usuário.'
    } finally {
      botao.disabled = false
    }
  }

  private abrirExclusao = (usuario: UsuarioLista): void => {
    this.usuarioParaExcluir = { id: usuario.id, nome: usuario.nome }
    this.el('texto-excluir').textContent = `Deseja excluir o usuário "${usuario.nome}"? Usuários com cadastro de aluno ou instrutor não podem ser excluídos.`
    this.el('erro-excluir').textContent = ''
    this.abrirDialogo('dialogo-excluir')
  }

  private confirmarExclusao = async (): Promise<void> => {
    if (!this.usuarioParaExcluir) return
    const botao = this.el<HTMLButtonElement>('confirmar-excluir')
    botao.disabled = true
    this.el('erro-excluir').textContent = ''

    try {
      const resultado: ResultadoCriacao = await ipcRenderer.invoke('usuarios:excluir', this.usuarioParaExcluir.id)
      if (!resultado.ok) {
        this.el('erro-excluir').textContent = resultado.mensagem
        return
      }

      this.el<HTMLDialogElement>('dialogo-excluir').close()
      this.usuarioParaExcluir = null
      await this.atualizar()
      this.el('status').classList.remove('erro')
      this.el('status').textContent = 'Usuário excluído com sucesso.'
    } catch {
      this.el('erro-excluir').textContent = 'Não foi possível excluir o usuário.'
    } finally {
      botao.disabled = false
    }
  }

  private voltar = async (): Promise<void> => {
    try {
      await ipcRenderer.invoke('menu:voltar')
    } catch {
      this.el('status').textContent = 'Não foi possível voltar ao menu.'
    }
  }

  iniciar = (): void => {
    this.el<HTMLInputElement>('busca').addEventListener('input', this.agendarBusca)
    this.el('novo').addEventListener('click', this.abrirFormulario)
    this.el('voltar').addEventListener('click', this.voltar)
    this.el('cancelar').addEventListener('click', this.fecharFormulario)
    this.el('formulario').addEventListener('submit', this.salvar)
    this.el('cancelar-excluir').addEventListener('click', () =>
      this.el<HTMLDialogElement>('dialogo-excluir').close()
    )
    this.el('confirmar-excluir').addEventListener('click', () => void this.confirmarExclusao())
    void this.atualizar()
  }
}

window.addEventListener('DOMContentLoaded', () => new UsuariosView().iniciar())
