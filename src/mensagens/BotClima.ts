import { app } from 'electron'
import { registrarCanal } from '../SegurancaIpc'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import 'dotenv/config'
import { Sessao } from '../Sessao'
import { ResultadoEnvioEmail } from '../integracoes/EmailBackend'
import { Mensagem, MensagemServico, ResultadoVerificacao } from './MensagemBackend'

/**
 * Variável de ambiente que desliga o agendamento automático em qualquer
 * processo (app Electron ou clima-servidor). Valores vazios ou inválidos
 * mantêm o comportamento padrão, que é permitir o agendamento.
 */
const agendamentoHabilitado = (): boolean => {
  const valor = (process.env.CLIMA_BOT_ATIVO ?? '').trim().toLowerCase()
  return !['false', '0', 'no', 'off', 'nao', 'não'].includes(valor)
}

export type ConfiguracaoBot = {
  ativo: boolean
  intervaloMinutos: number
  limiarChuva: number
  ultimaDataAviso?: string
}

export type EstadoBot = {
  ativo: boolean
  intervaloMinutos: number
  limiarChuva: number
  verificando: boolean
  emailConfigurado: boolean
  emailRemetente?: string
  ultimaVerificacaoEm?: string
  proximaVerificacaoEm?: string
  ultimoResultado?: ResultadoVerificacao
  mensagens: Mensagem[]
}

export class ConfiguracaoBotArquivo {
  constructor(
    private readonly caminho: string = join(app.getPath('userData'), 'bot-clima.json'),
    private readonly ativoPadrao = false
  ) {}

  private numero = (valor: unknown): number => {
    const numero = Number(valor)
    return Number.isFinite(numero) ? numero : 30
  }

  private limiarPadrao = (): number => {
    const numero = Number(process.env.CLIMA_LIMIAR_CHUVA ?? 50)
    return Number.isFinite(numero) ? Math.min(100, Math.max(0, Math.round(numero))) : 50
  }

  private limiar = (valor: unknown): number => {
    const numero = Number(valor)
    return Number.isFinite(numero) ? Math.min(100, Math.max(0, Math.round(numero))) : this.limiarPadrao()
  }

  carregar = (): ConfiguracaoBot => {
    try {
      const dados = JSON.parse(readFileSync(this.caminho, 'utf8')) as Partial<ConfiguracaoBot>
      return {
        ativo: dados.ativo === true,
        intervaloMinutos: this.numero(dados.intervaloMinutos),
        limiarChuva: this.limiar(dados.limiarChuva),
        ultimaDataAviso: typeof dados.ultimaDataAviso === 'string' ? dados.ultimaDataAviso : undefined
      }
    } catch {
      return { ativo: this.ativoPadrao, intervaloMinutos: 30, limiarChuva: this.limiarPadrao() }
    }
  }

  salvar = (configuracao: ConfiguracaoBot): void => {
    try {
      writeFileSync(this.caminho, JSON.stringify(configuracao, null, 2), 'utf8')
    } catch {
      // A configuração é uma conveniência; uma falha de escrita não deve interromper o bot.
    }
  }
}

export class BotClimaServico {
  private ativoDesejado: boolean
  private intervaloMinutos: number
  private limiarChuva: number
  private ultimaDataAviso?: string
  private timer: NodeJS.Timeout | null = null
  private verificando = false
  private ultimaVerificacaoEm?: string
  private proximaVerificacaoEm?: string
  private ultimoResultado?: ResultadoVerificacao

  constructor(
    private readonly mensagens: MensagemServico = new MensagemServico(),
    private readonly configuracao: ConfiguracaoBotArquivo = new ConfiguracaoBotArquivo()
  ) {
    const salva = this.configuracao.carregar()
    this.ativoDesejado = salva.ativo
    this.intervaloMinutos = this.normalizarIntervalo(salva.intervaloMinutos)
    this.limiarChuva = this.normalizarLimiar(salva.limiarChuva)
    this.ultimaDataAviso = salva.ultimaDataAviso
    if (this.ultimaDataAviso) this.mensagens.marcarAvisoAnterior(this.ultimaDataAviso)
  }

  /** Estado efetivo: a preferência salva só agenda se a variável permitir. */
  private get ativo(): boolean {
    return this.ativoDesejado && agendamentoHabilitado()
  }

  private normalizarIntervalo = (valor: unknown): number => {
    const numero = Number(valor)
    if (!Number.isFinite(numero)) return 30
    return Math.min(1440, Math.max(1, Math.round(numero)))
  }

  private normalizarLimiar = (valor: unknown): number => {
    const numero = Number(valor)
    if (!Number.isFinite(numero)) return 50
    return Math.min(100, Math.max(0, Math.round(numero)))
  }

