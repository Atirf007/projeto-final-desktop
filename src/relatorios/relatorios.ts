import { ipcRenderer } from 'electron'

type Periodo = { tipo: 'mensal'; ano: number; mes: number } | { tipo: 'anual'; ano: number }

type Receitas = {
  planos: number
  aulas: number
  aluguel: number
  outros: number
}

type Barra = { rotulo: string; valor: number; destaque: boolean }

class RelatoriosView {
  private readonly moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

  private readonly moedaCurta = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  })

  private readonly svgNs = 'http://www.w3.org/2000/svg'

  private nomeArquivo = 'relatorio'

  private el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

  private dois = (numero: number): string => String(numero).padStart(2, '0')

  private svg = (tag: string, atributos: Record<string, string | number>, texto?: string): SVGElement => {
    const elemento = document.createElementNS(this.svgNs, tag) as SVGElement
    Object.entries(atributos).forEach(([nome, valor]) => elemento.setAttribute(nome, String(valor)))
    if (texto !== undefined) elemento.textContent = texto
    return elemento
  }

  private escala = (maximo: number): number => {
    if (maximo <= 0) return 1
    const base = Math.pow(10, Math.floor(Math.log10(maximo)))
    const fator = maximo / base
    const arredondado = fator <= 1 ? 1 : fator <= 2 ? 2 : fator <= 5 ? 5 : 10
    return arredondado * base
  }

  private periodoAtual = (): Periodo | null => {
    const tipo = this.el<HTMLSelectElement>('periodo').value

    if (tipo === 'mensal') {
      const [ano, mes] = this.el<HTMLInputElement>('mes').value.split('-').map(Number)
      return Number.isInteger(ano) && Number.isInteger(mes) ? { tipo, ano, mes } : null
    }

    const ano = Number(this.el<HTMLInputElement>('ano').value)
    return Number.isInteger(ano) ? { tipo: 'anual', ano } : null
  }

  private titulo = (periodo: Periodo): string => {
    if (periodo.tipo === 'anual') return `Receita por categoria - ano de ${periodo.ano}`
    const mes = new Date(periodo.ano, periodo.mes - 1, 1).toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric'
    })
    return `Receita por categoria - ${mes}`
  }

  private desenhar = (receitas: Receitas): void => {
    const planos = Number(receitas.planos) || 0
    const aulas = Number(receitas.aulas) || 0
    const aluguel = Number(receitas.aluguel) || 0
    const outros = Number(receitas.outros) || 0

    const total = planos + aulas + aluguel + outros

    const barras: Barra[] = [
      { rotulo: 'Planos', valor: planos, destaque: false },
      { rotulo: 'Aulas', valor: aulas, destaque: false },
      { rotulo: 'Aluguel', valor: aluguel, destaque: false },
      { rotulo: 'Outros', valor: outros, destaque: false },
      { rotulo: 'Total', valor: total, destaque: true }
    ]

    const largura = 800
    const altura = 380
    const margemEsquerda = 90
    const margemDireita = 20
    const margemTopo = 30
    const margemBase = 50
    const areaLargura = largura - margemEsquerda - margemDireita
    const areaAltura = altura - margemTopo - margemBase
    const topo = this.escala(total)
    const passo = areaLargura / barras.length
    const larguraBarra = passo * 0.5

    const grafico = this.svg('svg', { viewBox: `0 0 ${largura} ${altura}`, role: 'img' })

    for (let i = 0; i <= 4; i++) {
      const y = margemTopo + areaAltura - (areaAltura * i) / 4
      grafico.appendChild(
        this.svg('line', { x1: margemEsquerda, x2: largura - margemDireita, y1: y, y2: y, class: 'grade' })
      )
      grafico.appendChild(
        this.svg('text', { x: margemEsquerda - 10, y: y + 4, class: 'eixo', 'text-anchor': 'end' }, this.moedaCurta.format((topo * i) / 4))
      )
    }

    barras.forEach((barra, indice) => {
      const alturaBarra = (areaAltura * barra.valor) / topo
      const x = margemEsquerda + passo * indice + (passo - larguraBarra) / 2
      const y = margemTopo + areaAltura - alturaBarra
      const centro = x + larguraBarra / 2

      grafico.appendChild(
        this.svg('rect', {
          x,
          y,
          width: larguraBarra,
          height: alturaBarra,
          rx: 4,
          class: barra.destaque ? 'barra destaque' : 'barra'
        })
      )
      grafico.appendChild(this.svg('text', { x: centro, y: y - 8, class: 'valor', 'text-anchor': 'middle' }, this.moeda.format(barra.valor)))
      grafico.appendChild(
        this.svg('text', { x: centro, y: margemTopo + areaAltura + 24, class: 'rotulo', 'text-anchor': 'middle' }, barra.rotulo)
      )
    })

    this.el('grafico').replaceChildren(grafico)
  }

  private atualizar = async (): Promise<void> => {
    const periodo = this.periodoAtual()
    const status = this.el('status')

    if (!periodo) {
      status.textContent = 'Selecione um período válido.'
      return
    }

    this.nomeArquivo = periodo.tipo === 'anual' ? `relatorio-${periodo.ano}` : `relatorio-${periodo.ano}-${this.dois(periodo.mes)}`
    this.el('titulo').textContent = this.titulo(periodo)

    try {
      const receitas: Receitas = await ipcRenderer.invoke('relatorios:receitas', periodo)
      this.desenhar(receitas)
      status.textContent = ''
    } catch {
      this.el('grafico').replaceChildren()
      status.textContent = 'Não foi possível carregar os dados.'
    }
  }

  private alternarPeriodo = async (): Promise<void> => {
    const mensal = this.el<HTMLSelectElement>('periodo').value === 'mensal'
    this.el('campo-mes').hidden = !mensal
    this.el('campo-ano').hidden = mensal
    await this.atualizar()
  }

  private exportar = async (): Promise<void> => {
    const status = this.el('status')
    try {
      const caminho: string | null = await ipcRenderer.invoke('relatorios:exportar-pdf', this.nomeArquivo)
      status.textContent = caminho ? `PDF salvo em ${caminho}` : 'Exportação cancelada.'
    } catch {
      status.textContent = 'Não foi possível exportar o PDF.'
    }
  }

  private voltar = async (): Promise<void> => {
    try {
      await ipcRenderer.invoke('menu:voltar')
    } catch {
      this.el('status').textContent = 'Não foi possível voltar ao menu.'
    }
  }

  iniciar = async (): Promise<void> => {
    const hoje = new Date()
    this.el<HTMLInputElement>('mes').value = `${hoje.getFullYear()}-${this.dois(hoje.getMonth() + 1)}`
    this.el<HTMLInputElement>('ano').value = String(hoje.getFullYear())

    this.el('periodo').addEventListener('change', this.alternarPeriodo)
    this.el('mes').addEventListener('change', this.atualizar)
    this.el('ano').addEventListener('change', this.atualizar)
    this.el('exportar').addEventListener('click', this.exportar)
    this.el('voltar').addEventListener('click', this.voltar)

    await this.alternarPeriodo()
  }
}

window.addEventListener('DOMContentLoaded', () => new RelatoriosView().iniciar())
