import { RowDataPacket } from 'mysql2/promise'
import { Banco } from '../Banco'

export type ResultadoDestinatarios =
  | { ok: true; emails: string[] }
  | { ok: false; mensagem: string }

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export class AlunoDestinatarios {
  private readonly sql = `
    SELECT DISTINCT u.email
    FROM alunos a
    INNER JOIN usuarios u ON u.id = a.usuario_id
    WHERE a.ativo = 1 AND u.email IS NOT NULL AND u.email <> ''
    ORDER BY u.email ASC`

  listar = async (): Promise<ResultadoDestinatarios> => {
    try {
      const [linhas] = await Banco.pool.query<RowDataPacket[]>({ sql: this.sql, timeout: 10000 })
      const emails = linhas
        .map((linha) => String(linha.email ?? '').trim().toLowerCase())
        .filter((email) => EMAIL_VALIDO.test(email))

      return { ok: true, emails: [...new Set(emails)] }
    } catch {
      return { ok: false, mensagem: 'Não foi possível carregar os e-mails dos alunos cadastrados.' }
    }
  }
}
