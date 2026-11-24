import { RowDataPacket } from 'mysql2/promise'
import { Banco } from '../Banco'
import { HorarioAula } from '../integracoes/ClimaBackend'

export type AulaExternaAmanha = HorarioAula & {
  id: number
  data: string
}

/**
 * Lê apenas as aulas ao ar livre de amanhã. O bot de chuva usa o horário real
 * dessas aulas para calcular o risco e os ids para registrar os avisos.
 */
export class AulasAmanha {
  private readonly pool = Banco.pool

  private amanha = (): string => {
    const data = new Date()
    data.setDate(data.getDate() + 1)
    const ano = data.getFullYear()
    const mes = String(data.getMonth() + 1).padStart(2, '0')
    const dia = String(data.getDate()).padStart(2, '0')
    return `${ano}-${mes}-${dia}`
  }

  listar = async (): Promise<AulaExternaAmanha[]> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, titulo, data_hora_inicio, duracao_min
         FROM aulas
        WHERE DATE(data_hora_inicio) = ?
          AND local = 'externa'
          AND status IN ('agendada', 'confirmada')
        ORDER BY data_hora_inicio`,
      [this.amanha()]
    )

    return linhas.map((linha) => {
      const texto = String(linha.data_hora_inicio)
      const inicioMin = Number(texto.slice(11, 13)) * 60 + Number(texto.slice(14, 16))
      const duracao = Number(linha.duracao_min)
      const fimMin = inicioMin + (Number.isFinite(duracao) && duracao > 0 ? duracao : 60)
      const inicio = Math.floor(inicioMin / 60)
      const fim = Math.min(23, Math.max(inicio, Math.floor((fimMin - 1) / 60)))

      return {
        id: Number(linha.id),
        data: texto.slice(0, 10),
        inicio,
        fim,
        inicioMin,
        fimMin,
        titulo: String(linha.titulo ?? '')
      }
    })
  }
}
