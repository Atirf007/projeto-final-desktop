"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const JanelaApp_1 = require("./JanelaApp");
const Sessao_1 = require("./Sessao");
const AlunoBackend_1 = require("./alunos/AlunoBackend");
const AutenticacaoBackend_1 = require("./autenticacao/AutenticacaoBackend");
const FuncionarioBackend_1 = require("./funcionarios/FuncionarioBackend");
const CepBackend_1 = require("./integracoes/CepBackend");
const ClimaBackend_1 = require("./integracoes/ClimaBackend");
const BotClima_1 = require("./mensagens/BotClima");
const MenuBackend_1 = require("./menu/MenuBackend");
const RelatorioBackend_1 = require("./relatorios/RelatorioBackend");
const UsuarioBackend_1 = require("./usuarios/UsuarioBackend");
class Aplicacao {
    constructor() {
        this.sessao = new Sessao_1.Sessao();
        this.login = new JanelaApp_1.JanelaApp({
            pasta: 'autenticacao',
            nome: 'login',
            largura: 440,
            altura: 560,
            redimensionavel: false
        });
        this.menu = new JanelaApp_1.JanelaApp({ pasta: 'menu', nome: 'menu', largura: 1000, altura: 700 });
        this.relatorios = new JanelaApp_1.JanelaApp({ pasta: 'relatorios', nome: 'relatorios', largura: 1000, altura: 700 });
        this.usuarios = new JanelaApp_1.JanelaApp({ pasta: 'usuarios', nome: 'usuarios', largura: 1000, altura: 700 });
        this.funcionarios = new JanelaApp_1.JanelaApp({ pasta: 'funcionarios', nome: 'funcionarios', largura: 1200, altura: 760 });
        this.alunos = new JanelaApp_1.JanelaApp({ pasta: 'alunos', nome: 'alunos', largura: 1200, altura: 760 });
        this.bot = new JanelaApp_1.JanelaApp({ pasta: 'mensagens', nome: 'mensagens', largura: 1000, altura: 820 });
        this.aoEntrar = () => {
            this.menu.abrir();
            this.login.fechar();
        };
        this.aoSair = () => {
            this.login.abrir();
            this.relatorios.fechar();
            this.usuarios.fechar();
            this.funcionarios.fechar();
            this.alunos.fechar();
            this.bot.fechar();
            this.menu.fechar();
        };
        this.aoVoltar = (origem) => {
            this.menu.abrir();
            origem?.close();
        };
        this.abrirInicial = () => {
            if (this.sessao.usuario())
                this.menu.abrir();
            else
                this.login.abrir();
        };
        this.iniciar = () => {
            electron_1.app.whenReady().then(() => {
                if (process.platform === 'win32')
                    electron_1.app.setAppUserModelId('com.cotil.academia');
                const botClima = new BotClima_1.BotClimaServico();
                new AutenticacaoBackend_1.AutenticacaoIpc(new AutenticacaoBackend_1.AutenticacaoServico(), this.sessao, this.aoEntrar, this.aoSair).registrar();
                new CepBackend_1.CepIpc(this.sessao).registrar();
                new ClimaBackend_1.ClimaIpc(this.sessao).registrar();
                new BotClima_1.BotClimaIpc(this.sessao, botClima).registrar();
                new AlunoBackend_1.AlunoIpc(this.sessao).registrar();
                new FuncionarioBackend_1.FuncionarioIpc(this.sessao).registrar();
                new FuncionarioBackend_1.ModalidadeIpc(this.sessao).registrar();
                new MenuBackend_1.MenuIpc(this.sessao, {
                    relatorios: () => this.relatorios.abrir(),
                    usuarios: () => this.usuarios.abrir(),
                    funcionarios: () => this.funcionarios.abrir(),
                    alunos: () => this.alunos.abrir(),
                    bot: () => this.bot.abrir()
                }, this.aoVoltar).registrar();
                new RelatorioBackend_1.RelatorioIpc(this.sessao).registrar();
                new UsuarioBackend_1.UsuarioIpc(this.sessao).registrar();
                this.abrirInicial();
                botClima.iniciar();
                electron_1.app.on('before-quit', () => botClima.encerrar());
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
