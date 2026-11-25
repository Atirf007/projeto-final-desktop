"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WgerIpc = exports.WgerCliente = void 0;
const SegurancaIpc_1 = require("../SegurancaIpc");
const BASE_URL = 'https://wger.de/api/v2';
const LIMITE_API = 60;
class WgerCliente {
    constructor() {
        this.cache = null;
        this.ttlMs = 30 * 60 * 1000;
        this.limparHtml = (valor) => String(valor ?? '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/gi, "'")
            .replace(/\s+/g, ' ')
            .trim();
        this.normalizarTexto = (valor) => valor
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
        this.escolherTraducao = (item) => {
            const traducoes = Array.isArray(item.translations) ? item.translations : [];
            const comNome = traducoes.filter((traducao) => typeof traducao.name === 'string' && traducao.name.trim());
            if (!comNome.length)
                return null;
            return comNome.find((traducao) => traducao.language === 7 || traducao.language === 9)
                ?? comNome.find((traducao) => traducao.language === 2)
                ?? comNome[0];
        };
        this.imagem = (url) => {
            if (typeof url !== 'string' || !url.trim())
                return undefined;
            return url.startsWith('http') ? url : `${BASE_URL.replace('/api/v2', '')}${url}`;
        };
        this.mapear = (item) => {
            const id = Number(item.id);
            if (!Number.isInteger(id) || id <= 0)
                return null;
            const traducao = this.escolherTraducao(item);
            const nome = this.limparHtml(traducao?.name);
            if (!nome)
                return null;
            const musculos = (Array.isArray(item.muscles) ? item.muscles : [])
                .map((musculo) => this.limparHtml(musculo?.name))
                .filter(Boolean);
            const equipamento = (Array.isArray(item.equipment) ? item.equipment : [])
                .map((equipamento) => this.limparHtml(equipamento?.name))
                .filter(Boolean);
            return {
                id,
                nome,
                descricao: this.limparHtml(traducao?.description).slice(0, 600),
                musculos,
                equipamento,
                imagemUrl: this.imagem(item.images?.[0]?.image)
            };
        };
        this.carregar = async () => {
            if (this.cache && this.cache.expiraEm > Date.now()) {
                return { ok: true, exercicios: this.cache.valor };
            }
            try {
                const resposta = await fetch(`${BASE_URL}/exerciseinfo/?limit=${LIMITE_API}`, {
                    signal: AbortSignal.timeout(8000)
                });
                if (!resposta.ok) {
                    return { ok: false, mensagem: 'Não foi possível consultar o catálogo de exercícios no momento.' };
                }
                const dados = (await resposta.json());
                const itens = Array.isArray(dados.results) ? dados.results : [];
                const exercicios = itens
                    .map((item) => this.mapear(item))
                    .filter((item) => item !== null);
                if (!exercicios.length) {
                    return { ok: false, mensagem: 'O catálogo de exercícios não retornou dados.' };
                }
                this.cache = { expiraEm: Date.now() + this.ttlMs, valor: exercicios };
                return { ok: true, exercicios };
            }
            catch {
                return {
                    ok: false,
                    mensagem: 'Não foi possível consultar o catálogo de exercícios. Verifique a conexão com a internet.'
                };
            }
        };
        this.buscar = async (termoInformado, limiteInformado) => {
            const resultado = await this.carregar();
            if (!resultado.ok)
                return resultado;
            const limite = Number.isInteger(limiteInformado) && limiteInformado > 0 ? Math.min(limiteInformado, 50) : 20;
            const termo = this.normalizarTexto(termoInformado.trim());
            const encontrados = termo
                ? resultado.exercicios.filter((exercicio) => this.normalizarTexto(`${exercicio.nome} ${exercicio.descricao} ${exercicio.musculos.join(' ')} ${exercicio.equipamento.join(' ')}`).includes(termo))
                : resultado.exercicios;
            return { ok: true, exercicios: encontrados.slice(0, limite) };
        };
        this.obter = async (id) => {
            const resultado = await this.buscar('', LIMITE_API);
            if (!resultado.ok)
                return resultado;
            const exercicio = resultado.exercicios.find((item) => item.id === id);
            if (!exercicio)
                return { ok: false, mensagem: 'Exercício não encontrado no catálogo.' };
            return { ok: true, exercicio };
        };
    }
}
exports.WgerCliente = WgerCliente;
class WgerIpc {
    constructor(sessao, cliente = new WgerCliente()) {
        this.sessao = sessao;
        this.cliente = cliente;
        this.registrar = () => {
            (0, SegurancaIpc_1.registrarCanal)('exercicios:buscar', async (_evento, entrada) => {
                this.sessao.exigir(['admin', 'instrutor']);
                const dados = typeof entrada === 'object' && entrada !== null ? entrada : {};
                const termo = typeof dados.termo === 'string' ? dados.termo.trim().slice(0, 80) : '';
                const limite = Number(dados.limite);
                return this.cliente.buscar(termo, Number.isInteger(limite) ? limite : 20);
            });
            (0, SegurancaIpc_1.registrarCanal)('exercicios:obter', async (_evento, entrada) => {
                this.sessao.exigir(['admin', 'instrutor']);
                const dados = typeof entrada === 'object' && entrada !== null ? entrada : {};
                const id = typeof entrada === 'number' ? entrada : Number(dados.id);
                if (!Number.isInteger(id) || id <= 0)
                    return { ok: false, mensagem: 'Exercício inválido.' };
                return this.cliente.obter(id);
            });
        };
    }
}
exports.WgerIpc = WgerIpc;
