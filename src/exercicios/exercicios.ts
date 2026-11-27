import { ipcRenderer } from 'electron'
import type { ExercicioExterno, ResultadoExercicio, ResultadoExercicios } from '../integracoes/WgerBackend'

type UsuarioSessao = { perfil: 'admin' | 'instrutor' | 'aluno' }

class ExerciciosView {
  private exercicios: ExercicioExterno[] = []
  private usuario: UsuarioSessao | null = null
  private consulta = 0
  private detalhando = false
  private debounce: number | null = null

  private el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

  private abrirDialogo = (id: string): void => {
    const dialogo = this.el<HTMLDialogElement>(id)
    if (!dialogo.open) dialogo.showModal()
  }

  private criar = (tag: string, classe?: string, texto?: string): HTMLElement => {
    const elemento = document.createElement(tag)
    if (classe) elemento.className = classe
    if (texto !== undefined) elemento.textContent = texto
    return elemento
  }

  private criarImagem = (exercicio: ExercicioExterno, classe: string): HTMLImageElement | null => {
    if (!exercicio.imagemUrl) return null
    const imagem = new Image()
    imagem.className = classe
    imagem.src = exercicio.imagemUrl
    imagem.alt = exercicio.nome
    imagem.loading = 'lazy'
    imagem.referrerPolicy = 'no-referrer'
    return imagem
  }

  private statusPagina = (texto: string, erro = false): void => {
    const elemento = this.el('status')
    elemento.textContent = texto
    elemento.classList.toggle('erro', erro)
  }

  private criarCartao = (exercicio: ExercicioExterno): HTMLElement => {
    const cartao = this.criar('article', 'cartao')
    const titulo = this.criar('h3', 'cartao-titulo', exercicio.nome)
    const metadados = this.criar('div', 'metadados')

    if (exercicio.musculos.length) {
      metadados.append(this.criar('span', 'etiqueta', `Músculos: ${exercicio.musculos.slice(0, 4).join(', ')}`))
    }
    if (exercicio.equipamento.length) {
      metadados.append(this.criar('span', 'etiqueta', `Equipamento: ${exercicio.equipamento.slice(0, 3).join(', ')}`))
    }

    const resumo = this.criar('p', 'resumo', exercicio.descricao || 'Sem descrição disponível na API Wger.')
    const acoes = this.criar('div', 'cartao-acoes')
    const botao = document.createElement('button')
    botao.type = 'button'
    botao.className = 'botao pequeno'
    botao.textContent = 'Ver detalhes'
    botao.addEventListener('click', () => void this.abrirDetalhe(exercicio.id))
    acoes.append(botao)

    const imagem = this.criarImagem(exercicio, 'cartao-imagem')
    cartao.append(titulo)
    if (imagem) cartao.append(imagem)
    cartao.append(metadados, resumo, acoes)
    return cartao
  }

  private renderizar = (): void => {
    const lista = this.el('lista')
    if (!this.exercicios.length) {
      lista.replaceChildren(this.criar('div', 'vazio', 'Nenhum exercício encontrado para esta busca.'))
    } else {
      lista.replaceChildren(...this.exercicios.map(this.criarCartao))
    }
    this.el('contador').textContent = `${this.exercicios.length} exercício(s) encontrado(s) no Wger.`
  }

  private buscar = async (): Promise<void> => {
    const sequencia = ++this.consulta
    const termo = this.el<HTMLInputElement>('termo').value.trim().slice(0, 80)
    const limite = Number(this.el<HTMLSelectElement>('limite').value)
    const botao = this.el<HTMLButtonElement>('buscar')

    botao.disabled = true
    this.statusPagina('Consultando o catálogo Wger...')

    try {
      const resultado = (await ipcRenderer.invoke('exercicios:buscar', {
        termo,
        limite: Number.isInteger(limite) ? limite : 20
      })) as ResultadoExercicios
      if (sequencia !== this.consulta) return

      if (!resultado.ok) {
        this.exercicios = []
        this.renderizar()
        this.statusPagina(resultado.mensagem, true)
        return
      }

      this.exercicios = resultado.exercicios
      this.renderizar()
      this.statusPagina(termo ? `Resultados para "${termo}".` : 'Catálogo carregado da API Wger.')
    } catch (erro) {
      console.error(erro)
      if (sequencia === this.consulta) {
        this.exercicios = []
        this.renderizar()
        this.statusPagina('Não foi possível consultar o catálogo de exercícios.', true)
      }
    } finally {
      if (sequencia === this.consulta) botao.disabled = false
    }
  }

