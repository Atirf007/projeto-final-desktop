import 'dotenv/config'
import { mkdirSync } from 'fs'
import { createServer as criarServidorNet } from 'net'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { Banco } from '../src/Banco'
import { OpenMeteoClient } from '../src/integracoes/ClimaBackend'
import { EmailServico } from '../src/integracoes/EmailBackend'
import { BotClimaServico, ConfiguracaoBotArquivo } from '../src/mensagens/BotClima'
import { AulasAmanha } from '../src/mensagens/AulasAmanha'
import { AlunoDestinatarios } from '../src/mensagens/DestinatariosAlunos'
import { AssinadorDecisao, ServidorDecisaoClima } from '../src/mensagens/DecisaoClima'
import { MensagemServico } from '../src/mensagens/MensagemBackend'
import { NotificacaoChuvaRepositorio } from '../src/mensagens/NotificacaoChuva'

const PORTA_PADRAO = 39517
const HOST_PADRAO = '127.0.0.1'

/**
 * Entrada sem Electron: reusa o serviço de agendamento e o servidor de decisão
 * já usados pelo app, apenas injetando caminhos válidos fora do userData.
 */
class ServidorClimaStandalone {
  private encerrando = false
  private bot: BotClimaServico | null = null
  private servidor: ServidorDecisaoClima | null = null
  private emails: EmailServico | null = null

  private porta = (): number => {
    const numero = Number(process.env.CLIMA_DECISAO_PORTA ?? PORTA_PADRAO)
    return Number.isInteger(numero) && numero > 0 && numero <= 65535 ? numero : PORTA_PADRAO
  }

  private host = (): string => (process.env.CLIMA_DECISAO_HOST ?? HOST_PADRAO).trim() || HOST_PADRAO

  private portaDisponivel = (porta: number, host: string): Promise<boolean> =>
    new Promise((resolve) => {
      const teste = criarServidorNet()
      teste.once('error', () => resolve(false))
      teste.once('listening', () => teste.close(() => resolve(true)))
      teste.listen(porta, host)
    })

  private configurarUrlBase = (porta: number, host: string): string => {
    const configurada = (process.env.CLIMA_DECISAO_URL_BASE ?? '').trim()
    if (configurada) {
      const url = configurada.replace(/\/+$/, '')
      process.env.CLIMA_DECISAO_URL_BASE = url
      return url
    }

    const hostLink = host === '0.0.0.0' || host === '::' ? HOST_PADRAO : host
    const url = `http://${hostLink}:${porta}`
    process.env.CLIMA_DECISAO_URL_BASE = url
    return url
  }

  private caminhoArquivo = (variavel: string, nomePadrao: string): string => {
    const configurado = (process.env[variavel] ?? '').trim()
    const caminho = configurado || join(tmpdir(), nomePadrao)
    mkdirSync(dirname(caminho), { recursive: true })
    return caminho
  }

  private encerrar = async (codigo: number): Promise<void> => {
    if (this.encerrando) return
    this.encerrando = true
    console.log('\nEncerrando clima-servidor...')
    this.bot?.encerrar()
    this.servidor?.encerrar()
    this.emails?.fechar()
    try {
      await Banco.pool.end()
    } catch {
      // O processo será encerrado de qualquer forma.
    }
    process.exit(codigo)
  }

  private registrarSinais = (): void => {
    process.once('SIGINT', () => {
      void this.encerrar(0)
    })
    process.once('SIGTERM', () => {
      void this.encerrar(0)
    })
  }

  iniciar = async (): Promise<void> => {
    const porta = this.porta()
    const host = this.host()

    if (!(await this.portaDisponivel(porta, host))) {
      throw new Error(
        `A porta ${porta} em ${host} está ocupada. Feche o aplicativo ou ajuste CLIMA_DECISAO_PORTA/CLIMA_DECISAO_HOST.`
      )
    }

    const urlBase = this.configurarUrlBase(porta, host)
    const assinador = new AssinadorDecisao(
      this.caminhoArquivo('CLIMA_DECISAO_ARQUIVO', 'projeto-final-dad-bot-clima-decisao.json')
    )
    const emails = new EmailServico()
    const mensagens = new MensagemServico(
      new OpenMeteoClient(),
      emails,
      new AlunoDestinatarios(),
      new AulasAmanha(),
      new NotificacaoChuvaRepositorio(),
      assinador
    )
    const bot = new BotClimaServico(
      mensagens,
      new ConfiguracaoBotArquivo(
        this.caminhoArquivo('CLIMA_BOT_CONFIG_ARQUIVO', 'projeto-final-dad-clima-servidor-bot.json'),
        true
      )
    )
    const servidor = new ServidorDecisaoClima(assinador)

    this.emails = emails
    this.bot = bot
    this.servidor = servidor
    this.registrarSinais()

    servidor.iniciar()
    bot.iniciar()

    const estado = bot.estado()
    console.log('=== clima-servidor ===')
    console.log(`Agendamento do bot: ${estado.ativo ? 'ativo' : 'desativado por CLIMA_BOT_ATIVO'}`)
    console.log(`Intervalo: ${estado.intervaloMinutos} min | limiar de chuva: ${estado.limiarChuva}%`)
    console.log(`SMTP: ${emails.configurado() ? 'configurado' : 'não configurado'}`)
    console.log(`Servidor de decisão: ${urlBase}/clima`)
    console.log('Verificação inicial disparada. Pressione Ctrl+C para encerrar.')
  }
}

const main = async (): Promise<void> => {
  await new ServidorClimaStandalone().iniciar()
}

main().catch((erro: unknown) => {
  console.error('Não foi possível iniciar o clima-servidor:', erro instanceof Error ? erro.message : erro)
  process.exitCode = 1
})
