const { existsSync, readFileSync } = require('fs')
const { join } = require('path')
const { spawnSync } = require('child_process')

const raiz = join(__dirname, '..')
const pastaElectron = join(raiz, 'node_modules', 'electron')
const instalador = join(pastaElectron, 'install.js')

function localizarBinario() {
  const arquivoPath = join(pastaElectron, 'path.txt')
  if (existsSync(arquivoPath)) {
    const relativo = readFileSync(arquivoPath, 'utf8').trim()
    const candidato = join(pastaElectron, 'dist', relativo)
    if (existsSync(candidato)) return candidato
  }

  const nomes =
    process.platform === 'win32'
      ? ['electron.exe']
      : process.platform === 'darwin'
        ? ['Electron.app/Contents/MacOS/Electron']
        : ['electron']

  for (const nome of nomes) {
    const candidato = join(pastaElectron, 'dist', nome)
    if (existsSync(candidato)) return candidato
  }

  return null
}

if (!existsSync(instalador)) {
  console.error('Pacote do Electron nao encontrado. Rode: npm install')
  process.exit(1)
}

if (!localizarBinario()) {
  console.log('Binario do Electron ausente. Baixando...')
  const resultado = spawnSync(process.execPath, [instalador], {
    cwd: pastaElectron,
    stdio: 'inherit'
  })

  if (resultado.status !== 0) {
    console.error('Nao foi possivel baixar o Electron.')
    console.error('Tente manualmente: node node_modules/electron/install.js')
    process.exit(resultado.status ?? 1)
  }
}

if (!localizarBinario()) {
  console.error('O binario do Electron continua ausente apos a instalacao.')
  process.exit(1)
}
