import { app } from 'electron'
import { JanelaApp } from './JanelaApp'
import { Sessao } from './Sessao'
import { AutenticacaoIpc, AutenticacaoServico } from './autenticacao/AutenticacaoBackend'
import { MenuIpc } from './menu/MenuBackend'
import { RelatorioIpc } from './relatorios/RelatorioBackend'
import { UsuarioIpc } from './usuarios/UsuarioBackend'

class Aplicacao {
  private readonly sessao = new Sessao()

  private readonly login = new JanelaApp({
    pasta: 'autenticacao',
    nome: 'login',
    largura: 440,
    altura: 560,
    redimensionavel: false
  })

  private readonly menu = new JanelaApp({ pasta: 'menu', nome: 'menu', largura: 1000, altura: 700 })

  private readonly relatorios = new JanelaApp({ pasta: 'relatorios', nome: 'relatorios', largura: 1000, altura: 700 })

  private readonly usuarios = new JanelaApp({ pasta: 'usuarios', nome: 'usuarios', largura: 1000, altura: 700 })

  private aoEntrar = (): void => {
    this.menu.abrir()
    this.login.fechar()
  }

  private aoSair = (): void => {
    this.login.abrir()
    this.relatorios.fechar()
    this.usuarios.fechar()
    this.menu.fechar()
  }

  private abrirInicial = (): void => {
    if (this.sessao.usuario()) this.menu.abrir()
    else this.login.abrir()
  }

  iniciar = (): void => {
    app.whenReady().then(() => {
      new AutenticacaoIpc(new AutenticacaoServico(), this.sessao, this.aoEntrar, this.aoSair).registrar()
      new MenuIpc(this.sessao, {
        relatorios: () => this.relatorios.abrir(),
        usuarios: () => this.usuarios.abrir()
      }).registrar()
      new RelatorioIpc(this.sessao).registrar()
      new UsuarioIpc(this.sessao).registrar()

      this.abrirInicial()

      app.on('activate', this.abrirInicial)
    })

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit()
    })
  }
}

new Aplicacao().iniciar()
