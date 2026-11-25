import { ipcRenderer } from 'electron'
import type { Feriado, ResultadoFeriado, ResultadoFeriados } from '../integracoes/FeriadosBackend'

type UsuarioSessao = { perfil: 'admin' | 'instrutor' | 'aluno' }

class FeriadosView {
  private feriados: Feriado[] = []
  private usuario: UsuarioSessao | null = null
  private ano = new Date().getFullYear()
  private verificando = false
  private consulta = 0

  private el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

  private criar = (tag: string, classe?: string, texto?: string): HTMLElement => {
    const elemento = document.createElement(tag)
    if (classe) elemento.className = classe
    if (texto !== undefined) elemento.textContent = texto
    return elemento
  }

  private statusPagina = (texto: string, erro = false): void => {
    const elemento = this.el('status')
    elemento.textContent = texto
    elemento.classList.toggle('erro', erro)
  }

  private dataFmt = (valor: string): string => {
    const [ano, mes, dia] = valor.split('-')
    if (!ano || !mes || !dia) return valor
    return `${dia}/${mes}/${ano}`
  }

  private diaSemana = (valor: string): string => {
    const data = new Date(`${valor}T12:00:00`)
    if (Number.isNaN(data.getTime())) return ''
    return data.toLocaleDateString('pt-BR', { weekday: 'long' })
  }

  private tipoTexto = (tipo?: string): string => {
    const tipos: Record<string, string> = {
      national: 'Nacional',
      state: 'Estadual',
      municipal: 'Municipal'
    }
    return tipo ? tipos[tipo] ?? tipo : 'Nacional'
  }

  private criarLinha = (feriado: Feriado): HTMLTableRowElement => {
    const linha = document.createElement('tr')

    const colunaData = document.createElement('td')
    colunaData.className = 'col-data'
    colunaData.append(
      this.criar('strong', undefined, this.dataFmt(feriado.data)),
      this.criar('small', undefined, this.diaSemana(feriado.data))
    )

    const colunaNome = document.createElement('td')
    colunaNome.className = 'col-nome'
    colunaNome.textContent = feriado.nome

    const colunaTipo = document.createElement('td')
    const tipo = feriado.tipo ?? 'national'
    colunaTipo.append(this.criar('span', `selo ${tipo === 'national' ? 'nacional' : ''}`, this.tipoTexto(feriado.tipo)))

    const colunaAcoes = document.createElement('td')
    const botao = document.createElement('button')
    botao.type = 'button'
    botao.className = 'botao secundario pequeno'
    botao.textContent = 'Verificar'
    botao.addEventListener('click', () => void this.verificar(feriado.data))
    colunaAcoes.append(botao)

    linha.append(colunaData, colunaNome, colunaTipo, colunaAcoes)
    return linha
  }

  private renderizar = (): void => {
    const filtro = this.el<HTMLSelectElement>('filtro-tipo').value
    const feriados = filtro
      ? this.feriados.filter((item) => (item.tipo ?? 'national') === filtro)
      : this.feriados
    const corpo = this.el<HTMLTableSectionElement>('corpo')

    if (!feriados.length) {
      const linha = document.createElement('tr')
      const coluna = document.createElement('td')
      coluna.colSpan = 4
      coluna.className = 'vazio'
      coluna.textContent = this.feriados.length ? 'Nenhum feriado com esse tipo.' : 'Nenhum feriado carregado.'
      linha.append(coluna)
      corpo.replaceChildren(linha)
    } else {
      corpo.replaceChildren(...feriados.map(this.criarLinha))
    }

    this.el('resumo').textContent = `${feriados.length} de ${this.feriados.length} feriado(s) em ${this.ano}.`
  }

