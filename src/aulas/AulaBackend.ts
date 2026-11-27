import { registrarCanal } from '../SegurancaIpc'
import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { Banco } from '../Banco'
import { BancoErros } from '../BancoErros'
import { FeriadoCliente } from '../integracoes/FeriadosBackend'
import { Sessao, UsuarioSessao } from '../Sessao'
import { ErroAula, RegrasAulaService } from './RegrasAula'

export type StatusAula = 'agendada' | 'confirmada' | 'cancelada' | 'remarcada' | 'concluida'
export type LocalAula = 'interna' | 'externa'
export type StatusInscricao = 'confirmada' | 'cancelada' | 'presente' | 'falta'

export type Aula = {
  id: number
  modalidadeId: number
  modalidadeNome: string
  instrutorId: number
  instrutorNome: string
  titulo: string
  dataHoraInicio: string
  duracaoMin: number
  capacidadeMax: number
  vagasOcupadas: number
  local: LocalAula
  localDescricao?: string
  status: StatusAula
}

export type InscricaoAula = {
  id: number
  aulaId: number
  alunoId: number
  alunoNome: string
  status: StatusInscricao
}

export type InscricaoDetalhe = InscricaoAula & {
  aulaTitulo: string
  dataHoraInicio: string
}

export type FiltroInscricoes = {
  aulaId?: number
  alunoId?: number
  instrutorId?: number
  status?: StatusInscricao
  busca?: string
}

export type ResultadoInscricao = { ok: true; id: number } | { ok: false; mensagem: string }

export type AulaDetalhe = Aula & {
  inscritos: InscricaoAula[]
}

export type CriarAulaInput = {
  modalidadeId: number
  instrutorId: number
  titulo: string
  dataHoraInicio: string
  duracaoMin: number
  capacidadeMax: number
  local: LocalAula
  localDescricao?: string
}

export type AtualizarAulaInput = {
  id: number
  modalidadeId?: number
  instrutorId?: number
  titulo?: string
  dataHoraInicio?: string
  duracaoMin?: number
  capacidadeMax?: number
  local?: LocalAula
  localDescricao?: string | null
  status?: StatusAula
}

export type RemarcarAulaInput = {
  id: number
  novaDataHora: string
  novoLocal?: LocalAula
  localDescricao?: string | null
}

export type FiltroAulas = {
  data?: string
  modalidadeId?: number
  instrutorId?: number
  status?: StatusAula
}

export type ResultadoAula = { ok: true; id?: number; aviso?: string } | { ok: false; mensagem: string }

type ContextoInscricao = {
  inscricaoId: number
  aulaId: number
  alunoId: number
  status: StatusInscricao
  instrutorId: number
}

const TIMEOUT = 15000

const textoOuNulo = (valor: unknown): string | null => (typeof valor === 'string' && valor.trim() ? valor.trim() : null)
const dataHoraBanco = (valor: unknown): string => String(valor ?? '')

const STATUS_AULA: StatusAula[] = ['agendada', 'confirmada', 'cancelada', 'remarcada', 'concluida']
const STATUS_INSCRICAO: StatusInscricao[] = ['confirmada', 'cancelada', 'presente', 'falta']
const LOCAIS: LocalAula[] = ['interna', 'externa']

class AulaValidador {
  private texto(valor: unknown, max: number): string | null {
    if (typeof valor !== 'string') return null
    const limpo = valor.trim()
    return limpo.length <= max ? limpo : null
  }

  private inteiro(valor: unknown, minimo: number, maximo: number): number | null {
    const numero = Number(valor)
    if (!Number.isInteger(numero) || numero < minimo || numero > maximo) return null
    return numero
  }

  id(valor: unknown): number | null {
    return this.inteiro(valor, 1, Number.MAX_SAFE_INTEGER)
  }

  private titulo(valor: unknown): string | null {
    const titulo = this.texto(valor, 120)
    return titulo && titulo.length >= 2 ? titulo : null
  }

