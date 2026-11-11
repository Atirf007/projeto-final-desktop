import { ipcMain } from 'electron'
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { Banco } from '../Banco'
import { BancoErros } from '../BancoErros'
import { Sessao, UsuarioSessao } from '../Sessao'

export type Avaliacao = {
  id: number
  alunoId: number
  alunoNome: string
  instrutorId?: number
  instrutorNome?: string
  dataAvaliacao: string
  pesoKg: number
  alturaCm: number
  imc: number
  percentualGordura?: number
  cinturaCm?: number
  quadrilCm?: number
  peitoCm?: number
  bracoCm?: number
  coxaCm?: number
  observacoes?: string
  criadoEm: string
  atualizadoEm: string
  podeEditar?: boolean
}

export type CriarAvaliacaoInput = {
  alunoId: number
  dataAvaliacao: string
  pesoKg: number
  alturaCm: number
  percentualGordura?: number
  cinturaCm?: number
  quadrilCm?: number
  peitoCm?: number
  bracoCm?: number
  coxaCm?: number
  observacoes?: string
}

export type AtualizarAvaliacaoInput = {
  id: number
  dataAvaliacao?: string
  pesoKg?: number
  alturaCm?: number
  percentualGordura?: number | null
  cinturaCm?: number | null
  quadrilCm?: number | null
  peitoCm?: number | null
  bracoCm?: number | null
  coxaCm?: number | null
  observacoes?: string | null
}

export type FiltroAvaliacoes = {
  alunoId?: number
  inicio?: string
  fim?: string
}

export type PontoEvolucao = {
  data: string
  pesoKg: number
  imc: number
  percentualGordura?: number
  cinturaCm?: number
}

export type SerieEvolucao = {
  alunoId: number
  alunoNome: string
  pontos: PontoEvolucao[]
}

export type ResultadoAvaliacao = { ok: true; id?: number } | { ok: false; mensagem: string }

const TIMEOUT = 15000

class ErroAvaliacao extends Error {}

const dataStr = (valor: unknown): string => String(valor ?? '').slice(0, 10)

const numeroOpcional = (valor: unknown): number | undefined => {
  if (valor === null || valor === undefined || valor === '') return undefined
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero : undefined
}

const calcularImc = (pesoKg: number, alturaCm: number): number => {
  const altura = alturaCm / 100
  if (!altura) return 0
  return Math.round((pesoKg / (altura * altura)) * 100) / 100
}

class AvaliacaoValidador {
  private texto(valor: unknown, max: number): string | null {
    if (typeof valor !== 'string') return null
    const limpo = valor.trim()
    return limpo.length <= max ? limpo : null
  }

  private id(valor: unknown): number | null {
    if (valor === undefined || valor === null || valor === '') return null
    const id = Number(valor)
    return Number.isInteger(id) && id > 0 ? id : null
  }

  private numero(valor: unknown, minimo: number, maximo: number): number | null {
    const numero = Number(valor)
    if (!Number.isFinite(numero) || numero < minimo || numero > maximo) return null
    return Math.round(numero * 100) / 100
  }

  private numeroOpcional(valor: unknown, minimo: number, maximo: number): number | undefined | null {
    if (valor === undefined || valor === null || valor === '') return undefined
    return this.numero(valor, minimo, maximo)
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
    const hoje = new Date()
    const hojeUtc = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
    if (d.getTime() > hojeUtc) return null
    if (ano < 1900 || ano > 2100) return null
    return `${m[1]}-${m[2]}-${m[3]}`
  }

  private observacoes(valor: unknown): string | undefined | null {
    if (valor === undefined || valor === null || valor === '') return undefined
    return this.texto(valor, 2000)
  }

