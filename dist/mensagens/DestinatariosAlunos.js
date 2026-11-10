"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlunoDestinatarios = void 0;
const Banco_1 = require("../Banco");
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
class AlunoDestinatarios {
    constructor() {
        this.sql = `
    SELECT DISTINCT u.email
    FROM alunos a
    INNER JOIN usuarios u ON u.id = a.usuario_id
    WHERE a.ativo = 1 AND u.email IS NOT NULL AND u.email <> ''
    ORDER BY u.email ASC`;
        this.listar = async () => {
            try {
                const [linhas] = await Banco_1.Banco.pool.query({ sql: this.sql, timeout: 10000 });
                const emails = linhas
                    .map((linha) => String(linha.email ?? '').trim().toLowerCase())
                    .filter((email) => EMAIL_VALIDO.test(email));
                return { ok: true, emails: [...new Set(emails)] };
            }
            catch {
                return { ok: false, mensagem: 'Não foi possível carregar os e-mails dos alunos cadastrados.' };
            }
        };
    }
}
exports.AlunoDestinatarios = AlunoDestinatarios;
