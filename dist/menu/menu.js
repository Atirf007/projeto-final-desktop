"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
class MenuView {
    constructor() {
        this.perfis = {
            admin: 'Administrador',
            instrutor: 'Instrutor',
            aluno: 'Aluno'
        };
        this.svgNs = 'http://www.w3.org/2000/svg';
        this.el = (id) => document.getElementById(id);
        this.criarOpcao = (opcao) => {
            const botao = document.createElement('button');
            botao.type = 'button';
            botao.className = 'opcao';
            botao.disabled = !opcao.disponivel;
            const icone = document.createElementNS(this.svgNs, 'svg');
            icone.setAttribute('class', 'opcao-icone');
            icone.setAttribute('aria-hidden', 'true');
            const referencia = document.createElementNS(this.svgNs, 'use');
            referencia.setAttribute('href', `#ico-${opcao.id}`);
            icone.append(referencia);
            const titulo = document.createElement('strong');
            titulo.textContent = opcao.titulo;
            const descricao = document.createElement('span');
            descricao.textContent = opcao.descricao;
            botao.append(icone, titulo, descricao);
            if (!opcao.disponivel) {
                const selo = document.createElement('em');
                selo.textContent = 'Em breve';
                botao.append(selo);
            }
            botao.addEventListener('click', () => this.abrir(opcao.id));
            return botao;
        };
        this.abrir = async (id) => {
            try {
                await electron_1.ipcRenderer.invoke('menu:abrir', id);
                this.el('status').textContent = '';
            }
            catch {
                this.el('status').textContent = 'Não foi possível abrir esta tela.';
            }
        };
        this.sair = async () => {
            await electron_1.ipcRenderer.invoke('auth:sair');
        };
        this.iniciar = async () => {
            this.el('sair').addEventListener('click', this.sair);
            try {
                const dados = await electron_1.ipcRenderer.invoke('menu:carregar');
                this.el('nome').textContent = dados.nome;
                this.el('perfil').textContent = this.perfis[dados.perfil] ?? dados.perfil;
                this.el('opcoes').replaceChildren(...dados.opcoes.map(this.criarOpcao));
            }
            catch {
                this.el('status').textContent = 'Sessão inválida. Faça login novamente.';
            }
        };
    }
}
window.addEventListener('DOMContentLoaded', () => new MenuView().iniciar());
