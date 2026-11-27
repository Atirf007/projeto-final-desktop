import 'dotenv/config'
import { RowDataPacket } from 'mysql2/promise'
import { readFileSync } from 'fs'
import { join } from 'path'
import { Banco } from '../src/Banco'

const dividir = (sql: string): string[] =>
  sql
    .split(';')
    .map((comando) => comando.trim())
    .filter(Boolean)

async function coluna(tabela: string, nome: string): Promise<RowDataPacket | null> {
  const [linhas] = await Banco.pool.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME, COLUMN_TYPE
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
      LIMIT 1`,
    [tabela, nome]
  )
  return linhas[0] ?? null
}

async function indiceExiste(tabela: string, nome: string): Promise<boolean> {
  const [linhas] = await Banco.pool.query<RowDataPacket[]>(
    `SELECT 1
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
      LIMIT 1`,
    [tabela, nome]
  )
  return linhas.length > 0
}

async function garantirColuna(tabela: string, nome: string, definicao: string): Promise<boolean> {
  if (await coluna(tabela, nome)) return false
  await Banco.pool.query(`ALTER TABLE \`${tabela}\` ADD COLUMN \`${nome}\` ${definicao}`)
  return true
}

async function garantirEnum(
  tabela: string,
  nome: string,
  valores: string[],
  definicao: string
): Promise<boolean> {
  const encontrada = await coluna(tabela, nome)
  if (!encontrada) return false

  const tipo = String(encontrada.COLUMN_TYPE)
  if (valores.every((valor) => tipo.includes(`'${valor}'`))) return false

  await Banco.pool.query(`ALTER TABLE \`${tabela}\` MODIFY COLUMN \`${nome}\` ${definicao}`)
  return true
}

async function garantirTipo(
  tabela: string,
  nome: string,
  tipoAtual: string,
  definicao: string
): Promise<boolean> {
  const encontrada = await coluna(tabela, nome)
  if (!encontrada) return false

  const normalizar = (valor: string): string =>
    valor.replace(/COLLATE\s+\S+/gi, '').replace(/\s+/g, '').toLowerCase()

  if (normalizar(String(encontrada.COLUMN_TYPE)) === normalizar(tipoAtual)) return false

  await Banco.pool.query(`ALTER TABLE \`${tabela}\` MODIFY COLUMN \`${nome}\` ${definicao}`)
  return true
}

async function garantirIndice(tabela: string, nome: string, colunas: string): Promise<boolean> {
  if (await indiceExiste(tabela, nome)) return false
  await Banco.pool.query(`CREATE INDEX \`${nome}\` ON \`${tabela}\` (${colunas})`)
  return true
}

async function garantirUnico(tabela: string, nome: string, colunas: string): Promise<boolean> {
  if (await indiceExiste(tabela, nome)) return false

  const [duplicatas] = await Banco.pool.query<RowDataPacket[]>(
    `SELECT 1 FROM \`${tabela}\` GROUP BY ${colunas} HAVING COUNT(*) > 1 LIMIT 1`
  )
  if (duplicatas.length > 0) {
    console.warn(`Indice ${nome} nao criado: existem duplicatas em ${tabela}.`)
    return false
  }

  await Banco.pool.query(`ALTER TABLE \`${tabela}\` ADD UNIQUE KEY \`${nome}\` (${colunas})`)
  return true
}

async function main(): Promise<void> {
  const nome = process.env.DB_NAME ?? ''
  if (!/^[A-Za-z0-9_]+$/.test(nome)) {
    throw new Error('DB_NAME invalido. Use apenas letras, numeros e underscore.')
  }

  const arquivo = join(__dirname, '..', 'database', 'schema.sql')
  const comandos = dividir(readFileSync(arquivo, 'utf8'))
  for (const comando of comandos) {
    await Banco.pool.query(comando)
  }

  const categoriaLancamento = "enum('aula','aluguel','outros') COLLATE utf8mb4_unicode_ci NOT NULL"
  const descricaoLancamento = 'varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL'
  const valorLancamento = 'decimal(10,2) NOT NULL'
  const dataLancamento = 'date NOT NULL'

  const migracoes: Array<() => Promise<boolean>> = [
    () => garantirColuna('lancamentos', 'categoria', categoriaLancamento),
    () => garantirColuna('lancamentos', 'descricao', descricaoLancamento),
    () => garantirColuna('lancamentos', 'valor', valorLancamento),
    () => garantirColuna('lancamentos', 'data_lancamento', dataLancamento),
    () => garantirTipo('lancamentos', 'categoria', "enum('aula','aluguel','outros')", categoriaLancamento),
    () => garantirTipo('lancamentos', 'descricao', 'varchar(160)', descricaoLancamento),
    () => garantirTipo('lancamentos', 'valor', 'decimal(10,2)', valorLancamento),
    () => garantirTipo('lancamentos', 'data_lancamento', 'date', dataLancamento),
    () => garantirIndice('lancamentos', 'idx_lancamentos_data', '`data_lancamento`'),
    () => garantirColuna('notificacoes', 'erro', 'varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL'),
    () => garantirColuna('notificacoes', 'enviado_em', 'datetime DEFAULT NULL'),
    () =>
      garantirColuna(
        'pagamentos',
        'metodo',
        "enum('dinheiro','pix','cartao','boleto','transferencia') COLLATE utf8mb4_unicode_ci DEFAULT NULL"
      ),
    () => garantirColuna('pagamentos', 'observacao', 'varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL'),
    () =>
      garantirEnum(
        'aulas',
        'status',
        ['agendada', 'confirmada', 'cancelada', 'remarcada', 'concluida'],
        "enum('agendada','confirmada','cancelada','remarcada','concluida') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'agendada'"
      ),
    () =>
      garantirEnum(
        'pagamentos',
        'status',
        ['pendente', 'pago', 'atrasado', 'cancelado'],
        "enum('pendente','pago','atrasado','cancelado') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pendente'"
      ),
    () => garantirIndice('pagamentos', 'idx_pagamentos_competencia', '`competencia`'),
    () =>
      garantirIndice(
        'notificacoes',
        'idx_notificacoes_pagamento_recente',
        '`pagamento_id`,`tipo`,`status`,`criado_em`'
      ),
    () => garantirIndice('notificacoes', 'idx_notificacoes_usuario_criado', '`usuario_id`,`criado_em`'),
    () => garantirIndice('notificacoes', 'idx_notificacoes_tipo_criado', '`tipo`,`criado_em`'),
    () => garantirUnico('presencas', 'uk_aluno_data', '`aluno_id`,`data_presenca`'),
    () => garantirUnico('pagamentos', 'uk_assinatura_competencia', '`assinatura_id`,`competencia`'),
    () =>
      garantirUnico(
        'notificacoes',
        'uk_notificacao_decisao_clima',
        '`tipo`,`canal`,`status`,`aula_id`,`usuario_id`,`assunto`'
      ),
    () =>
      garantirUnico(
        'notificacoes',
        'uk_notificacao_alerta_inadimplencia',
        '`usuario_id`,`tipo`,`canal`,`assunto`'
      )
  ]

  let aplicadas = 0
  for (const migracao of migracoes) {
    if (await migracao()) aplicadas++
  }

  console.log(`Tabelas aplicadas: ${comandos.length}. Migracoes aplicadas: ${aplicadas}.`)
  await Banco.pool.end()
}

main().catch(async (erro) => {
  console.error('Nao foi possivel criar ou atualizar as tabelas:', erro)
  try {
    await Banco.pool.end()
  } catch {
    process.exitCode = 1
  }
  process.exitCode = 1
})
