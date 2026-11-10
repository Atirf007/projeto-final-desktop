"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModalidadeIpc = exports.FuncionarioIpc = void 0;
const electron_1 = require("electron");
const Banco_1 = require("../Banco");
const BancoErros_1 = require("../BancoErros");
const AutenticacaoBackend_1 = require("../autenticacao/AutenticacaoBackend");
const TIMEOUT = 15000;
const textoOuNulo = (valor) => (typeof valor === 'string' && valor.trim() ? valor.trim() : null);
const dataHora = (valor) => String(valor ?? '');
class FuncionarioValidador {
    texto(valor, max) {
        if (typeof valor !== 'string')
            return null;
        const limpo = valor.trim();
        return limpo.length <= max ? limpo : null;
    }
    nome(valor) {
        const nome = this.texto(valor, 120);
        return nome && nome.length >= 2 ? nome : null;
    }
    email(valor) {
        const email = this.texto(valor, 160)?.toLowerCase() ?? null;
        return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
    }
    senha(valor) {
        if (typeof valor !== 'string')
            return null;
        return valor.length >= 8 && valor.length <= 128 && /[A-Za-z]/.test(valor) && /\d/.test(valor) ? valor : null;
    }
    cref(valor) {
        const cref = this.texto(valor, 30);
        return cref && cref.length >= 2 ? cref.toUpperCase() : null;
    }
    bio(valor) {
        if (valor === undefined || valor === null || valor === '')
            return undefined;
        return this.texto(valor, 2000);
    }
    modalidadeIds(valor) {
        if (valor === undefined || valor === null)
            return [];
        if (!Array.isArray(valor))
            return null;
        const ids = new Set();
        for (const item of valor) {
            const id = Number(item);
            if (!Number.isInteger(id) || id <= 0)
                return null;
            ids.add(id);
        }
        return [...ids];
    }
    validarCriacao(entrada) {
        if (typeof entrada !== 'object' || entrada === null)
            return { ok: false, mensagem: 'Dados inválidos.' };
        const e = entrada;
        const nome = this.nome(e.nome);
        if (!nome)
            return { ok: false, mensagem: 'Informe o nome com 2 a 120 caracteres.' };
        const email = this.email(e.email);
        if (!email)
            return { ok: false, mensagem: 'Informe um e-mail válido.' };
        const senha = this.senha(e.senha);
        if (!senha)
            return { ok: false, mensagem: 'A senha deve ter de 8 a 128 caracteres, com letras e números.' };
        const cref = this.cref(e.cref);
        if (!cref)
            return { ok: false, mensagem: 'Informe o CREF com 2 a 30 caracteres.' };
        const bio = this.bio(e.bio);
        if (bio === null)
            return { ok: false, mensagem: 'A biografia deve ter no máximo 2000 caracteres.' };
        const modalidadeIds = this.modalidadeIds(e.modalidadeIds);
        if (modalidadeIds === null)
            return { ok: false, mensagem: 'Selecione modalidades válidas.' };
        return { ok: true, dados: { nome, email, senha, cref, bio, modalidadeIds } };
    }
    validarAtualizacao(entrada) {
        if (typeof entrada !== 'object' || entrada === null)
            return { ok: false, mensagem: 'Dados inválidos.' };
        const e = entrada;
        const id = Number(e.id);
        if (!Number.isInteger(id) || id <= 0)
            return { ok: false, mensagem: 'Funcionário inválido.' };
        const dados = { id };
        if (e.nome !== undefined) {
            const nome = this.nome(e.nome);
            if (!nome)
                return { ok: false, mensagem: 'Nome inválido.' };
            dados.nome = nome;
        }
        if (e.email !== undefined) {
            const email = this.email(e.email);
            if (!email)
                return { ok: false, mensagem: 'E-mail inválido.' };
            dados.email = email;
        }
        if (e.novaSenha !== undefined && e.novaSenha !== '') {
            const senha = this.senha(e.novaSenha);
            if (!senha)
                return { ok: false, mensagem: 'A nova senha deve ter de 8 a 128 caracteres, com letras e números.' };
            dados.novaSenha = senha;
        }
        if (e.cref !== undefined) {
            const cref = this.cref(e.cref);
            if (!cref)
                return { ok: false, mensagem: 'CREF inválido.' };
            dados.cref = cref;
        }
        if (e.bio !== undefined) {
            if (e.bio === null || e.bio === '') {
                dados.bio = null;
            }
            else {
                const bio = this.texto(e.bio, 2000);
                if (bio === null)
                    return { ok: false, mensagem: 'A biografia deve ter no máximo 2000 caracteres.' };
                dados.bio = bio;
            }
        }
        if (e.modalidadeIds !== undefined) {
            const modalidadeIds = this.modalidadeIds(e.modalidadeIds);
            if (modalidadeIds === null)
                return { ok: false, mensagem: 'Selecione modalidades válidas.' };
            dados.modalidadeIds = modalidadeIds;
        }
        if (e.ativo !== undefined) {
            if (typeof e.ativo !== 'boolean')
                return { ok: false, mensagem: 'Status inválido.' };
            dados.ativo = e.ativo;
        }
        return { ok: true, dados };
    }
}
class ModalidadeValidador {
    nome(valor) {
        if (typeof valor !== 'string')
            return null;
        const nome = valor.trim();
        return nome.length >= 2 && nome.length <= 80 ? nome : null;
    }
    descricao(valor) {
        if (valor === undefined || valor === null || valor === '')
            return undefined;
        if (typeof valor !== 'string')
            return null;
        const descricao = valor.trim();
        return descricao.length <= 255 ? descricao : null;
    }
    validarCriacao(entrada) {
        if (typeof entrada !== 'object' || entrada === null)
            return { ok: false, mensagem: 'Dados inválidos.' };
        const e = entrada;
        const nome = this.nome(e.nome);
        if (!nome)
            return { ok: false, mensagem: 'Informe o nome da modalidade com 2 a 80 caracteres.' };
        const descricao = this.descricao(e.descricao);
        if (descricao === null)
            return { ok: false, mensagem: 'A descrição deve ter no máximo 255 caracteres.' };
        return { ok: true, dados: { nome, descricao } };
    }
    validarAtualizacao(entrada) {
        if (typeof entrada !== 'object' || entrada === null)
            return { ok: false, mensagem: 'Dados inválidos.' };
        const e = entrada;
        const id = Number(e.id);
        if (!Number.isInteger(id) || id <= 0)
            return { ok: false, mensagem: 'Modalidade inválida.' };
        const dados = { id };
        if (e.nome !== undefined) {
            const nome = this.nome(e.nome);
            if (!nome)
                return { ok: false, mensagem: 'Nome da modalidade inválido.' };
            dados.nome = nome;
        }
        if (e.descricao !== undefined) {
            if (e.descricao === null || e.descricao === '') {
                dados.descricao = null;
            }
            else {
                const descricao = this.descricao(e.descricao);
                if (descricao === null)
                    return { ok: false, mensagem: 'A descrição deve ter no máximo 255 caracteres.' };
                dados.descricao = descricao;
            }
        }
        if (e.ativo !== undefined) {
            if (typeof e.ativo !== 'boolean')
                return { ok: false, mensagem: 'Status inválido.' };
            dados.ativo = e.ativo;
        }
        return { ok: true, dados };
    }
}
class FuncionarioRepository {
    constructor() {
        this.pool = Banco_1.Banco.pool;
        this.sqlListar = `
    SELECT i.id, i.usuario_id, u.nome, u.email, i.cref, i.ativo,
           GROUP_CONCAT(m.nome ORDER BY m.nome SEPARATOR '||') AS modalidades
    FROM instrutores i
    INNER JOIN usuarios u ON u.id = i.usuario_id
    LEFT JOIN instrutores_modalidades im ON im.instrutor_id = i.id
    LEFT JOIN modalidades m ON m.id = im.modalidade_id
    WHERE (? = '' OR u.nome LIKE ? OR u.email LIKE ? OR i.cref LIKE ?)
      AND (? IS NULL OR i.ativo = ?)
    GROUP BY i.id, i.usuario_id, u.nome, u.email, i.cref, i.ativo
    ORDER BY u.nome ASC`;
        this.sqlObter = `
    SELECT i.id, i.usuario_id, u.nome, u.email, i.cref, i.bio, i.ativo, i.criado_em, i.atualizado_em
    FROM instrutores i
    INNER JOIN usuarios u ON u.id = i.usuario_id
    WHERE i.id = ?
    LIMIT 1`;
        this.sqlModalidadesDoFuncionario = `
    SELECT m.id, m.nome, m.descricao, m.ativo
    FROM modalidades m
    INNER JOIN instrutores_modalidades im ON im.modalidade_id = m.id
    WHERE im.instrutor_id = ?
    ORDER BY m.nome ASC`;
        this.validarModalidades = async (conexao, ids) => {
            if (!ids.length)
                return;
            const placeholders = ids.map(() => '?').join(', ');
            const [linhas] = await conexao.query({
                sql: `SELECT id FROM modalidades WHERE id IN (${placeholders})`,
                values: ids,
                timeout: TIMEOUT
            });
            if (linhas.length !== ids.length)
                throw new Error('Uma das modalidades selecionadas não existe.');
        };
        this.inserirModalidades = async (conexao, instrutorId, ids) => {
            if (!ids.length)
                return;
            await conexao.query({
                sql: 'INSERT INTO instrutores_modalidades (instrutor_id, modalidade_id) VALUES ?',
                values: [ids.map((id) => [instrutorId, id])],
                timeout: TIMEOUT
            });
        };
        this.listar = async (filtro) => {
            const busca = typeof filtro.busca === 'string' ? filtro.busca.trim() : '';
            const termo = busca ? `%${busca.replace(/[\\%_]/g, '\\$&')}%` : '';
            const ativo = typeof filtro.ativo === 'boolean' ? (filtro.ativo ? 1 : 0) : null;
            const [linhas] = await this.pool.query({
                sql: this.sqlListar,
                values: [termo, termo, termo, termo, ativo, ativo],
                timeout: TIMEOUT
            });
            return linhas.map((linha) => ({
                id: Number(linha.id),
                usuarioId: Number(linha.usuario_id),
                nome: String(linha.nome),
                email: String(linha.email),
                cref: String(linha.cref ?? ''),
                modalidades: linha.modalidades ? String(linha.modalidades).split('||').filter(Boolean) : [],
                ativo: Boolean(linha.ativo)
            }));
        };
        this.obter = async (id) => {
            const [linhas] = await this.pool.query({
                sql: this.sqlObter,
                values: [id],
                timeout: TIMEOUT
            });
            if (!linhas.length)
                return null;
            const linha = linhas[0];
            const [modalidades] = await this.pool.query({
                sql: this.sqlModalidadesDoFuncionario,
                values: [id],
                timeout: TIMEOUT
            });
            return {
                id: Number(linha.id),
                usuarioId: Number(linha.usuario_id),
                nome: String(linha.nome),
                email: String(linha.email),
                cref: String(linha.cref ?? ''),
                bio: linha.bio ? String(linha.bio) : undefined,
                modalidades: modalidades.map((m) => ({
                    id: Number(m.id),
                    nome: String(m.nome),
                    descricao: m.descricao ? String(m.descricao) : undefined,
                    ativo: Boolean(m.ativo)
                })),
                ativo: Boolean(linha.ativo),
                criadoEm: dataHora(linha.criado_em),
                atualizadoEm: dataHora(linha.atualizado_em)
            };
        };
        this.criar = async (dados, senhaHash) => {
            const conexao = await this.pool.getConnection();
            try {
                await conexao.beginTransaction();
                await this.validarModalidades(conexao, dados.modalidadeIds);
                const [usuario] = await conexao.query({
                    sql: 'INSERT INTO usuarios (nome, email, senha_hash, perfil, ativo) VALUES (?, ?, ?, ?, 1)',
                    values: [dados.nome, dados.email, senhaHash, 'instrutor'],
                    timeout: TIMEOUT
                });
                const usuarioId = Number(usuario.insertId);
                const [instrutor] = await conexao.query({
                    sql: `INSERT INTO instrutores (usuario_id, cref, bio, ativo, criado_em, atualizado_em)
              VALUES (?, ?, ?, 1, NOW(), NOW())`,
                    values: [usuarioId, dados.cref, textoOuNulo(dados.bio)],
                    timeout: TIMEOUT
                });
                const instrutorId = Number(instrutor.insertId);
                await this.inserirModalidades(conexao, instrutorId, dados.modalidadeIds);
                await conexao.commit();
                return instrutorId;
            }
            catch (erro) {
                await conexao.rollback().catch(() => undefined);
                throw erro;
            }
            finally {
                conexao.release();
            }
        };
        this.atualizar = async (dados, senhaHash) => {
            const conexao = await this.pool.getConnection();
            try {
                await conexao.beginTransaction();
                const [linhas] = await conexao.query({
                    sql: 'SELECT usuario_id FROM instrutores WHERE id = ? LIMIT 1',
                    values: [dados.id],
                    timeout: TIMEOUT
                });
                if (!linhas.length) {
                    await conexao.rollback();
                    return false;
                }
                const usuarioId = Number(linhas[0].usuario_id);
                const camposUsuario = [];
                const valoresUsuario = [];
                if (dados.nome !== undefined) {
                    camposUsuario.push('nome = ?');
                    valoresUsuario.push(dados.nome);
                }
                if (dados.email !== undefined) {
                    camposUsuario.push('email = ?');
                    valoresUsuario.push(dados.email);
                }
                if (dados.ativo !== undefined) {
                    camposUsuario.push('ativo = ?');
                    valoresUsuario.push(dados.ativo ? 1 : 0);
                }
                if (senhaHash) {
                    camposUsuario.push('senha_hash = ?');
                    valoresUsuario.push(senhaHash);
                }
                if (camposUsuario.length) {
                    await conexao.query({
                        sql: `UPDATE usuarios SET ${camposUsuario.join(', ')} WHERE id = ?`,
                        values: [...valoresUsuario, usuarioId],
                        timeout: TIMEOUT
                    });
                }
                const camposInstrutor = [];
                const valoresInstrutor = [];
                if (dados.cref !== undefined) {
                    camposInstrutor.push('cref = ?');
                    valoresInstrutor.push(dados.cref);
                }
                if (dados.bio !== undefined) {
                    camposInstrutor.push('bio = ?');
                    valoresInstrutor.push(dados.bio);
                }
                if (dados.ativo !== undefined) {
                    camposInstrutor.push('ativo = ?');
                    valoresInstrutor.push(dados.ativo ? 1 : 0);
                }
                if (camposInstrutor.length) {
                    camposInstrutor.push('atualizado_em = NOW()');
                    await conexao.query({
                        sql: `UPDATE instrutores SET ${camposInstrutor.join(', ')} WHERE id = ?`,
                        values: [...valoresInstrutor, dados.id],
                        timeout: TIMEOUT
                    });
                }
                if (dados.modalidadeIds !== undefined) {
                    await this.validarModalidades(conexao, dados.modalidadeIds);
                    await conexao.query({
                        sql: 'DELETE FROM instrutores_modalidades WHERE instrutor_id = ?',
                        values: [dados.id],
                        timeout: TIMEOUT
                    });
                    await this.inserirModalidades(conexao, dados.id, dados.modalidadeIds);
                }
                await conexao.commit();
                return true;
            }
            catch (erro) {
                await conexao.rollback().catch(() => undefined);
                throw erro;
            }
            finally {
                conexao.release();
            }
        };
        this.excluir = async (id) => {
            const conexao = await this.pool.getConnection();
            try {
                await conexao.beginTransaction();
                const [linhas] = await conexao.query({
                    sql: 'SELECT usuario_id FROM instrutores WHERE id = ? LIMIT 1',
                    values: [id],
                    timeout: TIMEOUT
                });
                if (!linhas.length) {
                    await conexao.rollback();
                    return false;
                }
                const usuarioId = Number(linhas[0].usuario_id);
                await conexao.query({
                    sql: 'UPDATE instrutores SET ativo = 0, atualizado_em = NOW() WHERE id = ?',
                    values: [id],
                    timeout: TIMEOUT
                });
                await conexao.query({
                    sql: 'UPDATE usuarios SET ativo = 0 WHERE id = ?',
                    values: [usuarioId],
                    timeout: TIMEOUT
                });
                await conexao.commit();
                return true;
            }
            catch (erro) {
                await conexao.rollback().catch(() => undefined);
                throw erro;
            }
            finally {
                conexao.release();
            }
        };
    }
}
class ModalidadeRepository {
    constructor() {
        this.pool = Banco_1.Banco.pool;
        this.listar = async (filtro) => {
            const ativo = typeof filtro.ativo === 'boolean' ? (filtro.ativo ? 1 : 0) : null;
            const [linhas] = await this.pool.query({
                sql: `SELECT id, nome, descricao, ativo
            FROM modalidades
            WHERE (? IS NULL OR ativo = ?)
            ORDER BY nome ASC`,
                values: [ativo, ativo],
                timeout: TIMEOUT
            });
            return linhas.map((linha) => ({
                id: Number(linha.id),
                nome: String(linha.nome),
                descricao: linha.descricao ? String(linha.descricao) : undefined,
                ativo: Boolean(linha.ativo)
            }));
        };
        this.criar = async (dados) => {
            const [resultado] = await this.pool.query({
                sql: 'INSERT INTO modalidades (nome, descricao, ativo, criado_em, atualizado_em) VALUES (?, ?, 1, NOW(), NOW())',
                values: [dados.nome, textoOuNulo(dados.descricao)],
                timeout: TIMEOUT
            });
            return Number(resultado.insertId);
        };
        this.atualizar = async (dados) => {
            const [linhas] = await this.pool.query({
                sql: 'SELECT id FROM modalidades WHERE id = ? LIMIT 1',
                values: [dados.id],
                timeout: TIMEOUT
            });
            if (!linhas.length)
                return false;
            const campos = [];
            const valores = [];
            if (dados.nome !== undefined) {
                campos.push('nome = ?');
                valores.push(dados.nome);
            }
            if (dados.descricao !== undefined) {
                campos.push('descricao = ?');
                valores.push(dados.descricao);
            }
            if (dados.ativo !== undefined) {
                campos.push('ativo = ?');
                valores.push(dados.ativo ? 1 : 0);
            }
            if (!campos.length)
                return true;
            campos.push('atualizado_em = NOW()');
            await this.pool.query({
                sql: `UPDATE modalidades SET ${campos.join(', ')} WHERE id = ?`,
                values: [...valores, dados.id],
                timeout: TIMEOUT
            });
            return true;
        };
        this.excluir = async (id) => {
            const [resultado] = await this.pool.query({
                sql: 'UPDATE modalidades SET ativo = 0, atualizado_em = NOW() WHERE id = ?',
                values: [id],
                timeout: TIMEOUT
            });
            return resultado.affectedRows > 0;
        };
    }
}
class FuncionarioIpc {
    constructor(sessao, repositorio = new FuncionarioRepository(), senha = new AutenticacaoBackend_1.Senha()) {
        this.sessao = sessao;
        this.repositorio = repositorio;
        this.senha = senha;
        this.validador = new FuncionarioValidador();
        this.registrar = () => {
            electron_1.ipcMain.handle('instrutores:listar', async (_evento, entrada) => {
                this.sessao.exigir(['admin', 'instrutor']);
                return this.repositorio.listar(this.filtroValido(entrada));
            });
            electron_1.ipcMain.handle('instrutores:obter', async (_evento, entrada) => {
                this.sessao.exigir(['admin', 'instrutor']);
                const id = this.idValido(entrada);
                if (id === null)
                    throw new Error('Funcionário inválido.');
                return this.repositorio.obter(id);
            });
            electron_1.ipcMain.handle('instrutores:criar', async (_evento, entrada) => {
                this.sessao.exigir(['admin']);
                const v = this.validador.validarCriacao(entrada);
                if (!v.ok)
                    return v;
                try {
                    const hash = await this.senha.gerar(v.dados.senha);
                    const id = await this.repositorio.criar(v.dados, hash);
                    return { ok: true, id };
                }
                catch (erro) {
                    console.error('[instrutores:criar]', erro);
                    return { ok: false, mensagem: BancoErros_1.BancoErros.mensagem(erro, 'Não foi possível cadastrar o funcionário.') };
                }
            });
            electron_1.ipcMain.handle('instrutores:atualizar', async (_evento, entrada) => {
                this.sessao.exigir(['admin']);
                const v = this.validador.validarAtualizacao(entrada);
                if (!v.ok)
                    return v;
                try {
                    const hash = v.dados.novaSenha ? await this.senha.gerar(v.dados.novaSenha) : undefined;
                    const ok = await this.repositorio.atualizar(v.dados, hash);
                    if (!ok)
                        return { ok: false, mensagem: 'Funcionário não encontrado.' };
                    return { ok: true, id: v.dados.id };
                }
                catch (erro) {
                    console.error('[instrutores:atualizar]', erro);
                    return { ok: false, mensagem: BancoErros_1.BancoErros.mensagem(erro, 'Não foi possível atualizar o funcionário.') };
                }
            });
            electron_1.ipcMain.handle('instrutores:excluir', async (_evento, entrada) => {
                this.sessao.exigir(['admin']);
                const id = this.idValido(entrada);
                if (id === null)
                    return { ok: false, mensagem: 'Funcionário inválido.' };
                try {
                    const ok = await this.repositorio.excluir(id);
                    if (!ok)
                        return { ok: false, mensagem: 'Funcionário não encontrado.' };
                    return { ok: true, id };
                }
                catch (erro) {
                    console.error('[instrutores:excluir]', erro);
                    return { ok: false, mensagem: BancoErros_1.BancoErros.mensagem(erro, 'Não foi possível desativar o funcionário.') };
                }
            });
        };
    }
    idValido(valor) {
        const id = typeof valor === 'number' ? valor : typeof valor === 'string' ? Number(valor) : NaN;
        return Number.isInteger(id) && id > 0 ? id : null;
    }
    filtroValido(entrada) {
        if (typeof entrada !== 'object' || entrada === null)
            return {};
        const f = entrada;
        const filtro = {};
        if (typeof f.busca === 'string')
            filtro.busca = f.busca.slice(0, 120);
        if (typeof f.ativo === 'boolean')
            filtro.ativo = f.ativo;
        return filtro;
    }
}
exports.FuncionarioIpc = FuncionarioIpc;
class ModalidadeIpc {
    constructor(sessao, repositorio = new ModalidadeRepository()) {
        this.sessao = sessao;
        this.repositorio = repositorio;
        this.validador = new ModalidadeValidador();
        this.registrar = () => {
            electron_1.ipcMain.handle('modalidades:listar', async (_evento, entrada) => {
                this.sessao.exigir(['admin', 'instrutor', 'aluno']);
                return this.repositorio.listar(this.filtroValido(entrada));
            });
            electron_1.ipcMain.handle('modalidades:criar', async (_evento, entrada) => {
                this.sessao.exigir(['admin']);
                const v = this.validador.validarCriacao(entrada);
                if (!v.ok)
                    return v;
                try {
                    const id = await this.repositorio.criar(v.dados);
                    return { ok: true, id };
                }
                catch (erro) {
                    console.error('[modalidades:criar]', erro);
                    return { ok: false, mensagem: BancoErros_1.BancoErros.mensagem(erro, 'Não foi possível cadastrar a modalidade.') };
                }
            });
            electron_1.ipcMain.handle('modalidades:atualizar', async (_evento, entrada) => {
                this.sessao.exigir(['admin']);
                const v = this.validador.validarAtualizacao(entrada);
                if (!v.ok)
                    return v;
                try {
                    const ok = await this.repositorio.atualizar(v.dados);
                    if (!ok)
                        return { ok: false, mensagem: 'Modalidade não encontrada.' };
                    return { ok: true, id: v.dados.id };
                }
                catch (erro) {
                    console.error('[modalidades:atualizar]', erro);
                    return { ok: false, mensagem: BancoErros_1.BancoErros.mensagem(erro, 'Não foi possível atualizar a modalidade.') };
                }
            });
            electron_1.ipcMain.handle('modalidades:excluir', async (_evento, entrada) => {
                this.sessao.exigir(['admin']);
                const id = this.idValido(entrada);
                if (id === null)
                    return { ok: false, mensagem: 'Modalidade inválida.' };
                try {
                    const ok = await this.repositorio.excluir(id);
                    if (!ok)
                        return { ok: false, mensagem: 'Modalidade não encontrada.' };
                    return { ok: true, id };
                }
                catch (erro) {
                    console.error('[modalidades:excluir]', erro);
                    return { ok: false, mensagem: BancoErros_1.BancoErros.mensagem(erro, 'Não foi possível desativar a modalidade.') };
                }
            });
        };
    }
    idValido(valor) {
        const id = typeof valor === 'number' ? valor : typeof valor === 'string' ? Number(valor) : NaN;
        return Number.isInteger(id) && id > 0 ? id : null;
    }
    filtroValido(entrada) {
        if (typeof entrada !== 'object' || entrada === null)
            return {};
        const f = entrada;
        return typeof f.ativo === 'boolean' ? { ativo: f.ativo } : {};
    }
}
exports.ModalidadeIpc = ModalidadeIpc;
