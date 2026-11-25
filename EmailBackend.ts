import 'dotenv/config'
import nodemailer, { Transporter } from 'nodemailer'

export type FalhaEmail = {
  email: string
  erro: string
}

export type ResultadoEnvioEmail = {
  configurado: boolean
  total: number
  enviados: number
  falhas: FalhaEmail[]
  erroGeral?: string
}

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export class EmailServico {
  private transporte: Transporter | null = null

  private readonly host = (process.env.SMTP_HOST ?? '').trim()
  private readonly porta = Number(process.env.SMTP_PORT ?? 587)
  private readonly usuario = (process.env.SMTP_USER ?? '').trim()
  private readonly senha = process.env.SMTP_PASS ?? ''
  private readonly remetente = (process.env.SMTP_FROM ?? process.env.SMTP_USER ?? '').trim()
  private readonly nomeRemetente = (process.env.SMTP_REMETENTE_NOME ?? 'Academia Cotil').trim()

  constructor(private readonly fabricaTransporte?: () => Transporter) {}

  configurado = (): boolean => Boolean(this.host && this.usuario && this.senha && this.remetente)

  remetenteFormatado = (): string =>
    this.configurado() ? `${this.nomeRemetente} <${this.remetente}>` : ''

  private criarTransporte = (): Transporter => {
    const porta = Number.isFinite(this.porta) ? this.porta : 587
    const seguro = (process.env.SMTP_SECURE ?? '').toLowerCase() === 'true' || porta === 465
    const exigirTls = (process.env.SMTP_REQUIRE_TLS ?? '').toLowerCase() === 'true'
    const validarCertificado = (process.env.SMTP_TLS_REJECT_UNAUTHORIZED ?? 'true').toLowerCase() !== 'false'

    return nodemailer.createTransport({
      host: this.host,
      port: porta,
      secure: seguro,
      requireTLS: exigirTls,
      auth: { user: this.usuario, pass: this.senha },
      pool: true,
      maxConnections: 3,
      maxMessages: 50,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      tls: { rejectUnauthorized: validarCertificado }
    })
  }

  private obterTransporte = (): Transporter => {
    if (!this.transporte) {
      this.transporte = this.fabricaTransporte ? this.fabricaTransporte() : this.criarTransporte()
    }
    return this.transporte
  }

  fechar = (): void => {
    const transporte = this.transporte as (Transporter & { close?: () => void }) | null
    transporte?.close?.()
    this.transporte = null
  }

  enviar = async (destinatarios: string[], assunto: string, texto: string): Promise<ResultadoEnvioEmail> => {
    const lista = [...new Set(destinatarios.map((email) => email.trim().toLowerCase()).filter((email) => EMAIL_VALIDO.test(email)))]

    if (!this.configurado()) {
      return {
        configurado: false,
        total: lista.length,
        enviados: 0,
        falhas: [],
        erroGeral: 'Envio por e-mail não configurado. Defina SMTP_HOST, SMTP_USER e SMTP_PASS no .env.'
      }
    }

    if (lista.length === 0) {
      return {
        configurado: true,
        total: 0,
        enviados: 0,
        falhas: [],
        erroGeral: 'Nenhum aluno ativo possui e-mail cadastrado.'
      }
    }

    const transporte = this.obterTransporte()
    const fila = [...lista]
    const falhas: FalhaEmail[] = []
    let enviados = 0

    const consumir = async (): Promise<void> => {
      for (;;) {
        const email = fila.shift()
        if (!email) return

        try {
          await transporte.sendMail({
            from: this.remetenteFormatado(),
            to: email,
            subject: assunto,
            text: texto
          })
          enviados++
        } catch (erro) {
          falhas.push({
            email,
            erro: erro instanceof Error ? erro.message : 'Falha ao enviar o e-mail.'
          })
        }
      }
    }

    const conexoes = Math.min(4, lista.length)
    await Promise.all(Array.from({ length: conexoes }, () => consumir()))

    return {
      configurado: true,
      total: lista.length,
      enviados,
      falhas,
      erroGeral:
        enviados === 0
          ? 'Nenhum e-mail pôde ser enviado. Verifique as configurações de SMTP.'
          : undefined
    }
  }
}
