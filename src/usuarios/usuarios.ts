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

  iniciar = (): void => {
    this.el<HTMLInputElement>('busca').addEventListener('input', this.agendarBusca)
    void this.atualizar()
  }
}

window.addEventListener('DOMContentLoaded', () => new UsuariosView().iniciar())