  private carregar = async (): Promise<void> => {
    const ano = Number(this.el<HTMLInputElement>('ano').value)
    if (!Number.isInteger(ano) || ano < 1900 || ano > 2100) {
      this.statusPagina('Informe um ano válido entre 1900 e 2100.', true)
      return
    }

    const sequencia = ++this.consulta
    const botao = this.el<HTMLButtonElement>('carregar')
    botao.disabled = true
    this.statusPagina('Consultando feriados na BrasilAPI...')

    try {
      const resultado = (await ipcRenderer.invoke('feriados:listar', { ano })) as ResultadoFeriados
      if (sequencia !== this.consulta) return

      if (!resultado.ok) {
        this.feriados = []
        this.el<HTMLTableSectionElement>('corpo').replaceChildren()
        this.el('resumo').textContent = ''
        this.statusPagina(resultado.mensagem, true)
        return
      }

      this.ano = resultado.ano
      this.feriados = resultado.feriados
      this.renderizar()
      this.statusPagina(
        this.feriados.length
          ? 'Feriados carregados da BrasilAPI.'
          : 'A BrasilAPI não retornou feriados para este ano.',
        !this.feriados.length
      )
    } catch (erro) {
      console.error(erro)
      if (sequencia === this.consulta) {
        this.feriados = []
        this.renderizar()
        this.statusPagina('Não foi possível carregar os feriados.', true)
      }
    } finally {
      if (sequencia === this.consulta) botao.disabled = false
    }
  }

  private verificar = async (dataInformada?: string): Promise<void> => {
    if (this.verificando) return

    const campoData = this.el<HTMLInputElement>('data')
    const data = dataInformada ?? campoData.value
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      this.statusPagina('Informe uma data válida.', true)
      return
    }
    campoData.value = data

    const area = this.el('resultado-verificacao')
    const botao = this.el<HTMLButtonElement>('verificar')
    this.verificando = true
    botao.disabled = true
    area.className = 'resultado'
    area.textContent = 'Consultando a BrasilAPI...'

    try {
      const resultado = (await ipcRenderer.invoke('feriados:verificar', { data })) as ResultadoFeriado
      if (!resultado.ok) {
        area.className = 'resultado erro'
        area.textContent = resultado.mensagem
        this.statusPagina(resultado.mensagem, true)
        return
      }

      if (!resultado.feriado) {
        area.className = 'resultado'
        area.textContent = `${this.dataFmt(data)} não é feriado.`
        this.statusPagina('')
        return
      }

      area.className = 'resultado encontrado'
      area.textContent = `${this.dataFmt(data)} — ${resultado.feriado.nome} (${this.tipoTexto(resultado.feriado.tipo)})`
      this.statusPagina('')
    } catch (erro) {
      console.error(erro)
      area.className = 'resultado erro'
      area.textContent = 'Não foi possível verificar a data.'
      this.statusPagina('Não foi possível verificar a data.', true)
    } finally {
      this.verificando = false
      botao.disabled = false
    }
  }

  private voltar = async (): Promise<void> => {
    try {
      await ipcRenderer.invoke('menu:voltar')
    } catch (erro) {
      console.error(erro)
      this.statusPagina('Não foi possível voltar ao menu.', true)
    }
  }

  iniciar = async (): Promise<void> => {
    try {
      this.usuario = (await ipcRenderer.invoke('auth:me')) as UsuarioSessao | null
    } catch (erro) {
      console.error(erro)
      this.usuario = null
    }

    const perfis: UsuarioSessao['perfil'][] = ['admin', 'instrutor']
    if (!this.usuario || !perfis.includes(this.usuario.perfil)) {
      this.statusPagina('Acesso negado para este perfil.', true)
      return
    }

    const hoje = new Date()
    const dataHoje = [
      hoje.getFullYear(),
      String(hoje.getMonth() + 1).padStart(2, '0'),
      String(hoje.getDate()).padStart(2, '0')
    ].join('-')

    this.el<HTMLInputElement>('ano').value = String(this.ano)
    this.el<HTMLInputElement>('data').value = dataHoje

    this.el('carregar').addEventListener('click', () => void this.carregar())
    this.el<HTMLInputElement>('ano').addEventListener('keydown', (evento) => {
      if (evento.key === 'Enter') void this.carregar()
    })
    this.el('filtro-tipo').addEventListener('change', this.renderizar)
    this.el('verificar').addEventListener('click', () => void this.verificar())
    this.el('voltar').addEventListener('click', () => void this.voltar())

    await this.carregar()
  }
}

window.addEventListener('DOMContentLoaded', () => {
  void new FeriadosView().iniciar()
})