  private data(valor: unknown): string | null {
    if (typeof valor !== 'string') return null
    const m = valor.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!m) return null
    const ano = Number(m[1])
    const mes = Number(m[2])
    const dia = Number(m[3])
    const d = new Date(Date.UTC(ano, mes - 1, dia))
    if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null
    return `${m[1]}-${m[2]}-${m[3]}`
  }

  private dataHora(valor: unknown): string | null {
    if (typeof valor !== 'string') return null
    const m = valor.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/)
    if (!m) return null
    const ano = Number(m[1])
    const mes = Number(m[2])
    const dia = Number(m[3])
    const hora = Number(m[4])
    const minuto = Number(m[5])
    const segundo = Number(m[6] ?? '0')
    const d = new Date(Date.UTC(ano, mes - 1, dia))
    if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null
    if (ano < 2000 || ano > 2100 || hora > 23 || minuto > 59 || segundo > 59) return null
    return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${String(segundo).padStart(2, '0')}`
  }

  private local(valor: unknown): LocalAula | null {
    return typeof valor === 'string' && LOCAIS.includes(valor as LocalAula) ? (valor as LocalAula) : null
  }

  private status(valor: unknown): StatusAula | null {
    return typeof valor === 'string' && STATUS_AULA.includes(valor as StatusAula) ? (valor as StatusAula) : null
  }

  private localDescricao(valor: unknown): string | undefined | null {
    if (valor === undefined || valor === null || valor === '') return undefined
    return this.texto(valor, 120)
  }

  validarCriacao(entrada: unknown): { ok: true; dados: CriarAulaInput } | { ok: false; mensagem: string } {
    if (typeof entrada !== 'object' || entrada === null) return { ok: false, mensagem: 'Dados inválidos.' }
    const e = entrada as Record<string, unknown>
    const modalidadeId = this.id(e.modalidadeId)
    if (modalidadeId === null) return { ok: false, mensagem: 'Selecione uma modalidade válida.' }
    const instrutorId = this.id(e.instrutorId)
    if (instrutorId === null) return { ok: false, mensagem: 'Selecione um instrutor válido.' }
    const titulo = this.titulo(e.titulo)
    if (!titulo) return { ok: false, mensagem: 'Informe um título com 2 a 120 caracteres.' }
    const dataHoraInicio = this.dataHora(e.dataHoraInicio)
    if (!dataHoraInicio) return { ok: false, mensagem: 'Informe uma data e hora de início válidas.' }
    const duracaoMin = this.inteiro(e.duracaoMin, 1, 600)
    if (duracaoMin === null) return { ok: false, mensagem: 'A duração deve ser entre 1 e 600 minutos.' }
    const capacidadeMax = this.inteiro(e.capacidadeMax, 1, 500)
    if (capacidadeMax === null) return { ok: false, mensagem: 'A capacidade deve ser entre 1 e 500 alunos.' }
    const local = this.local(e.local)
    if (!local) return { ok: false, mensagem: 'Selecione um local válido.' }
    const localDescricao = this.localDescricao(e.localDescricao)
    if (localDescricao === null) return { ok: false, mensagem: 'A descrição do local deve ter no máximo 120 caracteres.' }
    return {
      ok: true,
      dados: { modalidadeId, instrutorId, titulo, dataHoraInicio, duracaoMin, capacidadeMax, local, localDescricao }
    }
  }

  validarAtualizacao(entrada: unknown): { ok: true; dados: AtualizarAulaInput } | { ok: false; mensagem: string } {
    if (typeof entrada !== 'object' || entrada === null) return { ok: false, mensagem: 'Dados inválidos.' }
    const e = entrada as Record<string, unknown>
    const id = this.id(e.id)
    if (id === null) return { ok: false, mensagem: 'Aula inválida.' }
    const dados: AtualizarAulaInput = { id }
    if (e.modalidadeId !== undefined) {
      const modalidadeId = this.id(e.modalidadeId)
      if (modalidadeId === null) return { ok: false, mensagem: 'Modalidade inválida.' }
      dados.modalidadeId = modalidadeId
    }
    if (e.instrutorId !== undefined) {
      const instrutorId = this.id(e.instrutorId)
      if (instrutorId === null) return { ok: false, mensagem: 'Instrutor inválido.' }
      dados.instrutorId = instrutorId
    }
    if (e.titulo !== undefined) {
      const titulo = this.titulo(e.titulo)
      if (!titulo) return { ok: false, mensagem: 'Título inválido.' }
      dados.titulo = titulo
    }
    if (e.dataHoraInicio !== undefined) {
      const dataHoraInicio = this.dataHora(e.dataHoraInicio)
      if (!dataHoraInicio) return { ok: false, mensagem: 'Data e hora inválidas.' }
      dados.dataHoraInicio = dataHoraInicio
    }
    if (e.duracaoMin !== undefined) {
      const duracaoMin = this.inteiro(e.duracaoMin, 1, 600)
      if (duracaoMin === null) return { ok: false, mensagem: 'Duração inválida.' }
      dados.duracaoMin = duracaoMin
    }
    if (e.capacidadeMax !== undefined) {
      const capacidadeMax = this.inteiro(e.capacidadeMax, 1, 500)
      if (capacidadeMax === null) return { ok: false, mensagem: 'Capacidade inválida.' }
      dados.capacidadeMax = capacidadeMax
    }
    if (e.local !== undefined) {
      const local = this.local(e.local)
      if (!local) return { ok: false, mensagem: 'Local inválido.' }
      dados.local = local
    }
    if (e.localDescricao !== undefined) {
      if (e.localDescricao === null || e.localDescricao === '') {
        dados.localDescricao = null
      } else {
        const localDescricao = this.texto(e.localDescricao, 120)
        if (localDescricao === null) return { ok: false, mensagem: 'Descrição do local inválida.' }
        dados.localDescricao = localDescricao
      }
    }
    if (e.status !== undefined) {
      const status = this.status(e.status)
      if (!status) return { ok: false, mensagem: 'Status inválido.' }
      dados.status = status
    }
    return { ok: true, dados }
  }

  validarRemarcacao(entrada: unknown): { ok: true; dados: RemarcarAulaInput } | { ok: false; mensagem: string } {
    if (typeof entrada !== 'object' || entrada === null) return { ok: false, mensagem: 'Dados inválidos.' }
    const e = entrada as Record<string, unknown>
    const id = this.id(e.id)
    if (id === null) return { ok: false, mensagem: 'Aula inválida.' }
    const novaDataHora = this.dataHora(e.novaDataHora)
    if (!novaDataHora) return { ok: false, mensagem: 'Informe a nova data e hora.' }
    let novoLocal: LocalAula | undefined
    if (e.novoLocal !== undefined && e.novoLocal !== '') {
      const local = this.local(e.novoLocal)
      if (!local) return { ok: false, mensagem: 'Local inválido.' }
      novoLocal = local
    }
    let localDescricao: string | null | undefined
    if (e.localDescricao !== undefined) {
      if (e.localDescricao === null || e.localDescricao === '') {
        localDescricao = null
      } else {
        const descricao = this.texto(e.localDescricao, 120)
        if (descricao === null) return { ok: false, mensagem: 'Descrição do local inválida.' }
        localDescricao = descricao
      }
    }
    return { ok: true, dados: { id, novaDataHora, novoLocal, localDescricao } }
  }

  filtro(entrada: unknown): FiltroAulas {
    if (typeof entrada !== 'object' || entrada === null) return {}
    const e = entrada as Record<string, unknown>
    const filtro: FiltroAulas = {}
    if (typeof e.data === 'string') {
      const data = this.data(e.data)
      if (data) filtro.data = data
    }
    const modalidadeId = this.id(e.modalidadeId)
    if (modalidadeId !== null) filtro.modalidadeId = modalidadeId
    const instrutorId = this.id(e.instrutorId)
    if (instrutorId !== null) filtro.instrutorId = instrutorId
    if (typeof e.status === 'string') {
      const status = this.status(e.status)
      if (status) filtro.status = status
    }
    return filtro
  }
}

const mapearAula = (linha: RowDataPacket): Aula => ({
  id: Number(linha.id),
  modalidadeId: Number(linha.modalidade_id),
  modalidadeNome: String(linha.modalidade_nome ?? ''),
  instrutorId: Number(linha.instrutor_id),
  instrutorNome: String(linha.instrutor_nome ?? ''),
  titulo: String(linha.titulo ?? ''),
  dataHoraInicio: dataHoraBanco(linha.data_hora_inicio),
  duracaoMin: Number(linha.duracao_min),
  capacidadeMax: Number(linha.capacidade_max),
  vagasOcupadas: Number(linha.vagas_ocupadas ?? 0),
  local: String(linha.local) as LocalAula,
  localDescricao: linha.local_descricao ? String(linha.local_descricao) : undefined,
  status: String(linha.status) as StatusAula
})

const mapearInscricao = (linha: RowDataPacket): InscricaoAula => ({
  id: Number(linha.id),
  aulaId: Number(linha.aula_id),
  alunoId: Number(linha.aluno_id),
  alunoNome: String(linha.aluno_nome ?? ''),
  status: String(linha.status) as StatusInscricao
})

const mapearInscricaoDetalhe = (linha: RowDataPacket): InscricaoDetalhe => ({
  ...mapearInscricao(linha),
  aulaTitulo: String(linha.aula_titulo ?? ''),
  dataHoraInicio: dataHoraBanco(linha.data_hora_inicio)
})

class AulaRepository {
  private readonly pool = Banco.pool

  constructor(private readonly regras: RegrasAulaService = new RegrasAulaService(Banco.pool)) {}

  private readonly camposAula = `
    a.id, a.modalidade_id, m.nome AS modalidade_nome, a.instrutor_id, u.nome AS instrutor_nome,
    a.titulo, a.data_hora_inicio, a.duracao_min, a.capacidade_max, a.local, a.local_descricao, a.status,
    (SELECT COUNT(*) FROM inscricoes_aula ia
      WHERE ia.aula_id = a.id AND ia.status IN ('confirmada', 'presente'))
      + (SELECT COUNT(*) FROM visitantes v
      WHERE v.aula_id = a.id AND v.status IN ('agendado', 'compareceu')) AS vagas_ocupadas`

  private readonly sqlObter = `
    SELECT ${this.camposAula}
    FROM aulas a
    INNER JOIN modalidades m ON m.id = a.modalidade_id
    INNER JOIN instrutores i ON i.id = a.instrutor_id
    INNER JOIN usuarios u ON u.id = i.usuario_id
    WHERE a.id = ?
    LIMIT 1`

  listar = async (filtro: FiltroAulas): Promise<Aula[]> => {
    const condicoes: string[] = []
    const valores: unknown[] = []
    if (filtro.data) {
      condicoes.push('DATE(a.data_hora_inicio) = ?')
      valores.push(filtro.data)
    }
    if (filtro.modalidadeId !== undefined) {
      condicoes.push('a.modalidade_id = ?')
      valores.push(filtro.modalidadeId)
    }
    if (filtro.instrutorId !== undefined) {
      condicoes.push('a.instrutor_id = ?')
      valores.push(filtro.instrutorId)
    }
    if (filtro.status) {
      condicoes.push('a.status = ?')
      valores.push(filtro.status)
    }
    const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : ''

    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT ${this.camposAula}
            FROM aulas a
            INNER JOIN modalidades m ON m.id = a.modalidade_id
            INNER JOIN instrutores i ON i.id = a.instrutor_id
            INNER JOIN usuarios u ON u.id = i.usuario_id
            ${where}
            ORDER BY a.data_hora_inicio ASC`,
      values: valores,
      timeout: TIMEOUT
    })
    return linhas.map(mapearAula)
  }

  obter = async (id: number, alunoIdFiltro: number | null): Promise<AulaDetalhe | null> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: this.sqlObter,
      values: [id],
      timeout: TIMEOUT
    })
    if (!linhas.length) return null
    const aula = mapearAula(linhas[0])
    return { ...aula, inscritos: await this.listarInscricoes(id, alunoIdFiltro) }
  }

  listarInscricoes = async (aulaId: number, alunoIdFiltro: number | null = null): Promise<InscricaoAula[]> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT ia.id, ia.aula_id, ia.aluno_id, u.nome AS aluno_nome, ia.status
            FROM inscricoes_aula ia
            INNER JOIN alunos al ON al.id = ia.aluno_id
            INNER JOIN usuarios u ON u.id = al.usuario_id
            WHERE ia.aula_id = ?
              AND (? IS NULL OR ia.aluno_id = ?)
            ORDER BY u.nome ASC`,
      values: [aulaId, alunoIdFiltro, alunoIdFiltro],
      timeout: TIMEOUT
    })
    return linhas.map(mapearInscricao)
  }

  private readonly camposInscricaoDetalhe = `
    ia.id, ia.aula_id, ia.aluno_id, u.nome AS aluno_nome, ia.status,
    a.titulo AS aula_titulo, a.data_hora_inicio`

  listarInscricoesTodas = async (filtro: FiltroInscricoes): Promise<InscricaoDetalhe[]> => {
    const condicoes: string[] = []
    const valores: unknown[] = []
    if (filtro.aulaId) {
      condicoes.push('ia.aula_id = ?')
      valores.push(filtro.aulaId)
    }
    if (filtro.alunoId) {
      condicoes.push('ia.aluno_id = ?')
      valores.push(filtro.alunoId)
    }
    if (filtro.instrutorId) {
      condicoes.push('a.instrutor_id = ?')
      valores.push(filtro.instrutorId)
    }
    if (filtro.status) {
      condicoes.push('ia.status = ?')
      valores.push(filtro.status)
    }
    if (filtro.busca) {
      const termo = `%${filtro.busca.replace(/[\\%_]/g, '\\$&')}%`
      condicoes.push('(u.nome LIKE ? OR a.titulo LIKE ?)')
      valores.push(termo, termo)
    }
    const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : ''
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT ${this.camposInscricaoDetalhe}
            FROM inscricoes_aula ia
            INNER JOIN alunos al ON al.id = ia.aluno_id
            INNER JOIN usuarios u ON u.id = al.usuario_id
            INNER JOIN aulas a ON a.id = ia.aula_id
            ${where}
            ORDER BY a.data_hora_inicio DESC, u.nome ASC
            LIMIT 500`,
      values: valores,
      timeout: TIMEOUT
    })
    return linhas.map(mapearInscricaoDetalhe)
  }

  obterInscricao = async (id: number): Promise<InscricaoDetalhe | null> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT ${this.camposInscricaoDetalhe}
            FROM inscricoes_aula ia
            INNER JOIN alunos al ON al.id = ia.aluno_id
            INNER JOIN usuarios u ON u.id = al.usuario_id
            INNER JOIN aulas a ON a.id = ia.aula_id
            WHERE ia.id = ? LIMIT 1`,
      values: [id],
      timeout: TIMEOUT
    })
    return linhas.length ? mapearInscricaoDetalhe(linhas[0]) : null
  }

  atualizarStatusInscricao = async (id: number, status: StatusInscricao): Promise<boolean> =>
    this.regras.executarTransacao(async (conexao) => {
      const [linhas] = await conexao.query<RowDataPacket[]>({
        sql: `SELECT ia.id, ia.aula_id, ia.aluno_id, ia.status, a.status AS aula_status,
                     a.capacidade_max, a.data_hora_inicio
              FROM inscricoes_aula ia
              INNER JOIN aulas a ON a.id = ia.aula_id
              WHERE ia.id = ?
              LIMIT 1 FOR UPDATE`,
        values: [id],
        timeout: TIMEOUT
      })
      if (!linhas.length) return false
      const linha = linhas[0]
      if (String(linha.status) === 'presente' && status !== 'presente') {
        throw new ErroAula('A presença já foi registrada; não é possível alterar o status desta inscrição.')
      }
      if (status === 'presente' && String(linha.aula_status) === 'cancelada') {
        throw new ErroAula('A aula está cancelada; não é possível registrar presença.')
      }
      const ocupanteAtual = ['confirmada', 'presente'].includes(String(linha.status))
      const ocupara = status === 'confirmada' || status === 'presente'
      if (ocupara) {
        const alunoId = Number(linha.aluno_id)
        const aulaId = Number(linha.aula_id)
        await this.regras.travarAluno(conexao, alunoId)
        await this.regras.validarUmaAulaPorDia(conexao, alunoId, aulaId, dataHoraBanco(linha.data_hora_inicio).slice(0, 10))
        await this.regras.validarCapacidade(conexao, aulaId, Number(linha.capacidade_max), ocupanteAtual ? 0 : 1)
      }
      if (status === 'presente' && String(linha.status) !== 'presente') {
        const alunoId = Number(linha.aluno_id)
        const aulaId = Number(linha.aula_id)
        const dataPresenca = dataHoraBanco(linha.data_hora_inicio).slice(0, 10)
        try {
          await conexao.query<ResultSetHeader>({
            sql: `INSERT INTO presencas (aluno_id, aula_id, data_presenca, origem, criado_em)
                  VALUES (?, ?, ?, 'aula', NOW())`,
            values: [alunoId, aulaId, dataPresenca],
            timeout: TIMEOUT
          })
        } catch (erro) {
          if ((erro as { code?: string }).code === 'ER_DUP_ENTRY') {
            throw new ErroAula('Este aluno já possui presença registrada nesta data. O limite é de uma aula por dia.')
          }
          throw erro
        }
      }
      await conexao.query({
        sql: 'UPDATE inscricoes_aula SET status = ?, atualizado_em = NOW() WHERE id = ?',
        values: [status, id],
        timeout: TIMEOUT
      })
      return true
    })

  excluirInscricao = async (id: number): Promise<boolean> =>
    this.regras.executarTransacao(async (conexao) => {
      const [linhas] = await conexao.query<RowDataPacket[]>({
        sql: 'SELECT status FROM inscricoes_aula WHERE id = ? LIMIT 1 FOR UPDATE',
        values: [id],
        timeout: TIMEOUT
      })
      if (!linhas.length) return false
      if (String(linhas[0].status) === 'presente') {
        throw new ErroAula('Não é possível excluir uma inscrição com presença registrada.')
      }
      const [resultado] = await conexao.query<ResultSetHeader>({
        sql: 'DELETE FROM inscricoes_aula WHERE id = ?',
        values: [id],
        timeout: TIMEOUT
      })
      return resultado.affectedRows > 0
    })

  minhas = async (alunoId: number): Promise<Aula[]> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT ${this.camposAula}
            FROM aulas a
            INNER JOIN inscricoes_aula ia ON ia.aula_id = a.id
            INNER JOIN modalidades m ON m.id = a.modalidade_id
            INNER JOIN instrutores i ON i.id = a.instrutor_id
            INNER JOIN usuarios u ON u.id = i.usuario_id
            WHERE ia.aluno_id = ? AND ia.status <> 'cancelada'
            ORDER BY a.data_hora_inicio ASC`,
      values: [alunoId],
      timeout: TIMEOUT
    })
    return linhas.map(mapearAula)
  }

  instrutorIdPorUsuario = async (usuarioId: number): Promise<number | null> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: 'SELECT id FROM instrutores WHERE usuario_id = ? LIMIT 1',
      values: [usuarioId],
      timeout: TIMEOUT
    })
    return linhas.length ? Number(linhas[0].id) : null
  }

  // Permite que um instrutor já autenticado crie aula mesmo sem vínculo prévio
  // no cadastro de funcionários (evita o erro "Selecione o instrutor").
  criarInstrutorParaUsuario = async (usuarioId: number): Promise<number> => {
    const [resultado] = await this.pool.query<ResultSetHeader>({
      sql: `INSERT INTO instrutores (usuario_id, cref, bio, ativo, criado_em, atualizado_em)
            VALUES (?, ?, NULL, 1, NOW(), NOW())`,
      values: [usuarioId, `AUTO-${usuarioId}`],
      timeout: TIMEOUT
    })
    return Number(resultado.insertId)
  }

  // Garante que a tela nunca fique sem modalidades/instrutores para criar aula,
  // mesmo quando o banco foi criado sem a carga de demonstração.
  garantirDadosBasicos = async (usuarioId: number): Promise<void> => {
    await this.pool.query({
      sql: `INSERT IGNORE INTO modalidades (nome, descricao, ativo, criado_em, atualizado_em) VALUES
            ('Musculação', 'Treino de força e hipertrofia', 1, NOW(), NOW()),
            ('Funcional', 'Treinos funcionais e condicionamento', 1, NOW(), NOW()),
            ('Pilates', 'Pilates solo e aparelhos', 1, NOW(), NOW())`,
      timeout: TIMEOUT
    })

    let instrutorId = await this.instrutorIdPorUsuario(usuarioId)
    if (instrutorId === null) instrutorId = await this.criarInstrutorParaUsuario(usuarioId)

    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: 'SELECT COUNT(*) AS total FROM aulas',
      timeout: TIMEOUT
    })
    if (Number(linhas[0].total) === 0) {
      await this.pool.query({
        sql: `INSERT INTO aulas
                (modalidade_id, instrutor_id, titulo, data_hora_inicio, duracao_min, capacidade_max, local, status, criado_em, atualizado_em)
              SELECT id, ?, 'Musculação — turma de hoje', CURDATE() + INTERVAL 7 HOUR, 60, 12, 'interna', 'agendada', NOW(), NOW()
              FROM modalidades WHERE nome = 'Musculação' LIMIT 1`,
        values: [instrutorId],
        timeout: TIMEOUT
      })
    }
  }

  alunoIdPorUsuario = async (usuarioId: number): Promise<number | null> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: 'SELECT id FROM alunos WHERE usuario_id = ? LIMIT 1',
      values: [usuarioId],
      timeout: TIMEOUT
    })
    return linhas.length ? Number(linhas[0].id) : null
  }

  private validarReferencias = async (
    conexao: PoolConnection,
    modalidadeId: number,
    instrutorId: number
  ): Promise<void> => {
    const [modalidades] = await conexao.query<RowDataPacket[]>({
      sql: 'SELECT id, ativo FROM modalidades WHERE id = ? LIMIT 1',
      values: [modalidadeId],
      timeout: TIMEOUT
    })
    if (!modalidades.length) throw new ErroAula('Modalidade não encontrada.')
    if (!modalidades[0].ativo) throw new ErroAula('A modalidade selecionada está inativa.')

    const [instrutores] = await conexao.query<RowDataPacket[]>({
      sql: `SELECT i.id, i.ativo, u.ativo AS usuario_ativo
            FROM instrutores i
            INNER JOIN usuarios u ON u.id = i.usuario_id
            WHERE i.id = ?
            LIMIT 1`,
      values: [instrutorId],
      timeout: TIMEOUT
    })
    if (!instrutores.length) throw new ErroAula('Instrutor não encontrado.')
    if (!instrutores[0].ativo || !instrutores[0].usuario_ativo) {
      throw new ErroAula('O instrutor selecionado está inativo.')
    }
  }

  criar = async (dados: CriarAulaInput): Promise<number> =>
    this.regras.executarTransacao(async (conexao) => {
      await this.validarReferencias(conexao, dados.modalidadeId, dados.instrutorId)
      const [resultado] = await conexao.query<ResultSetHeader>({
        sql: `INSERT INTO aulas
          (modalidade_id, instrutor_id, titulo, data_hora_inicio, duracao_min, capacidade_max, local, local_descricao, status, criado_em, atualizado_em)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'agendada', NOW(), NOW())`,
        values: [
          dados.modalidadeId,
          dados.instrutorId,
          dados.titulo,
          dados.dataHoraInicio,
          dados.duracaoMin,
          dados.capacidadeMax,
          dados.local,
          textoOuNulo(dados.localDescricao)
        ],
        timeout: TIMEOUT
      })
      return Number(resultado.insertId)
    })

  atualizar = async (dados: AtualizarAulaInput): Promise<boolean> =>
    this.regras.executarTransacao(async (conexao) => {
      const [linhas] = await conexao.query<RowDataPacket[]>({
        sql: `SELECT modalidade_id, instrutor_id, capacidade_max, data_hora_inicio
              FROM aulas WHERE id = ? LIMIT 1 FOR UPDATE`,
        values: [dados.id],
        timeout: TIMEOUT
      })
      if (!linhas.length) return false
      const aula = linhas[0]
      if (dados.modalidadeId !== undefined || dados.instrutorId !== undefined) {
        await this.validarReferencias(
          conexao,
          dados.modalidadeId ?? Number(aula.modalidade_id),
          dados.instrutorId ?? Number(aula.instrutor_id)
        )
      }

      const campos: string[] = []
      const valores: unknown[] = []
      const set = (coluna: string, valor: unknown): void => {
        campos.push(`${coluna} = ?`)
        valores.push(valor)
      }
      if (dados.modalidadeId !== undefined) set('modalidade_id', dados.modalidadeId)
      if (dados.instrutorId !== undefined) set('instrutor_id', dados.instrutorId)
      if (dados.titulo !== undefined) set('titulo', dados.titulo)
      if (dados.dataHoraInicio !== undefined) set('data_hora_inicio', dados.dataHoraInicio)
      if (dados.duracaoMin !== undefined) set('duracao_min', dados.duracaoMin)
      if (dados.capacidadeMax !== undefined) set('capacidade_max', dados.capacidadeMax)
      if (dados.local !== undefined) set('local', dados.local)
      if (dados.localDescricao !== undefined) set('local_descricao', dados.localDescricao)
      if (dados.status !== undefined) set('status', dados.status)

      if (!campos.length) return true

      const capacidadeFinal = dados.capacidadeMax ?? Number(aula.capacidade_max)
      const dataFinal = dataHoraBanco(dados.dataHoraInicio ?? aula.data_hora_inicio).slice(0, 10)
      await this.regras.validarCapacidade(conexao, dados.id, capacidadeFinal)
      await this.regras.validarAlunosDaAula(conexao, dados.id, dataFinal)

      campos.push('atualizado_em = NOW()')
      await conexao.query({
        sql: `UPDATE aulas SET ${campos.join(', ')} WHERE id = ?`,
        values: [...valores, dados.id],
        timeout: TIMEOUT
      })
      return true
    })

  remarcar = async (dados: RemarcarAulaInput): Promise<boolean> =>
    this.regras.executarTransacao(async (conexao) => {
      const aula = await this.regras.travarAula(conexao, dados.id)
      if (aula.status === 'concluida' || aula.status === 'cancelada') {
        throw new ErroAula('Esta aula não pode ser remarcada.')
      }
      await this.regras.validarCapacidade(conexao, dados.id, aula.capacidadeMax)
      await this.regras.validarAlunosDaAula(conexao, dados.id, dados.novaDataHora.slice(0, 10))

      const campos = ['data_hora_inicio = ?', "status = 'remarcada'", 'atualizado_em = NOW()']
      const valores: unknown[] = [dados.novaDataHora]
      if (dados.novoLocal !== undefined) {
        campos.push('local = ?')
        valores.push(dados.novoLocal)
      }
      if (dados.localDescricao !== undefined) {
        campos.push('local_descricao = ?')
        valores.push(dados.localDescricao)
      }
      await conexao.query({
        sql: `UPDATE aulas SET ${campos.join(', ')} WHERE id = ?`,
        values: [...valores, dados.id],
        timeout: TIMEOUT
      })
      return true
    })

  excluir = async (id: number): Promise<boolean> => {
    const [resultado] = await this.pool.query<ResultSetHeader>({
      sql: 'DELETE FROM aulas WHERE id = ?',
      values: [id],
      timeout: TIMEOUT
    })
    return resultado.affectedRows > 0
  }

  inscrever = async (aulaId: number, alunoId: number): Promise<number> =>
    this.regras.executarTransacao(async (conexao) => {
      const aula = await this.regras.travarAula(conexao, aulaId)
      if (aula.status === 'cancelada' || aula.status === 'concluida') {
        throw new ErroAula('Esta aula não aceita novas inscrições.')
      }
      const aluno = await this.regras.travarAluno(conexao, alunoId)
      if (!aluno) throw new ErroAula('Aluno não encontrado.')
      if (!aluno.ativo) throw new ErroAula('O aluno está inativo e não pode ser inscrito.')

      await this.regras.validarUmaAulaPorDia(conexao, alunoId, aulaId, aula.dataHoraInicio.slice(0, 10))
      await this.regras.validarCapacidade(conexao, aulaId, aula.capacidadeMax, 1)

      const [existentes] = await conexao.query<RowDataPacket[]>({
        sql: 'SELECT id, status FROM inscricoes_aula WHERE aula_id = ? AND aluno_id = ? LIMIT 1',
        values: [aulaId, alunoId],
        timeout: TIMEOUT
      })
      if (existentes.length) {
        const status = String(existentes[0].status)
        if (status !== 'cancelada') throw new ErroAula('O aluno já está inscrito nesta aula.')
        await conexao.query({
          sql: "UPDATE inscricoes_aula SET status = 'confirmada', atualizado_em = NOW() WHERE id = ?",
          values: [existentes[0].id],
          timeout: TIMEOUT
        })
        return Number(existentes[0].id)
      }

      const [resultado] = await conexao.query<ResultSetHeader>({
        sql: `INSERT INTO inscricoes_aula (aula_id, aluno_id, status, criado_em, atualizado_em)
              VALUES (?, ?, 'confirmada', NOW(), NOW())`,
        values: [aulaId, alunoId],
        timeout: TIMEOUT
      })
      return Number(resultado.insertId)
    })

  contextoInscricao = async (inscricaoId: number): Promise<ContextoInscricao | null> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT ia.id, ia.aula_id, ia.aluno_id, ia.status, a.instrutor_id
            FROM inscricoes_aula ia
            INNER JOIN aulas a ON a.id = ia.aula_id
            WHERE ia.id = ?
            LIMIT 1`,
      values: [inscricaoId],
      timeout: TIMEOUT
    })
    if (!linhas.length) return null
    return {
      inscricaoId: Number(linhas[0].id),
      aulaId: Number(linhas[0].aula_id),
      alunoId: Number(linhas[0].aluno_id),
      status: String(linhas[0].status) as StatusInscricao,
      instrutorId: Number(linhas[0].instrutor_id)
    }
  }

  cancelarInscricao = async (inscricaoId: number): Promise<boolean> =>
    this.regras.executarTransacao(async (conexao) => {
      const [linhas] = await conexao.query<RowDataPacket[]>({
        sql: 'SELECT status FROM inscricoes_aula WHERE id = ? FOR UPDATE',
        values: [inscricaoId],
        timeout: TIMEOUT
      })
      if (!linhas.length) return false
      const status = String(linhas[0].status)
      if (status === 'presente') {
        throw new ErroAula('A presença já foi registrada; não é possível cancelar a inscrição.')
      }
      if (status !== 'cancelada') {
        await conexao.query({
          sql: "UPDATE inscricoes_aula SET status = 'cancelada', atualizado_em = NOW() WHERE id = ?",
          values: [inscricaoId],
          timeout: TIMEOUT
        })
      }
      return true
    })

  marcarPresenca = async (inscricaoId: number, presente: boolean): Promise<boolean> =>
    this.regras.executarTransacao(async (conexao) => {
      const [linhas] = await conexao.query<RowDataPacket[]>({
        sql: `SELECT ia.id, ia.aula_id, ia.aluno_id, ia.status, a.status AS aula_status, a.data_hora_inicio
              FROM inscricoes_aula ia
              INNER JOIN aulas a ON a.id = ia.aula_id
              WHERE ia.id = ?
              FOR UPDATE`,
        values: [inscricaoId],
        timeout: TIMEOUT
      })
      if (!linhas.length) return false
      const linha = linhas[0]
      const statusAula = String(linha.aula_status)
      if (statusAula === 'cancelada') throw new ErroAula('A aula está cancelada; não é possível registrar presença.')
      if (String(linha.status) === 'cancelada') throw new ErroAula('A inscrição está cancelada; não é possível registrar presença.')
      const alunoId = Number(linha.aluno_id)
      const aulaId = Number(linha.aula_id)
      const dataPresenca = dataHoraBanco(linha.data_hora_inicio).slice(0, 10)

      await this.regras.travarAluno(conexao, alunoId)

      if (presente) {
        if (String(linha.status) !== 'presente') {
          await this.regras.validarUmaAulaPorDia(conexao, alunoId, aulaId, dataPresenca)
          try {
            await conexao.query<ResultSetHeader>({
              sql: `INSERT INTO presencas (aluno_id, aula_id, data_presenca, origem, criado_em)
                    VALUES (?, ?, ?, 'aula', NOW())`,
              values: [alunoId, aulaId, dataPresenca],
              timeout: TIMEOUT
            })
          } catch (erro) {
            if ((erro as { code?: string }).code === 'ER_DUP_ENTRY') {
              throw new ErroAula('Este aluno já possui presença registrada nesta data. O limite é de uma aula por dia.')
            }
            throw erro
          }
          await conexao.query({
            sql: "UPDATE inscricoes_aula SET status = 'presente', atualizado_em = NOW() WHERE id = ?",
            values: [inscricaoId],
            timeout: TIMEOUT
          })
        }
      } else {
        await conexao.query({
          sql: "UPDATE inscricoes_aula SET status = 'falta', atualizado_em = NOW() WHERE id = ?",
          values: [inscricaoId],
          timeout: TIMEOUT
        })
        await conexao.query({
          sql: `DELETE FROM presencas
                WHERE aluno_id = ? AND aula_id = ? AND data_presenca = ? AND origem = 'aula'`,
          values: [alunoId, aulaId, dataPresenca],
          timeout: TIMEOUT
        })
      }
      return true
    })

  vagas = async (aulaId: number): Promise<{ capacidadeMax: number; ocupadas: number; disponiveis: number } | null> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT a.capacidade_max,
                    (SELECT COUNT(*) FROM inscricoes_aula ia
                      WHERE ia.aula_id = a.id AND ia.status IN ('confirmada', 'presente'))
                    + (SELECT COUNT(*) FROM visitantes v
                      WHERE v.aula_id = a.id AND v.status IN ('agendado', 'compareceu')) AS ocupadas
             FROM aulas a
            WHERE a.id = ?
            LIMIT 1`,
      values: [aulaId],
      timeout: TIMEOUT
    })
    if (!linhas.length) return null
    const capacidadeMax = Number(linhas[0].capacidade_max)
    const ocupadas = Number(linhas[0].ocupadas)
    return { capacidadeMax, ocupadas, disponiveis: Math.max(0, capacidadeMax - ocupadas) }
  }
}

