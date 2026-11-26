import { app, BrowserWindow, session } from 'electron'
import { AssiduidadeIpc } from './assiduidade/AssiduidadeBackend'
import { JanelaApp } from './JanelaApp'
import { Sessao } from './Sessao'
import { AlunoIpc } from './alunos/AlunoBackend'
import { AulaIpc } from './aulas/AulaBackend'
import { AvaliacaoIpc } from './avaliacoes/AvaliacaoBackend'
import { AutenticacaoIpc, AutenticacaoServico } from './autenticacao/AutenticacaoBackend'
import { FuncionarioIpc, ModalidadeIpc } from './funcionarios/FuncionarioBackend'
import { InadimplenciaIpc } from './inadimplencia/InadimplenciaBackend'
import { LancamentoIpc } from './lancamentos/LancamentoBackend'
import { CepIpc } from './integracoes/CepBackend'
import { ClimaIpc } from './integracoes/ClimaBackend'
import { FeriadosIpc } from './integracoes/FeriadosBackend'
import { WgerIpc } from './integracoes/WgerBackend'
import { BotClimaIpc, BotClimaServico } from './mensagens/BotClima'
import { ServidorDecisaoClima } from './mensagens/DecisaoClima'
import { MenuIpc } from './menu/MenuBackend'
import { BotVencimentoServico } from './notificacoes/BotVencimento'
import { NotificacaoIpc, NotificacaoServico } from './notificacoes/NotificacaoBackend'
import { PagamentoIpc } from './pagamentos/PagamentoBackend'
import { AssinaturaIpc, PlanoIpc } from './planos/PlanosBackend'
import { PresencaCrudIpc, PresencaResumoIpc } from './presencas/PresencaBackend'
import { RelatorioIpc } from './relatorios/RelatorioBackend'
import { UsuarioIpc } from './usuarios/UsuarioBackend'
import { VisitanteIpc } from './visitantes/VisitanteBackend'

type Modulo =
  | 'relatorios'
  | 'assiduidade'
  | 'usuarios'
  | 'funcionarios'
  | 'alunos'
  | 'aulas'
  | 'planos'
  | 'pagamentos'
  | 'lancamentos'
  | 'visitantes'
  | 'avaliacoes'
  | 'notificacoes'
  | 'presencas'
  | 'inscricoes'
  | 'feriados'
  | 'exercicios'
  | 'portal'
  | 'bot'

const CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src 'self' data: file: https://wger.de",
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

  private readonly modulos: Record<Modulo, JanelaApp>

  constructor() {
    const criarModulo = (pasta: string, largura: number, altura: number, nome = pasta): JanelaApp =>
      new JanelaApp({
        pasta,
        nome,
        largura,
        altura,
        aoFechar: () => this.aoFecharModulo()
      })

    this.modulos = {
      relatorios: criarModulo('relatorios', 1000, 700),
      assiduidade: criarModulo('assiduidade', 1280, 860),
      usuarios: criarModulo('usuarios', 1000, 700),
      funcionarios: criarModulo('funcionarios', 1200, 760),
      alunos: criarModulo('alunos', 1200, 760),
      aulas: criarModulo('aulas', 1280, 800),
      planos: criarModulo('planos', 1280, 800),
      pagamentos: criarModulo('pagamentos', 1280, 820),
      lancamentos: criarModulo('lancamentos', 1100, 760),
      visitantes: criarModulo('visitantes', 1280, 800),
      avaliacoes: criarModulo('avaliacoes', 1280, 820),
      notificacoes: criarModulo('notificacoes', 1280, 820),
      presencas: criarModulo('presencas', 1280, 800),
      inscricoes: criarModulo('inscricoes', 1280, 800),
      feriados: criarModulo('feriados', 1100, 760),
      exercicios: criarModulo('exercicios', 1200, 820),
      portal: criarModulo('portal', 1280, 900),
      bot: criarModulo('mensagens', 1000, 820)
    }
  }

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
    Object.values(this.modulos).forEach((janela) => janela.fechar())
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

  private configurarSeguranca = (): void => {
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
  }

  private registrarIpc = (
    botClima: BotClimaServico,
    decisaoClima: ServidorDecisaoClima,
    notificacaoServico: NotificacaoServico,
    botVencimento: BotVencimentoServico
  ): void => {
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
    new PresencaCrudIpc(this.sessao).registrar()
    new PlanoIpc(this.sessao).registrar()
    new AssinaturaIpc(this.sessao).registrar()
    new PagamentoIpc(this.sessao).registrar()
    new InadimplenciaIpc(this.sessao).registrar()
    new LancamentoIpc(this.sessao).registrar()
    new VisitanteIpc(this.sessao).registrar()
    new NotificacaoIpc(this.sessao, botVencimento, notificacaoServico).registrar()
    new FuncionarioIpc(this.sessao).registrar()
    new ModalidadeIpc(this.sessao).registrar()
    new RelatorioIpc(this.sessao).registrar()
    new AssiduidadeIpc(this.sessao).registrar()
    new UsuarioIpc(this.sessao).registrar()

    const telas: Record<string, () => void> = {}
    for (const id of Object.keys(this.modulos) as Modulo[]) {
      telas[id] = this.abrirModulo(this.modulos[id])
    }
    new MenuIpc(this.sessao, telas, this.aoVoltar).registrar()
  }

  iniciar = (): void => {
    app.whenReady().then(() => {
      if (process.platform === 'win32') app.setAppUserModelId('com.cotil.academia')

      this.configurarSeguranca()

      const botClima = new BotClimaServico()
      const decisaoClima = new ServidorDecisaoClima()
      const notificacaoServico = new NotificacaoServico()
      const botVencimento = new BotVencimentoServico(notificacaoServico)

      this.registrarIpc(botClima, decisaoClima, notificacaoServico, botVencimento)
      this.abrirInicial()
      botClima.iniciar()
      decisaoClima.iniciar()
      botVencimento.iniciar()

      app.on('before-quit', () => {
        botClima.encerrar()
        decisaoClima.encerrar()
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
