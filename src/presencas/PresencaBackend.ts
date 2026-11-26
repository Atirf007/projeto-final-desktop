import { registrarCanal } from '../SegurancaIpc'
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { Banco } from '../Banco'
import { BancoErros } from '../BancoErros'
import { Sessao } from '../Sessao'
import { ErroAula, RegrasAulaService } from '../aulas/RegrasAula'

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

export type FiltroPresencas = {
  alunoId?: number
  inicio?: string
  fim?: string
  origem?: OrigemPresenca
  busca?: string
}

export type PresencaInput = {
  id?: number
  alunoId: number
  aulaId?: number | null
  dataPresenca: string
  origem: OrigemPresenca
}

export type ResultadoPresenca = { ok: true; id: number } | { ok: false; mensagem: string }

const ORIGENS: OrigemPresenca[] = ['aula', 'livre', 'experimental']
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

  constructor(private readonly regras: RegrasAulaService = new RegrasAulaService(Banco.pool)) {}

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

  listarTodos = async (filtro: FiltroPresencas): Promise<Presenca[]> => {
    const condicoes: string[] = []
    const valores: unknown[] = []
    if (filtro.alunoId) {
      condicoes.push('p.aluno_id = ?')
      valores.push(filtro.alunoId)
    }
    if (filtro.inicio) {
      condicoes.push('p.data_presenca >= ?')
      valores.push(filtro.inicio)
    }
    if (filtro.fim) {
      condicoes.push('p.data_presenca <= ?')
      valores.push(filtro.fim)
    }
    if (filtro.origem) {
      condicoes.push('p.origem = ?')
      valores.push(filtro.origem)
    }
    if (filtro.busca) {
      const termo = `%${filtro.busca.replace(/[\\%_]/g, '\\$&')}%`
      condicoes.push('u.nome LIKE ?')
      valores.push(termo)
    }
    const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : ''
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT p.id, p.aluno_id, u.nome AS aluno_nome, p.aula_id, a.titulo AS aula_titulo,
                   p.data_presenca, p.origem, p.criado_em
            FROM presencas p
            INNER JOIN alunos al ON al.id = p.aluno_id
            INNER JOIN usuarios u ON u.id = al.usuario_id
            LEFT JOIN aulas a ON a.id = p.aula_id
            ${where}
            ORDER BY p.data_presenca DESC, p.id DESC
            LIMIT 500`,
      values: valores,
      timeout: TIMEOUT
    })
    return linhas.map(mapear)
  }

  obter = async (id: number): Promise<Presenca | null> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT p.id, p.aluno_id, u.nome AS aluno_nome, p.aula_id, a.titulo AS aula_titulo,
                   p.data_presenca, p.origem, p.criado_em
            FROM presencas p
            INNER JOIN alunos al ON al.id = p.aluno_id
            INNER JOIN usuarios u ON u.id = al.usuario_id
            LEFT JOIN aulas a ON a.id = p.aula_id
            WHERE p.id = ? LIMIT 1`,
      values: [id],
      timeout: TIMEOUT
    })
    return linhas.length ? mapear(linhas[0]) : null
  }

  criar = async (dados: PresencaInput): Promise<number> =>
    this.regras.executarTransacao(async (conexao) => {
      const aluno = await this.regras.travarAluno(conexao, dados.alunoId)
      if (!aluno) throw new ErroAula('Aluno não encontrado.')
      if (!aluno.ativo) throw new ErroAula('O aluno está inativo e não pode receber presença.')
      await this.regras.validarUmaAulaPorDia(conexao, dados.alunoId, dados.aulaId ?? 0, dados.dataPresenca)

      const [resultado] = await conexao.query<ResultSetHeader>({
        sql: `INSERT INTO presencas (aluno_id, aula_id, data_presenca, origem, criado_em)
              VALUES (?, ?, ?, ?, NOW())`,
        values: [dados.alunoId, dados.aulaId ?? null, dados.dataPresenca, dados.origem],
        timeout: TIMEOUT
      })
      return Number(resultado.insertId)
    })

  atualizar = async (dados: PresencaInput): Promise<boolean> =>
    this.regras.executarTransacao(async (conexao) => {
      const [existentes] = await conexao.query<RowDataPacket[]>({
        sql: 'SELECT id FROM presencas WHERE id = ? LIMIT 1 FOR UPDATE',
        values: [dados.id],
        timeout: TIMEOUT
      })
      if (!existentes.length) return false

      const aluno = await this.regras.travarAluno(conexao, dados.alunoId)
      if (!aluno) throw new ErroAula('Aluno não encontrado.')
      if (!aluno.ativo) throw new ErroAula('O aluno está inativo e não pode receber presença.')
      await this.regras.validarUmaAulaPorDia(
        conexao,
        dados.alunoId,
        dados.aulaId ?? 0,
        dados.dataPresenca,
        Number(existentes[0].id)
      )

      const [resultado] = await conexao.query<ResultSetHeader>({
        sql: `UPDATE presencas
              SET aluno_id = ?, aula_id = ?, data_presenca = ?, origem = ?
              WHERE id = ?`,
        values: [dados.alunoId, dados.aulaId ?? null, dados.dataPresenca, dados.origem, dados.id],
        timeout: TIMEOUT
      })
      return resultado.affectedRows > 0
    })

  excluir = async (id: number): Promise<boolean> => {
    const [resultado] = await this.pool.query<ResultSetHeader>({
      sql: 'DELETE FROM presencas WHERE id = ?',
      values: [id],
      timeout: TIMEOUT
    })
    return resultado.affectedRows > 0
  }
}

