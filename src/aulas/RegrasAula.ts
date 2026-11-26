import { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'

const TIMEOUT = 15000

export class ErroAula extends Error {}

export type AulaTravada = {
  id: number
  capacidadeMax: number
  status: string
  dataHoraInicio: string
}

export type AlunoTravado = {
  id: number
  ativo: boolean
}

export const executarTransacao = async <T>(
  pool: Pool,
  operacao: (conexao: PoolConnection) => Promise<T>
): Promise<T> => {
  const conexao = await pool.getConnection()
  try {
    await conexao.beginTransaction()
    const resultado = await operacao(conexao)
    await conexao.commit()
    return resultado
  } catch (erro) {
    await conexao.rollback().catch(() => undefined)
    throw erro
  } finally {
    conexao.release()
  }
}

export const travarAula = async (conexao: PoolConnection, aulaId: number): Promise<AulaTravada> => {
  const [linhas] = await conexao.query<RowDataPacket[]>({
    sql: 'SELECT id, capacidade_max, status, data_hora_inicio FROM aulas WHERE id = ? LIMIT 1 FOR UPDATE',
    values: [aulaId],
    timeout: TIMEOUT
  })
  if (!linhas.length) throw new ErroAula('Aula não encontrada.')
  return {
    id: Number(linhas[0].id),
    capacidadeMax: Number(linhas[0].capacidade_max),
    status: String(linhas[0].status),
    dataHoraInicio: String(linhas[0].data_hora_inicio ?? '')
  }
}

export const travarAluno = async (conexao: PoolConnection, alunoId: number): Promise<AlunoTravado | null> => {
  const [linhas] = await conexao.query<RowDataPacket[]>({
    sql: 'SELECT id, ativo FROM alunos WHERE id = ? LIMIT 1 FOR UPDATE',
    values: [alunoId],
    timeout: TIMEOUT
  })
  return linhas.length ? { id: Number(linhas[0].id), ativo: Boolean(linhas[0].ativo) } : null
}

export const validarUmaAulaPorDia = async (
  conexao: PoolConnection,
  alunoId: number,
  aulaId: number,
  dataAula: string
): Promise<void> => {
  const [mesmaData] = await conexao.query<RowDataPacket[]>({
    sql: `SELECT ia.id
          FROM inscricoes_aula ia
          INNER JOIN aulas a ON a.id = ia.aula_id
          WHERE ia.aluno_id = ? AND ia.aula_id <> ?
            AND ia.status <> 'cancelada'
            AND DATE(a.data_hora_inicio) = ?
          LIMIT 1`,
    values: [alunoId, aulaId, dataAula],
    timeout: TIMEOUT
  })
  if (mesmaData.length) {
    throw new ErroAula('O aluno já possui inscrição em outra aula nesta data. O limite é de uma aula por dia.')
  }
}

export const validarAlunosDaAula = async (
  conexao: PoolConnection,
  aulaId: number,
  dataAula: string
): Promise<void> => {
  const [linhas] = await conexao.query<RowDataPacket[]>({
    sql: `SELECT DISTINCT ia.aluno_id
          FROM inscricoes_aula ia
          WHERE ia.aula_id = ? AND ia.status <> 'cancelada'
          ORDER BY ia.aluno_id ASC`,
    values: [aulaId],
    timeout: TIMEOUT
  })
  for (const linha of linhas) {
    const alunoId = Number(linha.aluno_id)
    await travarAluno(conexao, alunoId)
    await validarUmaAulaPorDia(conexao, alunoId, aulaId, dataAula)
  }
}

export const contarOcupacao = async (conexao: PoolConnection, aulaId: number): Promise<number> => {
  const [linhas] = await conexao.query<RowDataPacket[]>({
    sql: `SELECT
            (SELECT COUNT(*) FROM inscricoes_aula
              WHERE aula_id = ? AND status IN ('confirmada', 'presente'))
            + (SELECT COUNT(*) FROM visitantes
              WHERE aula_id = ? AND status IN ('agendado', 'compareceu')) AS total`,
    values: [aulaId, aulaId],
    timeout: TIMEOUT
  })
  return Number(linhas[0].total)
}

export const validarCapacidade = async (
  conexao: PoolConnection,
  aulaId: number,
  capacidadeMax: number,
  vagasAdicionais = 0
): Promise<void> => {
  const ocupacao = await contarOcupacao(conexao, aulaId)
  if (ocupacao + vagasAdicionais > capacidadeMax) {
    throw new ErroAula('Aula lotada. Não há vagas disponíveis.')
  }
}
