import { app } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  AgendadorVencimento,
  DIAS_ANTES_PADRAO,
  EstadoAgendadorVencimento,
  NotificacaoServico,
  ResultadoEnvioVencimentos
} from './NotificacaoBackend'

export type ConfiguracaoVencimento = {
  diasAntes: number
  ultimaExecucaoEm?: string
}

export class ConfiguracaoVencimentoArquivo {
  constructor(private readonly caminho: string = join(app.getPath('userData'), 'bot-vencimento.json')) {}

  carregar = (): ConfiguracaoVencimento => {
    try {
      const dados = JSON.parse(readFileSync(this.caminho, 'utf8')) as Partial<ConfiguracaoVencimento>
      const dias = Number(dados.diasAntes)
      return {
        diasAntes:
          Number.isFinite(dias) && dias >= 1 && dias <= 60 ? Math.round(dias) : DIAS_ANTES_PADRAO,
        ultimaExecucaoEm:
          typeof dados.ultimaExecucaoEm === 'string' ? dados.ultimaExecucaoEm : undefined
      }
    } catch {
      return { diasAntes: DIAS_ANTES_PADRAO }
    }
  }

  salvar = (configuracao: ConfiguracaoVencimento): void => {
    try {
      writeFileSync(this.caminho, JSON.stringify(configuracao, null, 2), 'utf8')
    } catch {
      // A configuração é uma conveniência; uma falha de escrita não deve interromper o bot.
    }
  }
}

const INTERVALO_MS = 24 * 60 * 60 * 1000

const diaLocal = (iso?: string): string | null => {
  if (!iso) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const data = new Date(iso)
  if (Number.isNaN(data.getTime())) return iso.slice(0, 10)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}`
}

export class BotVencimentoServico implements AgendadorVencimento {
  private diasAntes: number
  private ultimaExecucaoEm?: string
  private proximaExecucaoEm?: string
  private timer: NodeJS.Timeout | null = null
  private executando = false
  private ultimoResultado?: ResultadoEnvioVencimentos

  constructor(
    private readonly servico: NotificacaoServico = new NotificacaoServico(),
    private readonly configuracao: ConfiguracaoVencimentoArquivo = new ConfiguracaoVencimentoArquivo()
  ) {
    const salva = this.configuracao.carregar()
    this.diasAntes = salva.diasAntes
    this.ultimaExecucaoEm = salva.ultimaExecucaoEm
  }

  private salvar = (): void => {
    this.configuracao.salvar({
      diasAntes: this.diasAntes,
      ultimaExecucaoEm: this.ultimaExecucaoEm
    })
  }

  private agendar = (): void => {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.proximaExecucaoEm = new Date(Date.now() + INTERVALO_MS).toISOString()
    this.timer = setInterval(() => {
      void this.executar()
    }, INTERVALO_MS)
    this.timer.unref?.()
  }

  iniciar = (): void => {
    this.agendar()
    void this.executar()
  }

  encerrar = (): void => {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.proximaExecucaoEm = undefined
  }

  estado = (): EstadoAgendadorVencimento => ({
    ativo: this.timer !== null,
    diasAntes: this.diasAntes,
    executando: this.executando,
    ultimaExecucaoEm: this.ultimaExecucaoEm,
    proximaExecucaoEm: this.proximaExecucaoEm,
    ultimoResultado: this.ultimoResultado
  })

  executar = async (): Promise<EstadoAgendadorVencimento> => {
    if (this.executando) return this.estado()

    const hoje = diaLocal(new Date().toISOString())
    if (diaLocal(this.ultimaExecucaoEm) === hoje) {
      this.agendar()
      return this.estado()
    }

    this.executando = true
    try {
      const resultado = await this.servico.enviarVencimentos(this.diasAntes)
      this.ultimoResultado = resultado
      if (resultado.configurado) {
        this.ultimaExecucaoEm = new Date().toISOString()
        this.salvar()
      }
    } catch (erro) {
      console.error('[bot-vencimento]', erro)
      this.ultimoResultado = {
        configurado: this.servico.emailConfigurado(),
        total: 0,
        enviados: 0,
        semEmail: 0,
        falhas: [],
        notificacoes: []
      }
    } finally {
      this.executando = false
      this.agendar()
    }

    return this.estado()
  }
}