  validarCriacao(
    entrada: unknown
  ): { ok: true; dados: CriarAvaliacaoInput } | { ok: false; mensagem: string } {
    if (typeof entrada !== 'object' || entrada === null) return { ok: false, mensagem: 'Dados inválidos.' }
    const e = entrada as Record<string, unknown>
    const alunoId = this.id(e.alunoId)
    if (alunoId === null) return { ok: false, mensagem: 'Selecione o aluno da avaliação.' }
    const dataAvaliacao = this.data(e.dataAvaliacao)
    if (!dataAvaliacao) return { ok: false, mensagem: 'Informe uma data de avaliação válida e que não esteja no futuro.' }
    const pesoKg = this.numero(e.pesoKg, 20, 400)
    if (pesoKg === null) return { ok: false, mensagem: 'Informe o peso entre 20 e 400 kg.' }
    const alturaCm = this.numero(e.alturaCm, 80, 250)
    if (alturaCm === null) return { ok: false, mensagem: 'Informe a altura entre 80 e 250 cm.' }

    const percentualGordura = this.numeroOpcional(e.percentualGordura, 0, 70)
    if (percentualGordura === null) return { ok: false, mensagem: 'O percentual de gordura deve ficar entre 0 e 70%.' }
    const cinturaCm = this.numeroOpcional(e.cinturaCm, 0, 300)
    if (cinturaCm === null) return { ok: false, mensagem: 'A cintura deve ficar entre 0 e 300 cm.' }
    const quadrilCm = this.numeroOpcional(e.quadrilCm, 0, 300)
    if (quadrilCm === null) return { ok: false, mensagem: 'O quadril deve ficar entre 0 e 300 cm.' }
    const peitoCm = this.numeroOpcional(e.peitoCm, 0, 300)
    if (peitoCm === null) return { ok: false, mensagem: 'O peito deve ficar entre 0 e 300 cm.' }
    const bracoCm = this.numeroOpcional(e.bracoCm, 0, 300)
    if (bracoCm === null) return { ok: false, mensagem: 'O braço deve ficar entre 0 e 300 cm.' }
    const coxaCm = this.numeroOpcional(e.coxaCm, 0, 300)
    if (coxaCm === null) return { ok: false, mensagem: 'A coxa deve ficar entre 0 e 300 cm.' }
    const observacoes = this.observacoes(e.observacoes)
    if (observacoes === null) return { ok: false, mensagem: 'As observações devem ter no máximo 2000 caracteres.' }

    return {
      ok: true,
      dados: {
        alunoId,
        dataAvaliacao,
        pesoKg,
        alturaCm,
        percentualGordura,
        cinturaCm,
        quadrilCm,
        peitoCm,
        bracoCm,
        coxaCm,
        observacoes
      }
    }
  }

  validarAtualizacao(
    entrada: unknown
  ): { ok: true; dados: AtualizarAvaliacaoInput } | { ok: false; mensagem: string } {
    if (typeof entrada !== 'object' || entrada === null) return { ok: false, mensagem: 'Dados inválidos.' }
    const e = entrada as Record<string, unknown>
    const id = this.id(e.id)
    if (id === null) return { ok: false, mensagem: 'Avaliação inválida.' }
    const dados: AtualizarAvaliacaoInput = { id }

    if (e.dataAvaliacao !== undefined) {
      const dataAvaliacao = this.data(e.dataAvaliacao)
      if (!dataAvaliacao) return { ok: false, mensagem: 'Data de avaliação inválida.' }
      dados.dataAvaliacao = dataAvaliacao
    }
    if (e.pesoKg !== undefined) {
      const pesoKg = this.numero(e.pesoKg, 20, 400)
      if (pesoKg === null) return { ok: false, mensagem: 'Peso inválido.' }
      dados.pesoKg = pesoKg
    }
    if (e.alturaCm !== undefined) {
      const alturaCm = this.numero(e.alturaCm, 80, 250)
      if (alturaCm === null) return { ok: false, mensagem: 'Altura inválida.' }
      dados.alturaCm = alturaCm
    }

    const opcionais: Array<[keyof AtualizarAvaliacaoInput, unknown, number, number, string]> = [
      ['percentualGordura', e.percentualGordura, 0, 70, 'percentual de gordura'],
      ['cinturaCm', e.cinturaCm, 0, 300, 'cintura'],
      ['quadrilCm', e.quadrilCm, 0, 300, 'quadril'],
      ['peitoCm', e.peitoCm, 0, 300, 'peito'],
      ['bracoCm', e.bracoCm, 0, 300, 'braço'],
      ['coxaCm', e.coxaCm, 0, 300, 'coxa']
    ]
    for (const [campo, valor, minimo, maximo, rotulo] of opcionais) {
      if (valor === undefined) continue
      if (valor === null || valor === '') {
        ;(dados as Record<string, unknown>)[campo] = null
        continue
      }
      const numero = this.numero(valor, minimo, maximo)
      if (numero === null) return { ok: false, mensagem: `Valor inválido para ${rotulo}.` }
      ;(dados as Record<string, unknown>)[campo] = numero
    }

    if (e.observacoes !== undefined) {
      if (e.observacoes === null || e.observacoes === '') {
        dados.observacoes = null
      } else {
        const observacoes = this.texto(e.observacoes, 2000)
        if (observacoes === null) return { ok: false, mensagem: 'Observações inválidas.' }
        dados.observacoes = observacoes
      }
    }

    return { ok: true, dados }
  }

