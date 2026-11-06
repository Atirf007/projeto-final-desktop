import { BrowserWindow } from 'electron'
import * as path from 'path'

type OpcoesJanela = {
  pasta: string
  nome: string
  largura: number
  altura: number
  redimensionavel?: boolean
}

export class JanelaApp {
  private janela: BrowserWindow | null = null

  constructor(private readonly opcoes: OpcoesJanela) {}

  abrir = (): void => {
    if (this.janela && !this.janela.isDestroyed()) {
      this.janela.focus()
      return
    }

    const { pasta, nome, largura, altura, redimensionavel = true } = this.opcoes

    const janela = new BrowserWindow({
      width: largura,
      height: altura,
      resizable: redimensionavel,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, pasta, `${nome}.js`),
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    janela.on('closed', () => {
      if (this.janela === janela) this.janela = null
    })

    janela.loadFile(path.join(__dirname, pasta, `${nome}.html`))
    this.janela = janela
  }

  fechar = (): void => {
    if (this.janela && !this.janela.isDestroyed()) this.janela.close()
  }
}
