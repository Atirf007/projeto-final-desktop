"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gerarMensalidades = void 0;
const TIMEOUT = 15000;
const dataISO = (valor) => String(valor ?? '').slice(0, 10);
const somarMeses = (data, meses) => {
    const [ano, mes, dia] = data.split('-').map(Number);
    const alvoMes = mes - 1 + meses;
    const alvoAno = ano + Math.floor(alvoMes / 12);
    const mesNormalizado = ((alvoMes % 12) + 12) % 12;
    const ultimoDia = new Date(Date.UTC(alvoAno, mesNormalizado + 1, 0)).getUTCDate();
    const diaFinal = Math.min(dia, ultimoDia);
    return new Date(Date.UTC(alvoAno, mesNormalizado, diaFinal)).toISOString().slice(0, 10);
};
const primeiroDia = (data) => `${data.slice(0, 7)}-01`;
/**
 * Cria as mensalidades de uma assinatura na tabela `pagamentos`.
 * O valor total do contrato é dividido pelo número de meses do plano.
 * A restrição UNIQUE (assinatura_id, competencia) evita duplicidade.
 */
const gerarMensalidades = async (executor, dados) => {
    const meses = Math.max(1, Math.trunc(dados.duracaoMeses));
    const total = Number(dados.valorContratado);
    if (!Number.isFinite(total) || total < 0)
        return { criados: 0, ignorados: 0 };
    const [existentes] = await executor.query({
        sql: 'SELECT competencia FROM pagamentos WHERE assinatura_id = ?',
        values: [dados.assinaturaId],
        timeout: TIMEOUT
    });
    const jaGeradas = new Set(existentes.map((linha) => dataISO(linha.competencia)));
    const mensal = Math.round((total / meses) * 100) / 100;
    let criados = 0;
    let ignorados = 0;
    for (let indice = 0; indice < meses; indice++) {
        const competencia = somarMeses(primeiroDia(dados.dataInicio), indice);
        if (jaGeradas.has(competencia)) {
            ignorados++;
            continue;
        }
        const vencimento = somarMeses(dados.dataInicio, indice);
        const valor = indice === meses - 1
            ? Math.round((total - mensal * (meses - 1)) * 100) / 100
            : mensal;
        await executor.query({
            sql: `INSERT INTO pagamentos
              (assinatura_id, competencia, valor, data_vencimento, status, criado_em, atualizado_em)
            VALUES (?, ?, ?, ?, 'pendente', NOW(), NOW())`,
            values: [dados.assinaturaId, competencia, valor, vencimento],
            timeout: TIMEOUT
        });
        criados++;
    }
    return { criados, ignorados };
};
exports.gerarMensalidades = gerarMensalidades;
