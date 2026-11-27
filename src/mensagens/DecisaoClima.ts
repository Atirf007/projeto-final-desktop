import { app } from 'electron'
import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'
import { createServer, IncomingMessage, Server, ServerResponse } from 'http'
import { join } from 'path'
import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { Banco } from '../Banco'
import { RegrasAulaService } from '../aulas/RegrasAula'

const TIMEOUT = 10000
const VALIDADE_TOKEN_MS = 2 * 24 * 60 * 60 * 1000
const PORTA_PADRAO = 39517
const HOST_PADRAO = '127.0.0.1'
const ASSUNTO_CANCELAR = 'Decisão do aluno: cancelar a aula'
const ASSUNTO_MOVER = 'Decisão do aluno: mover para a área interna'

const portaServidor = (): number => {
  const porta = Number(process.env.CLIMA_DECISAO_PORTA ?? PORTA_PADRAO)
  return Number.isInteger(porta) && porta > 0 && porta <= 65535 ? porta : PORTA_PADRAO
}

const hostServidor = (): string => (process.env.CLIMA_DECISAO_HOST ?? HOST_PADRAO).trim() || HOST_PADRAO

/** Fora do Electron o arquivo pode vir do .env; no app continua usando o userData. */
const caminhoPadraoSegredo = (): string => {
  const configurado = (process.env.CLIMA_DECISAO_ARQUIVO ?? '').trim()
  return configurado || join(app.getPath('userData'), 'bot-clima-decisao.json')
}

const baseUrl = (): string => {
  const configurada = (process.env.CLIMA_DECISAO_URL_BASE ?? '').trim()
  if (configurada) return configurada.replace(/\/+$/, '')
  return `http://${HOST_PADRAO}:${portaServidor()}`
}

const escaparHtml = (valor: string): string =>
  valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const dataBr = (iso: string): string => {
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso
}

const dataHoraBr = (valor: string): string => {
  const data = dataBr(valor)
  const hora = valor.slice(11, 16)
  return hora ? `${data} às ${hora}` : data
}

export type AvisoDecisao = {
  id: number
  usuarioId: number
  aulaId: number
  email: string
  titulo: string
  dataHoraInicio: string
  local: string
  aulaStatus: string
  inscricaoStatus: string
}

type AcaoDecisao = 'cancelar' | 'mover'
type EstadoAula = 'disponivel' | 'cancelada' | 'movida' | 'indisponivel'

export type DecisaoRegistrada = {
  acao: AcaoDecisao
  assunto: string
  mensagem: string
  criadoEm: string
}

type ResultadoDecisao = {
  registrada: boolean
  estado: EstadoAula
  decisao: DecisaoRegistrada | null
}

const estadoDaAula = (aviso: AvisoDecisao): EstadoAula => {
  if (aviso.aulaStatus === 'cancelada') return 'cancelada'
  if (aviso.local === 'interna') return 'movida'
  if (
    !['agendada', 'confirmada', 'remarcada'].includes(aviso.aulaStatus) ||
    !['confirmada', 'presente'].includes(aviso.inscricaoStatus)
  ) {
    return 'indisponivel'
  }
  return 'disponivel'
}

const mensagemEstado = (estado: EstadoAula): string => {
  if (estado === 'cancelada') return 'Esta aula já foi cancelada.'
  if (estado === 'movida') return 'Esta aula já foi movida para a área interna.'
  return 'Esta aula não está mais aberta para escolha.'
}

/**
 * Guarda o segredo HMAC em um JSON no userData do Electron ou no caminho
 * definido por CLIMA_DECISAO_ARQUIVO. O segredo não vai para o banco nem para
 * o código-fonte, e os tokens continuam válidos após reiniciar o processo.
 */
export class AssinadorDecisao {
  private readonly segredo: string

  constructor(caminho: string = caminhoPadraoSegredo()) {
    this.segredo = this.carregarOuCriar(caminho)
  }

  private carregarOuCriar(caminho: string): string {
    try {
      const dados = JSON.parse(readFileSync(caminho, 'utf8')) as { segredo?: unknown }
      if (typeof dados.segredo === 'string' && /^[a-f0-9]{64}$/i.test(dados.segredo)) {
        return dados.segredo
      }
    } catch {
      // Arquivo ausente ou inválido: gera um novo segredo abaixo.
    }

    const segredo = randomBytes(32).toString('hex')
    try {
      writeFileSync(caminho, JSON.stringify({ segredo }, null, 2), { encoding: 'utf8', mode: 0o600 })
    } catch {
      // Se não for possível persistir, o segredo permanece válido nesta execução.
    }
    return segredo
  }

