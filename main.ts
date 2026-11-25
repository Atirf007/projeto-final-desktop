import { app, BrowserWindow, session } from 'electron'
import { JanelaApp } from './JanelaApp'
import { Sessao } from './Sessao'
import { AlunoIpc } from './alunos/AlunoBackend'
import { AulaIpc } from './aulas/AulaBackend'
import { AvaliacaoIpc } from './avaliacoes/AvaliacaoBackend'
import { AutenticacaoIpc, AutenticacaoServico } from './autenticacao/AutenticacaoBackend'
import { FuncionarioIpc, ModalidadeIpc } from './funcionarios/FuncionarioBackend'
import { CepIpc } from './integracoes/CepBackend'
import { ClimaIpc } from './integracoes/ClimaBackend'
import { FeriadosIpc } from './integracoes/FeriadosBackend'
import { WgerIpc } from './integracoes/WgerBackend'
import { BotClimaIpc, BotClimaServico } from './mensagens/BotClima'
import { MenuIpc } from './menu/MenuBackend'
import { BotVencimentoServico } from './notificacoes/BotVencimento'
import { NotificacaoIpc, NotificacaoServico } from './notificacoes/NotificacaoBackend'
import { PagamentoIpc } from './pagamentos/PagamentoBackend'
import { AssinaturaIpc, PlanoIpc } from './planos/PlanosBackend'
import { PresencaResumoIpc } from './presencas/PresencaBackend'
import { RelatorioIpc } from './relatorios/RelatorioBackend'
import { UsuarioIpc } from './usuarios/UsuarioBackend'
import { VisitanteIpc } from './visitantes/VisitanteBackend'

const CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src 'self' data: file:",
  "font-src 'self'",
  "connect-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'"
].join('; ')

class Aplicacao {
  private readonly sessao = new Sessao()
  private visivel: JanelaApp | null = null
  private encerrando = false

  private readonly login = new JanelaApp({
    pasta: 'autenticacao',
    nome: 'login',
    largura: 1200,
    altura: 760,
    redimensionavel: false
  })

  private readonly menu = new JanelaApp({ pasta: 'menu', nome: 'menu', largura: 1000, altura: 700 })

  private readonly relatorios = new JanelaApp({ pasta: 'relatorios', nome: 'relatorios', largura: 1000, altura: 700, aoFechar: () => this.aoFecharModulo() })

  private readonly usuarios = new JanelaApp({ pasta: 'usuarios', nome: 'usuarios', largura: 1000, altura: 700, aoFechar: () => this.aoFecharModulo() })

  private readonly funcionarios = new JanelaApp({ pasta: 'funcionarios', nome: 'funcionarios', largura: 1200, altura: 760, aoFechar: () => this.aoFecharModulo() })

  private readonly alunos = new JanelaApp({ pasta: 'alunos', nome: 'alunos', largura: 1200, altura: 760, aoFechar: () => this.aoFecharModulo() })

  private readonly aulas = new JanelaApp({ pasta: 'aulas', nome: 'aulas', largura: 1280, altura: 800, aoFechar: () => this.aoFecharModulo() })

  private readonly planos = new JanelaApp({ pasta: 'planos', nome: 'planos', largura: 1280, altura: 800, aoFechar: () => this.aoFecharModulo() })

  private readonly pagamentos = new JanelaApp({ pasta: 'pagamentos', nome: 'pagamentos', largura: 1280, altura: 820, aoFechar: () => this.aoFecharModulo() })

  private readonly visitantes = new JanelaApp({ pasta: 'visitantes', nome: 'visitantes', largura: 1280, altura: 800, aoFechar: () => this.aoFecharModulo() })

  private readonly avaliacoes = new JanelaApp({ pasta: 'avaliacoes', nome: 'avaliacoes', largura: 1280, altura: 820, aoFechar: () => this.aoFecharModulo() })

  private readonly notificacoes = new JanelaApp({ pasta: 'notificacoes', nome: 'notificacoes', largura: 1280, altura: 820, aoFechar: () => this.aoFecharModulo() })

  private readonly portal = new JanelaApp({ pasta: 'portal', nome: 'portal', largura: 1280, altura: 900, aoFechar: () => this.aoFecharModulo() })

  private readonly bot = new JanelaApp({ pasta: 'mensagens', nome: 'mensagens', largura: 1000, altura: 820, aoFechar: () => this.aoFecharModulo() })

