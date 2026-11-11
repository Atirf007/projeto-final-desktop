require('dotenv/config')
const path = require('path')
const { EmailServico } = require(path.join(__dirname, '..', 'dist', 'integracoes', 'EmailBackend.js'))

async function main() {
  const servico = new EmailServico()

  if (!servico.configurado()) {
    console.log('SMTP nao configurado.')
    console.log('Preencha SMTP_USER, SMTP_PASS e SMTP_FROM no arquivo .env antes de testar.')
    process.exitCode = 1
    return
  }

  const destino = process.argv[2] || process.env.SMTP_USER
  console.log('Remetente:', servico.remetenteFormatado())
  console.log('Destino:', destino)
  console.log('Enviando...')

  const resultado = await servico.enviar(
    [destino],
    'Teste do bot - Academia Cotil',
    'Se voce recebeu este e-mail, a configuracao SMTP do bot de clima esta funcionando.'
  )

  console.log('Configurado:', resultado.configurado)
  console.log('Enviados:', resultado.enviados, 'de', resultado.total)
  if (resultado.erroGeral) console.log('Erro:', resultado.erroGeral)
  for (const falha of resultado.falhas) console.log('Falha para', falha.email + ':', falha.erro)

  servico.fechar()
  process.exitCode = resultado.enviados > 0 ? 0 : 1
}

main().catch((erro) => {
  console.error('Erro inesperado:', erro instanceof Error ? erro.message : erro)
  process.exitCode = 1
})
