import { ipcMain } from 'electron'
import { Sessao } from '../Sessao'

export type Feriado = {
  data: string
  nome: string
  tipo?: string
}

export type ResultadoFeriados =
  | { ok: true; ano: number; feriados: Feriado[] }
  | { ok: false; mensagem: string }

export type ResultadoFeriado =
  | { ok: true; data: string; feriado: Feriado | null }
  | { ok: false; mensagem: string }

type BrasilApiFeriado = {
  date?: string
  name?: string
  type?: string
}

export class FeriadoCliente {
  private readonly cache = new Map<number, { expiraEm: number; valor: ResultadoFeriados }>()
  private readonly ttlMs = 24 * 60 * 60 * 1000

  private anoValido = (valor: unknown): number | null => {
    const ano = Number(valor)
    return Number.isInteger(ano) && ano >= 1900 && ano <= 2100 ? ano : null
  }

  private normalizarData = (valor: unknown): string | null => {
    if (typeof valor !== 'string') return null
    const m = valor.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!m) return null

    const ano = Number(m[1])
    const mes = Number(m[2])
    const dia = Number(m[3])
    const data = new Date(Date.UTC(ano, mes - 1, dia))
    if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null
    if (ano < 1900 || ano > 2100) return null
    return `${m[1]}-${m[2]}-${m[3]}`
  }

  private mapear = (item: BrasilApiFeriado): Feriado | null => {
    const data = this.normalizarData(item.date)
    const nome = typeof item.name === 'string' ? item.name.trim() : ''
    if (!data || !nome) return null
    return {
      data,
      nome,
      tipo: typeof item.type === 'string' && item.type.trim() ? item.type.trim() : undefined
    }
  }

  listar = async (anoInformado: unknown): Promise<ResultadoFeriados> => {
    const ano = this.anoValido(anoInformado)
    if (ano === null) return { ok: false, mensagem: 'Informe um ano válido.' }

    const cacheado = this.cache.get(ano)
    if (cacheado && cacheado.expiraEm > Date.now()) return cacheado.valor

    try {
      const resposta = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`, {
        signal: AbortSignal.timeout(8000)
      })
      if (!resposta.ok) {
        return { ok: false, mensagem: 'Não foi possível consultar os feriados no momento.' }
      }

      const dados = (await resposta.json()) as unknown
      if (!Array.isArray(dados)) {
        return { ok: false, mensagem: 'A API de feriados retornou uma resposta inesperada.' }
      }

      const feriados = (dados as BrasilApiFeriado[])
        .map((item) => this.mapear(item))
        .filter((item): item is Feriado => item !== null)
        .sort((a, b) => a.data.localeCompare(b.data))

      const resultado: ResultadoFeriados = { ok: true, ano, feriados }
      this.cache.set(ano, { expiraEm: Date.now() + this.ttlMs, valor: resultado })
      return resultado
    } catch {
      return { ok: false, mensagem: 'Não foi possível consultar os feriados. Verifique a conexão com a internet.' }
    }
  }

  verificar = async (dataInformada: unknown): Promise<ResultadoFeriado> => {
    const data = this.normalizarData(dataInformada)
    if (!data) return { ok: false, mensagem: 'Informe uma data válida no formato AAAA-MM-DD.' }

    const resultado = await this.listar(Number(data.slice(0, 4)))
    if (!resultado.ok) return resultado

    const feriado = resultado.feriados.find((item) => item.data === data) ?? null
    return { ok: true, data, feriado }
  }
}

export class FeriadosIpc {
  constructor(
    private readonly sessao: Sessao,
    private readonly cliente: FeriadoCliente = new FeriadoCliente()
  ) {}

  registrar = (): void => {
    ipcMain.handle('feriados:listar', async (_evento, entrada: unknown): Promise<ResultadoFeriados> => {
      this.sessao.exigir(['admin', 'instrutor'])
      const ano = typeof entrada === 'object' && entrada !== null ? (entrada as { ano?: unknown }).ano : entrada
      return this.cliente.listar(ano)
    })

    ipcMain.handle('feriados:verificar', async (_evento, entrada: unknown): Promise<ResultadoFeriado> => {
      this.sessao.exigir()
      const data = typeof entrada === 'object' && entrada !== null ? (entrada as { data?: unknown }).data : entrada
      if (typeof data !== 'string') return { ok: false, mensagem: 'Informe a data.' }
      return this.cliente.verificar(data)
    })
  }
}
