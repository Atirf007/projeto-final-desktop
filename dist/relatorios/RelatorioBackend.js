"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelatorioIpc = exports.RelatorioPdf = exports.RelatorioRepository = void 0;
const electron_1 = require("electron");
const promises_1 = require("fs/promises");
const Banco_1 = require("../Banco");
class RelatorioRepository {
    constructor() {
        this.pool = Banco_1.Banco.pool;
        this.sqlReceitas = `
    SELECT
      GREATEST(
        (SELECT COALESCE(SUM(p.valor), 0)
          FROM assinaturas a
          INNER JOIN planos p ON p.id = a.plano_id
          WHERE a.status <> 'cancelada'
            AND a.data_inicio >= ? AND a.data_inicio < ?)
        -
        (SELECT COALESCE(SUM(pg.valor), 0)
          FROM pagamentos pg
          INNER JOIN assinaturas a ON a.id = pg.assinatura_id
          WHERE pg.status = 'cancelado'
            AND a.status <> 'cancelada'
            AND a.data_inicio >= ? AND a.data_inicio < ?),
        0
      ) AS planos,
      COALESCE(SUM(CASE WHEN categoria = 'aula' THEN valor END), 0) AS aulas,
      COALESCE(SUM(CASE WHEN categoria = 'aluguel' THEN valor END), 0) AS aluguel,
      COALESCE(SUM(CASE WHEN categoria = 'outros' THEN valor END), 0) AS outros
    FROM lancamentos
    WHERE data_lancamento >= ? AND data_lancamento < ?`;
        this.dois = (numero) => String(numero).padStart(2, '0');
        this.intervalo = (periodo) => {
            const { ano } = periodo;
            if (periodo.tipo === 'anual')
                return [`${ano}-01-01`, `${ano + 1}-01-01`];
            const anoSeguinte = periodo.mes === 12 ? ano + 1 : ano;
            const mesSeguinte = periodo.mes === 12 ? 1 : periodo.mes + 1;
            return [`${ano}-${this.dois(periodo.mes)}-01`, `${anoSeguinte}-${this.dois(mesSeguinte)}-01`];
        };
        this.periodoValido = (periodo) => {
            if (typeof periodo !== 'object' || periodo === null)
                return false;
            const { tipo, ano, mes } = periodo;
            const anoValido = Number.isInteger(ano) && ano >= 2000 && ano <= 2100;
            if (tipo === 'anual')
                return anoValido;
            return tipo === 'mensal' && anoValido && Number.isInteger(mes) && mes >= 1 && mes <= 12;
        };
        this.receitas = async (periodo) => {
            const [inicio, fim] = this.intervalo(periodo);
            const [linhas] = await this.pool.query(this.sqlReceitas, [
                inicio,
                fim,
                inicio,
                fim,
                inicio,
                fim
            ]);
            const linha = linhas[0];
            return {
                planos: Number(linha.planos),
                aulas: Number(linha.aulas),
                aluguel: Number(linha.aluguel),
                outros: Number(linha.outros)
            };
        };
    }
}
exports.RelatorioRepository = RelatorioRepository;
class RelatorioPdf {
    constructor() {
        this.salvar = async (janela, nome) => {
            const base = nome.replace(/[^\w-]/g, '').slice(0, 60) || 'relatorio';
            const { canceled, filePath } = await electron_1.dialog.showSaveDialog(janela, {
                defaultPath: `${base}.pdf`,
                filters: [{ name: 'PDF', extensions: ['pdf'] }]
            });
            if (canceled || !filePath)
                return null;
            const destino = filePath.toLowerCase().endsWith('.pdf') ? filePath : `${filePath}.pdf`;
            const conteudo = await janela.webContents.printToPDF({ printBackground: true, landscape: true, pageSize: 'A4' });
            await (0, promises_1.writeFile)(destino, conteudo);
            return destino;
        };
    }
}
exports.RelatorioPdf = RelatorioPdf;
class RelatorioIpc {
    constructor(sessao, repositorio = new RelatorioRepository(), pdf = new RelatorioPdf()) {
        this.sessao = sessao;
        this.repositorio = repositorio;
        this.pdf = pdf;
        this.registrar = () => {
            electron_1.ipcMain.handle('relatorios:receitas', (_evento, periodo) => {
                this.sessao.exigir(['admin']);
                if (!this.repositorio.periodoValido(periodo))
                    throw new Error('Período inválido');
                return this.repositorio.receitas(periodo);
            });
            electron_1.ipcMain.handle('relatorios:exportar-pdf', (evento, nome) => {
                this.sessao.exigir(['admin']);
                const janela = electron_1.BrowserWindow.fromWebContents(evento.sender);
                if (!janela)
                    throw new Error('Janela não encontrada');
                return this.pdf.salvar(janela, typeof nome === 'string' ? nome : 'relatorio');
            });
        };
    }
}
exports.RelatorioIpc = RelatorioIpc;
