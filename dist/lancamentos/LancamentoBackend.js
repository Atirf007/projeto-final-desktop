"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LancamentoIpc = exports.LancamentoRepository = void 0;
const SegurancaIpc_1 = require("../SegurancaIpc");
const Banco_1 = require("../Banco");
const BancoErros_1 = require("../BancoErros");
class LancamentoRepository {
    constructor() {
        this.pool = Banco_1.Banco.pool;
        this.sqlListar = `
    SELECT id, categoria, descricao, valor, data_lancamento
    FROM lancamentos
    WHERE (? IS NULL OR categoria = ?)
      AND (? IS NULL OR data_lancamento >= ?)
      AND (? IS NULL OR data_lancamento <= ?)
      AND (? IS NULL OR descricao LIKE ?)
    ORDER BY data_lancamento DESC, id DESC`;
        this.mapear = (linha) => ({
            id: Number(linha.id),
            categoria: linha.categoria,
            descricao: linha.descricao ?? null,
            valor: Number(linha.valor),
            dataLancamento: String(linha.data_lancamento)
        });
        this.listar = async (filtro) => {
            const categoria = filtro.categoria || null;
            const inicio = filtro.inicio || null;
            const fim = filtro.fim || null;
            const termo = filtro.busca ? `%${filtro.busca.replace(/[\\%_]/g, '\\$&')}%` : null;
            const [linhas] = await this.pool.query({
                sql: this.sqlListar,
                values: [
                    categoria, categoria,
                    inicio, inicio,
                    fim, fim,
                    termo, termo
                ],
                timeout: 10000
            });
            return linhas.map(this.mapear);
        };
        this.obter = async (id) => {
            const [linhas] = await this.pool.query('SELECT id, categoria, descricao, valor, data_lancamento FROM lancamentos WHERE id = ? LIMIT 1', [id]);
            return linhas[0] ? this.mapear(linhas[0]) : null;
        };
        this.criar = async (dados) => {
            const [resultado] = await this.pool.query('INSERT INTO lancamentos (categoria, descricao, valor, data_lancamento) VALUES (?, ?, ?, ?)', [dados.categoria, dados.descricao, dados.valor, dados.dataLancamento]);
            return Number(resultado.insertId);
        };
        this.atualizar = async (id, dados) => {
            const [resultado] = await this.pool.query('UPDATE lancamentos SET categoria = ?, descricao = ?, valor = ?, data_lancamento = ? WHERE id = ?', [dados.categoria, dados.descricao, dados.valor, dados.dataLancamento, id]);
            return resultado.affectedRows > 0;
        };
        this.excluir = async (id) => {
            const [resultado] = await this.pool.query('DELETE FROM lancamentos WHERE id = ?', [id]);
            return resultado.affectedRows > 0;
        };
    }
}
exports.LancamentoRepository = LancamentoRepository;
class LancamentoIpc {
    constructor(sessao, repositorio = new LancamentoRepository()) {
        this.sessao = sessao;
        this.repositorio = repositorio;
        this.categorias = ['aula', 'aluguel', 'outros'];
        this.validarId = (entrada) => {
            if (typeof entrada !== 'number' && typeof entrada !== 'string')
                return null;
            const id = Number(entrada);
            return Number.isInteger(id) && id > 0 ? id : null;
        };
        this.validarData = (entrada) => {
            if (typeof entrada !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entrada))
                return null;
            const [ano, mes, dia] = entrada.split('-').map(Number);
            if (ano < 2000 || ano > 2100 || mes < 1 || mes > 12 || dia < 1 || dia > 31)
                return null;
            const data = new Date(Date.UTC(ano, mes - 1, dia));
            if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia)
                return null;
            return entrada;
        };
        this.validarValor = (entrada) => {
            if (typeof entrada !== 'number' && typeof entrada !== 'string')
                return null;
            if (typeof entrada === 'string' && !/^\d+([.,]\d{1,2})?$/.test(entrada.trim()))
                return null;
            const valor = typeof entrada === 'number' ? entrada : Number(entrada.trim().replace(',', '.'));
            if (!Number.isFinite(valor) || valor <= 0 || valor > 99999999.99)
                return null;
            return Math.round(valor * 100) / 100;
        };
        this.validarFiltro = (entrada) => {
            if (entrada === undefined)
                return { categoria: '', inicio: '', fim: '', busca: '' };
            if (typeof entrada !== 'object' || entrada === null)
                return null;
            const { categoria, inicio, fim, busca } = entrada;
            if (categoria !== undefined && categoria !== '' && !this.categorias.includes(categoria)) {
                return null;
            }
            if ((inicio !== undefined && inicio !== '' && !this.validarData(inicio)) ||
                (fim !== undefined && fim !== '' && !this.validarData(fim))) {
                return null;
            }
            if (busca !== undefined && (typeof busca !== 'string' || busca.length > 160))
                return null;
            const inicioValido = typeof inicio === 'string' ? this.validarData(inicio) : null;
            const fimValido = typeof fim === 'string' ? this.validarData(fim) : null;
            if (inicioValido && fimValido && inicioValido > fimValido)
                return null;
            return {
                categoria: typeof categoria === 'string' ? categoria : '',
                inicio: inicioValido ?? '',
                fim: fimValido ?? '',
                busca: typeof busca === 'string' ? busca.trim() : ''
            };
        };
        this.validar = (entrada) => {
            if (typeof entrada !== 'object' || entrada === null) {
                return { valido: false, mensagem: 'Dados inválidos.' };
            }
            const { categoria, descricao, valor, dataLancamento } = entrada;
            if (!this.categorias.includes(categoria)) {
                return { valido: false, mensagem: 'Selecione uma categoria válida.' };
            }
            const descricaoLimpa = typeof descricao === 'string' ? descricao.trim() : '';
            if (descricaoLimpa.length > 160) {
                return { valido: false, mensagem: 'A descrição deve ter até 160 caracteres.' };
            }
            const valorValido = this.validarValor(valor);
            if (valorValido === null) {
                return { valido: false, mensagem: 'Informe um valor entre 0,01 e 99.999.999,99.' };
            }
            const dataValida = this.validarData(dataLancamento);
            if (!dataValida) {
                return { valido: false, mensagem: 'Informe uma data válida entre 2000 e 2100.' };
            }
            return {
                valido: true,
                dados: {
                    categoria: categoria,
                    descricao: descricaoLimpa || null,
                    valor: valorValido,
                    dataLancamento: dataValida
                }
            };
        };
        this.registrar = () => {
            (0, SegurancaIpc_1.registrarCanal)('lancamentos:listar', async (_evento, entrada) => {
                this.sessao.exigir(['admin']);
                const filtro = this.validarFiltro(entrada);
                if (!filtro)
                    throw new Error('Filtro inválido');
                try {
                    return await this.repositorio.listar(filtro);
                }
                catch (erro) {
                    console.error('[lancamentos:listar]', erro);
                    throw new Error(BancoErros_1.BancoErros.mensagem(erro, 'Não foi possível carregar os lançamentos.'));
                }
            });
            (0, SegurancaIpc_1.registrarCanal)('lancamentos:obter', async (_evento, entrada) => {
                this.sessao.exigir(['admin']);
                const id = this.validarId(entrada);
                if (id === null)
                    throw new Error('Identificador inválido');
                try {
                    return await this.repositorio.obter(id);
                }
                catch (erro) {
                    console.error('[lancamentos:obter]', erro);
                    throw new Error(BancoErros_1.BancoErros.mensagem(erro, 'Não foi possível carregar o lançamento.'));
                }
            });
            (0, SegurancaIpc_1.registrarCanal)('lancamentos:criar', async (_evento, entrada) => {
                this.sessao.exigir(['admin']);
                const validacao = this.validar(entrada);
                if (!validacao.valido)
                    return { ok: false, mensagem: validacao.mensagem };
                try {
                    const id = await this.repositorio.criar(validacao.dados);
                    return { ok: true, id };
                }
                catch (erro) {
                    console.error('[lancamentos:criar]', erro);
                    return { ok: false, mensagem: BancoErros_1.BancoErros.mensagem(erro, 'Não foi possível cadastrar o lançamento.') };
                }
            });
            (0, SegurancaIpc_1.registrarCanal)('lancamentos:atualizar', async (_evento, entrada) => {
                this.sessao.exigir(['admin']);
                if (typeof entrada !== 'object' || entrada === null)
                    return { ok: false, mensagem: 'Dados inválidos.' };
                const { id, ...dados } = entrada;
                const idValido = this.validarId(id);
                if (idValido === null)
                    return { ok: false, mensagem: 'Identificador inválido.' };
                const validacao = this.validar(dados);
                if (!validacao.valido)
                    return { ok: false, mensagem: validacao.mensagem };
                try {
                    const atualizado = await this.repositorio.atualizar(idValido, validacao.dados);
                    return atualizado ? { ok: true } : { ok: false, mensagem: 'Lançamento não encontrado.' };
                }
                catch (erro) {
                    console.error('[lancamentos:atualizar]', erro);
                    return { ok: false, mensagem: BancoErros_1.BancoErros.mensagem(erro, 'Não foi possível atualizar o lançamento.') };
                }
            });
            (0, SegurancaIpc_1.registrarCanal)('lancamentos:excluir', async (_evento, entrada) => {
                this.sessao.exigir(['admin']);
                const id = this.validarId(entrada);
                if (id === null)
                    return { ok: false, mensagem: 'Identificador inválido.' };
                try {
                    const excluido = await this.repositorio.excluir(id);
                    return excluido ? { ok: true } : { ok: false, mensagem: 'Lançamento não encontrado.' };
                }
                catch (erro) {
                    console.error('[lancamentos:excluir]', erro);
                    return { ok: false, mensagem: BancoErros_1.BancoErros.mensagem(erro, 'Não foi possível excluir o lançamento.') };
                }
            });
        };
    }
}
exports.LancamentoIpc = LancamentoIpc;
