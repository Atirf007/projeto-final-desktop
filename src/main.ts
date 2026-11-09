import { app, BrowserWindow } from 'electron'
import { JanelaApp } from './JanelaApp'
import { Sessao } from './Sessao'
import { AlunoIpc } from './alunos/AlunoBackend'
import { AutenticacaoIpc, AutenticacaoServico } from './autenticacao/AutenticacaoBackend'
import { CepIpc } from './integracoes/CepBackend'
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

  private readonly alunos = new JanelaApp({ pasta: 'alunos', nome: 'alunos', largura: 1200, altura: 760 })

  private aoEntrar = (): void => {
    this.menu.abrir()
    this.login.fechar()
  }

  private aoSair = (): void => {
    this.login.abrir()
    this.relatorios.fechar()
    this.usuarios.fechar()
    this.alunos.fechar()
    this.menu.fechar()
  }

  private aoVoltar = (origem: BrowserWindow | null): void => {
    this.menu.abrir()
    origem?.close()
  }

  private abrirInicial = (): void => {
    if (this.sessao.usuario()) this.menu.abrir()
    else this.login.abrir()
  }

  iniciar = (): void => {
    app.whenReady().then(() => {
      new AutenticacaoIpc(new AutenticacaoServico(), this.sessao, this.aoEntrar, this.aoSair).registrar()
      new CepIpc(this.sessao).registrar()
      new AlunoIpc(this.sessao).registrar()
      new MenuIpc(this.sessao, {
        relatorios: () => this.relatorios.abrir(),
        usuarios: () => this.usuarios.abrir(),
        alunos: () => this.alunos.abrir()
      }, this.aoVoltar).registrar()
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
