"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeriadosIpc = exports.FeriadoCliente = void 0;
const SegurancaIpc_1 = require("../SegurancaIpc");
class FeriadoCliente {
    constructor() {
        this.cache = new Map();
        this.ttlMs = 24 * 60 * 60 * 1000;
        this.anoValido = (valor) => {
            const ano = Number(valor);
            return Number.isInteger(ano) && ano >= 1900 && ano <= 2100 ? ano : null;
        };
        this.normalizarData = (valor) => {
            if (typeof valor !== 'string')
                return null;
            const m = valor.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (!m)
                return null;
            const ano = Number(m[1]);
            const mes = Number(m[2]);
            const dia = Number(m[3]);
            const data = new Date(Date.UTC(ano, mes - 1, dia));
            if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia)
                return null;
            if (ano < 1900 || ano > 2100)
                return null;
            return `${m[1]}-${m[2]}-${m[3]}`;
        };
        this.mapear = (item) => {
            const data = this.normalizarData(item.date);
            const nome = typeof item.name === 'string' ? item.name.trim() : '';
            if (!data || !nome)
                return null;
            return {
                data,
                nome,
                tipo: typeof item.type === 'string' && item.type.trim() ? item.type.trim() : undefined
            };
        };
        this.listar = async (anoInformado) => {
            const ano = this.anoValido(anoInformado);
            if (ano === null)
                return { ok: false, mensagem: 'Informe um ano válido.' };
            const cacheado = this.cache.get(ano);
            if (cacheado && cacheado.expiraEm > Date.now())
                return cacheado.valor;
            try {
                const resposta = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`, {
                    signal: AbortSignal.timeout(8000)
                });
                if (!resposta.ok) {
                    return { ok: false, mensagem: 'Não foi possível consultar os feriados no momento.' };
                }
                const dados = (await resposta.json());
                if (!Array.isArray(dados)) {
                    return { ok: false, mensagem: 'A API de feriados retornou uma resposta inesperada.' };
                }
                const feriados = dados
                    .map((item) => this.mapear(item))
                    .filter((item) => item !== null)
                    .sort((a, b) => a.data.localeCompare(b.data));
                const resultado = { ok: true, ano, feriados };
                this.cache.set(ano, { expiraEm: Date.now() + this.ttlMs, valor: resultado });
                return resultado;
            }
            catch {
                return { ok: false, mensagem: 'Não foi possível consultar os feriados. Verifique a conexão com a internet.' };
            }
        };
        this.verificar = async (dataInformada) => {
            const data = this.normalizarData(dataInformada);
            if (!data)
                return { ok: false, mensagem: 'Informe uma data válida no formato AAAA-MM-DD.' };
            const resultado = await this.listar(Number(data.slice(0, 4)));
            if (!resultado.ok)
                return resultado;
            const feriado = resultado.feriados.find((item) => item.data === data) ?? null;
            return { ok: true, data, feriado };
        };
    }
}
exports.FeriadoCliente = FeriadoCliente;
class FeriadosIpc {
    constructor(sessao, cliente = new FeriadoCliente()) {
        this.sessao = sessao;
        this.cliente = cliente;
        this.registrar = () => {
            (0, SegurancaIpc_1.registrarCanal)('feriados:listar', async (_evento, entrada) => {
                this.sessao.exigir(['admin', 'instrutor']);
                const ano = typeof entrada === 'object' && entrada !== null ? entrada.ano : entrada;
                return this.cliente.listar(ano);
            });
            (0, SegurancaIpc_1.registrarCanal)('feriados:verificar', async (_evento, entrada) => {
                this.sessao.exigir(['admin', 'instrutor']);
                const data = typeof entrada === 'object' && entrada !== null ? entrada.data : entrada;
                if (typeof data !== 'string')
                    return { ok: false, mensagem: 'Informe a data.' };
                return this.cliente.verificar(data);
            });
        };
    }
}
exports.FeriadosIpc = FeriadosIpc;
