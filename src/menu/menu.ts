import { ipcRenderer } from 'electron'
import type { ResumoInadimplencia } from '../inadimplencia/InadimplenciaBackend'

type Opcao = { id: string; titulo: string; descricao: string; grupo: string; disponivel: boolean }

type DadosMenu = { nome: string; perfil: string; opcoes: Opcao[] }

class MenuView {
  private readonly perfis: Record<string, string> = {
    admin: 'Administrador',
    instrutor: 'Instrutor',
    aluno: 'Aluno'
  }

  private readonly svgNs = 'http://www.w3.org/2000/svg'
  private readonly moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

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

    const acao = document.createElement('em')
    acao.textContent = opcao.disponivel ? 'Abrir' : 'Em breve'

    botao.append(icone, titulo, descricao, acao)

    botao.addEventListener('click', () => this.abrir(opcao.id))
    return botao
  }

  private dataBr = (valor: string): string => {
    const [ano, mes, dia] = valor.split('-').map(Number)
    return ano && mes && dia ? `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}` : valor
  }

  private competenciaBr = (valor: string): string => {
    const [ano, mes] = valor.split('-')
    return ano && mes ? `${mes}/${ano}` : valor
  }

  private carregarAlerta = async (perfil: string): Promise<void> => {
    const caixa = this.el<HTMLElement>('alerta-inadimplencia')
    caixa.hidden = true
    if (perfil !== 'admin') return

    try {
      const resumo = await ipcRenderer.invoke('inadimplencia:resumo') as ResumoInadimplencia
      if (!resumo.atrasados) return

      caixa.replaceChildren()
      const topo = document.createElement('div')
      topo.className = 'alerta-topo'

      const titulo = document.createElement('strong')
      titulo.textContent = `${resumo.atrasados} ${resumo.atrasados === 1 ? 'mensalidade em atraso' : 'mensalidades em atraso'}`

      const detalhe = document.createElement('span')
      detalhe.textContent = `${resumo.totalAlunos} ${resumo.totalAlunos === 1 ? 'aluno' : 'alunos'} • ${this.moeda.format(resumo.valorTotal)}`

      topo.append(titulo, detalhe)
      caixa.append(topo)

      if (resumo.itens.length) {
        const detalhes = document.createElement('details')
        const resumoDetalhes = document.createElement('summary')
        resumoDetalhes.textContent = 'Ver detalhes'
        const lista = document.createElement('ul')

        for (const item of resumo.itens) {
          const linha = document.createElement('li')
          linha.textContent = `${item.alunoNome} — ${this.competenciaBr(item.competencia)} • vencida em ${this.dataBr(item.dataVencimento)} • ${this.moeda.format(item.valor)} • ${item.diasAtraso} ${item.diasAtraso === 1 ? 'dia' : 'dias'} em atraso`
          lista.append(linha)
        }

        detalhes.append(resumoDetalhes, lista)
        caixa.append(detalhes)
      }

      caixa.hidden = false
    } catch {
      caixa.hidden = true
    }
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

      await this.carregarAlerta(dados.perfil)
    } catch {
      this.el('status').textContent = 'Sessão inválida. Faça login novamente.'
    }
  }
}

window.addEventListener('DOMContentLoaded', () => new MenuView().iniciar())
