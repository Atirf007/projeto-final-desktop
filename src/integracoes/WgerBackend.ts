import { ipcMain } from 'electron'
import { Sessao } from '../Sessao'

export type ExercicioExterno = {
  id: number
  nome: string
  descricao: string
  musculos: string[]
  equipamento: string[]
  imagemUrl?: string
}

export type ResultadoExercicios =
  | { ok: true; exercicios: ExercicioExterno[] }
  | { ok: false; mensagem: string }

export type ResultadoExercicio =
  | { ok: true; exercicio: ExercicioExterno }
  | { ok: false; mensagem: string }

type WgerTraducao = {
  language?: number
  name?: string
  description?: string
}

type WgerItem = {
  id?: number
  translations?: WgerTraducao[]
  muscles?: { name?: string }[]
  equipment?: { name?: string }[]
  images?: { image?: string }[]
}

const BASE_URL = 'https://wger.de/api/v2'
const LIMITE_API = 60

export class WgerCliente {
  private cache: { expiraEm: number; valor: ExercicioExterno[] } | null = null
  private readonly ttlMs = 30 * 60 * 1000

  private limparHtml = (valor: unknown): string =>
    String(valor ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim()

  private normalizarTexto = (valor: string): string =>
    valor
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()

  private escolherTraducao = (item: WgerItem): WgerTraducao | null => {
    const traducoes = Array.isArray(item.translations) ? item.translations : []
    const comNome = traducoes.filter((traducao) => typeof traducao.name === 'string' && traducao.name.trim())
    if (!comNome.length) return null

    return comNome.find((traducao) => traducao.language === 7 || traducao.language === 9)
      ?? comNome.find((traducao) => traducao.language === 2)
      ?? comNome[0]
  }

  private imagem = (url: unknown): string | undefined => {
    if (typeof url !== 'string' || !url.trim()) return undefined
    return url.startsWith('http') ? url : `${BASE_URL.replace('/api/v2', '')}${url}`
  }

  private mapear = (item: WgerItem): ExercicioExterno | null => {
    const id = Number(item.id)
    if (!Number.isInteger(id) || id <= 0) return null

    const traducao = this.escolherTraducao(item)
    const nome = this.limparHtml(traducao?.name)
    if (!nome) return null

    const musculos = (Array.isArray(item.muscles) ? item.muscles : [])
      .map((musculo) => this.limparHtml(musculo?.name))
      .filter(Boolean)

    const equipamento = (Array.isArray(item.equipment) ? item.equipment : [])
      .map((equipamento) => this.limparHtml(equipamento?.name))
      .filter(Boolean)

    return {
      id,
      nome,
      descricao: this.limparHtml(traducao?.description).slice(0, 600),
      musculos,
      equipamento,
      imagemUrl: this.imagem(item.images?.[0]?.image)
    }
  }

  private carregar = async (): Promise<ResultadoExercicios> => {
    if (this.cache && this.cache.expiraEm > Date.now()) {
      return { ok: true, exercicios: this.cache.valor }
    }

    try {
      const resposta = await fetch(`${BASE_URL}/exerciseinfo/?limit=${LIMITE_API}`, {
        signal: AbortSignal.timeout(8000)
      })
      if (!resposta.ok) {
        return { ok: false, mensagem: 'Não foi possível consultar o catálogo de exercícios no momento.' }
      }

      const dados = (await resposta.json()) as { results?: WgerItem[] }
      const itens = Array.isArray(dados.results) ? dados.results : []
      const exercicios = itens
        .map((item) => this.mapear(item))
        .filter((item): item is ExercicioExterno => item !== null)

      if (!exercicios.length) {
        return { ok: false, mensagem: 'O catálogo de exercícios não retornou dados.' }
      }

      this.cache = { expiraEm: Date.now() + this.ttlMs, valor: exercicios }
      return { ok: true, exercicios }
    } catch {
      return {
        ok: false,
        mensagem: 'Não foi possível consultar o catálogo de exercícios. Verifique a conexão com a internet.'
      }
    }
  }

  buscar = async (termoInformado: string, limiteInformado: number): Promise<ResultadoExercicios> => {
    const resultado = await this.carregar()
    if (!resultado.ok) return resultado

    const limite = Number.isInteger(limiteInformado) && limiteInformado > 0 ? Math.min(limiteInformado, 50) : 20
    const termo = this.normalizarTexto(termoInformado.trim())
    const encontrados = termo
      ? resultado.exercicios.filter((exercicio) =>
          this.normalizarTexto(`${exercicio.nome} ${exercicio.descricao} ${exercicio.musculos.join(' ')} ${exercicio.equipamento.join(' ')}`).includes(termo)
        )
      : resultado.exercicios

    return { ok: true, exercicios: encontrados.slice(0, limite) }
  }

  obter = async (id: number): Promise<ResultadoExercicio> => {
    const resultado = await this.buscar('', LIMITE_API)
    if (!resultado.ok) return resultado

    const exercicio = resultado.exercicios.find((item) => item.id === id)
    if (!exercicio) return { ok: false, mensagem: 'Exercício não encontrado no catálogo.' }
    return { ok: true, exercicio }
  }
}

export class WgerIpc {
  constructor(
    private readonly sessao: Sessao,
    private readonly cliente: WgerCliente = new WgerCliente()
  ) {}

  registrar = (): void => {
    ipcMain.handle('exercicios:buscar', async (_evento, entrada: unknown): Promise<ResultadoExercicios> => {
      this.sessao.exigir(['admin', 'instrutor'])

      const dados = typeof entrada === 'object' && entrada !== null ? (entrada as Record<string, unknown>) : {}
      const termo = typeof dados.termo === 'string' ? dados.termo.trim().slice(0, 80) : ''
      const limite = Number(dados.limite)

      return this.cliente.buscar(termo, Number.isInteger(limite) ? limite : 20)
    })

    ipcMain.handle('exercicios:obter', async (_evento, entrada: unknown): Promise<ResultadoExercicio> => {
      this.sessao.exigir(['admin', 'instrutor'])

      const dados = typeof entrada === 'object' && entrada !== null ? (entrada as Record<string, unknown>) : {}
      const id = typeof entrada === 'number' ? entrada : Number(dados.id)
      if (!Number.isInteger(id) || id <= 0) return { ok: false, mensagem: 'Exercício inválido.' }

      return this.cliente.obter(id)
    })
  }
}
