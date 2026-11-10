"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotClimaIpc = exports.BotClimaServico = exports.ConfiguracaoBotArquivo = void 0;
const electron_1 = require("electron");
const fs_1 = require("fs");
const path_1 = require("path");
const MensagemBackend_1 = require("./MensagemBackend");
class ConfiguracaoBotArquivo {
    constructor(caminho = (0, path_1.join)(electron_1.app.getPath('userData'), 'bot-clima.json')) {
        this.caminho = caminho;
        this.numero = (valor) => {
            const numero = Number(valor);
            return Number.isFinite(numero) ? numero : 30;
        };
        this.carregar = () => {
            try {
                const dados = JSON.parse((0, fs_1.readFileSync)(this.caminho, 'utf8'));
                return {
                    ativo: dados.ativo === true,
                    intervaloMinutos: this.numero(dados.intervaloMinutos),
                    ultimaDataAviso: typeof dados.ultimaDataAviso === 'string' ? dados.ultimaDataAviso : undefined
                };
            }
            catch {
                return { ativo: false, intervaloMinutos: 30 };
            }
        };
        this.salvar = (configuracao) => {
            try {
                (0, fs_1.writeFileSync)(this.caminho, JSON.stringify(configuracao, null, 2), 'utf8');
            }
            catch {
                // A configuração é uma conveniência; uma falha de escrita não deve interromper o bot.
            }
        };
    }
}
exports.ConfiguracaoBotArquivo = ConfiguracaoBotArquivo;
class BotClimaServico {
    constructor(mensagens = new MensagemBackend_1.MensagemServico(), configuracao = new ConfiguracaoBotArquivo()) {
        this.mensagens = mensagens;
        this.configuracao = configuracao;
        this.timer = null;
        this.verificando = false;
        this.normalizarIntervalo = (valor) => {
            const numero = Number(valor);
            if (!Number.isFinite(numero))
                return 30;
            return Math.min(1440, Math.max(1, Math.round(numero)));
        };
        this.salvar = () => {
            this.configuracao.salvar({
                ativo: this.ativo,
                intervaloMinutos: this.intervaloMinutos,
                ultimaDataAviso: this.ultimaDataAviso
            });
        };
        this.agendar = () => {
            if (this.timer)
                clearInterval(this.timer);
            this.timer = null;
            if (!this.ativo) {
                this.proximaVerificacaoEm = undefined;
                return;
            }
            this.proximaVerificacaoEm = new Date(Date.now() + this.intervaloMinutos * 60000).toISOString();
            this.timer = setInterval(() => {
                void this.verificar();
            }, this.intervaloMinutos * 60000);
            this.timer.unref?.();
        };
        this.iniciar = () => {
            if (!this.ativo)
                return;
            this.agendar();
            void this.verificar();
        };
        this.encerrar = () => {
            if (this.timer)
                clearInterval(this.timer);
            this.timer = null;
        };
        this.estado = () => ({
            ativo: this.ativo,
            intervaloMinutos: this.intervaloMinutos,
            verificando: this.verificando,
            emailConfigurado: this.mensagens.emailConfigurado(),
            emailRemetente: this.mensagens.emailRemetente() || undefined,
            ultimaVerificacaoEm: this.ultimaVerificacaoEm,
            proximaVerificacaoEm: this.proximaVerificacaoEm,
            ultimoResultado: this.ultimoResultado,
            mensagens: this.mensagens.listar()
        });
        this.definirAtivo = async (ativo) => {
            this.ativo = ativo;
            this.salvar();
            if (!ativo) {
                this.agendar();
                return this.estado();
            }
            this.agendar();
            return this.verificar();
        };
        this.definirIntervalo = (valor) => {
            this.intervaloMinutos = this.normalizarIntervalo(valor);
            this.salvar();
            this.agendar();
            return this.estado();
        };
        this.verificar = async () => {
            if (this.verificando)
                return this.estado();
            this.verificando = true;
            try {
                const resultado = await this.mensagens.verificar();
                this.ultimoResultado = resultado;
                this.ultimaVerificacaoEm = new Date().toISOString();
                if (resultado.ok && resultado.consolidar) {
                    this.ultimaDataAviso = resultado.previsao.data;
                    this.salvar();
                }
            }
            catch {
                this.ultimoResultado = {
                    ok: false,
                    mensagem: 'Não foi possível verificar o clima.',
                    historico: this.mensagens.listar()
                };
                this.ultimaVerificacaoEm = new Date().toISOString();
            }
            finally {
                this.verificando = false;
                if (this.ativo)
                    this.agendar();
                else
                    this.proximaVerificacaoEm = undefined;
            }
            return this.estado();
        };
        const salva = this.configuracao.carregar();
        this.ativo = salva.ativo;
        this.intervaloMinutos = this.normalizarIntervalo(salva.intervaloMinutos);
        this.ultimaDataAviso = salva.ultimaDataAviso;
        if (this.ultimaDataAviso)
            this.mensagens.marcarAvisoAnterior(this.ultimaDataAviso);
    }
}
exports.BotClimaServico = BotClimaServico;
class BotClimaIpc {
    constructor(sessao, bot) {
        this.sessao = sessao;
        this.bot = bot;
        this.registrar = () => {
            electron_1.ipcMain.handle('bot:estado', () => {
                this.sessao.exigir(['admin', 'instrutor']);
                return this.bot.estado();
            });
            electron_1.ipcMain.handle('bot:verificar', async () => {
                this.sessao.exigir(['admin', 'instrutor']);
                return this.bot.verificar();
            });
            electron_1.ipcMain.handle('bot:definir-ativo', async (_evento, ativo) => {
                this.sessao.exigir(['admin', 'instrutor']);
                if (typeof ativo !== 'boolean')
                    throw new Error('Valor inválido');
                return this.bot.definirAtivo(ativo);
            });
            electron_1.ipcMain.handle('bot:definir-intervalo', (_evento, intervalo) => {
                this.sessao.exigir(['admin', 'instrutor']);
                return this.bot.definirIntervalo(intervalo);
            });
        };
    }
}
exports.BotClimaIpc = BotClimaIpc;
