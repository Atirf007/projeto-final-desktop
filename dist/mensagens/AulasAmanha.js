"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AulasAmanha = void 0;
const Banco_1 = require("../Banco");
/**
 * Lê as aulas de amanhã para que o bot de chuva use a probabilidade no
 * horário real das aulas, e não a máxima do dia inteiro.
 */
class AulasAmanha {
    constructor() {
        this.pool = Banco_1.Banco.pool;
        this.amanha = () => {
            const data = new Date();
            data.setDate(data.getDate() + 1);
            const ano = data.getFullYear();
            const mes = String(data.getMonth() + 1).padStart(2, '0');
            const dia = String(data.getDate()).padStart(2, '0');
            return `${ano}-${mes}-${dia}`;
        };
        this.listar = async () => {
            const [linhas] = await this.pool.query(`SELECT titulo, data_hora_inicio, duracao_min
         FROM aulas
        WHERE DATE(data_hora_inicio) = ?
          AND status IN ('agendada', 'confirmada')
        ORDER BY data_hora_inicio`, [this.amanha()]);
            return linhas.map((linha) => {
                const texto = String(linha.data_hora_inicio);
                const inicioMin = Number(texto.slice(11, 13)) * 60 + Number(texto.slice(14, 16));
                const duracao = Number(linha.duracao_min);
                const fimMin = inicioMin + (Number.isFinite(duracao) && duracao > 0 ? duracao : 60);
                const inicio = Math.floor(inicioMin / 60);
                const fim = Math.min(23, Math.max(inicio, Math.floor((fimMin - 1) / 60)));
                return {
                    inicio,
                    fim,
                    inicioMin,
                    fimMin,
                    titulo: String(linha.titulo ?? '')
                };
            });
        };
    }
}
exports.AulasAmanha = AulasAmanha;
