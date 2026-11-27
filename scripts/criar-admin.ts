import 'dotenv/config'
import { randomBytes, scrypt } from 'crypto'
import { RowDataPacket } from 'mysql2/promise'
import { Banco } from '../src/Banco'

function gerarHash(senha: string): Promise<string> {
  const sal = randomBytes(16)
  return new Promise((resolver, rejeitar) => {
    scrypt(senha, sal, 64, (erro, chave) => {
      if (erro) {
        rejeitar(erro)
        return
      }
      resolver(`scrypt:${sal.toString('hex')}:${chave.toString('hex')}`)
    })
  })
}

async function main(): Promise<void> {
  const nome = (process.env.ADMIN_NOME ?? 'Administrador').trim()
  const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase()
  const senha = process.env.ADMIN_SENHA ?? ''

  if (!email || !senha) {
    throw new Error('Preencha ADMIN_EMAIL e ADMIN_SENHA no arquivo .env.')
  }

  const senhaHash = await gerarHash(senha)
  const [encontrados] = await Banco.pool.query<RowDataPacket[]>(
    'SELECT id FROM usuarios WHERE email = ? LIMIT 1',
    [email]
  )

  if (encontrados.length) {
    await Banco.pool.query(
      'UPDATE usuarios SET nome = ?, senha_hash = ?, perfil = ?, ativo = 1 WHERE email = ?',
      [nome, senhaHash, 'admin', email]
    )
    console.log(`Administrador atualizado: ${email}`)
  } else {
    await Banco.pool.query(
      'INSERT INTO usuarios (nome, email, senha_hash, perfil, ativo) VALUES (?, ?, ?, ?, 1)',
      [nome, email, senhaHash, 'admin']
    )
    console.log(`Administrador criado: ${email}`)
  }

  await Banco.pool.end()
}

main().catch((erro) => {
  console.error('Nao foi possivel criar o administrador:', erro)
  process.exitCode = 1
})
