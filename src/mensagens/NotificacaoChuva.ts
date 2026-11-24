import { RowDataPacket } from 'mysql2/promise'
import { Banco } from '../Banco'

const TIMEOUT = 10000
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type RegistroNotificacaoChuva = {
  aulaId: number
  usuarioId: number
  email: string
  assunto: string
  mensagem: string
  status: 'enviado' | 'falhou'
  erro?: string
}

export type RegistrosExistentes = {
  enviados: Set<string>
  falhas: Set<string>
}

const chave = (aulaId: number, email: string): string => `${aulaId}|${email.trim().toLowerCase()}`

const idsValidos = (aulaIds: number[]): number[] =>
  [...new Set(aulaIds)].filter((id) => Number.isInteger(id) && id > 0)

/**
 * Persiste os avisos de chuva na tabela `notificacoes`. Também consulta os
 * registros anteriores para não reenviar o mesmo aviso ao mesmo aluno.
 */
export class NotificacaoChuvaRepositorio {
  private readonly pool = Banco.pool

  existentes = async (aulaIds: number[]): Promise<RegistrosExistentes> => {
    const ids = idsValidos(aulaIds)
    const resultado: RegistrosExistentes = { enviados: new Set(), falhas: new Set() }
    if (ids.length === 0) return resultado

    const placeholders = ids.map(() => '?').join(', ')
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT aula_id, destinatario_email, status
              FROM notificacoes
             WHERE tipo = 'chuva'
               AND aula_id IN (${placeholders})`,
      values: ids,
      timeout: TIMEOUT
    })

    for (const linha of linhas) {
      const aulaId = Number(linha.aula_id)
      const email = String(linha.destinatario_email ?? '').trim().toLowerCase()
      if (!Number.isInteger(aulaId) || aulaId <= 0 || !EMAIL_VALIDO.test(email)) continue

      const status = String(linha.status)
      if (status === 'enviado') resultado.enviados.add(chave(aulaId, email))
      else if (status === 'falhou') resultado.falhas.add(chave(aulaId, email))
    }

    return resultado
  }

  registrar = async (
    registros: RegistroNotificacaoChuva[]
  ): Promise<{ ok: boolean; registrados: number }> => {
    const validos = registros.filter(
      (registro) =>
        Number.isInteger(registro.aulaId) &&
        registro.aulaId > 0 &&
        Number.isInteger(registro.usuarioId) &&
        registro.usuarioId > 0 &&
        EMAIL_VALIDO.test(registro.email.trim().toLowerCase())
    )
    if (validos.length === 0) return { ok: true, registrados: 0 }

    const grupos = validos.map(() => "(?, ?, ?, 'chuva', 'email', ?, ?, ?, ?, NOW(), ?)").join(', ')
    const valores: unknown[] = []
    for (const registro of validos) {
      const status = registro.status === 'enviado' ? 'enviado' : 'falhou'
      valores.push(
        registro.usuarioId,
        registro.aulaId,
        registro.email.trim().toLowerCase().slice(0, 160),
        registro.assunto.trim().slice(0, 160),
        registro.mensagem,
        status,
        registro.erro ? registro.erro.slice(0, 255) : null,
        status === 'enviado' ? new Date() : null
      )
    }

    try {
      await this.pool.query({
        sql: `INSERT INTO notificacoes
          (usuario_id, aula_id, destinatario_email, tipo, canal, assunto, mensagem, status, erro, criado_em, enviado_em)
          VALUES ${grupos}`,
        values: valores,
        timeout: TIMEOUT
      })
      return { ok: true, registrados: validos.length }
    } catch (erro) {
      console.error('[bot-clima] Não foi possível registrar as notificações de chuva.', erro)
      return { ok: false, registrados: 0 }
    }
  }
}
