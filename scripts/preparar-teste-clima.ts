import 'dotenv/config'
import { randomBytes } from 'crypto'
import { createInterface } from 'readline/promises'
import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { Banco } from '../src/Banco'
import { Senha } from '../src/autenticacao/AutenticacaoBackend'
import {
  amanha,
  emailValido,
  formatarDataHora,
  gerarCpfTeste,
  localDescricaoTeste,
  nomeUsuarioTeste,
  normalizarEmail,
  observacoesAlunoTeste,
  tituloTeste
} from './teste-clima-comum'

type UsuarioPlano = {
  id: number
  nome: string
  perfil: string
  ativo: boolean
}

type AlunoPlano = {
  id: number
}

type ModalidadePlano = {
  id: number
  nome: string
}

type InstrutorPlano = {
  id: number
  nome: string
}

type PlanoPreparacao = {
  email: string
  usuario: UsuarioPlano | null
  aluno: AlunoPlano | null
  modalidade: ModalidadePlano
  instrutor: InstrutorPlano
  data: string
  dataHora: string
  titulo: string
}

type ResultadoPreparacao = {
  usuarioId: number
  alunoId: number
  aulaId: number
  inscricaoId: number
  criouUsuario: boolean
  criouAluno: boolean
}

class PreparadorTesteClima {
  private readonly email: string

  constructor(email: string) {
    this.email = normalizarEmail(email)
  }

  private validar = (): void => {
    if (!emailValido(this.email)) {
      throw new Error('E-mail inválido. Informe um e-mail válido, por exemplo: npm run preparar-teste-clima -- aluno@exemplo.com')
    }
  }

  private carregarPlano = async (): Promise<PlanoPreparacao> => {
    const [usuarios] = await Banco.pool.query<RowDataPacket[]>({
      sql: 'SELECT id, nome, perfil, ativo FROM usuarios WHERE email = ? LIMIT 1',
      values: [this.email],
      timeout: 10000
    })

    let usuario: UsuarioPlano | null = null
    let aluno: AlunoPlano | null = null

    if (usuarios.length) {
      const linha = usuarios[0]
      usuario = {
        id: Number(linha.id),
        nome: String(linha.nome ?? ''),
        perfil: String(linha.perfil ?? ''),
        ativo: Boolean(Number(linha.ativo))
      }

      if (!usuario.ativo) {
        throw new Error('Já existe um usuário com este e-mail, mas ele está inativo. Use outro e-mail ou ative o usuário manualmente.')
      }
      if (usuario.perfil !== 'aluno') {
        throw new Error('Este e-mail pertence a um usuário que não é aluno. Use um e-mail de aluno ou um e-mail novo.')
      }

      const [alunos] = await Banco.pool.query<RowDataPacket[]>({
        sql: 'SELECT id, ativo FROM alunos WHERE usuario_id = ? LIMIT 1',
        values: [usuario.id],
        timeout: 10000
      })

      if (alunos.length) {
        if (!Boolean(Number(alunos[0].ativo))) {
          throw new Error('O aluno com este e-mail existe, mas está inativo. Use outro e-mail ou ative o aluno manualmente.')
        }
        aluno = { id: Number(alunos[0].id) }
      }
    }

    const [modalidades] = await Banco.pool.query<RowDataPacket[]>({
      sql: 'SELECT id, nome FROM modalidades WHERE ativo = 1 ORDER BY id LIMIT 1',
      timeout: 10000
    })
    if (!modalidades.length) {
      throw new Error('Nenhuma modalidade ativa encontrada. Cadastre uma modalidade ativa antes de preparar o teste.')
    }

    const [instrutores] = await Banco.pool.query<RowDataPacket[]>({
      sql: `SELECT i.id, u.nome
              FROM instrutores i
              INNER JOIN usuarios u ON u.id = i.usuario_id
             WHERE i.ativo = 1
               AND u.ativo = 1
             ORDER BY i.id
             LIMIT 1`,
      timeout: 10000
    })
    if (!instrutores.length) {
      throw new Error('Nenhum instrutor ativo encontrado. Cadastre um instrutor ativo antes de preparar o teste.')
    }

    const data = amanha()
    return {
      email: this.email,
      usuario,
      aluno,
      modalidade: {
        id: Number(modalidades[0].id),
        nome: String(modalidades[0].nome ?? '')
      },
      instrutor: {
        id: Number(instrutores[0].id),
        nome: String(instrutores[0].nome ?? '')
      },
      data,
      dataHora: `${data} 10:00:00`,
      titulo: tituloTeste(this.email, data)
    }
  }

  private mostrarPlano = (plano: PlanoPreparacao): void => {
    console.log('')
    console.log('=== Preparar teste de clima ===')
    console.log(`E-mail informado: ${plano.email}`)
    console.log('')
    console.log('Aula que será criada:')
    console.log(`- Título: ${plano.titulo}`)
    console.log(`- Data: ${formatarDataHora(plano.dataHora)}`)
    console.log('- Local: externa')
    console.log('- Status: agendada')
    console.log(`- Modalidade: ${plano.modalidade.nome} (id ${plano.modalidade.id})`)
    console.log(`- Instrutor: ${plano.instrutor.nome} (id ${plano.instrutor.id})`)
    console.log('')
    console.log('Aluno:')
    if (plano.usuario) {
      console.log(`- Usuário existente: #${plano.usuario.id} ${plano.usuario.nome} (${plano.email})`)
    } else {
      console.log(`- Criar usuário de teste: "${nomeUsuarioTeste(plano.email)}" (perfil aluno, ativo)`)
    }
    if (plano.aluno) {
      console.log(`- Aluno existente: #${plano.aluno.id} (será reutilizado e não será renomeado)`)
    } else {
      console.log('- Criar aluno de teste ativo com CPF temporário e observação "TESTE CLIMA"')
    }
    console.log('- Inscrever o aluno na aula com status confirmada')
    console.log('')
  }

