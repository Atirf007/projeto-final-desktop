"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AulaIpc = void 0;
const electron_1 = require("electron");
const Banco_1 = require("../Banco");
const BancoErros_1 = require("../BancoErros");
const TIMEOUT = 15000;
class ErroAula extends Error {
}
const textoOuNulo = (valor) => (typeof valor === 'string' && valor.trim() ? valor.trim() : null);
const dataHoraBanco = (valor) => String(valor ?? '');
const STATUS_AULA = ['agendada', 'confirmada', 'cancelada', 'remarcada', 'concluida'];
const LOCAIS = ['interna', 'externa'];
class AulaValidador {
    texto(valor, max) {
        if (typeof valor !== 'string')
            return null;
        const limpo = valor.trim();
        return limpo.length <= max ? limpo : null;
    }
    inteiro(valor, minimo, maximo) {
        const numero = Number(valor);
        if (!Number.isInteger(numero) || numero < minimo || numero > maximo)
            return null;
        return numero;
    }
    id(valor) {
        return this.inteiro(valor, 1, Number.MAX_SAFE_INTEGER);
    }
    titulo(valor) {
        const titulo = this.texto(valor, 120);
        return titulo && titulo.length >= 2 ? titulo : null;
    }
    data(valor) {
        if (typeof valor !== 'string')
            return null;
        const m = valor.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m)
            return null;
        const ano = Number(m[1]);
        const mes = Number(m[2]);
        const dia = Number(m[3]);
        const d = new Date(Date.UTC(ano, mes - 1, dia));
        if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia)
            return null;
        return `${m[1]}-${m[2]}-${m[3]}`;
    }
    dataHora(valor) {
        if (typeof valor !== 'string')
            return null;
        const m = valor.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
        if (!m)
            return null;
        const ano = Number(m[1]);
        const mes = Number(m[2]);
        const dia = Number(m[3]);
        const hora = Number(m[4]);
        const minuto = Number(m[5]);
        const segundo = Number(m[6] ?? '0');
        const d = new Date(Date.UTC(ano, mes - 1, dia));
        if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia)
            return null;
        if (ano < 2000 || ano > 2100 || hora > 23 || minuto > 59 || segundo > 59)
            return null;
        return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${String(segundo).padStart(2, '0')}`;
    }
    local(valor) {
        return typeof valor === 'string' && LOCAIS.includes(valor) ? valor : null;
    }
    status(valor) {
        return typeof valor === 'string' && STATUS_AULA.includes(valor) ? valor : null;
    }
    localDescricao(valor) {
        if (valor === undefined || valor === null || valor === '')
            return undefined;
        return this.texto(valor, 120);
    }
    validarCriacao(entrada) {
        if (typeof entrada !== 'object' || entrada === null)
            return { ok: false, mensagem: 'Dados inválidos.' };
        const e = entrada;
        const modalidadeId = this.id(e.modalidadeId);
        if (modalidadeId === null)
            return { ok: false, mensagem: 'Selecione uma modalidade válida.' };
        const instrutorId = this.id(e.instrutorId);
        if (instrutorId === null)
            return { ok: false, mensagem: 'Selecione um instrutor válido.' };
        const titulo = this.titulo(e.titulo);
        if (!titulo)
            return { ok: false, mensagem: 'Informe um título com 2 a 120 caracteres.' };
        const dataHoraInicio = this.dataHora(e.dataHoraInicio);
        if (!dataHoraInicio)
            return { ok: false, mensagem: 'Informe uma data e hora de início válidas.' };
        const duracaoMin = this.inteiro(e.duracaoMin, 1, 600);
        if (duracaoMin === null)
            return { ok: false, mensagem: 'A duração deve ser entre 1 e 600 minutos.' };
        const capacidadeMax = this.inteiro(e.capacidadeMax, 1, 500);
        if (capacidadeMax === null)
            return { ok: false, mensagem: 'A capacidade deve ser entre 1 e 500 alunos.' };
        const local = this.local(e.local);
        if (!local)
            return { ok: false, mensagem: 'Selecione um local válido.' };
        const localDescricao = this.localDescricao(e.localDescricao);
        if (localDescricao === null)
            return { ok: false, mensagem: 'A descrição do local deve ter no máximo 120 caracteres.' };
        return {
            ok: true,
            dados: { modalidadeId, instrutorId, titulo, dataHoraInicio, duracaoMin, capacidadeMax, local, localDescricao }
        };
    }
    validarAtualizacao(entrada) {
        if (typeof entrada !== 'object' || entrada === null)
            return { ok: false, mensagem: 'Dados inválidos.' };
        const e = entrada;
        const id = this.id(e.id);
        if (id === null)
            return { ok: false, mensagem: 'Aula inválida.' };
        const dados = { id };
        if (e.modalidadeId !== undefined) {
            const modalidadeId = this.id(e.modalidadeId);
            if (modalidadeId === null)
                return { ok: false, mensagem: 'Modalidade inválida.' };
            dados.modalidadeId = modalidadeId;
        }
        if (e.instrutorId !== undefined) {
            const instrutorId = this.id(e.instrutorId);
            if (instrutorId === null)
                return { ok: false, mensagem: 'Instrutor inválido.' };
            dados.instrutorId = instrutorId;
        }
        if (e.titulo !== undefined) {
            const titulo = this.titulo(e.titulo);
            if (!titulo)
                return { ok: false, mensagem: 'Título inválido.' };
            dados.titulo = titulo;
        }
        if (e.dataHoraInicio !== undefined) {
            const dataHoraInicio = this.dataHora(e.dataHoraInicio);
            if (!dataHoraInicio)
                return { ok: false, mensagem: 'Data e hora inválidas.' };
            dados.dataHoraInicio = dataHoraInicio;
        }
        if (e.duracaoMin !== undefined) {
            const duracaoMin = this.inteiro(e.duracaoMin, 1, 600);
            if (duracaoMin === null)
                return { ok: false, mensagem: 'Duração inválida.' };
            dados.duracaoMin = duracaoMin;
        }
        if (e.capacidadeMax !== undefined) {
            const capacidadeMax = this.inteiro(e.capacidadeMax, 1, 500);
            if (capacidadeMax === null)
                return { ok: false, mensagem: 'Capacidade inválida.' };
            dados.capacidadeMax = capacidadeMax;
        }
        if (e.local !== undefined) {
            const local = this.local(e.local);
            if (!local)
                return { ok: false, mensagem: 'Local inválido.' };
            dados.local = local;
        }
        if (e.localDescricao !== undefined) {
            if (e.localDescricao === null || e.localDescricao === '') {
                dados.localDescricao = null;
            }
            else {
                const localDescricao = this.texto(e.localDescricao, 120);
                if (localDescricao === null)
                    return { ok: false, mensagem: 'Descrição do local inválida.' };
                dados.localDescricao = localDescricao;
            }
        }
        if (e.status !== undefined) {
            const status = this.status(e.status);
            if (!status)
                return { ok: false, mensagem: 'Status inválido.' };
            dados.status = status;
        }
        return { ok: true, dados };
    }
    validarRemarcacao(entrada) {
        if (typeof entrada !== 'object' || entrada === null)
            return { ok: false, mensagem: 'Dados inválidos.' };
        const e = entrada;
        const id = this.id(e.id);
        if (id === null)
            return { ok: false, mensagem: 'Aula inválida.' };
        const novaDataHora = this.dataHora(e.novaDataHora);
        if (!novaDataHora)
            return { ok: false, mensagem: 'Informe a nova data e hora.' };
        let novoLocal;
        if (e.novoLocal !== undefined && e.novoLocal !== '') {
            const local = this.local(e.novoLocal);
            if (!local)
                return { ok: false, mensagem: 'Local inválido.' };
            novoLocal = local;
        }
        let localDescricao;
        if (e.localDescricao !== undefined) {
            if (e.localDescricao === null || e.localDescricao === '') {
                localDescricao = null;
            }
            else {
                const descricao = this.texto(e.localDescricao, 120);
                if (descricao === null)
                    return { ok: false, mensagem: 'Descrição do local inválida.' };
                localDescricao = descricao;
            }
        }
        return { ok: true, dados: { id, novaDataHora, novoLocal, localDescricao } };
    }
    filtro(entrada) {
        if (typeof entrada !== 'object' || entrada === null)
            return {};
        const e = entrada;
        const filtro = {};
        if (typeof e.data === 'string') {
            const data = this.data(e.data);
            if (data)
                filtro.data = data;
        }
        const modalidadeId = this.id(e.modalidadeId);
        if (modalidadeId !== null)
            filtro.modalidadeId = modalidadeId;
        const instrutorId = this.id(e.instrutorId);
        if (instrutorId !== null)
            filtro.instrutorId = instrutorId;
        if (typeof e.status === 'string') {
            const status = this.status(e.status);
            if (status)
                filtro.status = status;
        }
        return filtro;
    }
}
const mapearAula = (linha) => ({
    id: Number(linha.id),
    modalidadeId: Number(linha.modalidade_id),
    modalidadeNome: String(linha.modalidade_nome ?? ''),
    instrutorId: Number(linha.instrutor_id),
    instrutorNome: String(linha.instrutor_nome ?? ''),
    titulo: String(linha.titulo ?? ''),
    dataHoraInicio: dataHoraBanco(linha.data_hora_inicio),
    duracaoMin: Number(linha.duracao_min),
    capacidadeMax: Number(linha.capacidade_max),
    vagasOcupadas: Number(linha.vagas_ocupadas ?? 0),
    local: String(linha.local),
    localDescricao: linha.local_descricao ? String(linha.local_descricao) : undefined,
    status: String(linha.status)
});
const mapearInscricao = (linha) => ({
    id: Number(linha.id),
    aulaId: Number(linha.aula_id),
    alunoId: Number(linha.aluno_id),
    alunoNome: String(linha.aluno_nome ?? ''),
    status: String(linha.status)
});
class AulaRepository {
    constructor() {
        this.pool = Banco_1.Banco.pool;
        this.camposAula = `
    a.id, a.modalidade_id, m.nome AS modalidade_nome, a.instrutor_id, u.nome AS instrutor_nome,
    a.titulo, a.data_hora_inicio, a.duracao_min, a.capacidade_max, a.local, a.local_descricao, a.status,
    (SELECT COUNT(*) FROM inscricoes_aula ia
      WHERE ia.aula_id = a.id AND ia.status IN ('confirmada', 'presente')) AS vagas_ocupadas`;
        this.sqlObter = `
    SELECT ${this.camposAula}
    FROM aulas a
    INNER JOIN modalidades m ON m.id = a.modalidade_id
    INNER JOIN instrutores i ON i.id = a.instrutor_id
    INNER JOIN usuarios u ON u.id = i.usuario_id
    WHERE a.id = ?
    LIMIT 1`;
        this.listar = async (filtro) => {
            const condicoes = [];
            const valores = [];
            if (filtro.data) {
                condicoes.push('DATE(a.data_hora_inicio) = ?');
                valores.push(filtro.data);
            }
            if (filtro.modalidadeId !== undefined) {
                condicoes.push('a.modalidade_id = ?');
                valores.push(filtro.modalidadeId);
            }
            if (filtro.instrutorId !== undefined) {
                condicoes.push('a.instrutor_id = ?');
                valores.push(filtro.instrutorId);
            }
            if (filtro.status) {
                condicoes.push('a.status = ?');
                valores.push(filtro.status);
            }
            const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
            const [linhas] = await this.pool.query({
                sql: `SELECT ${this.camposAula}
            FROM aulas a
            INNER JOIN modalidades m ON m.id = a.modalidade_id
            INNER JOIN instrutores i ON i.id = a.instrutor_id
            INNER JOIN usuarios u ON u.id = i.usuario_id
            ${where}
            ORDER BY a.data_hora_inicio ASC`,
                values: valores,
                timeout: TIMEOUT
            });
            return linhas.map(mapearAula);
        };
        this.obter = async (id, alunoIdFiltro) => {
            const [linhas] = await this.pool.query({
                sql: this.sqlObter,
                values: [id],
                timeout: TIMEOUT
            });
            if (!linhas.length)
                return null;
            const aula = mapearAula(linhas[0]);
            return { ...aula, inscritos: await this.listarInscricoes(id, alunoIdFiltro) };
        };
        this.listarInscricoes = async (aulaId, alunoIdFiltro = null) => {
            const [linhas] = await this.pool.query({
                sql: `SELECT ia.id, ia.aula_id, ia.aluno_id, u.nome AS aluno_nome, ia.status
            FROM inscricoes_aula ia
            INNER JOIN alunos al ON al.id = ia.aluno_id
            INNER JOIN usuarios u ON u.id = al.usuario_id
            WHERE ia.aula_id = ?
              AND (? IS NULL OR ia.aluno_id = ?)
            ORDER BY u.nome ASC`,
                values: [aulaId, alunoIdFiltro, alunoIdFiltro],
                timeout: TIMEOUT
            });
            return linhas.map(mapearInscricao);
        };
        this.minhas = async (alunoId) => {
            const [linhas] = await this.pool.query({
                sql: `SELECT ${this.camposAula}
            FROM aulas a
            INNER JOIN inscricoes_aula ia ON ia.aula_id = a.id
            INNER JOIN modalidades m ON m.id = a.modalidade_id
            INNER JOIN instrutores i ON i.id = a.instrutor_id
            INNER JOIN usuarios u ON u.id = i.usuario_id
            WHERE ia.aluno_id = ? AND ia.status <> 'cancelada'
            ORDER BY a.data_hora_inicio ASC`,
                values: [alunoId],
                timeout: TIMEOUT
            });
            return linhas.map(mapearAula);
        };
        this.instrutorIdPorUsuario = async (usuarioId) => {
            const [linhas] = await this.pool.query({
                sql: 'SELECT id FROM instrutores WHERE usuario_id = ? LIMIT 1',
                values: [usuarioId],
                timeout: TIMEOUT
            });
            return linhas.length ? Number(linhas[0].id) : null;
        };
        this.alunoIdPorUsuario = async (usuarioId) => {
            const [linhas] = await this.pool.query({
                sql: 'SELECT id FROM alunos WHERE usuario_id = ? LIMIT 1',
                values: [usuarioId],
                timeout: TIMEOUT
            });
            return linhas.length ? Number(linhas[0].id) : null;
        };
        this.validarReferencias = async (conexao, modalidadeId, instrutorId) => {
            const [modalidades] = await conexao.query({
                sql: 'SELECT id, ativo FROM modalidades WHERE id = ? LIMIT 1',
                values: [modalidadeId],
                timeout: TIMEOUT
            });
            if (!modalidades.length)
                throw new ErroAula('Modalidade não encontrada.');
            if (!modalidades[0].ativo)
                throw new ErroAula('A modalidade selecionada está inativa.');
            const [instrutores] = await conexao.query({
                sql: `SELECT i.id, i.ativo, u.ativo AS usuario_ativo
            FROM instrutores i
            INNER JOIN usuarios u ON u.id = i.usuario_id
            WHERE i.id = ?
            LIMIT 1`,
                values: [instrutorId],
                timeout: TIMEOUT
            });
            if (!instrutores.length)
                throw new ErroAula('Instrutor não encontrado.');
            if (!instrutores[0].ativo || !instrutores[0].usuario_ativo) {
                throw new ErroAula('O instrutor selecionado está inativo.');
            }
        };
        this.criar = async (dados) => {
            const conexao = await this.pool.getConnection();
            try {
                await conexao.beginTransaction();
                await this.validarReferencias(conexao, dados.modalidadeId, dados.instrutorId);
                const [resultado] = await conexao.query({
                    sql: `INSERT INTO aulas
          (modalidade_id, instrutor_id, titulo, data_hora_inicio, duracao_min, capacidade_max, local, local_descricao, status, criado_em, atualizado_em)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'agendada', NOW(), NOW())`,
                    values: [
                        dados.modalidadeId,
                        dados.instrutorId,
                        dados.titulo,
                        dados.dataHoraInicio,
                        dados.duracaoMin,
                        dados.capacidadeMax,
                        dados.local,
                        textoOuNulo(dados.localDescricao)
                    ],
                    timeout: TIMEOUT
                });
                await conexao.commit();
                return Number(resultado.insertId);
            }
            catch (erro) {
                await conexao.rollback().catch(() => undefined);
                throw erro;
            }
            finally {
                conexao.release();
            }
        };
        this.atualizar = async (dados) => {
            const conexao = await this.pool.getConnection();
            try {
                await conexao.beginTransaction();
                const [linhas] = await conexao.query({
                    sql: 'SELECT modalidade_id, instrutor_id FROM aulas WHERE id = ? LIMIT 1',
                    values: [dados.id],
                    timeout: TIMEOUT
                });
                if (!linhas.length) {
                    await conexao.rollback();
                    return false;
                }
                if (dados.modalidadeId !== undefined || dados.instrutorId !== undefined) {
                    await this.validarReferencias(conexao, dados.modalidadeId ?? Number(linhas[0].modalidade_id), dados.instrutorId ?? Number(linhas[0].instrutor_id));
                }
                const campos = [];
                const valores = [];
                const set = (coluna, valor) => {
                    campos.push(`${coluna} = ?`);
                    valores.push(valor);
                };
                if (dados.modalidadeId !== undefined)
                    set('modalidade_id', dados.modalidadeId);
                if (dados.instrutorId !== undefined)
                    set('instrutor_id', dados.instrutorId);
                if (dados.titulo !== undefined)
                    set('titulo', dados.titulo);
                if (dados.dataHoraInicio !== undefined)
                    set('data_hora_inicio', dados.dataHoraInicio);
                if (dados.duracaoMin !== undefined)
                    set('duracao_min', dados.duracaoMin);
                if (dados.capacidadeMax !== undefined)
                    set('capacidade_max', dados.capacidadeMax);
                if (dados.local !== undefined)
                    set('local', dados.local);
                if (dados.localDescricao !== undefined)
                    set('local_descricao', dados.localDescricao);
                if (dados.status !== undefined)
                    set('status', dados.status);
                if (!campos.length) {
                    await conexao.commit();
                    return true;
                }
                campos.push('atualizado_em = NOW()');
                await conexao.query({
                    sql: `UPDATE aulas SET ${campos.join(', ')} WHERE id = ?`,
                    values: [...valores, dados.id],
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
        this.remarcar = async (dados) => {
            const conexao = await this.pool.getConnection();
            try {
                await conexao.beginTransaction();
                const [linhas] = await conexao.query({
                    sql: 'SELECT status FROM aulas WHERE id = ? LIMIT 1',
                    values: [dados.id],
                    timeout: TIMEOUT
                });
                if (!linhas.length) {
                    await conexao.rollback();
                    return false;
                }
                const status = String(linhas[0].status);
                if (status === 'concluida' || status === 'cancelada') {
                    throw new ErroAula('Esta aula não pode ser remarcada.');
                }
                const campos = ['data_hora_inicio = ?', "status = 'remarcada'", 'atualizado_em = NOW()'];
                const valores = [dados.novaDataHora];
                if (dados.novoLocal !== undefined) {
                    campos.push('local = ?');
                    valores.push(dados.novoLocal);
                }
                if (dados.localDescricao !== undefined) {
                    campos.push('local_descricao = ?');
                    valores.push(dados.localDescricao);
                }
                await conexao.query({
                    sql: `UPDATE aulas SET ${campos.join(', ')} WHERE id = ?`,
                    values: [...valores, dados.id],
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
        this.excluir = async (id) => {
            const [resultado] = await this.pool.query({
                sql: 'DELETE FROM aulas WHERE id = ?',
                values: [id],
                timeout: TIMEOUT
            });
            return resultado.affectedRows > 0;
        };
        this.inscrever = async (aulaId, alunoId) => {
            const conexao = await this.pool.getConnection();
            try {
                await conexao.beginTransaction();
                const [aulas] = await conexao.query({
                    sql: 'SELECT id, capacidade_max, status FROM aulas WHERE id = ? FOR UPDATE',
                    values: [aulaId],
                    timeout: TIMEOUT
                });
                if (!aulas.length)
                    throw new ErroAula('Aula não encontrada.');
                const statusAula = String(aulas[0].status);
                if (statusAula === 'cancelada' || statusAula === 'concluida') {
                    throw new ErroAula('Esta aula não aceita novas inscrições.');
                }
                const [alunos] = await conexao.query({
                    sql: 'SELECT id, ativo FROM alunos WHERE id = ? LIMIT 1',
                    values: [alunoId],
                    timeout: TIMEOUT
                });
                if (!alunos.length)
                    throw new ErroAula('Aluno não encontrado.');
                if (!alunos[0].ativo)
                    throw new ErroAula('O aluno está inativo e não pode ser inscrito.');
                const [ocupacao] = await conexao.query({
                    sql: `SELECT COUNT(*) AS total FROM inscricoes_aula
              WHERE aula_id = ? AND status IN ('confirmada', 'presente')`,
                    values: [aulaId],
                    timeout: TIMEOUT
                });
                if (Number(ocupacao[0].total) >= Number(aulas[0].capacidade_max)) {
                    throw new ErroAula('Aula lotada. Não há vagas disponíveis.');
                }
                const [existentes] = await conexao.query({
                    sql: 'SELECT id, status FROM inscricoes_aula WHERE aula_id = ? AND aluno_id = ? LIMIT 1',
                    values: [aulaId, alunoId],
                    timeout: TIMEOUT
                });
                if (existentes.length) {
                    const status = String(existentes[0].status);
                    if (status !== 'cancelada')
                        throw new ErroAula('O aluno já está inscrito nesta aula.');
                    await conexao.query({
                        sql: "UPDATE inscricoes_aula SET status = 'confirmada', atualizado_em = NOW() WHERE id = ?",
                        values: [existentes[0].id],
                        timeout: TIMEOUT
                    });
                    await conexao.commit();
                    return Number(existentes[0].id);
                }
                const [resultado] = await conexao.query({
                    sql: `INSERT INTO inscricoes_aula (aula_id, aluno_id, status, criado_em, atualizado_em)
              VALUES (?, ?, 'confirmada', NOW(), NOW())`,
                    values: [aulaId, alunoId],
                    timeout: TIMEOUT
                });
                await conexao.commit();
                return Number(resultado.insertId);
            }
            catch (erro) {
                await conexao.rollback().catch(() => undefined);
                throw erro;
            }
            finally {
                conexao.release();
            }
        };
        this.contextoInscricao = async (inscricaoId) => {
            const [linhas] = await this.pool.query({
                sql: `SELECT ia.id, ia.aula_id, ia.aluno_id, ia.status, a.instrutor_id
            FROM inscricoes_aula ia
            INNER JOIN aulas a ON a.id = ia.aula_id
            WHERE ia.id = ?
            LIMIT 1`,
                values: [inscricaoId],
                timeout: TIMEOUT
            });
            if (!linhas.length)
                return null;
            return {
                inscricaoId: Number(linhas[0].id),
                aulaId: Number(linhas[0].aula_id),
                alunoId: Number(linhas[0].aluno_id),
                status: String(linhas[0].status),
                instrutorId: Number(linhas[0].instrutor_id)
            };
        };
        this.cancelarInscricao = async (inscricaoId) => {
            const conexao = await this.pool.getConnection();
            try {
                await conexao.beginTransaction();
                const [linhas] = await conexao.query({
                    sql: 'SELECT status FROM inscricoes_aula WHERE id = ? FOR UPDATE',
                    values: [inscricaoId],
                    timeout: TIMEOUT
                });
                if (!linhas.length) {
                    await conexao.rollback();
                    return false;
                }
                const status = String(linhas[0].status);
                if (status === 'presente') {
                    throw new ErroAula('A presença já foi registrada; não é possível cancelar a inscrição.');
                }
                if (status !== 'cancelada') {
                    await conexao.query({
                        sql: "UPDATE inscricoes_aula SET status = 'cancelada', atualizado_em = NOW() WHERE id = ?",
                        values: [inscricaoId],
                        timeout: TIMEOUT
                    });
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
        this.marcarPresenca = async (inscricaoId, presente) => {
            const conexao = await this.pool.getConnection();
            try {
                await conexao.beginTransaction();
                const [linhas] = await conexao.query({
                    sql: `SELECT ia.id, ia.aula_id, ia.aluno_id, ia.status, a.status AS aula_status, a.data_hora_inicio
              FROM inscricoes_aula ia
              INNER JOIN aulas a ON a.id = ia.aula_id
              WHERE ia.id = ?
              FOR UPDATE`,
                    values: [inscricaoId],
                    timeout: TIMEOUT
                });
                if (!linhas.length) {
                    await conexao.rollback();
                    return false;
                }
                const linha = linhas[0];
                const statusAula = String(linha.aula_status);
                if (statusAula === 'cancelada')
                    throw new ErroAula('A aula está cancelada; não é possível registrar presença.');
                if (String(linha.status) === 'cancelada')
                    throw new ErroAula('A inscrição está cancelada; não é possível registrar presença.');
                const alunoId = Number(linha.aluno_id);
                const aulaId = Number(linha.aula_id);
                const dataPresenca = dataHoraBanco(linha.data_hora_inicio).slice(0, 10);
                if (presente) {
                    if (String(linha.status) !== 'presente') {
                        try {
                            await conexao.query({
                                sql: `INSERT INTO presencas (aluno_id, aula_id, data_presenca, origem, criado_em)
                    VALUES (?, ?, ?, 'aula', NOW())`,
                                values: [alunoId, aulaId, dataPresenca],
                                timeout: TIMEOUT
                            });
                        }
                        catch (erro) {
                            if (erro.code === 'ER_DUP_ENTRY') {
                                throw new ErroAula('Este aluno já possui presença registrada nesta data. O limite é de uma aula por dia.');
                            }
                            throw erro;
                        }
                        await conexao.query({
                            sql: "UPDATE inscricoes_aula SET status = 'presente', atualizado_em = NOW() WHERE id = ?",
                            values: [inscricaoId],
                            timeout: TIMEOUT
                        });
                    }
                }
                else {
                    await conexao.query({
                        sql: "UPDATE inscricoes_aula SET status = 'falta', atualizado_em = NOW() WHERE id = ?",
                        values: [inscricaoId],
                        timeout: TIMEOUT
                    });
                    await conexao.query({
                        sql: `DELETE FROM presencas
                WHERE aluno_id = ? AND aula_id = ? AND data_presenca = ? AND origem = 'aula'`,
                        values: [alunoId, aulaId, dataPresenca],
                        timeout: TIMEOUT
                    });
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
        this.vagas = async (aulaId) => {
            const [linhas] = await this.pool.query({
                sql: `SELECT a.capacidade_max,
                   (SELECT COUNT(*) FROM inscricoes_aula ia
                     WHERE ia.aula_id = a.id AND ia.status IN ('confirmada', 'presente')) AS ocupadas
            FROM aulas a
            WHERE a.id = ?
            LIMIT 1`,
                values: [aulaId],
                timeout: TIMEOUT
            });
            if (!linhas.length)
                return null;
            const capacidadeMax = Number(linhas[0].capacidade_max);
            const ocupadas = Number(linhas[0].ocupadas);
            return { capacidadeMax, ocupadas, disponiveis: Math.max(0, capacidadeMax - ocupadas) };
        };
    }
}
class AulaIpc {
    constructor(sessao, repositorio = new AulaRepository()) {
        this.sessao = sessao;
        this.repositorio = repositorio;
        this.validador = new AulaValidador();
        this.meuInstrutorId = async (usuario) => this.repositorio.instrutorIdPorUsuario(usuario.id);
        this.meuAlunoId = async (usuario) => this.repositorio.alunoIdPorUsuario(usuario.id);
        this.gerenciar = (usuario, instrutorIdAula, meuInstrutorId) => {
            if (usuario.perfil === 'admin')
                return;
            if (usuario.perfil === 'instrutor' && meuInstrutorId !== null && meuInstrutorId === instrutorIdAula)
                return;
            throw new Error('Acesso negado');
        };
        this.erro = (contexto, erro, padrao) => {
            if (erro instanceof ErroAula)
                return { ok: false, mensagem: erro.message };
            if (erro instanceof Error && erro.message === 'Acesso negado') {
                return { ok: false, mensagem: 'Acesso negado para esta operação.' };
            }
            console.error(`[${contexto}]`, erro);
            return { ok: false, mensagem: BancoErros_1.BancoErros.mensagem(erro, padrao) };
        };
        this.registrar = () => {
            electron_1.ipcMain.handle('aulas:listar', async (_evento, entrada) => {
                this.sessao.exigir();
                return this.repositorio.listar(this.validador.filtro(entrada));
            });
            electron_1.ipcMain.handle('aulas:obter', async (_evento, entrada) => {
                const usuario = this.sessao.exigir();
                const id = this.idValido(entrada);
                if (id === null)
                    throw new Error('Aula inválida.');
                if (usuario.perfil === 'aluno') {
                    const alunoId = await this.meuAlunoId(usuario);
                    if (alunoId === null)
                        return null;
                    return this.repositorio.obter(id, alunoId);
                }
                return this.repositorio.obter(id, null);
            });
            electron_1.ipcMain.handle('aulas:criar', async (_evento, entrada) => {
                const usuario = this.sessao.exigir(['admin', 'instrutor']);
                const v = this.validador.validarCriacao(entrada);
                if (!v.ok)
                    return v;
                try {
                    if (usuario.perfil === 'instrutor') {
                        const meuInstrutorId = await this.meuInstrutorId(usuario);
                        if (meuInstrutorId === null)
                            return { ok: false, mensagem: 'Seu usuário não possui cadastro de instrutor.' };
                        v.dados.instrutorId = meuInstrutorId;
                    }
                    const id = await this.repositorio.criar(v.dados);
                    return { ok: true, id };
                }
                catch (erro) {
                    return this.erro('aulas:criar', erro, 'Não foi possível cadastrar a aula.');
                }
            });
            electron_1.ipcMain.handle('aulas:atualizar', async (_evento, entrada) => {
                const usuario = this.sessao.exigir(['admin', 'instrutor']);
                const v = this.validador.validarAtualizacao(entrada);
                if (!v.ok)
                    return v;
                try {
                    const aula = await this.repositorio.obter(v.dados.id, null);
                    if (!aula)
                        return { ok: false, mensagem: 'Aula não encontrada.' };
                    const meuInstrutorId = usuario.perfil === 'instrutor' ? await this.meuInstrutorId(usuario) : null;
                    this.gerenciar(usuario, aula.instrutorId, meuInstrutorId);
                    if (usuario.perfil === 'instrutor')
                        v.dados.instrutorId = meuInstrutorId ?? undefined;
                    const ok = await this.repositorio.atualizar(v.dados);
                    if (!ok)
                        return { ok: false, mensagem: 'Aula não encontrada.' };
                    return { ok: true, id: v.dados.id };
                }
                catch (erro) {
                    return this.erro('aulas:atualizar', erro, 'Não foi possível atualizar a aula.');
                }
            });
            electron_1.ipcMain.handle('aulas:remarcar', async (_evento, entrada) => {
                const usuario = this.sessao.exigir(['admin', 'instrutor']);
                const v = this.validador.validarRemarcacao(entrada);
                if (!v.ok)
                    return v;
                try {
                    const aula = await this.repositorio.obter(v.dados.id, null);
                    if (!aula)
                        return { ok: false, mensagem: 'Aula não encontrada.' };
                    const meuInstrutorId = usuario.perfil === 'instrutor' ? await this.meuInstrutorId(usuario) : null;
                    this.gerenciar(usuario, aula.instrutorId, meuInstrutorId);
                    const ok = await this.repositorio.remarcar(v.dados);
                    if (!ok)
                        return { ok: false, mensagem: 'Aula não encontrada.' };
                    return { ok: true, id: v.dados.id };
                }
                catch (erro) {
                    return this.erro('aulas:remarcar', erro, 'Não foi possível remarcar a aula.');
                }
            });
            electron_1.ipcMain.handle('aulas:excluir', async (_evento, entrada) => {
                const usuario = this.sessao.exigir(['admin', 'instrutor']);
                const id = this.idValido(entrada);
                if (id === null)
                    return { ok: false, mensagem: 'Aula inválida.' };
                try {
                    const aula = await this.repositorio.obter(id, null);
                    if (!aula)
                        return { ok: false, mensagem: 'Aula não encontrada.' };
                    const meuInstrutorId = usuario.perfil === 'instrutor' ? await this.meuInstrutorId(usuario) : null;
                    this.gerenciar(usuario, aula.instrutorId, meuInstrutorId);
                    const ok = await this.repositorio.excluir(id);
                    if (!ok)
                        return { ok: false, mensagem: 'Aula não encontrada.' };
                    return { ok: true, id };
                }
                catch (erro) {
                    return this.erro('aulas:excluir', erro, 'Não foi possível excluir a aula.');
                }
            });
            electron_1.ipcMain.handle('aulas:inscrever', async (_evento, entrada) => {
                const usuario = this.sessao.exigir(['admin', 'instrutor']);
                if (typeof entrada !== 'object' || entrada === null)
                    return { ok: false, mensagem: 'Dados inválidos.' };
                const e = entrada;
                const aulaId = this.idValido(e.aulaId);
                const alunoId = this.idValido(e.alunoId);
                if (aulaId === null || alunoId === null)
                    return { ok: false, mensagem: 'Dados da inscrição inválidos.' };
                try {
                    const aula = await this.repositorio.obter(aulaId, null);
                    if (!aula)
                        return { ok: false, mensagem: 'Aula não encontrada.' };
                    const meuInstrutorId = usuario.perfil === 'instrutor' ? await this.meuInstrutorId(usuario) : null;
                    this.gerenciar(usuario, aula.instrutorId, meuInstrutorId);
                    const id = await this.repositorio.inscrever(aulaId, alunoId);
                    return { ok: true, id };
                }
                catch (erro) {
                    return this.erro('aulas:inscrever', erro, 'Não foi possível inscrever o aluno.');
                }
            });
            electron_1.ipcMain.handle('aulas:inscreverMe', async (_evento, entrada) => {
                const usuario = this.sessao.exigir(['aluno']);
                if (typeof entrada !== 'object' || entrada === null)
                    return { ok: false, mensagem: 'Dados inválidos.' };
                const aulaId = this.idValido(entrada.aulaId);
                if (aulaId === null)
                    return { ok: false, mensagem: 'Aula inválida.' };
                try {
                    const alunoId = await this.meuAlunoId(usuario);
                    if (alunoId === null)
                        return { ok: false, mensagem: 'Seu usuário não possui cadastro de aluno.' };
                    const id = await this.repositorio.inscrever(aulaId, alunoId);
                    return { ok: true, id };
                }
                catch (erro) {
                    return this.erro('aulas:inscreverMe', erro, 'Não foi possível reservar a vaga.');
                }
            });
            electron_1.ipcMain.handle('aulas:cancelarInscricao', async (_evento, entrada) => {
                const usuario = this.sessao.exigir();
                const inscricaoId = this.idValido(entrada);
                if (inscricaoId === null)
                    return { ok: false, mensagem: 'Inscrição inválida.' };
                try {
                    const contexto = await this.repositorio.contextoInscricao(inscricaoId);
                    if (!contexto)
                        return { ok: false, mensagem: 'Inscrição não encontrada.' };
                    if (usuario.perfil === 'aluno') {
                        const meuAlunoId = await this.meuAlunoId(usuario);
                        if (meuAlunoId === null || meuAlunoId !== contexto.alunoId)
                            throw new Error('Acesso negado');
                    }
                    else {
                        const meuInstrutorId = usuario.perfil === 'instrutor' ? await this.meuInstrutorId(usuario) : null;
                        this.gerenciar(usuario, contexto.instrutorId, meuInstrutorId);
                    }
                    const ok = await this.repositorio.cancelarInscricao(inscricaoId);
                    if (!ok)
                        return { ok: false, mensagem: 'Inscrição não encontrada.' };
                    return { ok: true, id: inscricaoId };
                }
                catch (erro) {
                    return this.erro('aulas:cancelarInscricao', erro, 'Não foi possível cancelar a inscrição.');
                }
            });
            electron_1.ipcMain.handle('aulas:minhas', async () => {
                const usuario = this.sessao.exigir(['aluno']);
                const alunoId = await this.meuAlunoId(usuario);
                if (alunoId === null)
                    return [];
                return this.repositorio.minhas(alunoId);
            });
            electron_1.ipcMain.handle('aulas:listaPresenca', async (_evento, entrada) => {
                const usuario = this.sessao.exigir(['admin', 'instrutor']);
                const aulaId = this.idValido(entrada);
                if (aulaId === null)
                    throw new Error('Aula inválida.');
                const aula = await this.repositorio.obter(aulaId, null);
                if (!aula)
                    throw new Error('Aula não encontrada.');
                const meuInstrutorId = usuario.perfil === 'instrutor' ? await this.meuInstrutorId(usuario) : null;
                this.gerenciar(usuario, aula.instrutorId, meuInstrutorId);
                return this.repositorio.listarInscricoes(aulaId);
            });
            electron_1.ipcMain.handle('aulas:marcarPresenca', async (_evento, entrada) => {
                const usuario = this.sessao.exigir(['admin', 'instrutor']);
                if (typeof entrada !== 'object' || entrada === null)
                    return { ok: false, mensagem: 'Dados inválidos.' };
                const e = entrada;
                const inscricaoId = this.idValido(e.inscricaoId);
                if (inscricaoId === null || typeof e.presente !== 'boolean') {
                    return { ok: false, mensagem: 'Dados de presença inválidos.' };
                }
                try {
                    const contexto = await this.repositorio.contextoInscricao(inscricaoId);
                    if (!contexto)
                        return { ok: false, mensagem: 'Inscrição não encontrada.' };
                    const meuInstrutorId = usuario.perfil === 'instrutor' ? await this.meuInstrutorId(usuario) : null;
                    this.gerenciar(usuario, contexto.instrutorId, meuInstrutorId);
                    const ok = await this.repositorio.marcarPresenca(inscricaoId, e.presente);
                    if (!ok)
                        return { ok: false, mensagem: 'Inscrição não encontrada.' };
                    return { ok: true, id: inscricaoId };
                }
                catch (erro) {
                    return this.erro('aulas:marcarPresenca', erro, 'Não foi possível registrar a presença.');
                }
            });
            electron_1.ipcMain.handle('aulas:vagas', async (_evento, entrada) => {
                this.sessao.exigir();
                const aulaId = this.idValido(entrada);
                if (aulaId === null)
                    throw new Error('Aula inválida.');
                return this.repositorio.vagas(aulaId);
            });
        };
    }
    idValido(valor) {
        const id = typeof valor === 'number' ? valor : typeof valor === 'string' ? Number(valor) : NaN;
        return Number.isInteger(id) && id > 0 ? id : null;
    }
}
exports.AulaIpc = AulaIpc;