  filtro(entrada: unknown): FiltroAvaliacoes {
    if (typeof entrada !== 'object' || entrada === null) return {}
    const e = entrada as Record<string, unknown>
    const filtro: FiltroAvaliacoes = {}
    const alunoId = numeroOpcional(e.alunoId)
    if (alunoId && Number.isInteger(alunoId) && alunoId > 0) filtro.alunoId = alunoId
    if (typeof e.inicio === 'string') {
      const inicio = this.data(e.inicio)
      if (inicio) filtro.inicio = inicio
    }
    if (typeof e.fim === 'string') {
      const fim = this.data(e.fim)
      if (fim) filtro.fim = fim
    }
    if (filtro.inicio && filtro.fim && filtro.inicio > filtro.fim) {
      const troca = filtro.inicio
      filtro.inicio = filtro.fim
      filtro.fim = troca
    }
    return filtro
  }
}

const mapear = (linha: RowDataPacket): Avaliacao => {
  const pesoKg = Number(linha.peso_kg ?? 0)
  const alturaCm = Number(linha.altura_cm ?? 0)
  return {
    id: Number(linha.id),
    alunoId: Number(linha.aluno_id),
    alunoNome: String(linha.aluno_nome ?? ''),
    instrutorId:
      linha.instrutor_id === null || linha.instrutor_id === undefined ? undefined : Number(linha.instrutor_id),
    instrutorNome: linha.instrutor_nome ? String(linha.instrutor_nome) : undefined,
    dataAvaliacao: dataStr(linha.data_avaliacao),
    pesoKg,
    alturaCm,
    imc: calcularImc(pesoKg, alturaCm),
    percentualGordura: numeroOpcional(linha.percentual_gordura),
    cinturaCm: numeroOpcional(linha.cintura_cm),
    quadrilCm: numeroOpcional(linha.quadril_cm),
    peitoCm: numeroOpcional(linha.peito_cm),
    bracoCm: numeroOpcional(linha.braco_cm),
    coxaCm: numeroOpcional(linha.coxa_cm),
    observacoes: linha.observacoes ? String(linha.observacoes) : undefined,
    criadoEm: String(linha.criado_em ?? ''),
    atualizadoEm: String(linha.atualizado_em ?? '')
  }
}

class AvaliacaoRepository {
  private readonly pool = Banco.pool

  private readonly campos = `
    av.id, av.aluno_id, u.nome AS aluno_nome, av.instrutor_id, ui.nome AS instrutor_nome,
    av.data_avaliacao, av.peso_kg, av.altura_cm, av.percentual_gordura,
    av.cintura_cm, av.quadril_cm, av.peito_cm, av.braco_cm, av.coxa_cm,
    av.observacoes, av.criado_em, av.atualizado_em`

  private readonly joins = `
    FROM avaliacoes av
    INNER JOIN alunos al ON al.id = av.aluno_id
    INNER JOIN usuarios u ON u.id = al.usuario_id
    LEFT JOIN instrutores i ON i.id = av.instrutor_id
    LEFT JOIN usuarios ui ON ui.id = i.usuario_id`