export class AulaIpc {
  private readonly validador = new AulaValidador()

  constructor(
    private readonly sessao: Sessao,
    private readonly repositorio: AulaRepository = new AulaRepository(),
    private readonly feriados: FeriadoCliente = new FeriadoCliente()
  ) {}

  private avisoFeriado = async (dataHora: string): Promise<string | undefined> => {
    const data = String(dataHora).slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return undefined
    try {
      const verificado = await this.feriados.verificar(data)
      if (!verificado.ok || !verificado.feriado) return undefined
      const [ano, mes, dia] = data.split('-')
      return `Atenção: ${dia}/${mes}/${ano} é feriado (${verificado.feriado.nome}). O agendamento foi concluído normalmente.`
    } catch (erro) {
      console.error('[aulas:feriado]', erro)
      return undefined
    }
  }

  private idValido(valor: unknown): number | null {
    const id = typeof valor === 'number' ? valor : typeof valor === 'string' ? Number(valor) : NaN
    return Number.isInteger(id) && id > 0 ? id : null
  }

  private meuInstrutorId = async (usuario: UsuarioSessao): Promise<number | null> =>
    this.repositorio.instrutorIdPorUsuario(usuario.id)

  private meuAlunoId = async (usuario: UsuarioSessao): Promise<number | null> =>
    this.repositorio.alunoIdPorUsuario(usuario.id)

