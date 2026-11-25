import 'dotenv/config'
import { readFileSync } from 'fs'
import { join } from 'path'
import { Banco } from '../src/Banco'

async function main(): Promise<void> {
  const arquivo = join(__dirname, '..', 'database', 'schema.sql')
  const sql = readFileSync(arquivo, 'utf8')
  const comandos = sql
    .split(';')
    .map((comando) => comando.trim())
    .filter(Boolean)

  for (const comando of comandos) {
    await Banco.pool.query(comando)
  }

  console.log(`Tabelas criadas ou verificadas: ${comandos.length}`)
  await Banco.pool.end()
}

main().catch((erro) => {
  console.error('Nao foi possivel criar as tabelas:', erro)
  process.exitCode = 1
})
