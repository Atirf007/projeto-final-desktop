import { ipcRenderer } from 'electron'

type Opcao = { id: string; titulo: string; descricao: string; disponivel: boolean }

type DadosMenu = { nome: string; perfil: string; opcoes: Opcao[] }

class MenuView {
  private readonly perfis: Record<string, string> = {
    admin: 'Administrador',
    instrutor: 'Instrutor',
    aluno: 'Aluno'
  }

  private el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

  private criarOpcao = (opcao: Opcao): HTMLButtonElement => {
    const botao = document.createElement('button')
    botao.type = 'button'
    botao.className = 'opcao'
    botao.disabled = !opcao.disponivel

    const titulo = document.createElement('strong')
    titulo.textContent = opcao.titulo

    const descricao = document.createElement('span')
    descricao.textContent = opcao.descricao

    botao.append(titulo, descricao)

    if (!opcao.disponivel) {
      const selo = document.createElement('em')
      selo.textContent = 'Em breve'
      botao.append(selo)
    }

    botao.addEventListener('click', () => this.abrir(opcao.id))
    return botao
  }

  private abrir = async (id: string): Promise<void> => {
    try {
      await ipcRenderer.invoke('menu:abrir', id)
      this.el('status').textContent = ''
    } catch {
      this.el('status').textContent = 'Não foi possível abrir esta tela.'
    }
  }

  private sair = async (): Promise<void> => {
    await ipcRenderer.invoke('auth:sair')
  }

  iniciar = async (): Promise<void> => {
    this.el('sair').addEventListener('click', this.sair)

    try {
      const dados: DadosMenu = await ipcRenderer.invoke('menu:carregar')
      this.el('usuario').textContent = `${dados.nome} - ${this.perfis[dados.perfil] ?? dados.perfil}`
      this.el('opcoes').replaceChildren(...dados.opcoes.map(this.criarOpcao))
    } catch {
      this.el('status').textContent = 'Sessão inválida. Faça login novamente.'
    }
  }
}

window.addEventListener('DOMContentLoaded', () => new MenuView().iniciar())
