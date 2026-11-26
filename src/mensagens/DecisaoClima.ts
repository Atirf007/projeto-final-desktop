import { app } from 'electron'
import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'
import { createServer, IncomingMessage, Server, ServerResponse } from 'http'
import { join } from 'path'
import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { Banco } from '../Banco'
import {
  executarTransacao,
  travarAula,
  validarAlunosDaAula,
  validarCapacidade
} from '../aulas/RegrasAula'

const TIMEOUT = 10000
const VALIDADE_TOKEN_MS = 7 * 24 * 60 * 60 * 1000
const PORTA_PADRAO = 39517
const HOST_PADRAO = '127.0.0.1'
const ASSUNTO_MANTER = 'Decisão do aluno: manter a aula'
const ASSUNTO_REMARCAR = 'Decisão do aluno: pedir remarcação'

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

export type DecisaoRegistrada = {
  assunto: string
  mensagem: string
  criadoEm: string
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
    if (!Number.isInteger(expiraEm) || expiraEm < Math.floor(Date.now() / 1000)) return false

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
      values: [aulaId, usuarioId, ASSUNTO_MANTER, ASSUNTO_REMARCAR],
      timeout: TIMEOUT
    })

    if (!linhas.length) return null
    return {
      assunto: String(linhas[0].assunto ?? ''),
      mensagem: String(linhas[0].mensagem ?? ''),
      criadoEm: String(linhas[0].criado_em ?? '')
    }
  }

  private moverParaAreaInterna = async (conexao: PoolConnection, aulaId: number): Promise<void> => {
    const aula = await travarAula(conexao, aulaId)
    if (aula.status === 'cancelada' || aula.status === 'concluida') {
      throw new Error('Esta aula não pode ser transferida para a área interna.')
    }
    await validarCapacidade(conexao, aulaId, aula.capacidadeMax)
    await validarAlunosDaAula(conexao, aulaId, aula.dataHoraInicio.slice(0, 10))
    await conexao.query({
      sql: `UPDATE aulas
            SET local = 'interna', local_descricao = NULL, status = 'remarcada', atualizado_em = NOW()
            WHERE id = ?`,
      values: [aulaId],
      timeout: TIMEOUT
    })
  }

  registrarDecisao = async (aviso: AvisoDecisao, decisao: 'manter' | 'remarcar'): Promise<boolean> =>
    executarTransacao(this.pool, async (conexao) => {
      if (decisao === 'remarcar') await this.moverParaAreaInterna(conexao, aviso.aulaId)
      const assunto = decisao === 'manter' ? ASSUNTO_MANTER : ASSUNTO_REMARCAR
      const quando = dataHoraBr(aviso.dataHoraInicio)
      const mensagem =
        decisao === 'manter'
          ? `Aluno decidiu manter a aula "${aviso.titulo}" de ${quando}.`
          : `Aula "${aviso.titulo}" de ${quando} transferida para a área interna a pedido do aluno.`

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
          ASSUNTO_MANTER,
          ASSUNTO_REMARCAR
        ],
        timeout: TIMEOUT
      })

      return resultado.affectedRows > 0
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
    .manter { background: #10b981; border-color: #10b981; color: #fff; }
    .remarcar { background: #fff; color: #b91c1c; border-color: #fecaca; }
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

      if (requisicao.method === 'POST' && (acao === 'manter' || acao === 'remarcar')) {
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

  private podeDecidir = (aviso: AvisoDecisao): boolean =>
    ['agendada', 'confirmada', 'remarcada'].includes(aviso.aulaStatus) &&
    ['confirmada', 'presente'].includes(aviso.inscricaoStatus)

  private mostrar = async (id: number, token: string): Promise<Resposta> => {
    const aviso = await this.repositorio.obterAviso(id)
    if (!aviso) {
      return { ...this.paginaErro('Este aviso não está mais disponível.'), status: 404 }
    }

    const localAtual = aviso.local === 'interna' ? 'área interna' : 'área externa'
    const detalhe = `<p><strong>${escaparHtml(aviso.titulo)}</strong><br>${escaparHtml(
      dataHoraBr(aviso.dataHoraInicio)
    )}</p><p>Local atual: ${escaparHtml(localAtual)}.</p>`

    if (!this.podeDecidir(aviso)) {
      return {
        status: 409,
        html: this.pagina(
          'Aula indisponível para decisão',
          `${detalhe}<p class="erro">Esta aula não está mais aberta para escolha.</p>`
        )
      }
    }

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

    if (aviso.local === 'interna') {
      return {
        status: 200,
        html: this.pagina(
          'Aula na área interna',
          `${detalhe}<p>Esta aula já foi transferida para a área interna.</p>`
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
         <p>Escolha o que deseja fazer com esta aula. A academia será avisada da sua decisão.</p>
         <div class="acoes">
           <form method="post" action="/clima/${id}/manter?t=${tokenUrl}">
             <button type="submit" class="manter">Manter a aula</button>
           </form>
            <form method="post" action="/clima/${id}/remarcar?t=${tokenUrl}">
              <button type="submit" class="remarcar">Transferir para a área interna</button>
            </form>
         </div>
         <p class="nota">Se você não responder, a aula permanece como está.</p>`
      )
    }
  }

  private decidir = async (id: number, token: string, acao: 'manter' | 'remarcar'): Promise<Resposta> => {
    const aviso = await this.repositorio.obterAviso(id)
    if (!aviso) {
      return { ...this.paginaErro('Este aviso não está mais disponível.'), status: 404 }
    }

    if (!this.podeDecidir(aviso)) {
      return {
        status: 409,
        html: this.pagina(
          'Aula indisponível para decisão',
          '<p class="erro">Esta aula não está mais aberta para escolha.</p>'
        )
      }
    }

    if (acao === 'manter' && aviso.local === 'interna') {
      return {
        status: 409,
        html: this.pagina('Aula na área interna', '<p>Esta aula já foi transferida para a área interna.</p>')
      }
    }

    const registrada = await this.repositorio.registrarDecisao(aviso, acao)
    const decisao = await this.repositorio.obterDecisao(aviso.aulaId, aviso.usuarioId)

    if (!registrada) {
      return {
        status: 200,
        html: this.pagina(
          'Decisão já registrada',
          `<p>${escaparHtml(decisao?.mensagem ?? 'Sua decisão já havia sido registrada.')}</p>`
        )
      }
    }

    const mensagem =
      acao === 'manter'
        ? 'Sua decisão de manter a aula foi registrada.'
        : 'Sua aula foi transferida para a área interna da academia, mantendo o mesmo horário.'
    return {
      status: 200,
      html: this.pagina('Decisão registrada', `<p>${escaparHtml(mensagem)}</p>`)
    }
  }
}
