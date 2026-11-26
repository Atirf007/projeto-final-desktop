import 'dotenv/config'
import { createInterface } from 'readline/promises'
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { Banco } from '../src/Banco'
import { LIKE_TESTE_CLIMA, formatarDataHora } from './teste-clima-comum'

type AulaTeste = {
  id: number
  titulo: string
  dataHoraInicio: string
}

type AlunoTeste = {
  id: number
  nome: string
  email: string
}

type UsuarioTeste = {
  id: number
  nome: string
  email: string
}

type PlanoLimpeza = {
  aulas: AulaTeste[]
  alunos: AlunoTeste[]
  usuarios: UsuarioTeste[]
}

type ResultadoLimpeza = {
  aulas: number
  alunos: number
  usuarios: number
}

class LimpadorTesteClima {
  private carregarPlano = async (): Promise<PlanoLimpeza> => {
    const [aulas] = await Banco.pool.query<RowDataPacket[]>({
      sql: 'SELECT id, titulo, data_hora_inicio FROM aulas WHERE titulo LIKE ? ORDER BY id',
      values: [LIKE_TESTE_CLIMA],
      timeout: 10000
    })

    const [alunos] = await Banco.pool.query<RowDataPacket[]>({
      sql: `SELECT a.id, u.nome, u.email
              FROM alunos a
              INNER JOIN usuarios u ON u.id = a.usuario_id
             WHERE a.observacoes_saude LIKE ?
             ORDER BY a.id`,
      values: [LIKE_TESTE_CLIMA],
      timeout: 10000
    })

    const [usuarios] = await Banco.pool.query<RowDataPacket[]>({
      sql: `SELECT id, nome, email
              FROM usuarios
             WHERE nome LIKE ?
               AND perfil = 'aluno'
             ORDER BY id`,
      values: [LIKE_TESTE_CLIMA],
      timeout: 10000
    })

    return {
      aulas: aulas.map((linha) => ({
        id: Number(linha.id),
        titulo: String(linha.titulo ?? ''),
        dataHoraInicio: String(linha.data_hora_inicio ?? '')
      })),
      alunos: alunos.map((linha) => ({
        id: Number(linha.id),
        nome: String(linha.nome ?? ''),
        email: String(linha.email ?? '')
      })),
      usuarios: usuarios.map((linha) => ({
        id: Number(linha.id),
        nome: String(linha.nome ?? ''),
        email: String(linha.email ?? '')
      }))
    }
  }

  private vazio = (plano: PlanoLimpeza): boolean =>
    plano.aulas.length === 0 && plano.alunos.length === 0 && plano.usuarios.length === 0

  private mostrarPlano = (plano: PlanoLimpeza): void => {
    console.log('')
    console.log('=== Limpar teste de clima ===')
    console.log(`Aulas de teste: ${plano.aulas.length}`)
    for (const aula of plano.aulas.slice(0, 20)) {
      console.log(`- #${aula.id} ${aula.titulo} (${formatarDataHora(aula.dataHoraInicio)})`)
    }
    if (plano.aulas.length > 20) console.log(`- ... e mais ${plano.aulas.length - 20} aula(s)`)

    console.log(`Alunos de teste: ${plano.alunos.length}`)
    for (const aluno of plano.alunos.slice(0, 20)) {
      console.log(`- #${aluno.id} ${aluno.nome} (${aluno.email})`)
    }
    if (plano.alunos.length > 20) console.log(`- ... e mais ${plano.alunos.length - 20} aluno(s)`)

    console.log(`Usuários de teste: ${plano.usuarios.length}`)
    for (const usuario of plano.usuarios.slice(0, 20)) {
      console.log(`- #${usuario.id} ${usuario.nome} (${usuario.email})`)
    }
    if (plano.usuarios.length > 20) console.log(`- ... e mais ${plano.usuarios.length - 20} usuário(s)`)

    console.log('')
    console.log('As inscrições, presenças e notificações ligadas a esses registros também serão removidas.')
    console.log('')
  }

