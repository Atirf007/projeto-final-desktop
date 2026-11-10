"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutenticacaoIpc = exports.AutenticacaoServico = exports.UsuarioRepository = exports.LimitadorTentativas = exports.Senha = exports.ErroAutenticacao = void 0;
const crypto_1 = require("crypto");
const electron_1 = require("electron");
const Banco_1 = require("../Banco");
class ErroAutenticacao extends Error {
}
exports.ErroAutenticacao = ErroAutenticacao;
class Senha {
    constructor() {
        this.derivar = (senha, sal, tamanho) => new Promise((resolver, rejeitar) => {
            (0, crypto_1.scrypt)(senha, sal, tamanho, (erro, chave) => (erro ? rejeitar(erro) : resolver(chave)));
        });
        this.gerar = async (senha) => {
            const sal = (0, crypto_1.randomBytes)(16);
            const hash = await this.derivar(senha, sal, 64);
            return `scrypt:${sal.toString('hex')}:${hash.toString('hex')}`;
        };
        this.verificar = async (senha, armazenado) => {
            try {
                const [algoritmo, salHex, hashHex] = armazenado.split(':');
                if (algoritmo !== 'scrypt' || !salHex || !hashHex)
                    return false;
                const esperado = Buffer.from(hashHex, 'hex');
                const calculado = await this.derivar(senha, Buffer.from(salHex, 'hex'), esperado.length);
                return esperado.length === calculado.length && (0, crypto_1.timingSafeEqual)(esperado, calculado);
            }
            catch {
                return false;
            }
        };
    }
}
exports.Senha = Senha;
class LimitadorTentativas {
    constructor(maximo = 5, bloqueioMs = 5 * 60 * 1000) {
        this.maximo = maximo;
        this.bloqueioMs = bloqueioMs;
        this.registros = new Map();
        this.bloqueado = (chave) => (this.registros.get(chave)?.bloqueadoAte ?? 0) > Date.now();
        this.minutosRestantes = (chave) => Math.max(1, Math.ceil(((this.registros.get(chave)?.bloqueadoAte ?? 0) - Date.now()) / 60000));
        this.falhou = (chave) => {
            const registro = this.registros.get(chave) ?? { quantidade: 0, bloqueadoAte: 0 };
            registro.quantidade += 1;
            if (registro.quantidade >= this.maximo) {
                registro.quantidade = 0;
                registro.bloqueadoAte = Date.now() + this.bloqueioMs;
            }
            this.registros.set(chave, registro);
        };
        this.sucesso = (chave) => {
            this.registros.delete(chave);
        };
    }
}
exports.LimitadorTentativas = LimitadorTentativas;
class UsuarioRepository {
    constructor() {
        this.buscarPorEmail = async (email) => {
            const [linhas] = await Banco_1.Banco.pool.query({
                sql: 'SELECT id, nome, senha_hash, perfil FROM usuarios WHERE email = ? AND ativo = 1 LIMIT 1',
                values: [email],
                timeout: 10000
            });
            return linhas.length ? linhas[0] : null;
        };
        this.registrarLogin = async (id) => {
            await Banco_1.Banco.pool.query({
                sql: 'UPDATE usuarios SET ultimo_login = NOW() WHERE id = ?',
                values: [id],
                timeout: 5000
            });
        };
    }
}
exports.UsuarioRepository = UsuarioRepository;
class AutenticacaoServico {
    constructor(repositorio = new UsuarioRepository(), senha = new Senha(), limitador = new LimitadorTentativas()) {
        this.repositorio = repositorio;
        this.senha = senha;
        this.limitador = limitador;
        this.hashFalso = null;
        this.obterHashFalso = () => {
            this.hashFalso ?? (this.hashFalso = this.senha.gerar((0, crypto_1.randomBytes)(8).toString('hex')));
            return this.hashFalso;
        };
        this.entrar = async (email, senha) => {
            const chave = email.trim().toLowerCase();
            if (this.limitador.bloqueado(chave)) {
                throw new ErroAutenticacao(`Muitas tentativas. Tente novamente em ${this.limitador.minutosRestantes(chave)} min.`);
            }
            const usuario = await this.repositorio.buscarPorEmail(chave);
            const hash = usuario ? usuario.senha_hash : await this.obterHashFalso();
            const valida = await this.senha.verificar(senha, hash);
            if (!usuario || !valida) {
                this.limitador.falhou(chave);
                throw new ErroAutenticacao('E-mail ou senha inválidos.');
            }
            this.limitador.sucesso(chave);
            this.repositorio.registrarLogin(usuario.id).catch((erro) => {
                console.error('[login] não foi possível atualizar o ultimo_login:', erro);
            });
            return { id: Number(usuario.id), nome: usuario.nome, perfil: usuario.perfil };
        };
    }
}
exports.AutenticacaoServico = AutenticacaoServico;
class AutenticacaoIpc {
    constructor(servico, sessao, aoEntrar, aoSair) {
        this.servico = servico;
        this.sessao = sessao;
        this.aoEntrar = aoEntrar;
        this.aoSair = aoSair;
        this.emailValido = (email) => email.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        this.comLimite = (promessa, milissegundos) => new Promise((resolver, rejeitar) => {
            const temporizador = setTimeout(() => {
                rejeitar(new ErroAutenticacao('O banco de dados demorou demais para responder. Tente novamente.'));
            }, milissegundos);
            promessa.then((valor) => {
                clearTimeout(temporizador);
                resolver(valor);
            }, (erro) => {
                clearTimeout(temporizador);
                rejeitar(erro);
            });
        });
        this.mensagemDeErro = (erro) => {
            if (erro instanceof ErroAutenticacao)
                return erro.message;
            const codigo = erro.code ?? '';
            const semConexao = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH', 'ENETUNREACH', 'ECONNRESET', 'PROTOCOL_CONNECTION_LOST'];
            if (semConexao.includes(codigo))
                return 'Não foi possível conectar ao banco de dados. Verifique a rede e o DB_HOST no arquivo .env.';
            if (codigo === 'ER_ACCESS_DENIED_ERROR')
                return 'O MySQL recusou o DB_USER ou o DB_PASSWORD do arquivo .env.';
            if (codigo === 'ER_DBACCESS_DENIED_ERROR')
                return 'O usuário do arquivo .env não tem acesso ao banco informado em DB_NAME.';
            if (codigo === 'ER_BAD_DB_ERROR')
                return 'Banco de dados não encontrado. Verifique o DB_NAME no arquivo .env.';
            if (codigo === 'ER_NO_SUCH_TABLE')
                return 'A tabela usuarios não existe no banco de dados.';
            if (codigo === 'PROTOCOL_SEQUENCE_TIMEOUT')
                return 'O banco de dados demorou demais para responder. Tente novamente.';
            return 'Não foi possível entrar. Verifique a conexão com o banco.';
        };
        this.registrar = () => {
            electron_1.ipcMain.handle('auth:login', async (_evento, email, senha) => {
                if (typeof email !== 'string' || typeof senha !== 'string')
                    return { ok: false, mensagem: 'Dados inválidos.' };
                const emailLimpo = email.trim();
                if (!this.emailValido(emailLimpo) || !senha || senha.length > 128) {
                    return { ok: false, mensagem: 'E-mail ou senha inválidos.' };
                }
                try {
                    const usuario = await this.comLimite(this.servico.entrar(emailLimpo, senha), 15000);
                    this.sessao.iniciar(usuario);
                    setImmediate(this.aoEntrar);
                    return { ok: true };
                }
                catch (erro) {
                    if (!(erro instanceof ErroAutenticacao))
                        console.error('[login] falha ao autenticar:', erro);
                    return { ok: false, mensagem: this.mensagemDeErro(erro) };
                }
            });
            electron_1.ipcMain.handle('auth:me', () => this.sessao.usuario());
            electron_1.ipcMain.handle('auth:sair', () => {
                this.sessao.encerrar();
                setImmediate(this.aoSair);
            });
        };
    }
}
exports.AutenticacaoIpc = AutenticacaoIpc;
