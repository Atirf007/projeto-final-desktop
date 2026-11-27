import { ipcRenderer } from 'electron'
import type { ExercicioExterno, ResultadoExercicios } from '../integracoes/WgerBackend'

type ElementosSugestoes = {
  origem: HTMLElement
  lista: HTMLElement
  mensagem: HTMLElement
  atualizar: HTMLButtonElement
}

const LIMITE_SUGESTOES = 5

export class SugestoesExercicios {
  private sequencia = 0
  private termo = ''

  constructor(private readonly elementos: ElementosSugestoes) {}

  private criar = (tag: string, classe?: string, texto?: string): HTMLElement => {
    const elemento = document.createElement(tag)
    if (classe) elemento.className = classe
    if (texto !== undefined) elemento.textContent = texto
    return elemento
  }

  private criarImagem = (exercicio: ExercicioExterno): HTMLImageElement | null => {
    if (!exercicio.imagemUrl) return null
    const imagem = new Image()
    imagem.className = 'sugestao-imagem'
    imagem.src = exercicio.imagemUrl
    imagem.alt = exercicio.nome
    imagem.loading = 'lazy'
    imagem.referrerPolicy = 'no-referrer'
    return imagem
  }

  private criarCartao = (exercicio: ExercicioExterno): HTMLElement => {
    const cartao = this.criar('article', 'sugestao')
    const titulo = this.criar('strong', 'sugestao-titulo', exercicio.nome)
    const metadados = this.criar('div', 'sugestao-metadados')

    if (exercicio.musculos.length) {
      metadados.append(this.criar('span', 'etiqueta', `Músculos: ${exercicio.musculos.slice(0, 3).join(', ')}`))
    }
    if (exercicio.equipamento.length) {
      metadados.append(this.criar('span', 'etiqueta', `Equipamento: ${exercicio.equipamento.slice(0, 2).join(', ')}`))
    }

    const resumo = this.criar(
      'p',
      'sugestao-resumo',
      exercicio.descricao || 'Sem descrição disponível na API Wger.'
    )
    const imagem = this.criarImagem(exercicio)
    cartao.append(titulo)
    if (imagem) cartao.append(imagem)
    cartao.append(metadados, resumo)
    return cartao
  }

  private renderizar = (exercicios: ExercicioExterno[]): void => {
    if (!exercicios.length) {
      this.elementos.lista.replaceChildren(this.criar('p', 'inscrito-vazio', 'Nenhum exercício sugerido encontrado.'))
      return
    }
    this.elementos.lista.replaceChildren(...exercicios.map(this.criarCartao))
  }

  private buscar = async (termo: string): Promise<ResultadoExercicios> => {
    try {
      return (await ipcRenderer.invoke('exercicios:buscar', {
        termo,
        limite: LIMITE_SUGESTOES
      })) as ResultadoExercicios
    } catch (erro) {
      console.error(erro)
      return { ok: false, mensagem: 'Não foi possível consultar sugestões de exercícios no Wger.' }
    }
  }

  carregar = async (termoInformado: string = this.termo): Promise<void> => {
    const termo = String(termoInformado ?? '').trim().slice(0, 80)
    this.termo = termo
    const sequencia = ++this.sequencia
    const botao = this.elementos.atualizar

    botao.disabled = true
    this.elementos.lista.replaceChildren()
    this.elementos.origem.textContent = ''
    this.elementos.mensagem.textContent = 'Consultando sugestões no Wger...'

    try {
      let resultado = await this.buscar(termo)
      if (sequencia !== this.sequencia) return

      let geral = false
      if (resultado.ok && !resultado.exercicios.length && termo) {
        resultado = await this.buscar('')
        geral = true
        if (sequencia !== this.sequencia) return
      }

      if (!resultado.ok) {
        this.elementos.mensagem.textContent = resultado.mensagem
        return
      }

      this.elementos.origem.textContent = geral
        ? `Sem resultados para "${termo}": exercícios gerais do catálogo.`
        : termo
          ? `Exercícios relacionados a "${termo}".`
          : 'Exercícios do catálogo Wger.'
      this.renderizar(resultado.exercicios)
      this.elementos.mensagem.textContent = ''
    } finally {
      if (sequencia === this.sequencia) botao.disabled = false
    }
  }

  registrar = (): void => {
    this.elementos.atualizar.addEventListener('click', () => void this.carregar())
  }
}
