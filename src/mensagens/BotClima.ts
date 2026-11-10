import { app, ipcMain } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { Sessao } from '../Sessao'
import { Mensagem, MensagemServico, ResultadoVerificacao } from './MensagemBackend'

export type ConfiguracaoBot = {
  ativo: boolean
  intervaloMinutos: number
  ultimaDataAviso?: string
}

export type EstadoBot = {
  ativo: boolean
  intervaloMinutos: number
  verificando: boolean
  emailConfigurado: boolean
  emailRemetente?: string
  ultimaVerificacaoEm?: string
  proximaVerificacaoEm?: string
  ultimoResultado?: ResultadoVerificacao
  mensagens: Mensagem[]
}

export class ConfiguracaoBotArquivo {
  constructor(private readonly caminho: string = join(app.getPath('userData'), 'bot-clima.json')) {}

  private numero = (valor: unknown): number => {
    const numero = Number(valor)
    return Number.isFinite(numero) ? numero : 30
  }

  carregar = (): ConfiguracaoBot => {
    try {
      const dados = JSON.parse(readFileSync(this.caminho, 'utf8')) as Partial<ConfiguracaoBot>
      return {
        ativo: dados.ativo === true,
        intervaloMinutos: this.numero(dados.intervaloMinutos),
        ultimaDataAviso: typeof dados.ultimaDataAviso === 'string' ? dados.ultimaDataAviso : undefined
      }
    } catch {
      return { ativo: false, intervaloMinutos: 30 }
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
  private ativo: boolean
  private intervaloMinutos: number
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
    this.ativo = salva.ativo
    this.intervaloMinutos = this.normalizarIntervalo(salva.intervaloMinutos)
    this.ultimaDataAviso = salva.ultimaDataAviso
    if (this.ultimaDataAviso) this.mensagens.marcarAvisoAnterior(this.ultimaDataAviso)
  }

  private normalizarIntervalo = (valor: unknown): number => {
    const numero = Number(valor)
    if (!Number.isFinite(numero)) return 30
    return Math.min(1440, Math.max(1, Math.round(numero)))
  }

  private salvar = (): void => {
    this.configuracao.salvar({
      ativo: this.ativo,
      intervaloMinutos: this.intervaloMinutos,
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
    verificando: this.verificando,
    emailConfigurado: this.mensagens.emailConfigurado(),
    emailRemetente: this.mensagens.emailRemetente() || undefined,
    ultimaVerificacaoEm: this.ultimaVerificacaoEm,
    proximaVerificacaoEm: this.proximaVerificacaoEm,
    ultimoResultado: this.ultimoResultado,
    mensagens: this.mensagens.listar()
  })

  definirAtivo = async (ativo: boolean): Promise<EstadoBot> => {
    this.ativo = ativo
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

  verificar = async (): Promise<EstadoBot> => {
    if (this.verificando) return this.estado()

    this.verificando = true
    try {
      const resultado = await this.mensagens.verificar()
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
    ipcMain.handle('bot:estado', (): EstadoBot => {
      this.sessao.exigir(['admin', 'instrutor'])
      return this.bot.estado()
    })

    ipcMain.handle('bot:verificar', async (): Promise<EstadoBot> => {
      this.sessao.exigir(['admin', 'instrutor'])
      return this.bot.verificar()
    })

    ipcMain.handle('bot:definir-ativo', async (_evento, ativo: unknown): Promise<EstadoBot> => {
      this.sessao.exigir(['admin', 'instrutor'])
      if (typeof ativo !== 'boolean') throw new Error('Valor inválido')
      return this.bot.definirAtivo(ativo)
    })

    ipcMain.handle('bot:definir-intervalo', (_evento, intervalo: unknown): EstadoBot => {
      this.sessao.exigir(['admin', 'instrutor'])
      return this.bot.definirIntervalo(intervalo)
    })
  }
}
