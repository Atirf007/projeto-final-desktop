import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { Banco } from '../src/Banco'
import { Senha } from '../src/autenticacao/AutenticacaoBackend'

after(async () => {
  await Banco.pool.end()
})

test('gera e verifica senha no formato scrypt', async () => {
  const senha = new Senha()
  const armazenado = await senha.gerar('senha-de-teste')

  assert.match(armazenado, /^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/i)
  assert.equal(await senha.verificar('senha-de-teste', armazenado), true)
  assert.equal(await senha.verificar('outra-senha', armazenado), false)
})

test('rejeita hash truncado e algoritmo diferente', async () => {
  const senha = new Senha()
  const armazenado = await senha.gerar('senha-de-teste')
  const partes = armazenado.split(':')

  assert.equal(await senha.verificar('senha-de-teste', `${partes[0]}:${partes[1]}:${partes[2].slice(0, 126)}`), false)
  assert.equal(await senha.verificar('senha-de-teste', `pbkdf2:${partes[1]}:${partes[2]}`), false)
  assert.equal(await senha.verificar('senha-de-teste', 'scrypt:xyz:abc'), false)
  assert.equal(await senha.verificar('senha-de-teste', 'scrypt:somente'), false)
})
