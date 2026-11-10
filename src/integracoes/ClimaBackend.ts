import 'dotenv/config'
import { ipcMain } from 'electron'
import { Sessao } from '../Sessao'

export type PrevisaoClima = {
  data: string
  temperaturaMinC: number
  temperaturaMaxC: number
  probabilidadeChuva: number
  precipitacaoMm: number
  codigoClima: number
  descricao: string
  vaiChover: boolean
}

export type ResultadoClima =
  | { ok: true; local: string; previsao: PrevisaoClima }
  | { ok: false; mensagem: string }

type RespostaOpenMeteo = {
  daily?: {
    time?: string[]
    weather_code?: number[]
    temperature_2m_max?: number[]
    temperature_2m_min?: number[]
    precipitation_probability_max?: number[]
    precipitation_sum?: number[]
  }
}

const CODIGOS_CHUVA = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99])

const DESCRICOES: Record<number, string> = {
  0: 'Céu limpo',
  1: 'Predominantemente limpo',
  2: 'Parcialmente nublado',
  3: 'Nublado',
  45: 'Neblina',
  48: 'Neblina com geada',
  51: 'Garoa leve',
  53: 'Garoa moderada',
  55: 'Garoa intensa',
  56: 'Garoa congelante leve',
  57: 'Garoa congelante intensa',
  61: 'Chuva leve',
  63: 'Chuva moderada',
  65: 'Chuva intensa',
  66: 'Chuva congelante leve',
  67: 'Chuva congelante intensa',
  71: 'Neve leve',
  73: 'Neve moderada',
  75: 'Neve intensa',
  77: 'Grãos de neve',
  80: 'Pancadas de chuva leves',
  81: 'Pancadas de chuva moderadas',
  82: 'Pancadas de chuva intensas',
  85: 'Pancadas de neve leves',
  86: 'Pancadas de neve intensas',
  95: 'Trovoada',
  96: 'Trovoada com granizo leve',
  99: 'Trovoada com granizo intenso'
}

export class OpenMeteoClient {
  private cache: { expiraEm: number; valor: ResultadoClima } | null = null
  private readonly ttlMs = 30 * 60 * 1000
  private readonly latitude: number
  private readonly longitude: number
  readonly local: string

  constructor() {
    const latitude = Number(process.env.CLIMA_LATITUDE ?? -22.5645)
    const longitude = Number(process.env.CLIMA_LONGITUDE ?? -47.4017)

    this.latitude = Number.isFinite(latitude) ? latitude : -22.5645
    this.longitude = Number.isFinite(longitude) ? longitude : -47.4017
    this.local = process.env.CLIMA_CIDADE ?? 'Limeira - SP'
  }

  private numero = (valor: unknown): number => {
    const numero = Number(valor)
    return Number.isFinite(numero) ? numero : 0
  }

  private limiarChuva = (): number => {
    const limite = Number(process.env.CLIMA_LIMIAR_CHUVA ?? 50)
    return Number.isFinite(limite) ? limite : 50
  }

  private previsaoDeAmanha = (dados: RespostaOpenMeteo): PrevisaoClima | null => {
    const diario = dados.daily
    const datas = diario?.time
    if (!diario || !datas || datas.length === 0) return null

    const indice = datas.length > 1 ? 1 : 0
    const codigo = this.numero(diario.weather_code?.[indice])
    const probabilidade = this.numero(diario.precipitation_probability_max?.[indice])
    const precipitacao = this.numero(diario.precipitation_sum?.[indice])

    return {
      data: datas[indice],
      temperaturaMinC: this.numero(diario.temperature_2m_min?.[indice]),
      temperaturaMaxC: this.numero(diario.temperature_2m_max?.[indice]),
      probabilidadeChuva: probabilidade,
      precipitacaoMm: precipitacao,
      codigoClima: codigo,
      descricao: DESCRICOES[codigo] ?? 'Condição não identificada',
      vaiChover: probabilidade >= this.limiarChuva() || precipitacao > 0 || CODIGOS_CHUVA.has(codigo)
    }
  }

  buscar = async (): Promise<ResultadoClima> => {
    if (this.cache && this.cache.expiraEm > Date.now()) return this.cache.valor

    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude', String(this.latitude))
    url.searchParams.set('longitude', String(this.longitude))
    url.searchParams.set(
      'daily',
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum'
    )
    url.searchParams.set('timezone', 'America/Sao_Paulo')
    url.searchParams.set('forecast_days', '2')

    try {
      const resposta = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!resposta.ok) {
        return { ok: false, mensagem: 'Não foi possível consultar a previsão do tempo no momento.' }
      }

      const dados = (await resposta.json()) as RespostaOpenMeteo
      const previsao = this.previsaoDeAmanha(dados)
      if (!previsao) return { ok: false, mensagem: 'A previsão do tempo não retornou dados para amanhã.' }

      const resultado: ResultadoClima = { ok: true, local: this.local, previsao }
      this.cache = { expiraEm: Date.now() + this.ttlMs, valor: resultado }
      return resultado
    } catch {
      return {
        ok: false,
        mensagem: 'Não foi possível consultar a previsão do tempo. Verifique a conexão com a internet.'
      }
    }
  }
}

export class ClimaIpc {
  constructor(
    private readonly sessao: Sessao,
    private readonly cliente: OpenMeteoClient = new OpenMeteoClient()
  ) {}

  registrar = (): void => {
    ipcMain.handle('clima:previsao', async (): Promise<ResultadoClima> => {
      this.sessao.exigir(['admin', 'instrutor'])
      return this.cliente.buscar()
    })
  }
}
