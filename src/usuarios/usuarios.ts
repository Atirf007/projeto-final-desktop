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

type ResultadoCriacao = { ok: true; id: number } | { ok: false; mensagem: string }

class UsuariosView {
  private readonly perfis: Record<string, string> = {
    admin: 'Administrador',
    instrutor: 'Instrutor',
    aluno: 'Aluno'
  }

  private timer: ReturnType<typeof setTimeout> | null = null

  private el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

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

    linha.append(
      this.celula(String(usuario.id), 'col-id'),
      this.celula(usuario.nome, 'col-nome'),
      this.celula(usuario.email),
      perfil,
      status,
      this.celula(this.dataHora(usuario.ultimoLogin), 'col-data'),
      this.celula(this.dataHora(usuario.criadoEm), 'col-data')
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

  private abrirFormulario = (): void => {
    this.el<HTMLFormElement>('formulario').reset()
    this.el('erro-formulario').textContent = ''
    this.el<HTMLDialogElement>('dialogo').showModal()
    this.el<HTMLInputElement>('nome').focus()
  }

  private fecharFormulario = (): void => {
    this.el<HTMLFormElement>('formulario').reset()
    this.el<HTMLDialogElement>('dialogo').close()
  }

  private salvar = async (evento: Event): Promise<void> => {
    evento.preventDefault()

    const erro = this.el('erro-formulario')
    const botao = this.el<HTMLButtonElement>('salvar')
    const nome = this.el<HTMLInputElement>('nome').value.trim()
    const email = this.el<HTMLInputElement>('email').value.trim()
    const perfil = this.el<HTMLSelectElement>('perfil').value
    const senha = this.el<HTMLInputElement>('senha').value
    const confirmacao = this.el<HTMLInputElement>('confirmacao').value

    if (!nome || !email || !senha || !confirmacao) {
      erro.textContent = 'Preencha todos os campos.'
      return
    }

    if (senha !== confirmacao) {
      erro.textContent = 'A confirmação da senha não confere.'
      return
    }

    botao.disabled = true
    erro.textContent = ''

    try {
      const resultado: ResultadoCriacao = await ipcRenderer.invoke('usuarios:criar', { nome, email, senha, perfil })

      if (!resultado.ok) {
        erro.textContent = resultado.mensagem
        return
      }

      this.fecharFormulario()
      await this.atualizar()
      this.el('status').textContent = `Usuário ${nome} cadastrado com sucesso.`
    } catch {
      erro.textContent = 'Não foi possível cadastrar o usuário.'
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
    void this.atualizar()
  }
}

window.addEventListener('DOMContentLoaded', () => new UsuariosView().iniciar())
