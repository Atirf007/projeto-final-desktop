import { ipcRenderer } from 'electron'

type Opcao = { id: string; titulo: string; descricao: string; grupo: string; disponivel: boolean }

type DadosMenu = { nome: string; perfil: string; opcoes: Opcao[] }

class MenuView {
  private readonly perfis: Record<string, string> = {
    admin: 'Administrador',
    instrutor: 'Instrutor',
    aluno: 'Aluno'
  }

  private readonly svgNs = 'http://www.w3.org/2000/svg'

  private el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

  private criarGrupo = (titulo: string, opcoes: Opcao[]): HTMLElement => {
    const secao = document.createElement('section')
    secao.className = 'grupo-modulos'

    const cabecalho = document.createElement('div')
    cabecalho.className = 'grupo-cabecalho'

    const nome = document.createElement('h3')
    nome.textContent = titulo

    const quantidade = document.createElement('span')
    quantidade.textContent = `${opcoes.length} ${opcoes.length === 1 ? 'módulo' : 'módulos'}`

    cabecalho.append(nome, quantidade)

    const linha = document.createElement('div')
    linha.className = 'linha-modulos'
    linha.append(...opcoes.map(this.criarOpcao))

    secao.append(cabecalho, linha)
    return secao
  }

  private criarOpcao = (opcao: Opcao): HTMLButtonElement => {
    const botao = document.createElement('button')
    botao.type = 'button'
    botao.className = 'opcao'
    botao.disabled = !opcao.disponivel

    const icone = document.createElementNS(this.svgNs, 'svg')
    icone.setAttribute('class', 'opcao-icone')
    icone.setAttribute('aria-hidden', 'true')
    const referencia = document.createElementNS(this.svgNs, 'use')
    referencia.setAttribute('href', `#ico-${opcao.id}`)
    icone.append(referencia)

    const titulo = document.createElement('strong')
    titulo.textContent = opcao.titulo

    const descricao = document.createElement('span')
    descricao.textContent = opcao.descricao

    botao.append(icone, titulo, descricao)

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
      const primeiroNome = dados.nome.trim().split(/\s+/)[0] ?? dados.nome

      this.el('nome').textContent = dados.nome
      this.el('perfil').textContent = this.perfis[dados.perfil] ?? dados.perfil
      this.el('boas-vindas').textContent = `Olá, ${primeiroNome}!`
      this.el('resumo-menu').textContent = `Você está como ${this.perfis[dados.perfil] ?? dados.perfil}. Escolha um módulo abaixo.`
      this.el('total-opcoes').textContent = String(dados.opcoes.length)

      const grupos = new Map<string, Opcao[]>()
      for (const opcao of dados.opcoes) {
        const lista = grupos.get(opcao.grupo) ?? []
        lista.push(opcao)
        grupos.set(opcao.grupo, lista)
      }

      this.el('opcoes').replaceChildren(
        ...Array.from(grupos, ([grupo, opcoes]) => this.criarGrupo(grupo, opcoes))
      )
    } catch {
      this.el('status').textContent = 'Sessão inválida. Faça login novamente.'
    }
  }
}

window.addEventListener('DOMContentLoaded', () => new MenuView().iniciar())