export class PresencaResumoIpc {
  private readonly validador = new PeriodoValidador()

  constructor(
    private readonly sessao: Sessao,
    private readonly repositorio: PresencaRepository = new PresencaRepository()
  ) {}

  registrar = (): void => {
    registrarCanal('presencas:minhas', async (_evento, entrada: unknown): Promise<Presenca[]> => {
      const usuario = this.sessao.exigir(['aluno'])
      const alunoId = await this.repositorio.alunoIdPorUsuario(usuario.id)
      if (alunoId === null) return []
      return this.repositorio.listar(alunoId, this.validador.validar(entrada))
    })

    registrarCanal('presencas:minhaFrequencia', async (_evento, entrada: unknown): Promise<FrequenciaResumo> => {
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

export class PresencaCrudIpc {
  private readonly repositorio = new PresencaRepository()

  constructor(private readonly sessao: Sessao) {}

  private id = (valor: unknown): number | null => {
    const numero = typeof valor === 'number' ? valor : typeof valor === 'string' ? Number(valor) : NaN
    return Number.isInteger(numero) && numero > 0 ? numero : null
  }

  private erro = (contexto: string, erro: unknown, padrao: string): ResultadoPresenca => {
    if (erro instanceof ErroAula) return { ok: false, mensagem: erro.message }
    if (erro instanceof Error && erro.message === 'Acesso negado') {
      return { ok: false, mensagem: 'Acesso negado para esta operação.' }
    }
    console.error(`[${contexto}]`, erro)
    return { ok: false, mensagem: BancoErros.mensagem(erro, padrao) }
  }

  private validarFiltro = (entrada: unknown): FiltroPresencas => {
    if (typeof entrada !== 'object' || entrada === null) return {}
    const e = entrada as Record<string, unknown>
    const filtro: FiltroPresencas = {}
    const alunoId = this.id(e.alunoId)
    if (alunoId !== null) filtro.alunoId = alunoId
    const inicio = dataValida(e.inicio)
    if (inicio) filtro.inicio = inicio
    const fim = dataValida(e.fim)
    if (fim) filtro.fim = fim
    if (typeof e.origem === 'string' && ORIGENS.includes(e.origem as OrigemPresenca)) {
      filtro.origem = e.origem as OrigemPresenca
    }
    if (typeof e.busca === 'string') filtro.busca = e.busca.trim().slice(0, 120)
    return filtro
  }

  private validar = (entrada: unknown): { ok: true; dados: PresencaInput } | { ok: false; mensagem: string } => {
    if (typeof entrada !== 'object' || entrada === null) return { ok: false, mensagem: 'Dados inválidos.' }
    const e = entrada as Record<string, unknown>

    let id: number | undefined
    if (e.id !== undefined) {
      const idValido = this.id(e.id)
      if (idValido === null) return { ok: false, mensagem: 'Presença inválida.' }
      id = idValido
    }

    const alunoId = this.id(e.alunoId)
    if (alunoId === null) return { ok: false, mensagem: 'Selecione um aluno válido.' }

    let aulaId: number | null = null
    if (e.aulaId !== undefined && e.aulaId !== null && e.aulaId !== '') {
      aulaId = this.id(e.aulaId)
      if (aulaId === null) return { ok: false, mensagem: 'Aula inválida.' }
    }

    const dataPresenca = dataValida(e.dataPresenca)
    if (!dataPresenca) return { ok: false, mensagem: 'Informe uma data válida.' }

    if (typeof e.origem !== 'string' || !ORIGENS.includes(e.origem as OrigemPresenca)) {
      return { ok: false, mensagem: 'Selecione uma origem válida.' }
    }
    const origem = e.origem as OrigemPresenca
    if (origem === 'aula' && aulaId === null) {
      return { ok: false, mensagem: 'Selecione a aula desta presença.' }
    }

    return { ok: true, dados: { id, alunoId, aulaId, dataPresenca, origem } }
  }

  registrar = (): void => {
    registrarCanal('presencas:listarTodos', async (_evento, entrada: unknown): Promise<Presenca[]> => {
      this.sessao.exigir(['admin', 'instrutor'])
      return this.repositorio.listarTodos(this.validarFiltro(entrada))
    })

    registrarCanal('presencas:obter', async (_evento, entrada: unknown): Promise<Presenca | null> => {
      this.sessao.exigir(['admin', 'instrutor'])
      const id = this.id(entrada)
      if (id === null) throw new Error('Presença inválida.')
      return this.repositorio.obter(id)
    })

    registrarCanal('presencas:criar', async (_evento, entrada: unknown): Promise<ResultadoPresenca> => {
      this.sessao.exigir(['admin', 'instrutor'])
      const v = this.validar(entrada)
      if (!v.ok) return v
      try {
        const id = await this.repositorio.criar(v.dados)
        return { ok: true, id }
      } catch (erro) {
        return this.erro('presencas:criar', erro, 'Não foi possível registrar a presença.')
      }
    })

    registrarCanal('presencas:atualizar', async (_evento, entrada: unknown): Promise<ResultadoPresenca> => {
      this.sessao.exigir(['admin', 'instrutor'])
      const v = this.validar(entrada)
      if (!v.ok) return v
      if (v.dados.id === undefined) return { ok: false, mensagem: 'Presença inválida.' }
      try {
        const ok = await this.repositorio.atualizar(v.dados)
        if (!ok) return { ok: false, mensagem: 'Presença não encontrada.' }
        return { ok: true, id: v.dados.id }
      } catch (erro) {
        return this.erro('presencas:atualizar', erro, 'Não foi possível atualizar a presença.')
      }
    })

    registrarCanal('presencas:excluir', async (_evento, entrada: unknown): Promise<ResultadoPresenca> => {
      this.sessao.exigir(['admin', 'instrutor'])
      const id = this.id(entrada)
      if (id === null) return { ok: false, mensagem: 'Presença inválida.' }
      try {
        const ok = await this.repositorio.excluir(id)
        if (!ok) return { ok: false, mensagem: 'Presença não encontrada.' }
        return { ok: true, id }
      } catch (erro) {
        return this.erro('presencas:excluir', erro, 'Não foi possível excluir a presença.')
      }
    })
  }
}