  listar = async (filtro: FiltroAvaliacoes): Promise<Avaliacao[]> => {
    const condicoes: string[] = []
    const valores: unknown[] = []
    if (filtro.alunoId) {
      condicoes.push('av.aluno_id = ?')
      valores.push(filtro.alunoId)
    }
    if (filtro.inicio) {
      condicoes.push('av.data_avaliacao >= ?')
      valores.push(filtro.inicio)
    }
    if (filtro.fim) {
      condicoes.push('av.data_avaliacao <= ?')
      valores.push(filtro.fim)
    }
    const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : ''
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT ${this.campos} ${this.joins} ${where}
            ORDER BY av.data_avaliacao DESC, av.id DESC
            LIMIT 500`,
      values: valores,
      timeout: TIMEOUT
    })
    return linhas.map(mapear)
  }

  obter = async (id: number): Promise<Avaliacao | null> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: `SELECT ${this.campos} ${this.joins} WHERE av.id = ? LIMIT 1`,
      values: [id],
      timeout: TIMEOUT
    })
    return linhas.length ? mapear(linhas[0]) : null
  }

  listarPorAluno = async (alunoId: number): Promise<Avaliacao[]> =>
    this.listar({ alunoId })

  alunoExiste = async (alunoId: number): Promise<boolean> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: 'SELECT id FROM alunos WHERE id = ? LIMIT 1',
      values: [alunoId],
      timeout: TIMEOUT
    })
    return linhas.length > 0
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

  alunoIdPorUsuario = async (usuarioId: number): Promise<number | null> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: 'SELECT id FROM alunos WHERE usuario_id = ? LIMIT 1',
      values: [usuarioId],
      timeout: TIMEOUT
    })
    return linhas.length ? Number(linhas[0].id) : null
  }

  instrutorIdPorUsuario = async (usuarioId: number): Promise<number | null> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: 'SELECT id FROM instrutores WHERE usuario_id = ? LIMIT 1',
      values: [usuarioId],
      timeout: TIMEOUT
    })
    return linhas.length ? Number(linhas[0].id) : null
  }

  dono = async (id: number): Promise<{ existe: boolean; instrutorId: number | null }> => {
    const [linhas] = await this.pool.query<RowDataPacket[]>({
      sql: 'SELECT instrutor_id FROM avaliacoes WHERE id = ? LIMIT 1',
      values: [id],
      timeout: TIMEOUT
    })
    if (!linhas.length) return { existe: false, instrutorId: null }
    return {
      existe: true,
      instrutorId:
        linhas[0].instrutor_id === null || linhas[0].instrutor_id === undefined
          ? null
          : Number(linhas[0].instrutor_id)
    }
  }

  criar = async (dados: CriarAvaliacaoInput, instrutorId: number | null): Promise<number> => {
    if (!(await this.alunoExiste(dados.alunoId))) {
      throw new ErroAvaliacao('O aluno selecionado não existe mais. Escolha outro aluno.')
    }
    const [resultado] = await this.pool.query<ResultSetHeader>({
      sql: `INSERT INTO avaliacoes
        (aluno_id, instrutor_id, data_avaliacao, peso_kg, altura_cm, percentual_gordura,
         cintura_cm, quadril_cm, peito_cm, braco_cm, coxa_cm, observacoes, criado_em, atualizado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      values: [
        dados.alunoId,
        instrutorId,
        dados.dataAvaliacao,
        dados.pesoKg,
        dados.alturaCm,
        dados.percentualGordura ?? null,
        dados.cinturaCm ?? null,
        dados.quadrilCm ?? null,
        dados.peitoCm ?? null,
        dados.bracoCm ?? null,
        dados.coxaCm ?? null,
        dados.observacoes ?? null
      ],
      timeout: TIMEOUT
    })
    return Number(resultado.insertId)
  }

  atualizar = async (dados: AtualizarAvaliacaoInput): Promise<boolean> => {
    const existente = await this.dono(dados.id)
    if (!existente.existe) return false

    const campos: string[] = []
    const valores: unknown[] = []
    const set = (coluna: string, valor: unknown): void => {
      campos.push(`${coluna} = ?`)
      valores.push(valor)
    }
    if (dados.dataAvaliacao !== undefined) set('data_avaliacao', dados.dataAvaliacao)
    if (dados.pesoKg !== undefined) set('peso_kg', dados.pesoKg)
    if (dados.alturaCm !== undefined) set('altura_cm', dados.alturaCm)
    if (dados.percentualGordura !== undefined) set('percentual_gordura', dados.percentualGordura)
    if (dados.cinturaCm !== undefined) set('cintura_cm', dados.cinturaCm)
    if (dados.quadrilCm !== undefined) set('quadril_cm', dados.quadrilCm)
    if (dados.peitoCm !== undefined) set('peito_cm', dados.peitoCm)
    if (dados.bracoCm !== undefined) set('braco_cm', dados.bracoCm)
    if (dados.coxaCm !== undefined) set('coxa_cm', dados.coxaCm)
    if (dados.observacoes !== undefined) set('observacoes', dados.observacoes)

    if (!campos.length) return true
    campos.push('atualizado_em = NOW()')
    await this.pool.query({
      sql: `UPDATE avaliacoes SET ${campos.join(', ')} WHERE id = ?`,
      values: [...valores, dados.id],
      timeout: TIMEOUT
    })
    return true
  }

  excluir = async (id: number): Promise<boolean> => {
    const [resultado] = await this.pool.query<ResultSetHeader>({
      sql: 'DELETE FROM avaliacoes WHERE id = ?',
      values: [id],
      timeout: TIMEOUT
    })
    return resultado.affectedRows > 0
  }
}

