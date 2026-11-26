import assert from 'node:assert/strict'
import { createHmac } from 'crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { after, test } from 'node:test'
import { Banco } from '../src/Banco'
import { AssinadorDecisao } from '../src/mensagens/DecisaoClima'

const diretorio = mkdtempSync(join(tmpdir(), 'decisao-clima-'))
const arquivo = join(diretorio, 'segredo.json')
const segredo = 'a'.repeat(64)

writeFileSync(arquivo, JSON.stringify({ segredo }), { encoding: 'utf8', mode: 0o600 })

const assinar = (id: number, expiraEm: number): string =>
  `${expiraEm}.${createHmac('sha256', segredo).update(`${id}.${expiraEm}`).digest('hex')}`

after(async () => {
  rmSync(diretorio, { recursive: true, force: true })
  await Banco.pool.end()
})

test('token gerado é aceito e alteração é rejeitada', () => {
  const assinador = new AssinadorDecisao(arquivo)
  const token = assinador.gerarToken(42)

  assert.equal(assinador.validarToken(42, token), true)
  assert.equal(assinador.validarToken(43, token), false)
  const alterado = token.slice(0, -1) + (token.endsWith('0') ? '1' : '0')
  assert.equal(assinador.validarToken(42, alterado), false)
})

test('token expirado e token com prazo acima de dois dias são rejeitados', () => {
  const assinador = new AssinadorDecisao(arquivo)
  const agora = Math.floor(Date.now() / 1000)

  assert.equal(assinador.validarToken(42, assinar(42, agora - 10)), false)
  assert.equal(assinador.validarToken(42, assinar(42, agora + 3 * 24 * 60 * 60)), false)
  assert.equal(assinador.validarToken(42, assinar(42, agora + 24 * 60 * 60)), true)
  assert.equal(assinador.validarToken(42, 'token-invalido'), false)
})