  private preencherDetalhe = (exercicio: ExercicioExterno): void => {
    this.el('detalhe-titulo').textContent = exercicio.nome
    this.el('detalhe-id').textContent = `#${exercicio.id}`
    this.el('detalhe-musculos').textContent = exercicio.musculos.length
      ? exercicio.musculos.join(', ')
      : 'Não informado'
    this.el('detalhe-equipamento').textContent = exercicio.equipamento.length
      ? exercicio.equipamento.join(', ')
      : 'Não informado'
    this.el('detalhe-descricao').textContent = exercicio.descricao || 'Sem descrição disponível na API Wger.'
    const imagem = this.el<HTMLImageElement>('detalhe-imagem')
    imagem.alt = exercicio.nome
    imagem.hidden = !exercicio.imagemUrl
    if (exercicio.imagemUrl) imagem.src = exercicio.imagemUrl
    else imagem.removeAttribute('src')
  }

  private abrirDetalhe = async (id: number): Promise<void> => {
    if (this.detalhando) return

    const dialogo = this.el<HTMLDialogElement>('dialogo-detalhe')
    const areaErro = this.el('detalhe-erro')
    areaErro.textContent = ''
    this.el('detalhe-titulo').textContent = 'Carregando exercício...'
    this.el('detalhe-id').textContent = '—'
    this.el('detalhe-musculos').textContent = '—'
    this.el('detalhe-equipamento').textContent = '—'
    this.el('detalhe-descricao').textContent = ''
    const imagem = this.el<HTMLImageElement>('detalhe-imagem')
    imagem.hidden = true
    imagem.removeAttribute('src')
    if (!dialogo.open) dialogo.showModal()

    this.detalhando = true
    try {
      const resultado = (await ipcRenderer.invoke('exercicios:obter', { id })) as ResultadoExercicio
      if (!resultado.ok) {
        this.el('detalhe-titulo').textContent = 'Exercício'
        areaErro.textContent = resultado.mensagem
        this.statusPagina(resultado.mensagem, true)
        return
      }
      this.preencherDetalhe(resultado.exercicio)
      this.statusPagina('')
    } catch (erro) {
      console.error(erro)
      this.el('detalhe-titulo').textContent = 'Exercício'
      areaErro.textContent = 'Não foi possível carregar os detalhes do exercício.'
      this.statusPagina('Não foi possível carregar os detalhes do exercício.', true)
    } finally {
      this.detalhando = false
    }
  }

  private limpar = (): void => {
    if (this.debounce !== null) window.clearTimeout(this.debounce)
    this.el<HTMLInputElement>('termo').value = ''
    this.el<HTMLSelectElement>('limite').value = '20'
    void this.buscar()
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

    this.el('buscar').addEventListener('click', () => void this.buscar())
    this.el<HTMLInputElement>('termo').addEventListener('keydown', (evento) => {
      if (evento.key === 'Enter') void this.buscar()
    })
    this.el<HTMLInputElement>('termo').addEventListener('input', () => {
      if (this.debounce !== null) window.clearTimeout(this.debounce)
      this.debounce = window.setTimeout(() => void this.buscar(), 400)
    })
    this.el('limite').addEventListener('change', () => void this.buscar())
    this.el('limpar').addEventListener('click', this.limpar)
    this.el('fechar-detalhe').addEventListener('click', () =>
      this.el<HTMLDialogElement>('dialogo-detalhe').close()
    )
    this.el('voltar').addEventListener('click', () => void this.voltar())

    await this.buscar()
  }
}

window.addEventListener('DOMContentLoaded', () => {
  void new ExerciciosView().iniciar()
})
