import { RowDataPacket } from 'mysql2/promise'
import { Banco } from '../Banco'
import { HorarioAula } from '../integracoes/ClimaBackend'

/**
 * Lê as aulas de amanhã para que o bot de chuva use a probabilidade no
 * horário real das aulas, e não a máxima do dia inteiro.
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

  listar = async (): Promise<HorarioAula[]> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>(
      `SELECT titulo, data_hora_inicio, duracao_min
         FROM aulas
        WHERE DATE(data_hora_inicio) = ?
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
        inicio,
        fim,
        inicioMin,
        fimMin,
        titulo: String(linha.titulo ?? '')
      }
    })
  }
}