  private confirmar = async (): Promise<boolean> => {
    const leitor = createInterface({ input: process.stdin, output: process.stdout })
    try {
      const resposta = (await leitor.question('Confirma a limpeza? [s/N] ')).trim().toLowerCase()
      return ['s', 'sim', 'y', 'yes'].includes(resposta)
    } finally {
      leitor.close()
    }
  }

  private executar = async (plano: PlanoLimpeza): Promise<ResultadoLimpeza> => {
    const conexao = await Banco.pool.getConnection()
    const aulaIds = plano.aulas.map((aula) => aula.id)
    const alunoIds = plano.alunos.map((aluno) => aluno.id)
    const usuarioIds = plano.usuarios.map((usuario) => usuario.id)
    const placeholders = (ids: number[]): string => ids.map(() => '?').join(', ')

    try {
      await conexao.beginTransaction()

      if (aulaIds.length) {
        const ph = placeholders(aulaIds)
        await conexao.query<ResultSetHeader>({
          sql: `DELETE FROM notificacoes WHERE aula_id IN (${ph})`,
          values: aulaIds,
          timeout: 10000
        })
        await conexao.query<ResultSetHeader>({
          sql: `DELETE FROM presencas WHERE aula_id IN (${ph})`,
          values: aulaIds,
          timeout: 10000
        })
        await conexao.query<ResultSetHeader>({
          sql: `DELETE FROM visitantes WHERE aula_id IN (${ph})`,
          values: aulaIds,
          timeout: 10000
        })
      }

      if (usuarioIds.length) {
        const ph = placeholders(usuarioIds)
        await conexao.query<ResultSetHeader>({
          sql: `DELETE FROM notificacoes WHERE usuario_id IN (${ph})`,
          values: usuarioIds,
          timeout: 10000
        })
      }

      if (aulaIds.length) {
        const ph = placeholders(aulaIds)
        await conexao.query<ResultSetHeader>({
          sql: `DELETE FROM aulas WHERE id IN (${ph})`,
          values: aulaIds,
          timeout: 10000
        })
      }

      if (alunoIds.length) {
        const ph = placeholders(alunoIds)
        await conexao.query<ResultSetHeader>({
          sql: `DELETE FROM alunos WHERE id IN (${ph})`,
          values: alunoIds,
          timeout: 10000
        })
      }

      if (usuarioIds.length) {
        const ph = placeholders(usuarioIds)
        await conexao.query<ResultSetHeader>({
          sql: `DELETE FROM usuarios WHERE id IN (${ph})`,
          values: usuarioIds,
          timeout: 10000
        })
      }

      await conexao.commit()
      return {
        aulas: aulaIds.length,
        alunos: alunoIds.length,
        usuarios: usuarioIds.length
      }
    } catch (erro) {
      await conexao.rollback().catch(() => undefined)
      throw erro
    } finally {
      conexao.release()
    }
  }

  main = async (): Promise<void> => {
    const plano = await this.carregarPlano()
    if (this.vazio(plano)) {
      console.log('Nenhum registro de teste de clima encontrado.')
      return
    }

    this.mostrarPlano(plano)
    if (!(await this.confirmar())) {
      console.log('Cancelado. Nada foi apagado.')
      return
    }

    const resultado = await this.executar(plano)
    console.log('')
    console.log('Limpeza concluída:')
    console.log(`- Aulas removidas: ${resultado.aulas}`)
    console.log(`- Alunos de teste removidos: ${resultado.alunos}`)
    console.log(`- Usuários de teste removidos: ${resultado.usuarios}`)
  }
}

const main = async (): Promise<void> => {
  const limpador = new LimpadorTesteClima()
  await limpador.main()
}

main()
  .catch((erro: unknown) => {
    console.error('Erro:', erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(async () => {
    await Banco.pool.end().catch(() => undefined)
  })
