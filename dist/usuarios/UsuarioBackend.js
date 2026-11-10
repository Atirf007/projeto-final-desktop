"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsuarioIpc = exports.UsuarioRepository = void 0;
const electron_1 = require("electron");
const Banco_1 = require("../Banco");
const BancoErros_1 = require("../BancoErros");
const AutenticacaoBackend_1 = require("../autenticacao/AutenticacaoBackend");
class UsuarioRepository {
    constructor() {
        this.pool = Banco_1.Banco.pool;
        this.sqlCriar = 'INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (?, ?, ?, ?)';
        this.sqlListar = `
    SELECT id, nome, email, perfil, ativo, ultimo_login, criado_em
    FROM usuarios
    WHERE (? = '' OR nome LIKE ? OR email LIKE ?)
    ORDER BY nome ASC`;
        this.listar = async (busca) => {
            const termo = busca ? `%${busca.replace(/[\\%_]/g, '\\$&')}%` : '';
            const [linhas] = await this.pool.query({
                sql: this.sqlListar,
                values: [termo, termo, termo],
                timeout: 10000
            });
            return linhas.map((linha) => ({
                id: Number(linha.id),
                nome: String(linha.nome),
                email: String(linha.email),
                perfil: linha.perfil,
                ativo: Boolean(linha.ativo),
                ultimoLogin: linha.ultimo_login ?? null,
                criadoEm: String(linha.criado_em)
            }));
        };
        this.criar = async (nome, email, senhaHash, perfil) => {
            const [resultado] = await this.pool.query({
                sql: this.sqlCriar,
                values: [nome, email, senhaHash, perfil],
                timeout: 15000
            });
            return Number(resultado.insertId);
        };
    }
}
exports.UsuarioRepository = UsuarioRepository;
class UsuarioIpc {
    constructor(sessao, repositorio = new UsuarioRepository(), senha = new AutenticacaoBackend_1.Senha()) {
        this.sessao = sessao;
        this.repositorio = repositorio;
        this.senha = senha;
        this.perfisValidos = ['admin', 'instrutor', 'aluno'];
        this.validar = (entrada) => {
            if (typeof entrada !== 'object' || entrada === null)
                return { valido: false, mensagem: 'Dados inválidos.' };
            const { nome, email, senha, perfil } = entrada;
            if (typeof nome !== 'string' || typeof email !== 'string' || typeof senha !== 'string' || typeof perfil !== 'string') {
                return { valido: false, mensagem: 'Dados inválidos.' };
            }
            const nomeLimpo = nome.trim();
            if (nomeLimpo.length < 2 || nomeLimpo.length > 120) {
                return { valido: false, mensagem: 'Informe o nome com 2 a 120 caracteres.' };
            }
            const emailLimpo = email.trim().toLowerCase();
            if (emailLimpo.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo)) {
                return { valido: false, mensagem: 'Informe um e-mail válido.' };
            }
            if (senha.length < 8 || senha.length > 128 || !/[A-Za-z]/.test(senha) || !/\d/.test(senha)) {
                return { valido: false, mensagem: 'A senha deve ter de 8 a 128 caracteres, com letras e números.' };
            }
            if (!this.perfisValidos.includes(perfil))
                return { valido: false, mensagem: 'Selecione um perfil válido.' };
            return { valido: true, dados: { nome: nomeLimpo, email: emailLimpo, senha, perfil: perfil } };
        };
        this.registrar = () => {
            electron_1.ipcMain.handle('usuarios:listar', async (_evento, busca) => {
                this.sessao.exigir(['admin']);
                if (busca !== undefined && typeof busca !== 'string')
                    throw new Error('Consulta inválida');
                if (typeof busca === 'string' && busca.length > 120)
                    throw new Error('Consulta inválida');
                return this.repositorio.listar(typeof busca === 'string' ? busca.trim() : '');
            });
            electron_1.ipcMain.handle('usuarios:criar', async (_evento, entrada) => {
                this.sessao.exigir(['admin']);
                const validacao = this.validar(entrada);
                if (!validacao.valido)
                    return { ok: false, mensagem: validacao.mensagem };
                const { nome, email, senha, perfil } = validacao.dados;
                try {
                    const hash = await this.senha.gerar(senha);
                    const id = await this.repositorio.criar(nome, email, hash, perfil);
                    return { ok: true, id };
                }
                catch (erro) {
                    console.error('[usuarios:criar]', erro);
                    return { ok: false, mensagem: BancoErros_1.BancoErros.mensagem(erro, 'Não foi possível cadastrar o usuário.') };
                }
            });
        };
    }
}
exports.UsuarioIpc = UsuarioIpc;
