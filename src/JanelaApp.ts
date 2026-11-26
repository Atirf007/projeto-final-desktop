import { BrowserWindow, shell } from 'electron'
import * as path from 'path'

type OpcoesJanela = {
  pasta: string
  nome: string
  largura: number
  altura: number
  redimensionavel?: boolean
  aoFechar?: () => void
}

export class JanelaApp {
  private janela: BrowserWindow | null = null

  constructor(private readonly opcoes: OpcoesJanela) {}

  abrir = (): void => {
    if (this.janela && !this.janela.isDestroyed()) {
      if (this.janela.isMinimized()) this.janela.restore()
      if (!this.janela.isVisible()) this.janela.show()
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
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true
      }
    })

    const abrirLinkExterno = (url: string): void => {
      try {
        const alvo = new URL(url)
        if (alvo.protocol === 'https:') void shell.openExternal(alvo.toString())
      } catch {
        return
      }
    }

    janela.webContents.setWindowOpenHandler(({ url }) => {
      abrirLinkExterno(url)
      return { action: 'deny' }
    })

    janela.webContents.on('will-navigate', (evento, url) => {
      evento.preventDefault()
      abrirLinkExterno(url)
    })

    janela.on('closed', () => {
      if (this.janela === janela) this.janela = null
      this.opcoes.aoFechar?.()
    })

    janela.loadFile(path.join(__dirname, pasta, `${nome}.html`))
    this.janela = janela
  }

  ocultar = (): void => {
    if (this.janela && !this.janela.isDestroyed()) this.janela.hide()
  }

  fechar = (): void => {
    if (this.janela && !this.janela.isDestroyed()) this.janela.close()
  }
}