  private salvar = (): void => {
    this.configuracao.salvar({
      ativo: this.ativoDesejado,
      intervaloMinutos: this.intervaloMinutos,
      limiarChuva: this.limiarChuva,
      ultimaDataAviso: this.ultimaDataAviso
    })
  }

  private agendar = (): void => {
    if (this.timer) clearInterval(this.timer)
    this.timer = null

    if (!this.ativo) {
      this.proximaVerificacaoEm = undefined
      return
    }

    this.proximaVerificacaoEm = new Date(Date.now() + this.intervaloMinutos * 60_000).toISOString()
    this.timer = setInterval(() => {
      void this.verificar()
    }, this.intervaloMinutos * 60_000)
    this.timer.unref?.()
  }

  iniciar = (): void => {
    if (!this.ativo) return
    this.agendar()
    void this.verificar()
  }

  encerrar = (): void => {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  estado = (): EstadoBot => ({
    ativo: this.ativo,
    intervaloMinutos: this.intervaloMinutos,
    limiarChuva: this.limiarChuva,
    verificando: this.verificando,
    emailConfigurado: this.mensagens.emailConfigurado(),
    emailRemetente: this.mensagens.emailRemetente() || undefined,
    ultimaVerificacaoEm: this.ultimaVerificacaoEm,
    proximaVerificacaoEm: this.proximaVerificacaoEm,
    ultimoResultado: this.ultimoResultado,
    mensagens: this.mensagens.listar()
  })

  definirAtivo = async (ativo: boolean): Promise<EstadoBot> => {
    this.ativoDesejado = ativo
    this.salvar()

    if (!ativo) {
      this.agendar()
      return this.estado()
    }

    this.agendar()
    return this.verificar()
  }

  definirIntervalo = (valor: unknown): EstadoBot => {
    this.intervaloMinutos = this.normalizarIntervalo(valor)
    this.salvar()
    this.agendar()
    return this.estado()
  }

  definirLimiar = (valor: unknown): EstadoBot => {
    this.limiarChuva = this.normalizarLimiar(valor)
    this.salvar()
    return this.estado()
  }

  testarEmail = async (destinatario: string): Promise<ResultadoEnvioEmail> =>
    this.mensagens.testarEmail(destinatario)

  verificar = async (): Promise<EstadoBot> => {
    if (this.verificando) return this.estado()

    this.verificando = true
    try {
      const resultado = await this.mensagens.verificar(this.limiarChuva)
      this.ultimoResultado = resultado
      this.ultimaVerificacaoEm = new Date().toISOString()

      if (resultado.ok && resultado.consolidar) {
        this.ultimaDataAviso = resultado.previsao.data
        this.salvar()
      }
    } catch {
      this.ultimoResultado = {
        ok: false,
        mensagem: 'Não foi possível verificar o clima.',
        historico: this.mensagens.listar()
      }
      this.ultimaVerificacaoEm = new Date().toISOString()
    } finally {
      this.verificando = false
      if (this.ativo) this.agendar()
      else this.proximaVerificacaoEm = undefined
    }

    return this.estado()
  }
}

export class BotClimaIpc {
  constructor(
    private readonly sessao: Sessao,
    private readonly bot: BotClimaServico
  ) {}

  registrar = (): void => {
    registrarCanal('bot:estado', (): EstadoBot => {
      this.sessao.exigir(['admin', 'instrutor'])
      return this.bot.estado()
    })

    registrarCanal('bot:verificar', async (): Promise<EstadoBot> => {
      this.sessao.exigir(['admin', 'instrutor'])
      return this.bot.verificar()
    })

    registrarCanal('bot:definir-ativo', async (_evento, ativo: unknown): Promise<EstadoBot> => {
      this.sessao.exigir(['admin', 'instrutor'])
      if (typeof ativo !== 'boolean') throw new Error('Valor inválido')
      return this.bot.definirAtivo(ativo)
    })

    registrarCanal('bot:definir-intervalo', (_evento, intervalo: unknown): EstadoBot => {
      this.sessao.exigir(['admin', 'instrutor'])
      return this.bot.definirIntervalo(intervalo)
    })

    registrarCanal('bot:definir-limiar', (_evento, limiar: unknown): EstadoBot => {
      this.sessao.exigir(['admin'])
      return this.bot.definirLimiar(limiar)
    })

    registrarCanal('bot:testar-email', async (): Promise<ResultadoEnvioEmail> => {
      this.sessao.exigir(['admin'])
      const destino = (process.env.SMTP_TESTE_DESTINATARIO ?? process.env.SMTP_USER ?? '').trim()
      if (!destino) throw new Error('Defina SMTP_TESTE_DESTINATARIO no arquivo .env.')
      return this.bot.testarEmail(destino)
    })
  }
}
