import { ipcMain } from 'electron'
import { RowDataPacket } from 'mysql2/promise'
import { Banco } from '../Banco'
import { Sessao } from '../Sessao'

export type OrigemPresenca = 'aula' | 'livre' | 'experimental'

export type Presenca = {
  id: number
  alunoId: number
  alunoNome: string
  aulaId?: number
  aulaTitulo?: string
  dataPresenca: string
  origem: OrigemPresenca
  criadoEm: string
}

export type FrequenciaResumo = {
  alunoId: number
  alunoNome: string
  totalPresencas: number
  ultimaPresenca?: string
  diasNoPeriodo: number
  percentual: number
}

export type PeriodoPresencas = {
  inicio?: string
  fim?: string
}

const TIMEOUT = 15000

const dataStr = (valor: unknown): string => String(valor ?? '').slice(0, 10)

const hojeISO = (): string => {
  const agora = new Date()
  const ano = agora.getFullYear()
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const dia = String(agora.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

const dataValida = (valor: unknown): string | null => {
  if (typeof valor !== 'string') return null
  const m = valor.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const ano = Number(m[1])
  const mes = Number(m[2])
  const dia = Number(m[3])
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null
  if (ano < 1900 || ano > 2100) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

const somarDias = (data: string, dias: number): string => {
  const [ano, mes, dia] = data.split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10)
}

const diferencaDias = (inicio: string, fim: string): number => {
  const [anoI, mesI, diaI] = inicio.split('-').map(Number)
  const [anoF, mesF, diaF] = fim.split('-').map(Number)
  const a = Date.UTC(anoI, mesI - 1, diaI)
  const b = Date.UTC(anoF, mesF - 1, diaF)
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1)
}

class PeriodoValidador {
  validar(entrada: unknown): { inicio: string; fim: string } {
    const fimPadrao = hojeISO()
    const inicioPadrao = somarDias(fimPadrao, -89)
    if (typeof entrada !== 'object' || entrada === null) return { inicio: inicioPadrao, fim: fimPadrao }
    const e = entrada as Record<string, unknown>
    const inicio = dataValida(e.inicio) ?? inicioPadrao
    const fim = dataValida(e.fim) ?? fimPadrao
    if (inicio > fim) return { inicio: fim, fim: inicio }
    return { inicio, fim }
  }
}

const mapear = (linha: RowDataPacket): Presenca => ({
  id: Number(linha.id),
  alunoId: Number(linha.aluno_id),
  alunoNome: String(linha.aluno_nome ?? ''),
  aulaId: linha.aula_id === null || linha.aula_id === undefined ? undefined : Number(linha.aula_id),
  aulaTitulo: linha.aula_titulo ? String(linha.aula_titulo) : undefined,
  dataPresenca: dataStr(linha.data_presenca),
  origem: String(linha.origem) as OrigemPresenca,
  criadoEm: String(linha.criado_em ?? '')
})

class PresencaRepository {
  private readonly pool = Banco.pool

  alunoIdPorUsuario = async (usuarioId: number): Promise<number | null> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: 'SELECT id FROM alunos WHERE usuario_id = ? LIMIT 1',
      values: [usuarioId],
      timeout: TIMEOUT
    })
    return linhas.length ? Number(linhas[0].id) : null
  }

  nomeAluno = async (alunoId: number): Promise<string | null> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT u.nome
            FROM alunos al
            INNER JOIN usuarios u ON u.id = al.usuario_id
            WHERE al.id = ?
            LIMIT 1`,
      values: [alunoId],
      timeout: TIMEOUT
    })
    return linhas.length ? String(linhas[0].nome) : null
  }

  listar = async (alunoId: number, periodo: { inicio: string; fim: string }): Promise<Presenca[]> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT p.id, p.aluno_id, u.nome AS aluno_nome, p.aula_id, a.titulo AS aula_titulo,
                   p.data_presenca, p.origem, p.criado_em
            FROM presencas p
            INNER JOIN alunos al ON al.id = p.aluno_id
            INNER JOIN usuarios u ON u.id = al.usuario_id
            LEFT JOIN aulas a ON a.id = p.aula_id
            WHERE p.aluno_id = ? AND p.data_presenca BETWEEN ? AND ?
            ORDER BY p.data_presenca DESC, p.id DESC
            LIMIT 500`,
      values: [alunoId, periodo.inicio, periodo.fim],
      timeout: TIMEOUT
    })
    return linhas.map(mapear)
  }

  resumo = async (alunoId: number, periodo: { inicio: string; fim: string }): Promise<FrequenciaResumo> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT COUNT(*) AS total, MAX(data_presenca) AS ultima
            FROM presencas
            WHERE aluno_id = ? AND data_presenca BETWEEN ? AND ?`,
      values: [alunoId, periodo.inicio, periodo.fim],
      timeout: TIMEOUT
    })
    const total = linhas.length ? Number(linhas[0].total ?? 0) : 0
    const dias = diferencaDias(periodo.inicio, periodo.fim)
    return {
      alunoId,
      alunoNome: (await this.nomeAluno(alunoId)) ?? '',
      totalPresencas: total,
      ultimaPresenca: linhas.length && linhas[0].ultima ? dataStr(linhas[0].ultima) : undefined,
      diasNoPeriodo: dias,
      percentual: Math.round((total / dias) * 1000) / 10
    }
  }
}

export class PresencaResumoIpc {
  private readonly validador = new PeriodoValidador()

  constructor(
    private readonly sessao: Sessao,
    private readonly repositorio: PresencaRepository = new PresencaRepository()
  ) {}

  registrar = (): void => {
    ipcMain.handle('presencas:minhas', async (_evento, entrada: unknown): Promise<Presenca[]> => {
      const usuario = this.sessao.exigir(['aluno'])
      const alunoId = await this.repositorio.alunoIdPorUsuario(usuario.id)
      if (alunoId === null) return []
      return this.repositorio.listar(alunoId, this.validador.validar(entrada))
    })

    ipcMain.handle('presencas:minhaFrequencia', async (_evento, entrada: unknown): Promise<FrequenciaResumo> => {
      const usuario = this.sessao.exigir(['aluno'])
      const alunoId = await this.repositorio.alunoIdPorUsuario(usuario.id)
      if (alunoId === null) {
        return {
          alunoId: 0,
          alunoNome: '',
          totalPresencas: 0,
          diasNoPeriodo: 0,
          percentual: 0
        }
      }
      return this.repositorio.resumo(alunoId, this.validador.validar(entrada))
    })
  }
}
