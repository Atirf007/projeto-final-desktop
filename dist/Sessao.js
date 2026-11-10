"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Sessao = void 0;
class Sessao {
    constructor() {
        this.usuarioAtual = null;
        this.iniciar = (usuario) => {
            this.usuarioAtual = usuario;
        };
        this.encerrar = () => {
            this.usuarioAtual = null;
        };
        this.usuario = () => this.usuarioAtual;
        this.exigir = (perfis) => {
            if (!this.usuarioAtual)
                throw new Error('Sessão não iniciada');
            if (perfis && !perfis.includes(this.usuarioAtual.perfil))
                throw new Error('Acesso negado');
            return this.usuarioAtual;
        };
    }
}
exports.Sessao = Sessao;