export class AvaliacaoIpc {
  private readonly validador = new AvaliacaoValidador()

  constructor(
    private readonly sessao: Sessao,
    private readonly repositorio: AvaliacaoRepository = new AvaliacaoRepository()
  ) {}

  private idValido(valor: unknown): number | null {
    const id = typeof valor === 'number' ? valor : typeof valor === 'string' ? Number(valor) : NaN
    return Number.isInteger(id) && id > 0 ? id : null
  }

  private erro = (contexto: string, erro: unknown, padrao: string): ResultadoAvaliacao => {
    if (erro instanceof ErroAvaliacao) return { ok: false, mensagem: erro.message }
    if (erro instanceof Error && erro.message === 'Acesso negado') {
      return { ok: false, mensagem: 'Você só pode alterar avaliações que registrou.' }
    }
    console.error(`[${contexto}]`, erro)
    return { ok: false, mensagem: BancoErros.mensagem(erro, padrao) }
  }

  private meuInstrutorId = async (usuario: UsuarioSessao): Promise<number | null> =>
    this.repositorio.instrutorIdPorUsuario(usuario.id)

  private podeEditar = (usuario: UsuarioSessao, instrutorId: number | undefined, meuInstrutorId: number | null): boolean => {
    if (usuario.perfil === 'admin') return true
    return instrutorId !== undefined && meuInstrutorId !== null && instrutorId === meuInstrutorId
  }

  private exigirDono = async (usuario: UsuarioSessao, id: number): Promise<void> => {
    if (usuario.perfil === 'admin') return
    const existente = await this.repositorio.dono(id)
    if (!existente.existe) throw new ErroAvaliacao('Avaliação não encontrada.')
    const meu = await this.meuInstrutorId(usuario)
    if (meu === null || existente.instrutorId === null || existente.instrutorId !== meu) {
      throw new Error('Acesso negado')
    }
  }

