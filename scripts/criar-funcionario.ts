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
  const nome = (process.env.FUNCIONARIO_NOME ?? 'Funcionário').trim()
  const email = (process.env.FUNCIONARIO_EMAIL ?? '').trim().toLowerCase()
  const senha = process.env.FUNCIONARIO_SENHA ?? ''

  if (!email || !senha) {
    throw new Error('Preencha FUNCIONARIO_EMAIL e FUNCIONARIO_SENHA no arquivo .env.')
  }

  const senhaHash = await gerarHash(senha)
  const [encontrados] = await Banco.pool.query<RowDataPacket[]>(
    'SELECT id FROM usuarios WHERE email = ? LIMIT 1',
    [email]
  )

  if (encontrados.length) {
    await Banco.pool.query(
      'UPDATE usuarios SET nome = ?, senha_hash = ?, perfil = ?, ativo = 1 WHERE email = ?',
      [nome, senhaHash, 'instrutor', email]
    )
    console.log(`Funcionário atualizado: ${email}`)
  } else {
    await Banco.pool.query(
      'INSERT INTO usuarios (nome, email, senha_hash, perfil, ativo) VALUES (?, ?, ?, ?, 1)',
      [nome, email, senhaHash, 'instrutor']
    )
    console.log(`Funcionário criado: ${email}`)
  }

  await Banco.pool.end()
}

main().catch((erro) => {
  console.error('Não foi possível criar o funcionário:', erro)
  process.exitCode = 1
})