  private assinatura = (id: number, expiraEm: number): Buffer =>
    createHmac('sha256', this.segredo).update(`${id}.${expiraEm}`).digest()

  gerarToken = (id: number): string => {
    const expiraEm = Math.floor((Date.now() + VALIDADE_TOKEN_MS) / 1000)
    const assinatura = this.assinatura(id, expiraEm).toString('hex')
    return `${expiraEm}.${assinatura}`
  }

  validarToken = (id: number, token: string): boolean => {
    if (!Number.isInteger(id) || id <= 0 || typeof token !== 'string') return false

    const partes = token.split('.')
    if (partes.length !== 2) return false
    const [expTexto, assinaturaTexto] = partes
    if (!expTexto || !assinaturaTexto) return false

    const expiraEm = Number(expTexto)
    const agoraSeg = Math.floor(Date.now() / 1000)
    const limiteSeg = agoraSeg + Math.ceil(VALIDADE_TOKEN_MS / 1000) + 60
    if (!Number.isInteger(expiraEm) || expiraEm < agoraSeg || expiraEm > limiteSeg) return false

    let recebida: Buffer
    try {
      recebida = Buffer.from(assinaturaTexto, 'hex')
    } catch {
      return false
    }

    const esperada = this.assinatura(id, expiraEm)
    return recebida.length === esperada.length && timingSafeEqual(recebida, esperada)
  }

  gerarLink = (id: number): string =>
    `${baseUrl()}/clima/${id}?t=${encodeURIComponent(this.gerarToken(id))}`
}

let assinadorUnico: AssinadorDecisao | null = null

export const obterAssinadorDecisao = (): AssinadorDecisao => {
  if (!assinadorUnico) assinadorUnico = new AssinadorDecisao()
  return assinadorUnico
}

export class DecisaoClimaRepositorio {
  private readonly pool = Banco.pool

  constructor(private readonly regras: RegrasAulaService = new RegrasAulaService(Banco.pool)) {}