  private gerenciar = (usuario: UsuarioSessao, instrutorIdAula: number, meuInstrutorId: number | null): void => {
    if (usuario.perfil === 'admin') return
    if (usuario.perfil === 'instrutor' && meuInstrutorId !== null && meuInstrutorId === instrutorIdAula) return
    throw new Error('Acesso negado')
  }

  private erro = (contexto: string, erro: unknown, padrao: string): ResultadoAula => {
    if (erro instanceof ErroAula) return { ok: false, mensagem: erro.message }
    if (erro instanceof Error && erro.message === 'Acesso negado') {
      return { ok: false, mensagem: 'Acesso negado para esta operação.' }
    }
    console.error(`[${contexto}]`, erro)
    return { ok: false, mensagem: BancoErros.mensagem(erro, padrao) }
  }

  private erroInscricao = (contexto: string, erro: unknown, padrao: string): ResultadoInscricao => {
    if (erro instanceof ErroAula) return { ok: false, mensagem: erro.message }
    if (erro instanceof Error && erro.message === 'Acesso negado') {
      return { ok: false, mensagem: 'Acesso negado para esta operação.' }
    }
    console.error(`[${contexto}]`, erro)
    return { ok: false, mensagem: BancoErros.mensagem(erro, padrao) }
  }

  private filtroInscricoes = (entrada: unknown): FiltroInscricoes => {
    if (typeof entrada !== 'object' || entrada === null) return {}
    const e = entrada as Record<string, unknown>
    const filtro: FiltroInscricoes = {}
    const aulaId = this.idValido(e.aulaId)
    if (aulaId !== null) filtro.aulaId = aulaId
    const alunoId = this.idValido(e.alunoId)
    if (alunoId !== null) filtro.alunoId = alunoId
    if (typeof e.status === 'string' && STATUS_INSCRICAO.includes(e.status as StatusInscricao)) {
      filtro.status = e.status as StatusInscricao
    }
    if (typeof e.busca === 'string') filtro.busca = e.busca.trim().slice(0, 120)
    return filtro
  }

