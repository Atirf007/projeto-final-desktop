"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
class RelatoriosView {
    constructor() {
        this.moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
        this.moedaCurta = new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            maximumFractionDigits: 0
        });
        this.svgNs = 'http://www.w3.org/2000/svg';
        this.nomeArquivo = 'relatorio';
        this.el = (id) => document.getElementById(id);
        this.dois = (numero) => String(numero).padStart(2, '0');
        this.svg = (tag, atributos, texto) => {
            const elemento = document.createElementNS(this.svgNs, tag);
            Object.entries(atributos).forEach(([nome, valor]) => elemento.setAttribute(nome, String(valor)));
            if (texto !== undefined)
                elemento.textContent = texto;
            return elemento;
        };
        this.escala = (maximo) => {
            if (maximo <= 0)
                return 1;
            const base = Math.pow(10, Math.floor(Math.log10(maximo)));
            const fator = maximo / base;
            const arredondado = fator <= 1 ? 1 : fator <= 2 ? 2 : fator <= 5 ? 5 : 10;
            return arredondado * base;
        };
        this.periodoAtual = () => {
            const tipo = this.el('periodo').value;
            if (tipo === 'mensal') {
                const [ano, mes] = this.el('mes').value.split('-').map(Number);
                return Number.isInteger(ano) && Number.isInteger(mes) ? { tipo, ano, mes } : null;
            }
            const ano = Number(this.el('ano').value);
            return Number.isInteger(ano) ? { tipo: 'anual', ano } : null;
        };
        this.titulo = (periodo) => {
            if (periodo.tipo === 'anual')
                return `Receita por categoria - ano de ${periodo.ano}`;
            const mes = new Date(periodo.ano, periodo.mes - 1, 1).toLocaleDateString('pt-BR', {
                month: 'long',
                year: 'numeric'
            });
            return `Receita por categoria - ${mes}`;
        };
        this.desenhar = (receitas) => {
            const total = receitas.mensalidades + receitas.aulas + receitas.aluguel + receitas.outros;
            const barras = [
                { rotulo: 'Mensalidades', valor: receitas.mensalidades, destaque: false },
                { rotulo: 'Aulas', valor: receitas.aulas, destaque: false },
                { rotulo: 'Aluguel', valor: receitas.aluguel, destaque: false },
                { rotulo: 'Outros', valor: receitas.outros, destaque: false },
                { rotulo: 'Total', valor: total, destaque: true }
            ];
            const largura = 800;
            const altura = 380;
            const margemEsquerda = 90;
            const margemDireita = 20;
            const margemTopo = 30;
            const margemBase = 50;
            const areaLargura = largura - margemEsquerda - margemDireita;
            const areaAltura = altura - margemTopo - margemBase;
            const topo = this.escala(total);
            const passo = areaLargura / barras.length;
            const larguraBarra = passo * 0.5;
            const grafico = this.svg('svg', { viewBox: `0 0 ${largura} ${altura}`, role: 'img' });
            for (let i = 0; i <= 4; i++) {
                const y = margemTopo + areaAltura - (areaAltura * i) / 4;
                grafico.appendChild(this.svg('line', { x1: margemEsquerda, x2: largura - margemDireita, y1: y, y2: y, class: 'grade' }));
                grafico.appendChild(this.svg('text', { x: margemEsquerda - 10, y: y + 4, class: 'eixo', 'text-anchor': 'end' }, this.moedaCurta.format((topo * i) / 4)));
            }
            barras.forEach((barra, indice) => {
                const alturaBarra = (areaAltura * barra.valor) / topo;
                const x = margemEsquerda + passo * indice + (passo - larguraBarra) / 2;
                const y = margemTopo + areaAltura - alturaBarra;
                const centro = x + larguraBarra / 2;
                grafico.appendChild(this.svg('rect', {
                    x,
                    y,
                    width: larguraBarra,
                    height: alturaBarra,
                    rx: 4,
                    class: barra.destaque ? 'barra destaque' : 'barra'
                }));
                grafico.appendChild(this.svg('text', { x: centro, y: y - 8, class: 'valor', 'text-anchor': 'middle' }, this.moeda.format(barra.valor)));
                grafico.appendChild(this.svg('text', { x: centro, y: margemTopo + areaAltura + 24, class: 'rotulo', 'text-anchor': 'middle' }, barra.rotulo));
            });
            this.el('grafico').replaceChildren(grafico);
        };
        this.atualizar = async () => {
            const periodo = this.periodoAtual();
            const status = this.el('status');
            if (!periodo) {
                status.textContent = 'Selecione um período válido.';
                return;
            }
            this.nomeArquivo = periodo.tipo === 'anual' ? `relatorio-${periodo.ano}` : `relatorio-${periodo.ano}-${this.dois(periodo.mes)}`;
            this.el('titulo').textContent = this.titulo(periodo);
            try {
                const receitas = await electron_1.ipcRenderer.invoke('relatorios:receitas', periodo);
                this.desenhar(receitas);
                status.textContent = '';
            }
            catch {
                this.el('grafico').replaceChildren();
                status.textContent = 'Não foi possível carregar os dados.';
            }
        };
        this.alternarPeriodo = async () => {
            const mensal = this.el('periodo').value === 'mensal';
            this.el('campo-mes').hidden = !mensal;
            this.el('campo-ano').hidden = mensal;
            await this.atualizar();
        };
        this.exportar = async () => {
            const status = this.el('status');
            try {
                const caminho = await electron_1.ipcRenderer.invoke('relatorios:exportar-pdf', this.nomeArquivo);
                status.textContent = caminho ? `PDF salvo em ${caminho}` : 'Exportação cancelada.';
            }
            catch {
                status.textContent = 'Não foi possível exportar o PDF.';
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
        this.iniciar = async () => {
            const hoje = new Date();
            this.el('mes').value = `${hoje.getFullYear()}-${this.dois(hoje.getMonth() + 1)}`;
            this.el('ano').value = String(hoje.getFullYear());
            this.el('periodo').addEventListener('change', this.alternarPeriodo);
            this.el('mes').addEventListener('change', this.atualizar);
            this.el('ano').addEventListener('change', this.atualizar);
            this.el('exportar').addEventListener('click', this.exportar);
            this.el('voltar').addEventListener('click', this.voltar);
            await this.alternarPeriodo();
        };
    }
}
window.addEventListener('DOMContentLoaded', () => new RelatoriosView().iniciar());