  obterAviso = async (id: number): Promise<AvisoDecisao | null> => {
    if (!Number.isInteger(id) || id <= 0) return null

    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT n.id, n.usuario_id, n.aula_id, n.destinatario_email,
                   a.titulo, a.data_hora_inicio, a.local, a.status AS aula_status,
                   ia.status AS inscricao_status
              FROM notificacoes n
              INNER JOIN aulas a ON a.id = n.aula_id
              INNER JOIN alunos al ON al.usuario_id = n.usuario_id
              INNER JOIN inscricoes_aula ia ON ia.aula_id = n.aula_id AND ia.aluno_id = al.id
             WHERE n.id = ?
               AND n.tipo = 'chuva'
               AND n.canal = 'email'
               AND n.status IN ('pendente', 'enviado', 'falhou')
               AND ia.status IN ('confirmada', 'presente')
             LIMIT 1`,
      values: [id],
      timeout: TIMEOUT
    })

    if (!linhas.length) return null
    const linha = linhas[0]
    return {
      id: Number(linha.id),
      usuarioId: Number(linha.usuario_id),
      aulaId: Number(linha.aula_id),
      email: String(linha.destinatario_email ?? ''),
      titulo: String(linha.titulo ?? ''),
      dataHoraInicio: String(linha.data_hora_inicio ?? ''),
      local: String(linha.local ?? ''),
      aulaStatus: String(linha.aula_status ?? ''),
      inscricaoStatus: String(linha.inscricao_status ?? '')
    }
  }

  private mapearDecisao = (linha: RowDataPacket | undefined): DecisaoRegistrada | null => {
    if (!linha) return null
    const assunto = String(linha.assunto ?? '')
    return {
      acao: assunto === ASSUNTO_CANCELAR ? 'cancelar' : 'mover',
      assunto,
      mensagem: String(linha.mensagem ?? ''),
      criadoEm: String(linha.criado_em ?? '')
    }
  }

  obterDecisao = async (aulaId: number, usuarioId: number): Promise<DecisaoRegistrada | null> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT assunto, mensagem, criado_em
              FROM notificacoes
             WHERE tipo = 'chuva'
               AND canal = 'sistema'
               AND status = 'enviado'
               AND aula_id = ?
               AND usuario_id = ?
               AND assunto IN (?, ?)
             ORDER BY id DESC
             LIMIT 1`,
      values: [aulaId, usuarioId, ASSUNTO_CANCELAR, ASSUNTO_MOVER],
      timeout: TIMEOUT
    })

    return this.mapearDecisao(linhas[0])
  }

  private moverParaAreaInterna = async (conexao: PoolConnection, aulaId: number): Promise<void> => {
    const aula = await this.regras.travarAula(conexao, aulaId)
    if (aula.status === 'cancelada' || aula.status === 'concluida') {
      throw new Error('Esta aula não pode ser transferida para a área interna.')
    }
    await this.regras.validarCapacidade(conexao, aulaId, aula.capacidadeMax)
    await this.regras.validarAlunosDaAula(conexao, aulaId, aula.dataHoraInicio.slice(0, 10))
    await conexao.query({
      sql: `UPDATE aulas
            SET local = 'interna', local_descricao = NULL, status = 'remarcada', atualizado_em = NOW()
            WHERE id = ?`,
      values: [aulaId],
      timeout: TIMEOUT
    })
  }

  private cancelarAula = async (conexao: PoolConnection, aulaId: number): Promise<void> => {
    const aula = await this.regras.travarAula(conexao, aulaId)
    await this.regras.validarAlunosDaAula(conexao, aulaId, aula.dataHoraInicio.slice(0, 10))
    await conexao.query({
      sql: `UPDATE aulas
            SET status = 'cancelada', atualizado_em = NOW()
            WHERE id = ?`,
      values: [aulaId],
      timeout: TIMEOUT
    })
  }

  registrarDecisao = async (aviso: AvisoDecisao, acao: AcaoDecisao): Promise<ResultadoDecisao> => {
    try {
      return await this.registrarDecisaoNaTransacao(aviso, acao)
    } catch (erro) {
      if ((erro as { code?: string }).code === 'ER_DUP_ENTRY') {
        const existente = await this.obterDecisao(aviso.aulaId, aviso.usuarioId)
        return { registrada: false, estado: 'disponivel', decisao: existente }
      }
      throw erro
    }
  }

  private registrarDecisaoNaTransacao = async (
    aviso: AvisoDecisao,
    acao: AcaoDecisao
  ): Promise<ResultadoDecisao> =>
    this.regras.executarTransacao(async (conexao) => {
      const [aulas] = await conexao.query<RowDataPacket[]>({
        sql: 'SELECT local, status FROM aulas WHERE id = ? LIMIT 1 FOR UPDATE',
        values: [aviso.aulaId],
        timeout: TIMEOUT
      })
      if (!aulas.length) return { registrada: false, estado: 'indisponivel', decisao: null }

      const [inscricoes] = await conexao.query<RowDataPacket[]>({
        sql: `SELECT ia.status
                FROM inscricoes_aula ia
                INNER JOIN alunos al ON al.id = ia.aluno_id
               WHERE ia.aula_id = ? AND al.usuario_id = ?
               LIMIT 1 FOR UPDATE`,
        values: [aviso.aulaId, aviso.usuarioId],
        timeout: TIMEOUT
      })

      const estado = estadoDaAula({
        ...aviso,
        local: String(aulas[0].local ?? ''),
        aulaStatus: String(aulas[0].status ?? ''),
        inscricaoStatus: String(inscricoes[0]?.status ?? '')
      })
      if (estado !== 'disponivel') return { registrada: false, estado, decisao: null }

      const [anteriores] = await conexao.query<RowDataPacket[]>({
        sql: `SELECT assunto, mensagem, criado_em
                FROM notificacoes
               WHERE tipo = 'chuva'
                 AND canal = 'sistema'
                 AND status = 'enviado'
                 AND aula_id = ?
                 AND usuario_id = ?
                 AND assunto IN (?, ?)
               ORDER BY id DESC
               LIMIT 1 FOR UPDATE`,
        values: [aviso.aulaId, aviso.usuarioId, ASSUNTO_CANCELAR, ASSUNTO_MOVER],
        timeout: TIMEOUT
      })
      const existente = this.mapearDecisao(anteriores[0])
      if (existente) return { registrada: false, estado, decisao: existente }

      if (acao === 'cancelar') await this.cancelarAula(conexao, aviso.aulaId)
      else await this.moverParaAreaInterna(conexao, aviso.aulaId)

      const assunto = acao === 'cancelar' ? ASSUNTO_CANCELAR : ASSUNTO_MOVER
      const quando = dataHoraBr(aviso.dataHoraInicio)
      const mensagem =
        acao === 'cancelar'
          ? `Aluno cancelou a aula "${aviso.titulo}" de ${quando}.`
          : `Aluno moveu a aula "${aviso.titulo}" de ${quando} para a área interna.`

      const [resultado] = await conexao.query<ResultSetHeader>({
        sql: `INSERT INTO notificacoes
          (usuario_id, aula_id, destinatario_email, tipo, canal, assunto, mensagem, status, erro, criado_em, enviado_em)
          SELECT ?, ?, ?, 'chuva', 'sistema', ?, ?, 'enviado', NULL, NOW(), NOW()
          FROM DUAL
          WHERE NOT EXISTS (
            SELECT 1 FROM notificacoes n
             WHERE n.tipo = 'chuva'
               AND n.canal = 'sistema'
               AND n.status = 'enviado'
               AND n.aula_id = ?
               AND n.usuario_id = ?
               AND n.assunto IN (?, ?)
          )`,
        values: [
          aviso.usuarioId,
          aviso.aulaId,
          aviso.email,
          assunto,
          mensagem,
          aviso.aulaId,
          aviso.usuarioId,
          ASSUNTO_CANCELAR,
          ASSUNTO_MOVER
        ],
        timeout: TIMEOUT
      })

      if (resultado.affectedRows !== 1) {
        return { registrada: false, estado, decisao: existente }
      }

      return {
        registrada: true,
        estado,
        decisao: { acao, assunto, mensagem, criadoEm: new Date().toISOString() }
      }
    })
}

