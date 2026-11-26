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

export type VisitanteUnicoDia = {
  nome: string
  telefone: string
  email?: string | null
  dataVisita: string
  aulaId?: number | null
  ignorarVisitanteId?: number
}

const normalizarTexto = (valor: string): string => valor.trim().toLowerCase().replace(/\s+/g, ' ')

const normalizarTelefone = (valor: string): string =>
  valor.replace(/[\s()+.-]/g, '')

const MENSAGEM_VISITANTE_DIA = 'Esta pessoa já possui aula ou presença registrada nesta data. O limite é de uma aula por dia.'

export class RegrasAulaService {
  constructor(private readonly pool: Pool) {}

  executarTransacao = async <T>(operacao: (conexao: PoolConnection) => Promise<T>): Promise<T> => {
    const conexao = await this.pool.getConnection()
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

  travarAula = async (conexao: PoolConnection, aulaId: number): Promise<AulaTravada> => {
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

  travarAluno = async (conexao: PoolConnection, alunoId: number): Promise<AlunoTravado | null> => {
    const [linhas] = await conexao.query<RowDataPacket[]>({
      sql: 'SELECT id, ativo FROM alunos WHERE id = ? LIMIT 1 FOR UPDATE',
      values: [alunoId],
      timeout: TIMEOUT
    })
    return linhas.length ? { id: Number(linhas[0].id), ativo: Boolean(linhas[0].ativo) } : null
  }

  validarUmaAulaPorDia = async (
    conexao: PoolConnection,
    alunoId: number,
    aulaId: number,
    dataAula: string,
    ignorarPresencaId = 0
  ): Promise<void> => {
    const [mesmaData] = await conexao.query<RowDataPacket[]>({
      sql: `SELECT 1 AS encontrado
              FROM (
                SELECT ia.id
                  FROM inscricoes_aula ia
                  INNER JOIN aulas a ON a.id = ia.aula_id
                 WHERE ia.aluno_id = ? AND ia.aula_id <> ?
                   AND ia.status <> 'cancelada'
                   AND DATE(a.data_hora_inicio) = ?
                UNION ALL
                SELECT p.id
                  FROM presencas p
                 WHERE p.aluno_id = ? AND p.data_presenca = ?
                   AND (p.aula_id IS NULL OR p.aula_id <> ?)
                   AND p.id <> ?
              ) registros
             LIMIT 1`,
      values: [alunoId, aulaId, dataAula, alunoId, dataAula, aulaId, ignorarPresencaId],
      timeout: TIMEOUT
    })
    if (mesmaData.length) {
      throw new ErroAula('O aluno já possui aula ou presença registrada nesta data. O limite é de uma aula por dia.')
    }
  }

  validarVisitanteUnicoPorDia = async (conexao: PoolConnection, dados: VisitanteUnicoDia): Promise<void> => {
    const nome = normalizarTexto(dados.nome)
    const telefone = normalizarTelefone(dados.telefone)
    const email = normalizarTexto(dados.email ?? '')
    const temTelefone = telefone.length > 0
    const temEmail = email.length > 0
    const usarNome = !temTelefone && !temEmail
    const ignorar = dados.ignorarVisitanteId ?? 0
    const aulaId = dados.aulaId ?? 0

    const [duplicados] = await conexao.query<RowDataPacket[]>({
      sql: `SELECT v.id
              FROM visitantes v
             WHERE v.data_visita = ?
               AND v.id <> ?
               AND v.status <> 'cancelado'
               AND (
                 (? = 1 AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(v.telefone, ' ', ''), '-', ''), '(', ''), ')', ''), '.', ''), '+', '') = ?)
                 OR (? = 1 AND v.email IS NOT NULL AND LOWER(TRIM(v.email)) = ?)
                 OR (? = 1 AND LOWER(TRIM(v.nome)) = ?)
               )
             LIMIT 1`,
      values: [
        dados.dataVisita,
        ignorar,
        temTelefone ? 1 : 0,
        telefone,
        temEmail ? 1 : 0,
        email,
        usarNome ? 1 : 0,
        nome
      ],
      timeout: TIMEOUT
    })
    if (duplicados.length) throw new ErroAula(MENSAGEM_VISITANTE_DIA)

    const [vinculados] = await conexao.query<RowDataPacket[]>({
      sql: `SELECT al.id
              FROM alunos al
              INNER JOIN usuarios u ON u.id = al.usuario_id
             WHERE al.ativo = 1
               AND (
                 (? = 1 AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(al.telefone, ' ', ''), '-', ''), '(', ''), ')', ''), '.', ''), '+', '') = ?)
                 OR (? = 1 AND LOWER(TRIM(u.email)) = ?)
                 OR (? = 1 AND LOWER(TRIM(u.nome)) = ?)
               )
             LIMIT 10`,
      values: [temTelefone ? 1 : 0, telefone, temEmail ? 1 : 0, email, usarNome ? 1 : 0, nome],
      timeout: TIMEOUT
    })

    for (const linha of vinculados) {
      try {
        await this.validarUmaAulaPorDia(conexao, Number(linha.id), aulaId, dados.dataVisita)
      } catch (erro) {
        if (erro instanceof ErroAula) throw new ErroAula(MENSAGEM_VISITANTE_DIA)
        throw erro
      }
    }
  }

  validarAlunosDaAula = async (
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
      await this.travarAluno(conexao, alunoId)
      await this.validarUmaAulaPorDia(conexao, alunoId, aulaId, dataAula)
    }
  }

  contarOcupacao = async (conexao: PoolConnection, aulaId: number): Promise<number> => {
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

  validarCapacidade = async (
    conexao: PoolConnection,
    aulaId: number,
    capacidadeMax: number,
    vagasAdicionais = 0
  ): Promise<void> => {
    const ocupacao = await this.contarOcupacao(conexao, aulaId)
    if (ocupacao + vagasAdicionais > capacidadeMax) {
      throw new ErroAula('Aula lotada. Não há vagas disponíveis.')
    }
  }
}
