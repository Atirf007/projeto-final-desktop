import { ipcMain } from 'electron'
import { Sessao } from '../Sessao'

export type EnderecoCep = {
  cep: string
  logradouro: string
  bairro: string
  cidade: string
  estado: string
}

type ViaCepResposta = {
  cep?: string
  logradouro?: string
  bairro?: string
  localidade?: string
  uf?: string
  erro?: boolean | string
}

export type ResultadoCep = { ok: true; endereco: EnderecoCep } | { ok: false; mensagem: string }

class ViaCepClient {
  private readonly cache = new Map<string, { expiraEm: number; valor: EnderecoCep }>()
  private readonly ttlMs = 24 * 60 * 60 * 1000

  private normalizar = (cep: string): string | null => {
    const digitos = cep.replace(/\D/g, '')
    return /^\d{8}$/.test(digitos) ? digitos : null
  }

  buscar = async (entrada: string): Promise<ResultadoCep> => {
    const cep = this.normalizar(entrada)
    if (!cep) return { ok: false, mensagem: 'Informe um CEP válido com 8 dígitos.' }

    const cacheado = this.cache.get(cep)
    if (cacheado && cacheado.expiraEm > Date.now()) return { ok: true, endereco: cacheado.valor }

    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
        signal: AbortSignal.timeout(8000)
      })
      if (!resposta.ok) return { ok: false, mensagem: 'Não foi possível consultar o CEP no momento.' }

      const dados = (await resposta.json()) as ViaCepResposta
      if (dados.erro) return { ok: false, mensagem: 'CEP não encontrado.' }

      const endereco: EnderecoCep = {
        cep,
        logradouro: String(dados.logradouro ?? ''),
        bairro: String(dados.bairro ?? ''),
        cidade: String(dados.localidade ?? ''),
        estado: String(dados.uf ?? '')
      }

      this.cache.set(cep, { expiraEm: Date.now() + this.ttlMs, valor: endereco })
      return { ok: true, endereco }
    } catch {
      return { ok: false, mensagem: 'Não foi possível consultar o CEP. Verifique a conexão com a internet.' }
    }
  }
}

export class CepIpc {
  constructor(
    private readonly sessao: Sessao,
    private readonly cliente: ViaCepClient = new ViaCepClient()
  ) {}

  registrar = (): void => {
    ipcMain.handle('cep:buscar', async (_evento, entrada: unknown): Promise<ResultadoCep> => {
      this.sessao.exigir(['admin', 'instrutor', 'aluno'])
      const cep = typeof entrada === 'string' ? entrada : (entrada as { cep?: unknown } | null)?.cep
      if (typeof cep !== 'string') return { ok: false, mensagem: 'Informe o CEP.' }
      return this.cliente.buscar(cep)
    })
  }
}