  private mostrar = (janela: JanelaApp): void => {
    if (this.visivel && this.visivel !== janela) this.visivel.ocultar()
    janela.abrir()
    this.visivel = janela
  }

  private abrirModulo = (janela: JanelaApp) => (): void => {
    this.mostrar(janela)
  }

  private aoFecharModulo = (): void => {
    if (this.encerrando) return
    this.visivel = null
    this.mostrar(this.menu)
  }

  private aoEntrar = (): void => {
    this.login.ocultar()
    this.mostrar(this.menu)
    this.login.fechar()
  }

  private aoSair = (): void => {
    this.encerrando = true
    this.relatorios.fechar()
    this.usuarios.fechar()
    this.funcionarios.fechar()
    this.alunos.fechar()
    this.aulas.fechar()
    this.planos.fechar()
    this.pagamentos.fechar()
    this.visitantes.fechar()
    this.avaliacoes.fechar()
    this.notificacoes.fechar()
    this.portal.fechar()
    this.bot.fechar()
    this.menu.fechar()
    this.visivel = null
    this.encerrando = false
    this.mostrar(this.login)
  }

  private aoVoltar = (origem: BrowserWindow | null): void => {
    if (origem && !origem.isDestroyed()) origem.close()
    this.mostrar(this.menu)
  }

  private abrirInicial = (): void => {
    if (this.visivel) {
      this.visivel.abrir()
      return
    }
    this.mostrar(this.sessao.usuario() ? this.menu : this.login)
  }

  iniciar = (): void => {
    app.whenReady().then(() => {
      if (process.platform === 'win32') app.setAppUserModelId('com.cotil.academia')

      session.defaultSession.setPermissionRequestHandler((_conteudo, _permissao, callback) => callback(false))
      session.defaultSession.setPermissionCheckHandler(() => false)

      session.defaultSession.webRequest.onHeadersReceived((detalhes, callback) => {
        callback({
          responseHeaders: {
            ...detalhes.responseHeaders,
            'Content-Security-Policy': [CSP]
          }
        })
      })

      const botClima = new BotClimaServico()
      const notificacaoServico = new NotificacaoServico()
      const botVencimento = new BotVencimentoServico(notificacaoServico)

      new AutenticacaoIpc(new AutenticacaoServico(), this.sessao, this.aoEntrar, this.aoSair).registrar()
      new CepIpc(this.sessao).registrar()
      new ClimaIpc(this.sessao).registrar()
      new FeriadosIpc(this.sessao).registrar()
      new WgerIpc(this.sessao).registrar()
      new BotClimaIpc(this.sessao, botClima).registrar()
      new AlunoIpc(this.sessao).registrar()
      new AulaIpc(this.sessao).registrar()
      new AvaliacaoIpc(this.sessao).registrar()
      new PresencaResumoIpc(this.sessao).registrar()
      new PlanoIpc(this.sessao).registrar()
      new AssinaturaIpc(this.sessao).registrar()
      new PagamentoIpc(this.sessao).registrar()
      new VisitanteIpc(this.sessao).registrar()
      new NotificacaoIpc(this.sessao, botVencimento, notificacaoServico).registrar()
      new FuncionarioIpc(this.sessao).registrar()
      new ModalidadeIpc(this.sessao).registrar()
      new MenuIpc(this.sessao, {
        relatorios: this.abrirModulo(this.relatorios),
        usuarios: this.abrirModulo(this.usuarios),
        funcionarios: this.abrirModulo(this.funcionarios),
        alunos: this.abrirModulo(this.alunos),
        aulas: this.abrirModulo(this.aulas),
        avaliacoes: this.abrirModulo(this.avaliacoes),
        planos: this.abrirModulo(this.planos),
        pagamentos: this.abrirModulo(this.pagamentos),
        visitantes: this.abrirModulo(this.visitantes),
        notificacoes: this.abrirModulo(this.notificacoes),
        bot: this.abrirModulo(this.bot)
      }, this.aoVoltar).registrar()
      new RelatorioIpc(this.sessao).registrar()
      new UsuarioIpc(this.sessao).registrar()

      this.abrirInicial()
      botClima.iniciar()
      botVencimento.iniciar()

      app.on('before-quit', () => {
        botClima.encerrar()
        botVencimento.encerrar()
      })
      app.on('activate', this.abrirInicial)
    })

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit()
    })
  }
}

new Aplicacao().iniciar()
