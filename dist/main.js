"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const JanelaApp_1 = require("./JanelaApp");
const Sessao_1 = require("./Sessao");
const AlunoBackend_1 = require("./alunos/AlunoBackend");
const AulaBackend_1 = require("./aulas/AulaBackend");
const AvaliacaoBackend_1 = require("./avaliacoes/AvaliacaoBackend");
const AutenticacaoBackend_1 = require("./autenticacao/AutenticacaoBackend");
const FuncionarioBackend_1 = require("./funcionarios/FuncionarioBackend");
const CepBackend_1 = require("./integracoes/CepBackend");
const ClimaBackend_1 = require("./integracoes/ClimaBackend");
const FeriadosBackend_1 = require("./integracoes/FeriadosBackend");
const WgerBackend_1 = require("./integracoes/WgerBackend");
const BotClima_1 = require("./mensagens/BotClima");
const MenuBackend_1 = require("./menu/MenuBackend");
const BotVencimento_1 = require("./notificacoes/BotVencimento");
const NotificacaoBackend_1 = require("./notificacoes/NotificacaoBackend");
const PagamentoBackend_1 = require("./pagamentos/PagamentoBackend");
const PlanosBackend_1 = require("./planos/PlanosBackend");
const PresencaBackend_1 = require("./presencas/PresencaBackend");
const RelatorioBackend_1 = require("./relatorios/RelatorioBackend");
const UsuarioBackend_1 = require("./usuarios/UsuarioBackend");
const VisitanteBackend_1 = require("./visitantes/VisitanteBackend");
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
].join('; ');
class Aplicacao {
    constructor() {
        this.sessao = new Sessao_1.Sessao();
        this.visivel = null;
        this.encerrando = false;
        this.login = new JanelaApp_1.JanelaApp({
            pasta: 'autenticacao',
            nome: 'login',
            largura: 1200,
            altura: 760,
            redimensionavel: false
        });
        this.menu = new JanelaApp_1.JanelaApp({ pasta: 'menu', nome: 'menu', largura: 1000, altura: 700 });
        this.relatorios = new JanelaApp_1.JanelaApp({ pasta: 'relatorios', nome: 'relatorios', largura: 1000, altura: 700, aoFechar: () => this.aoFecharModulo() });
        this.usuarios = new JanelaApp_1.JanelaApp({ pasta: 'usuarios', nome: 'usuarios', largura: 1000, altura: 700, aoFechar: () => this.aoFecharModulo() });
        this.funcionarios = new JanelaApp_1.JanelaApp({ pasta: 'funcionarios', nome: 'funcionarios', largura: 1200, altura: 760, aoFechar: () => this.aoFecharModulo() });
        this.alunos = new JanelaApp_1.JanelaApp({ pasta: 'alunos', nome: 'alunos', largura: 1200, altura: 760, aoFechar: () => this.aoFecharModulo() });
        this.aulas = new JanelaApp_1.JanelaApp({ pasta: 'aulas', nome: 'aulas', largura: 1280, altura: 800, aoFechar: () => this.aoFecharModulo() });
        this.planos = new JanelaApp_1.JanelaApp({ pasta: 'planos', nome: 'planos', largura: 1280, altura: 800, aoFechar: () => this.aoFecharModulo() });
        this.pagamentos = new JanelaApp_1.JanelaApp({ pasta: 'pagamentos', nome: 'pagamentos', largura: 1280, altura: 820, aoFechar: () => this.aoFecharModulo() });
        this.visitantes = new JanelaApp_1.JanelaApp({ pasta: 'visitantes', nome: 'visitantes', largura: 1280, altura: 800, aoFechar: () => this.aoFecharModulo() });
        this.avaliacoes = new JanelaApp_1.JanelaApp({ pasta: 'avaliacoes', nome: 'avaliacoes', largura: 1280, altura: 820, aoFechar: () => this.aoFecharModulo() });
        this.notificacoes = new JanelaApp_1.JanelaApp({ pasta: 'notificacoes', nome: 'notificacoes', largura: 1280, altura: 820, aoFechar: () => this.aoFecharModulo() });
        this.portal = new JanelaApp_1.JanelaApp({ pasta: 'portal', nome: 'portal', largura: 1280, altura: 900, aoFechar: () => this.aoFecharModulo() });
        this.bot = new JanelaApp_1.JanelaApp({ pasta: 'mensagens', nome: 'mensagens', largura: 1000, altura: 820, aoFechar: () => this.aoFecharModulo() });
        this.mostrar = (janela) => {
            if (this.visivel && this.visivel !== janela)
                this.visivel.ocultar();
            janela.abrir();
            this.visivel = janela;
        };
        this.abrirModulo = (janela) => () => {
            this.mostrar(janela);
        };
        this.aoFecharModulo = () => {
            if (this.encerrando)
                return;
            this.visivel = null;
            this.mostrar(this.menu);
        };
        this.aoEntrar = () => {
            this.login.ocultar();
            this.mostrar(this.menu);
            this.login.fechar();
        };
        this.aoSair = () => {
            this.encerrando = true;
            this.relatorios.fechar();
            this.usuarios.fechar();
            this.funcionarios.fechar();
            this.alunos.fechar();
            this.aulas.fechar();
            this.planos.fechar();
            this.pagamentos.fechar();
            this.visitantes.fechar();
            this.avaliacoes.fechar();
            this.notificacoes.fechar();
            this.portal.fechar();
            this.bot.fechar();
            this.menu.fechar();
            this.visivel = null;
            this.encerrando = false;
            this.mostrar(this.login);
        };
        this.aoVoltar = (origem) => {
            if (origem && !origem.isDestroyed())
                origem.close();
            this.mostrar(this.menu);
        };
        this.abrirInicial = () => {
            if (this.visivel) {
                this.visivel.abrir();
                return;
            }
            this.mostrar(this.sessao.usuario() ? this.menu : this.login);
        };
        this.iniciar = () => {
            electron_1.app.whenReady().then(() => {
                if (process.platform === 'win32')
                    electron_1.app.setAppUserModelId('com.cotil.academia');
                electron_1.session.defaultSession.setPermissionRequestHandler((_conteudo, _permissao, callback) => callback(false));
                electron_1.session.defaultSession.setPermissionCheckHandler(() => false);
                electron_1.session.defaultSession.webRequest.onHeadersReceived((detalhes, callback) => {
                    callback({
                        responseHeaders: {
                            ...detalhes.responseHeaders,
                            'Content-Security-Policy': [CSP]
                        }
                    });
                });
                const botClima = new BotClima_1.BotClimaServico();
                const notificacaoServico = new NotificacaoBackend_1.NotificacaoServico();
                const botVencimento = new BotVencimento_1.BotVencimentoServico(notificacaoServico);
                new AutenticacaoBackend_1.AutenticacaoIpc(new AutenticacaoBackend_1.AutenticacaoServico(), this.sessao, this.aoEntrar, this.aoSair).registrar();
                new CepBackend_1.CepIpc(this.sessao).registrar();
                new ClimaBackend_1.ClimaIpc(this.sessao).registrar();
                new FeriadosBackend_1.FeriadosIpc(this.sessao).registrar();
                new WgerBackend_1.WgerIpc(this.sessao).registrar();
                new BotClima_1.BotClimaIpc(this.sessao, botClima).registrar();
                new AlunoBackend_1.AlunoIpc(this.sessao).registrar();
                new AulaBackend_1.AulaIpc(this.sessao).registrar();
                new AvaliacaoBackend_1.AvaliacaoIpc(this.sessao).registrar();
                new PresencaBackend_1.PresencaResumoIpc(this.sessao).registrar();
                new PlanosBackend_1.PlanoIpc(this.sessao).registrar();
                new PlanosBackend_1.AssinaturaIpc(this.sessao).registrar();
                new PagamentoBackend_1.PagamentoIpc(this.sessao).registrar();
                new VisitanteBackend_1.VisitanteIpc(this.sessao).registrar();
                new NotificacaoBackend_1.NotificacaoIpc(this.sessao, botVencimento, notificacaoServico).registrar();
                new FuncionarioBackend_1.FuncionarioIpc(this.sessao).registrar();
                new FuncionarioBackend_1.ModalidadeIpc(this.sessao).registrar();
                new MenuBackend_1.MenuIpc(this.sessao, {
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
                }, this.aoVoltar).registrar();
                new RelatorioBackend_1.RelatorioIpc(this.sessao).registrar();
                new UsuarioBackend_1.UsuarioIpc(this.sessao).registrar();
                this.abrirInicial();
                botClima.iniciar();
                botVencimento.iniciar();
                electron_1.app.on('before-quit', () => {
                    botClima.encerrar();
                    botVencimento.encerrar();
                });
                electron_1.app.on('activate', this.abrirInicial);
            });
            electron_1.app.on('window-all-closed', () => {
                if (process.platform !== 'darwin')
                    electron_1.app.quit();
            });
        };
    }
}
new Aplicacao().iniciar();