type Resposta = {
  status: number
  html: string
}

export class ServidorDecisaoClima {
  private servidor: Server | null = null

  constructor(
    private readonly assinador: AssinadorDecisao = obterAssinadorDecisao(),
    private readonly repositorio: DecisaoClimaRepositorio = new DecisaoClimaRepositorio()
  ) {}

  iniciar = (): void => {
    if (this.servidor) return

    const servidor = createServer((requisicao, resposta) => {
      void this.tratar(requisicao, resposta)
    })
    servidor.on('error', (erro) => {
      console.error('[decisao-clima] Não foi possível iniciar o servidor de decisões.', erro)
    })
    servidor.listen(portaServidor(), hostServidor(), () => {
      console.log(
        `[decisao-clima] Decisões de chuva disponíveis em http://${hostServidor()}:${portaServidor()}/clima`
      )
    })
    this.servidor = servidor
  }

  encerrar = (): void => {
    this.servidor?.close()
    this.servidor = null
  }

  private responder = (resposta: ServerResponse, resultado: Resposta): void => {
    resposta.statusCode = resultado.status
    resposta.setHeader('Content-Type', 'text/html; charset=utf-8')
    resposta.setHeader('Cache-Control', 'no-store')
    resposta.setHeader('X-Content-Type-Options', 'nosniff')
    resposta.setHeader('X-Frame-Options', 'DENY')
    resposta.setHeader('Referrer-Policy', 'no-referrer')
    resposta.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'"
    )
    resposta.end(resultado.html)
  }

  private pagina = (titulo: string, corpo: string): string => `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escaparHtml(titulo)}</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #f9fafb; color: #111827; }
    main { max-width: 520px; margin: 48px auto; padding: 28px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; }
    h1 { margin: 0 0 8px; font-size: 20px; }
    p { line-height: 1.5; color: #374151; }
    .selo { display: inline-block; padding: 3px 10px; border-radius: 999px; background: #fffbeb; color: #92400e; border: 1px solid #fde68a; font-size: 12px; font-weight: 700; }
    .acoes { display: grid; gap: 10px; margin-top: 20px; }
    button { padding: 12px 16px; font: inherit; font-weight: 700; border-radius: 8px; border: 1px solid #d1d5db; cursor: pointer; }
    .cancelar { background: #fff; color: #b91c1c; border-color: #fecaca; }
    .mover { background: #10b981; border-color: #10b981; color: #fff; }
    .nota { margin-top: 16px; font-size: 12px; color: #6b7280; }
    .erro { color: #b91c1c; font-weight: 600; }
  </style>
</head>
<body>
  <main>
    <h1>${escaparHtml(titulo)}</h1>
    ${corpo}
  </main>
</body>
</html>`

  private paginaErro = (mensagem: string): Resposta => ({
    status: 400,
    html: this.pagina('Não foi possível usar este link', `<p class="erro">${escaparHtml(mensagem)}</p>`)
  })

  private tratar = async (requisicao: IncomingMessage, resposta: ServerResponse): Promise<void> => {
    if (requisicao.method === 'POST') requisicao.resume()

    try {
      const url = new URL(requisicao.url ?? '/', `http://${requisicao.headers.host ?? HOST_PADRAO}`)
      const partes = url.pathname.split('/').filter(Boolean)
      if (partes[0] !== 'clima' || partes.length < 2 || partes.length > 3) {
        this.responder(resposta, { ...this.paginaErro('Página não encontrada.'), status: 404 })
        return
      }

      const idTexto = partes[1]
      if (!/^\d+$/.test(idTexto)) {
        this.responder(resposta, { ...this.paginaErro('Link inválido ou expirado.'), status: 403 })
        return
      }
      const id = Number(idTexto)
      const token = url.searchParams.get('t') ?? ''
      if (!this.assinador.validarToken(id, token)) {
        this.responder(resposta, { ...this.paginaErro('Link inválido ou expirado.'), status: 403 })
        return
      }

      const acao = partes[2]
      if (requisicao.method === 'GET' && !acao) {
        this.responder(resposta, await this.mostrar(id, token))
        return
      }

      if (requisicao.method === 'POST' && (acao === 'cancelar' || acao === 'mover')) {
        this.responder(resposta, await this.decidir(id, token, acao))
        return
      }

      this.responder(resposta, {
        status: 405,
        html: this.pagina('Método não permitido', '<p>Use a página enviada por e-mail.</p>')
      })
    } catch (erro) {
      console.error('[decisao-clima] Falha ao processar a decisão.', erro)
      this.responder(resposta, {
        status: 500,
        html: this.pagina('Erro inesperado', '<p>Não foi possível registrar a decisão agora. Tente novamente mais tarde.</p>')
      })
    }
  }

  private paginaIndisponivel = (estado: EstadoAula, detalhe = ''): Resposta => ({
    status: 409,
    html: this.pagina(
      'Aula indisponível para decisão',
      `${detalhe}<p class="erro">${escaparHtml(mensagemEstado(estado))}</p>`
    )
  })

  private mostrar = async (id: number, token: string): Promise<Resposta> => {
    const aviso = await this.repositorio.obterAviso(id)
    if (!aviso) {
      return { ...this.paginaErro('Este aviso não está mais disponível.'), status: 404 }
    }

    const localAtual = aviso.local === 'interna' ? 'área interna' : 'área externa'
    const detalhe = `<p><strong>${escaparHtml(aviso.titulo)}</strong><br>${escaparHtml(
      dataHoraBr(aviso.dataHoraInicio)
    )}</p><p>Local atual: ${escaparHtml(localAtual)}.</p>`

    const estado = estadoDaAula(aviso)
    if (estado !== 'disponivel') return this.paginaIndisponivel(estado, detalhe)

    const decisao = await this.repositorio.obterDecisao(aviso.aulaId, aviso.usuarioId)
    if (decisao) {
      return {
        status: 200,
        html: this.pagina(
          'Decisão já registrada',
          `${detalhe}<p>${escaparHtml(decisao.mensagem)}</p><p class="nota">Não é necessário responder novamente.</p>`
        )
      }
    }

    const tokenUrl = encodeURIComponent(token)
    return {
      status: 200,
      html: this.pagina(
        'Chuva prevista para sua aula ao ar livre',
        `<span class="selo">Risco de chuva</span>
         ${detalhe}
          <p>Escolha o que deseja fazer com esta aula. A decisão vale para toda a turma e será registrada no sistema.</p>
         <div class="acoes">
           <form method="post" action="/clima/${id}/cancelar?t=${tokenUrl}">
             <button type="submit" class="cancelar">Cancelar a aula para a turma</button>
           </form>
            <form method="post" action="/clima/${id}/mover?t=${tokenUrl}">
              <button type="submit" class="mover">Mover a turma para a área interna</button>
            </form>
         </div>
         <p class="nota">Se você não responder, a aula permanece como está.</p>`
      )
    }
  }

  private decidir = async (id: number, token: string, acao: AcaoDecisao): Promise<Resposta> => {
    const aviso = await this.repositorio.obterAviso(id)
    if (!aviso) {
      return { ...this.paginaErro('Este aviso não está mais disponível.'), status: 404 }
    }

    const estado = estadoDaAula(aviso)
    if (estado !== 'disponivel') return this.paginaIndisponivel(estado)

    const resultado = await this.repositorio.registrarDecisao(aviso, acao)
    if (!resultado.registrada) {
      if (resultado.estado !== 'disponivel') return this.paginaIndisponivel(resultado.estado)

      const decisao = resultado.decisao ?? (await this.repositorio.obterDecisao(aviso.aulaId, aviso.usuarioId))
      return {
        status: 200,
        html: this.pagina(
          'Decisão já registrada',
          `<p>${escaparHtml(decisao?.mensagem ?? 'Sua decisão já havia sido registrada.')}</p>`
        )
      }
    }

    const mensagem = acao === 'cancelar' ? 'A aula foi cancelada.' : 'A aula foi movida para a área interna.'
    return {
      status: 200,
      html: this.pagina('Decisão registrada', `<p>${escaparHtml(mensagem)}</p>`)
    }
  }
}