  registrar = (): void => {
    ipcMain.handle('avaliacoes:listar', async (_evento, entrada: unknown): Promise<Avaliacao[]> => {
      const usuario = this.sessao.exigir(['admin', 'instrutor'])
      const lista = await this.repositorio.listar(this.validador.filtro(entrada))
      if (usuario.perfil === 'admin') return lista.map((avaliacao) => ({ ...avaliacao, podeEditar: true }))
      const meu = await this.meuInstrutorId(usuario)
      return lista.map((avaliacao) => ({
        ...avaliacao,
        podeEditar: this.podeEditar(usuario, avaliacao.instrutorId, meu)
      }))
    })

    ipcMain.handle('avaliacoes:obter', async (_evento, entrada: unknown): Promise<Avaliacao | null> => {
      const usuario = this.sessao.exigir(['admin', 'instrutor'])
      const id = this.idValido(entrada)
      if (id === null) throw new Error('Avaliação inválida.')
      const avaliacao = await this.repositorio.obter(id)
      if (!avaliacao) return null
      const meu = usuario.perfil === 'instrutor' ? await this.meuInstrutorId(usuario) : null
      return { ...avaliacao, podeEditar: this.podeEditar(usuario, avaliacao.instrutorId, meu) }
    })

    ipcMain.handle('avaliacoes:criar', async (_evento, entrada: unknown): Promise<ResultadoAvaliacao> => {
      const usuario = this.sessao.exigir(['admin', 'instrutor'])
      const v = this.validador.validarCriacao(entrada)
      if (!v.ok) return v
      try {
        const instrutorId = usuario.perfil === 'instrutor' ? await this.meuInstrutorId(usuario) : null
        if (usuario.perfil === 'instrutor' && instrutorId === null) {
          return { ok: false, mensagem: 'Seu usuário não está vinculado a um instrutor. Avise o administrador.' }
        }
        const id = await this.repositorio.criar(v.dados, instrutorId)
        return { ok: true, id }
      } catch (erro) {
        return this.erro('avaliacoes:criar', erro, 'Não foi possível registrar a avaliação.')
      }
    })

    ipcMain.handle('avaliacoes:atualizar', async (_evento, entrada: unknown): Promise<ResultadoAvaliacao> => {
      const usuario = this.sessao.exigir(['admin', 'instrutor'])
      const v = this.validador.validarAtualizacao(entrada)
      if (!v.ok) return v
      try {
        await this.exigirDono(usuario, v.dados.id)
        const ok = await this.repositorio.atualizar(v.dados)
        if (!ok) return { ok: false, mensagem: 'Avaliação não encontrada.' }
        return { ok: true, id: v.dados.id }
      } catch (erro) {
        return this.erro('avaliacoes:atualizar', erro, 'Não foi possível atualizar a avaliação.')
      }
    })

    ipcMain.handle('avaliacoes:excluir', async (_evento, entrada: unknown): Promise<ResultadoAvaliacao> => {
      const usuario = this.sessao.exigir(['admin', 'instrutor'])
      const id = this.idValido(entrada)
      if (id === null) return { ok: false, mensagem: 'Avaliação inválida.' }
      try {
        await this.exigirDono(usuario, id)
        const ok = await this.repositorio.excluir(id)
        if (!ok) return { ok: false, mensagem: 'Avaliação não encontrada.' }
        return { ok: true, id }
      } catch (erro) {
        return this.erro('avaliacoes:excluir', erro, 'Não foi possível excluir a avaliação.')
      }
    })

    ipcMain.handle('avaliacoes:evolucao', async (_evento, entrada: unknown): Promise<SerieEvolucao | null> => {
      this.sessao.exigir(['admin', 'instrutor'])
      const id = this.idValido(entrada)
      if (id === null) throw new Error('Aluno inválido.')
      const alunoNome = await this.repositorio.nomeAluno(id)
      if (alunoNome === null) return null
      const lista = await this.repositorio.listarPorAluno(id)
      const pontos = [...lista]
        .sort((a, b) => a.dataAvaliacao.localeCompare(b.dataAvaliacao) || a.id - b.id)
        .map((avaliacao) => ({
          data: avaliacao.dataAvaliacao,
          pesoKg: avaliacao.pesoKg,
          imc: avaliacao.imc,
          percentualGordura: avaliacao.percentualGordura,
          cinturaCm: avaliacao.cinturaCm
        }))
      return { alunoId: id, alunoNome, pontos }
    })

    ipcMain.handle('avaliacoes:minhas', async (): Promise<Avaliacao[]> => {
      const usuario = this.sessao.exigir(['aluno'])
      const alunoId = await this.repositorio.alunoIdPorUsuario(usuario.id)
      if (alunoId === null) return []
      return this.repositorio.listarPorAluno(alunoId)
    })
  }
}