  registrar = (): void => {
    registrarCanal('aulas:preparar', async (): Promise<boolean> => {
      const usuario = this.sessao.exigir(['admin', 'instrutor'])
      await this.repositorio.garantirDadosBasicos(usuario.id)
      return true
    })

    registrarCanal('aulas:listar', async (_evento, entrada: unknown): Promise<Aula[]> => {
      this.sessao.exigir()
      return this.repositorio.listar(this.validador.filtro(entrada))
    })

    registrarCanal('aulas:obter', async (_evento, entrada: unknown): Promise<AulaDetalhe | null> => {
      const usuario = this.sessao.exigir()
      const id = this.idValido(entrada)
      if (id === null) throw new Error('Aula inválida.')
      if (usuario.perfil === 'aluno') {
        const alunoId = await this.meuAlunoId(usuario)
        if (alunoId === null) return null
        return this.repositorio.obter(id, alunoId)
      }
      return this.repositorio.obter(id, null)
    })

    registrarCanal('aulas:criar', async (_evento, entrada: unknown): Promise<ResultadoAula> => {
      const usuario = this.sessao.exigir(['admin', 'instrutor'])
      try {
        let dados = entrada
        if (usuario.perfil === 'instrutor') {
          // O instrutor sempre cria aula para si, mesmo que o select venha vazio.
          let meuInstrutorId = await this.meuInstrutorId(usuario)
          if (meuInstrutorId === null) {
            meuInstrutorId = await this.repositorio.criarInstrutorParaUsuario(usuario.id)
          }
          dados = typeof entrada === 'object' && entrada !== null
            ? { ...(entrada as Record<string, unknown>), instrutorId: meuInstrutorId }
            : { instrutorId: meuInstrutorId }
        }
        const v = this.validador.validarCriacao(dados)
        if (!v.ok) return v
        const id = await this.repositorio.criar(v.dados)
        return { ok: true, id, aviso: await this.avisoFeriado(v.dados.dataHoraInicio) }
      } catch (erro) {
        return this.erro('aulas:criar', erro, 'Não foi possível cadastrar a aula.')
      }
    })

    registrarCanal('aulas:atualizar', async (_evento, entrada: unknown): Promise<ResultadoAula> => {
      const usuario = this.sessao.exigir(['admin', 'instrutor'])
      const v = this.validador.validarAtualizacao(entrada)
      if (!v.ok) return v
      try {
        const aula = await this.repositorio.obter(v.dados.id, null)
        if (!aula) return { ok: false, mensagem: 'Aula não encontrada.' }
        const meuInstrutorId = usuario.perfil === 'instrutor' ? await this.meuInstrutorId(usuario) : null
        this.gerenciar(usuario, aula.instrutorId, meuInstrutorId)
        if (usuario.perfil === 'instrutor') v.dados.instrutorId = meuInstrutorId ?? undefined
        const ok = await this.repositorio.atualizar(v.dados)
        if (!ok) return { ok: false, mensagem: 'Aula não encontrada.' }
        return { ok: true, id: v.dados.id, aviso: await this.avisoFeriado(v.dados.dataHoraInicio ?? aula.dataHoraInicio) }
      } catch (erro) {
        return this.erro('aulas:atualizar', erro, 'Não foi possível atualizar a aula.')
      }
    })

    registrarCanal('aulas:remarcar', async (_evento, entrada: unknown): Promise<ResultadoAula> => {
      const usuario = this.sessao.exigir(['admin', 'instrutor'])
      const v = this.validador.validarRemarcacao(entrada)
      if (!v.ok) return v
      try {
        const aula = await this.repositorio.obter(v.dados.id, null)
        if (!aula) return { ok: false, mensagem: 'Aula não encontrada.' }
        const meuInstrutorId = usuario.perfil === 'instrutor' ? await this.meuInstrutorId(usuario) : null
        this.gerenciar(usuario, aula.instrutorId, meuInstrutorId)
        const ok = await this.repositorio.remarcar(v.dados)
        if (!ok) return { ok: false, mensagem: 'Aula não encontrada.' }
        return { ok: true, id: v.dados.id, aviso: await this.avisoFeriado(v.dados.novaDataHora) }
      } catch (erro) {
        return this.erro('aulas:remarcar', erro, 'Não foi possível remarcar a aula.')
      }
    })

    registrarCanal('aulas:excluir', async (_evento, entrada: unknown): Promise<ResultadoAula> => {
      const usuario = this.sessao.exigir(['admin', 'instrutor'])
      const id = this.idValido(entrada)
      if (id === null) return { ok: false, mensagem: 'Aula inválida.' }
      try {
        const aula = await this.repositorio.obter(id, null)
        if (!aula) return { ok: false, mensagem: 'Aula não encontrada.' }
        const meuInstrutorId = usuario.perfil === 'instrutor' ? await this.meuInstrutorId(usuario) : null
        this.gerenciar(usuario, aula.instrutorId, meuInstrutorId)
        const ok = await this.repositorio.excluir(id)
        if (!ok) return { ok: false, mensagem: 'Aula não encontrada.' }
        return { ok: true, id }
      } catch (erro) {
        return this.erro('aulas:excluir', erro, 'Não foi possível excluir a aula.')
      }
    })

    registrarCanal('aulas:inscrever', async (_evento, entrada: unknown): Promise<ResultadoAula> => {
      const usuario = this.sessao.exigir(['admin', 'instrutor'])
      if (typeof entrada !== 'object' || entrada === null) return { ok: false, mensagem: 'Dados inválidos.' }
      const e = entrada as Record<string, unknown>
      const aulaId = this.idValido(e.aulaId)
      const alunoId = this.idValido(e.alunoId)
      if (aulaId === null || alunoId === null) return { ok: false, mensagem: 'Dados da inscrição inválidos.' }
      try {
        const aula = await this.repositorio.obter(aulaId, null)
        if (!aula) return { ok: false, mensagem: 'Aula não encontrada.' }
        const meuInstrutorId = usuario.perfil === 'instrutor' ? await this.meuInstrutorId(usuario) : null
        this.gerenciar(usuario, aula.instrutorId, meuInstrutorId)
        const id = await this.repositorio.inscrever(aulaId, alunoId)
        return { ok: true, id }
      } catch (erro) {
        return this.erro('aulas:inscrever', erro, 'Não foi possível inscrever o aluno.')
      }
    })

    registrarCanal('aulas:inscreverMe', async (_evento, entrada: unknown): Promise<ResultadoAula> => {
      const usuario = this.sessao.exigir(['aluno'])
      if (typeof entrada !== 'object' || entrada === null) return { ok: false, mensagem: 'Dados inválidos.' }
      const aulaId = this.idValido((entrada as Record<string, unknown>).aulaId)
      if (aulaId === null) return { ok: false, mensagem: 'Aula inválida.' }
      try {
        const alunoId = await this.meuAlunoId(usuario)
        if (alunoId === null) return { ok: false, mensagem: 'Seu usuário não possui cadastro de aluno.' }
        const id = await this.repositorio.inscrever(aulaId, alunoId)
        return { ok: true, id }
      } catch (erro) {
        return this.erro('aulas:inscreverMe', erro, 'Não foi possível reservar a vaga.')
      }
    })

    registrarCanal('aulas:cancelarInscricao', async (_evento, entrada: unknown): Promise<ResultadoAula> => {
      const usuario = this.sessao.exigir()
      const inscricaoId = this.idValido(entrada)
      if (inscricaoId === null) return { ok: false, mensagem: 'Inscrição inválida.' }
      try {
        const contexto = await this.repositorio.contextoInscricao(inscricaoId)
        if (!contexto) return { ok: false, mensagem: 'Inscrição não encontrada.' }
        if (usuario.perfil === 'aluno') {
          const meuAlunoId = await this.meuAlunoId(usuario)
          if (meuAlunoId === null || meuAlunoId !== contexto.alunoId) throw new Error('Acesso negado')
        } else {
          const meuInstrutorId = usuario.perfil === 'instrutor' ? await this.meuInstrutorId(usuario) : null
          this.gerenciar(usuario, contexto.instrutorId, meuInstrutorId)
        }
        const ok = await this.repositorio.cancelarInscricao(inscricaoId)
        if (!ok) return { ok: false, mensagem: 'Inscrição não encontrada.' }
        return { ok: true, id: inscricaoId }
      } catch (erro) {
        return this.erro('aulas:cancelarInscricao', erro, 'Não foi possível cancelar a inscrição.')
      }
    })

    registrarCanal('aulas:minhas', async (): Promise<Aula[]> => {
      const usuario = this.sessao.exigir(['aluno'])
      const alunoId = await this.meuAlunoId(usuario)
      if (alunoId === null) return []
      return this.repositorio.minhas(alunoId)
    })

    registrarCanal('aulas:listaPresenca', async (_evento, entrada: unknown): Promise<InscricaoAula[]> => {
      const usuario = this.sessao.exigir(['admin', 'instrutor'])
      const aulaId = this.idValido(entrada)
      if (aulaId === null) throw new Error('Aula inválida.')
      const aula = await this.repositorio.obter(aulaId, null)
      if (!aula) throw new Error('Aula não encontrada.')
      const meuInstrutorId = usuario.perfil === 'instrutor' ? await this.meuInstrutorId(usuario) : null
      this.gerenciar(usuario, aula.instrutorId, meuInstrutorId)
      return this.repositorio.listarInscricoes(aulaId)
    })

    registrarCanal('aulas:marcarPresenca', async (_evento, entrada: unknown): Promise<ResultadoAula> => {
      const usuario = this.sessao.exigir(['admin', 'instrutor'])
      if (typeof entrada !== 'object' || entrada === null) return { ok: false, mensagem: 'Dados inválidos.' }
      const e = entrada as Record<string, unknown>
      const inscricaoId = this.idValido(e.inscricaoId)
      if (inscricaoId === null || typeof e.presente !== 'boolean') {
        return { ok: false, mensagem: 'Dados de presença inválidos.' }
      }
      try {
        const contexto = await this.repositorio.contextoInscricao(inscricaoId)
        if (!contexto) return { ok: false, mensagem: 'Inscrição não encontrada.' }
        const meuInstrutorId = usuario.perfil === 'instrutor' ? await this.meuInstrutorId(usuario) : null
        this.gerenciar(usuario, contexto.instrutorId, meuInstrutorId)
        const ok = await this.repositorio.marcarPresenca(inscricaoId, e.presente)
        if (!ok) return { ok: false, mensagem: 'Inscrição não encontrada.' }
        return { ok: true, id: inscricaoId }
      } catch (erro) {
        return this.erro('aulas:marcarPresenca', erro, 'Não foi possível registrar a presença.')
      }
    })

    registrarCanal('aulas:vagas', async (_evento, entrada: unknown): Promise<{ capacidadeMax: number; ocupadas: number; disponiveis: number } | null> => {
      this.sessao.exigir()
      const aulaId = this.idValido(entrada)
      if (aulaId === null) throw new Error('Aula inválida.')
      return this.repositorio.vagas(aulaId)
    })

    registrarCanal('inscricoes:listar', async (_evento, entrada: unknown): Promise<InscricaoDetalhe[]> => {
      const usuario = this.sessao.exigir(['admin', 'instrutor'])
      const filtro = this.filtroInscricoes(entrada)
      if (usuario.perfil === 'instrutor') {
        const instrutorId = await this.meuInstrutorId(usuario)
        if (instrutorId === null) return []
        filtro.instrutorId = instrutorId
      }
      return this.repositorio.listarInscricoesTodas(filtro)
    })

    registrarCanal('inscricoes:obter', async (_evento, entrada: unknown): Promise<InscricaoDetalhe | null> => {
      const usuario = this.sessao.exigir(['admin', 'instrutor'])
      const id = this.idValido(entrada)
      if (id === null) throw new Error('Inscrição inválida.')
      const inscricao = await this.repositorio.obterInscricao(id)
      if (!inscricao) return null
      const contexto = await this.repositorio.contextoInscricao(id)
      if (!contexto) return null
      const meuInstrutorId = usuario.perfil === 'instrutor' ? await this.meuInstrutorId(usuario) : null
      this.gerenciar(usuario, contexto.instrutorId, meuInstrutorId)
      return inscricao
    })

    registrarCanal('inscricoes:criar', async (_evento, entrada: unknown): Promise<ResultadoInscricao> => {
      const usuario = this.sessao.exigir(['admin', 'instrutor'])
      if (typeof entrada !== 'object' || entrada === null) return { ok: false, mensagem: 'Dados inválidos.' }
      const e = entrada as Record<string, unknown>
      const aulaId = this.idValido(e.aulaId)
      const alunoId = this.idValido(e.alunoId)
      if (aulaId === null || alunoId === null) return { ok: false, mensagem: 'Informe a aula e o aluno.' }
      try {
        const aula = await this.repositorio.obter(aulaId, null)
        if (!aula) return { ok: false, mensagem: 'Aula não encontrada.' }
        const meuInstrutorId = usuario.perfil === 'instrutor' ? await this.meuInstrutorId(usuario) : null
        this.gerenciar(usuario, aula.instrutorId, meuInstrutorId)
        const id = await this.repositorio.inscrever(aulaId, alunoId)
        return { ok: true, id }
      } catch (erro) {
        return this.erroInscricao('inscricoes:criar', erro, 'Não foi possível criar a inscrição.')
      }
    })

    registrarCanal('inscricoes:atualizar', async (_evento, entrada: unknown): Promise<ResultadoInscricao> => {
      const usuario = this.sessao.exigir(['admin', 'instrutor'])
      if (typeof entrada !== 'object' || entrada === null) return { ok: false, mensagem: 'Dados inválidos.' }
      const e = entrada as Record<string, unknown>
      const id = this.idValido(e.id)
      if (id === null) return { ok: false, mensagem: 'Inscrição inválida.' }
      if (typeof e.status !== 'string' || !STATUS_INSCRICAO.includes(e.status as StatusInscricao)) {
        return { ok: false, mensagem: 'Status de inscrição inválido.' }
      }
      try {
        const contexto = await this.repositorio.contextoInscricao(id)
        if (!contexto) return { ok: false, mensagem: 'Inscrição não encontrada.' }
        const meuInstrutorId = usuario.perfil === 'instrutor' ? await this.meuInstrutorId(usuario) : null
        this.gerenciar(usuario, contexto.instrutorId, meuInstrutorId)
        const ok = await this.repositorio.atualizarStatusInscricao(id, e.status as StatusInscricao)
        if (!ok) return { ok: false, mensagem: 'Inscrição não encontrada.' }
        return { ok: true, id }
      } catch (erro) {
        return this.erroInscricao('inscricoes:atualizar', erro, 'Não foi possível atualizar a inscrição.')
      }
    })

    registrarCanal('inscricoes:excluir', async (_evento, entrada: unknown): Promise<ResultadoInscricao> => {
      const usuario = this.sessao.exigir(['admin', 'instrutor'])
      const id = this.idValido(entrada)
      if (id === null) return { ok: false, mensagem: 'Inscrição inválida.' }
      try {
        const contexto = await this.repositorio.contextoInscricao(id)
        if (!contexto) return { ok: false, mensagem: 'Inscrição não encontrada.' }
        const meuInstrutorId = usuario.perfil === 'instrutor' ? await this.meuInstrutorId(usuario) : null
        this.gerenciar(usuario, contexto.instrutorId, meuInstrutorId)
        const ok = await this.repositorio.excluirInscricao(id)
        if (!ok) return { ok: false, mensagem: 'Inscrição não encontrada.' }
        return { ok: true, id }
      } catch (erro) {
        return this.erroInscricao('inscricoes:excluir', erro, 'Não foi possível excluir a inscrição.')
      }
    })
  }
}
