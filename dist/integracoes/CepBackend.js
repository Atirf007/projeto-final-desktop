"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CepIpc = void 0;
const electron_1 = require("electron");
class ViaCepClient {
    constructor() {
        this.cache = new Map();
        this.ttlMs = 24 * 60 * 60 * 1000;
        this.normalizar = (cep) => {
            const digitos = cep.replace(/\D/g, '');
            return /^\d{8}$/.test(digitos) ? digitos : null;
        };
        this.buscar = async (entrada) => {
            const cep = this.normalizar(entrada);
            if (!cep)
                return { ok: false, mensagem: 'Informe um CEP válido com 8 dígitos.' };
            const cacheado = this.cache.get(cep);
            if (cacheado && cacheado.expiraEm > Date.now())
                return { ok: true, endereco: cacheado.valor };
            try {
                const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
                    signal: AbortSignal.timeout(8000)
                });
                if (!resposta.ok)
                    return { ok: false, mensagem: 'Não foi possível consultar o CEP no momento.' };
                const dados = (await resposta.json());
                if (dados.erro)
                    return { ok: false, mensagem: 'CEP não encontrado.' };
                const endereco = {
                    cep,
                    logradouro: String(dados.logradouro ?? ''),
                    bairro: String(dados.bairro ?? ''),
                    cidade: String(dados.localidade ?? ''),
                    estado: String(dados.uf ?? '')
                };
                this.cache.set(cep, { expiraEm: Date.now() + this.ttlMs, valor: endereco });
                return { ok: true, endereco };
            }
            catch {
                return { ok: false, mensagem: 'Não foi possível consultar o CEP. Verifique a conexão com a internet.' };
            }
        };
    }
}
class CepIpc {
    constructor(sessao, cliente = new ViaCepClient()) {
        this.sessao = sessao;
        this.cliente = cliente;
        this.registrar = () => {
            electron_1.ipcMain.handle('cep:buscar', async (_evento, entrada) => {
                this.sessao.exigir(['admin', 'instrutor', 'aluno']);
                const cep = typeof entrada === 'string' ? entrada : entrada?.cep;
                if (typeof cep !== 'string')
                    return { ok: false, mensagem: 'Informe o CEP.' };
                return this.cliente.buscar(cep);
            });
        };
    }
}
exports.CepIpc = CepIpc;
