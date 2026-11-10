"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
class UsuariosView {
    constructor() {
        this.perfis = {
            admin: 'Administrador',
            instrutor: 'Instrutor',
            aluno: 'Aluno'
        };
        this.timer = null;
        this.el = (id) => document.getElementById(id);
        this.dataHora = (valor) => {
            if (!valor)
                return '—';
            const [data, hora] = valor.split(' ');
            const [ano, mes, dia] = data.split('-');
            if (!ano || !mes || !dia)
                return valor;
            return hora ? `${dia}/${mes}/${ano} ${hora.slice(0, 5)}` : `${dia}/${mes}/${ano}`;
        };
        this.celula = (valor, classe) => {
            const celula = document.createElement('td');
            celula.textContent = valor;
            if (classe)
                celula.className = classe;
            return celula;
        };
        this.criarLinha = (usuario) => {
            const linha = document.createElement('tr');
            const perfil = document.createElement('td');
            perfil.textContent = this.perfis[usuario.perfil] ?? usuario.perfil;
            const status = document.createElement('td');
            const selo = document.createElement('span');
            selo.className = usuario.ativo ? 'selo ativo' : 'selo inativo';
            selo.textContent = usuario.ativo ? 'Ativo' : 'Inativo';
            status.append(selo);
            linha.append(this.celula(String(usuario.id), 'col-id'), this.celula(usuario.nome, 'col-nome'), this.celula(usuario.email), perfil, status, this.celula(this.dataHora(usuario.ultimoLogin), 'col-data'), this.celula(this.dataHora(usuario.criadoEm), 'col-data'));
            return linha;
        };
        this.atualizar = async () => {
            const status = this.el('status');
            const corpo = this.el('corpo');
            const busca = this.el('busca').value.trim();
            status.classList.remove('erro');
            status.textContent = 'Carregando usuários...';
            try {
                const usuarios = await electron_1.ipcRenderer.invoke('usuarios:listar', busca);
                corpo.replaceChildren(...usuarios.map(this.criarLinha));
                status.classList.remove('erro');
                status.textContent = usuarios.length
                    ? ''
                    : busca
                        ? 'Nenhum usuário encontrado para a busca informada.'
                        : 'Nenhum usuário cadastrado.';
            }
            catch {
                corpo.replaceChildren();
                status.classList.add('erro');
                status.textContent = 'Não foi possível carregar os usuários.';
            }
        };
        this.agendarBusca = () => {
            if (this.timer)
                clearTimeout(this.timer);
            this.timer = setTimeout(() => {
                this.timer = null;
                void this.atualizar();
            }, 300);
        };
        this.abrirFormulario = () => {
            this.el('formulario').reset();
            this.el('erro-formulario').textContent = '';
            this.el('dialogo').showModal();
            this.el('nome').focus();
        };
        this.fecharFormulario = () => {
            this.el('formulario').reset();
            this.el('dialogo').close();
        };
        this.salvar = async (evento) => {
            evento.preventDefault();
            const erro = this.el('erro-formulario');
            const botao = this.el('salvar');
            const nome = this.el('nome').value.trim();
            const email = this.el('email').value.trim();
            const perfil = this.el('perfil').value;
            const senha = this.el('senha').value;
            const confirmacao = this.el('confirmacao').value;
            if (!nome || !email || !senha || !confirmacao) {
                erro.textContent = 'Preencha todos os campos.';
                return;
            }
            if (senha !== confirmacao) {
                erro.textContent = 'A confirmação da senha não confere.';
                return;
            }
            botao.disabled = true;
            erro.textContent = '';
            try {
                const resultado = await electron_1.ipcRenderer.invoke('usuarios:criar', { nome, email, senha, perfil });
                if (!resultado.ok) {
                    erro.textContent = resultado.mensagem;
                    return;
                }
                this.fecharFormulario();
                await this.atualizar();
                this.el('status').textContent = `Usuário ${nome} cadastrado com sucesso.`;
            }
            catch {
                erro.textContent = 'Não foi possível cadastrar o usuário.';
            }
            finally {
                botao.disabled = false;
            }
        };
        this.voltar = async () => {
            try {
                await electron_1.ipcRenderer.invoke('menu:voltar');
            }
            catch {
                this.el('status').textContent = 'Não foi possível voltar ao menu.';
            }
        };
        this.iniciar = () => {
            this.el('busca').addEventListener('input', this.agendarBusca);
            this.el('novo').addEventListener('click', this.abrirFormulario);
            this.el('voltar').addEventListener('click', this.voltar);
            this.el('cancelar').addEventListener('click', this.fecharFormulario);
            this.el('formulario').addEventListener('submit', this.salvar);
            void this.atualizar();
        };
    }
}
window.addEventListener('DOMContentLoaded', () => new UsuariosView().iniciar());
