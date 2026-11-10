"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
class LoginView {
    constructor() {
        this.el = (id) => document.getElementById(id);
        this.entrar = async (evento) => {
            evento.preventDefault();
            const email = this.el('email').value.trim();
            const campoSenha = this.el('senha');
            const botao = this.el('entrar');
            const status = this.el('status');
            if (!email || !campoSenha.value) {
                status.textContent = 'Informe o e-mail e a senha.';
                return;
            }
            botao.disabled = true;
            botao.textContent = 'Entrando...';
            status.textContent = '';
            try {
                const resultado = await electron_1.ipcRenderer.invoke('auth:login', email, campoSenha.value);
                if (!resultado.ok) {
                    status.textContent = resultado.mensagem ?? 'Não foi possível entrar.';
                    campoSenha.value = '';
                    campoSenha.focus();
                }
            }
            catch {
                status.textContent = 'Não foi possível entrar.';
            }
            finally {
                botao.disabled = false;
                botao.textContent = 'Entrar';
            }
        };
        this.iniciar = () => {
            this.el('formulario').addEventListener('submit', this.entrar);
            this.el('email').focus();
        };
    }
}
window.addEventListener('DOMContentLoaded', () => new LoginView().iniciar());
