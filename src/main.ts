import { app, BrowserWindow } from 'electron'
import { JanelaApp } from './JanelaApp'
import { Sessao } from './Sessao'
import { AlunoIpc } from './alunos/AlunoBackend'
import { AulaIpc } from './aulas/AulaBackend'
import { AutenticacaoIpc, AutenticacaoServico } from './autenticacao/AutenticacaoBackend'
import { FuncionarioIpc, ModalidadeIpc } from './funcionarios/FuncionarioBackend'
import { CepIpc } from './integracoes/CepBackend'
import { ClimaIpc } from './integracoes/ClimaBackend'
import { FeriadosIpc } from './integracoes/FeriadosBackend'
import { WgerIpc } from './integracoes/WgerBackend'
import { BotClimaIpc, BotClimaServico } from './mensagens/BotClima'
import { MenuIpc } from './menu/MenuBackend'
import { PagamentoIpc } from './pagamentos/PagamentoBackend'
import { AssinaturaIpc, PlanoIpc } from './planos/PlanosBackend'
import { RelatorioIpc } from './relatorios/RelatorioBackend'
import { UsuarioIpc } from './usuarios/UsuarioBackend'
import { VisitanteIpc } from './visitantes/VisitanteBackend'

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

  private readonly funcionarios = new JanelaApp({ pasta: 'funcionarios', nome: 'funcionarios', largura: 1200, altura: 760 })

  private readonly alunos = new JanelaApp({ pasta: 'alunos', nome: 'alunos', largura: 1200, altura: 760 })

  private readonly aulas = new JanelaApp({ pasta: 'aulas', nome: 'aulas', largura: 1280, altura: 800 })

  private readonly planos = new JanelaApp({ pasta: 'planos', nome: 'planos', largura: 1280, altura: 800 })

  private readonly pagamentos = new JanelaApp({ pasta: 'pagamentos', nome: 'pagamentos', largura: 1280, altura: 820 })

  private readonly visitantes = new JanelaApp({ pasta: 'visitantes', nome: 'visitantes', largura: 1280, altura: 800 })

  private readonly bot = new JanelaApp({ pasta: 'mensagens', nome: 'mensagens', largura: 1000, altura: 820 })

  private aoEntrar = (): void => {
    this.menu.abrir()
    this.login.fechar()
  }

  private aoSair = (): void => {
    this.login.abrir()
    this.relatorios.fechar()
    this.usuarios.fechar()
    this.funcionarios.fechar()
    this.alunos.fechar()
    this.aulas.fechar()
    this.planos.fechar()
    this.pagamentos.fechar()
    this.visitantes.fechar()
    this.bot.fechar()
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
      if (process.platform === 'win32') app.setAppUserModelId('com.cotil.academia')

      const botClima = new BotClimaServico()

      new AutenticacaoIpc(new AutenticacaoServico(), this.sessao, this.aoEntrar, this.aoSair).registrar()
      new CepIpc(this.sessao).registrar()
      new ClimaIpc(this.sessao).registrar()
      new FeriadosIpc(this.sessao).registrar()
      new WgerIpc(this.sessao).registrar()
      new BotClimaIpc(this.sessao, botClima).registrar()
      new AlunoIpc(this.sessao).registrar()
      new AulaIpc(this.sessao).registrar()
      new PlanoIpc(this.sessao).registrar()
      new AssinaturaIpc(this.sessao).registrar()
      new PagamentoIpc(this.sessao).registrar()
      new VisitanteIpc(this.sessao).registrar()
      new FuncionarioIpc(this.sessao).registrar()
      new ModalidadeIpc(this.sessao).registrar()
      new MenuIpc(this.sessao, {
        relatorios: () => this.relatorios.abrir(),
        usuarios: () => this.usuarios.abrir(),
        funcionarios: () => this.funcionarios.abrir(),
        alunos: () => this.alunos.abrir(),
        aulas: () => this.aulas.abrir(),
        planos: () => this.planos.abrir(),
        pagamentos: () => this.pagamentos.abrir(),
        visitantes: () => this.visitantes.abrir(),
        bot: () => this.bot.abrir()
      }, this.aoVoltar).registrar()
      new RelatorioIpc(this.sessao).registrar()
      new UsuarioIpc(this.sessao).registrar()

      this.abrirInicial()
      botClima.iniciar()

      app.on('before-quit', () => botClima.encerrar())
      app.on('activate', this.abrirInicial)
    })

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit()
    })
  }
}

new Aplicacao().iniciar()