  private confirmar = async (): Promise<boolean> => {
    const leitor = createInterface({ input: process.stdin, output: process.stdout })
    try {
      const resposta = (await leitor.question('Confirma a criação? [s/N] ')).trim().toLowerCase()
      return ['s', 'sim', 'y', 'yes'].includes(resposta)
    } finally {
      leitor.close()
    }
  }

  private gerarCpfUnico = async (conexao: PoolConnection): Promise<string> => {
    for (let tentativa = 0; tentativa < 10; tentativa++) {
      const cpf = gerarCpfTeste()
      const [linhas] = await conexao.query<RowDataPacket[]>({
        sql: 'SELECT id FROM alunos WHERE cpf = ? LIMIT 1',
        values: [cpf],
        timeout: 10000
      })
      if (!linhas.length) return cpf
    }
    throw new Error('Não foi possível gerar um CPF de teste único. Tente novamente.')
  }

  private executar = async (
    plano: PlanoPreparacao,
    senhaHash: string | null
  ): Promise<ResultadoPreparacao> => {
    const conexao = await Banco.pool.getConnection()
    try {
      await conexao.beginTransaction()

      let usuarioId: number
      if (plano.usuario) {
        usuarioId = plano.usuario.id
      } else {
        if (!senhaHash) throw new Error('Não foi possível gerar a senha do usuário de teste.')
        const [usuario] = await conexao.query<ResultSetHeader>({
          sql: `INSERT INTO usuarios (nome, email, senha_hash, perfil, ativo)
                VALUES (?, ?, ?, 'aluno', 1)`,
          values: [nomeUsuarioTeste(plano.email), plano.email, senhaHash],
          timeout: 10000
        })
        usuarioId = Number(usuario.insertId)
      }

      let alunoId: number
      if (plano.aluno) {
        alunoId = plano.aluno.id
      } else {
        const cpf = await this.gerarCpfUnico(conexao)
        const [aluno] = await conexao.query<ResultSetHeader>({
          sql: `INSERT INTO alunos
            (usuario_id, cpf, data_nascimento, telefone, observacoes_saude, ativo, criado_em, atualizado_em)
            VALUES (?, ?, '2000-01-01', '00000000000', ?, 1, NOW(), NOW())`,
          values: [usuarioId, cpf, observacoesAlunoTeste(plano.email)],
          timeout: 10000
        })
        alunoId = Number(aluno.insertId)
      }

      const [aula] = await conexao.query<ResultSetHeader>({
        sql: `INSERT INTO aulas
          (modalidade_id, instrutor_id, titulo, data_hora_inicio, duracao_min, capacidade_max, local, local_descricao, status, criado_em, atualizado_em)
          VALUES (?, ?, ?, ?, 60, 10, 'externa', ?, 'agendada', NOW(), NOW())`,
        values: [
          plano.modalidade.id,
          plano.instrutor.id,
          plano.titulo,
          plano.dataHora,
          localDescricaoTeste()
        ],
        timeout: 10000
      })
      const aulaId = Number(aula.insertId)

      const [inscricao] = await conexao.query<ResultSetHeader>({
        sql: `INSERT INTO inscricoes_aula (aula_id, aluno_id, status, criado_em, atualizado_em)
              VALUES (?, ?, 'confirmada', NOW(), NOW())`,
        values: [aulaId, alunoId],
        timeout: 10000
      })

      await conexao.commit()
      return {
        usuarioId,
        alunoId,
        aulaId,
        inscricaoId: Number(inscricao.insertId),
        criouUsuario: !plano.usuario,
        criouAluno: !plano.aluno
      }
    } catch (erro) {
      await conexao.rollback().catch(() => undefined)
      throw erro
    } finally {
      conexao.release()
    }
  }

  main = async (): Promise<void> => {
    this.validar()
    const plano = await this.carregarPlano()
    this.mostrarPlano(plano)

    if (!(await this.confirmar())) {
      console.log('Cancelado. Nada foi gravado.')
      return
    }

    const senhaHash = plano.usuario ? null : await new Senha().gerar(randomBytes(16).toString('hex'))
    const resultado = await this.executar(plano, senhaHash)

    console.log('')
    console.log('Teste de clima preparado com sucesso:')
    console.log(`- Usuário: #${resultado.usuarioId}${resultado.criouUsuario ? ' (criado)' : ' (reutilizado)'}`)
    console.log(`- Aluno: #${resultado.alunoId}${resultado.criouAluno ? ' (criado)' : ' (reutilizado)'}`)
    console.log(`- Aula: #${resultado.aulaId} "${plano.titulo}"`)
    console.log(`- Inscrição: #${resultado.inscricaoId}`)
    console.log('')
    console.log('Para testar o bot:')
    console.log('  npm run testar-clima -- 1')
    console.log('Para limpar os registros de teste:')
    console.log('  npm run limpar-teste-clima')
  }
}

const main = async (): Promise<void> => {
  const email = process.argv[2] ?? ''
  if (!email.trim()) {
    console.log('Uso: npm run preparar-teste-clima -- seu_email@exemplo.com')
    process.exitCode = 1
    return
  }

  const preparador = new PreparadorTesteClima(email)
  await preparador.main()
}

main()
  .catch((erro: unknown) => {
    console.error('Erro:', erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(async () => {
    await Banco.pool.end().catch(() => undefined)
  })
