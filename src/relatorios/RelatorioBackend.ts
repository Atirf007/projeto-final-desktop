import { BrowserWindow, dialog, ipcMain } from 'electron'
import { writeFile } from 'fs/promises'
import { RowDataPacket } from 'mysql2/promise'
import { Banco } from '../Banco'
import { Sessao } from '../Sessao'

export type Periodo = { tipo: 'mensal'; ano: number; mes: number } | { tipo: 'anual'; ano: number }

export type Receitas = {
  mensalidades: number
  aulas: number
  aluguel: number
  outros: number
}

export class RelatorioRepository {
  private readonly pool = Banco.pool

  private readonly sqlReceitas = `
    SELECT
      (SELECT COALESCE(SUM(valor), 0) FROM pagamentos
        WHERE status = 'pago' AND data_pagamento >= ? AND data_pagamento < ?) AS mensalidades,
      COALESCE(SUM(CASE WHEN categoria = 'aula' THEN valor END), 0) AS aulas,
      COALESCE(SUM(CASE WHEN categoria = 'aluguel' THEN valor END), 0) AS aluguel,
      COALESCE(SUM(CASE WHEN categoria = 'outros' THEN valor END), 0) AS outros
    FROM lancamentos
    WHERE data_lancamento >= ? AND data_lancamento < ?`

  private dois = (numero: number): string => String(numero).padStart(2, '0')

  private intervalo = (periodo: Periodo): [string, string] => {
    const { ano } = periodo
    if (periodo.tipo === 'anual') return [`${ano}-01-01`, `${ano + 1}-01-01`]

    const anoSeguinte = periodo.mes === 12 ? ano + 1 : ano
    const mesSeguinte = periodo.mes === 12 ? 1 : periodo.mes + 1
    return [`${ano}-${this.dois(periodo.mes)}-01`, `${anoSeguinte}-${this.dois(mesSeguinte)}-01`]
  }

  periodoValido = (periodo: unknown): periodo is Periodo => {
    if (typeof periodo !== 'object' || periodo === null) return false

    const { tipo, ano, mes } = periodo as Record<string, unknown>
    const anoValido = Number.isInteger(ano) && (ano as number) >= 2000 && (ano as number) <= 2100
    if (tipo === 'anual') return anoValido

    return tipo === 'mensal' && anoValido && Number.isInteger(mes) && (mes as number) >= 1 && (mes as number) <= 12
  }

  receitas = async (periodo: Periodo): Promise<Receitas> => {
    const [inicio, fim] = this.intervalo(periodo)
    const [linhas] = await this.pool.query<RowDataPacket[]>(this.sqlReceitas, [inicio, fim, inicio, fim])
    const linha = linhas[0]

    return {
      mensalidades: Number(linha.mensalidades),
      aulas: Number(linha.aulas),
      aluguel: Number(linha.aluguel),
      outros: Number(linha.outros)
    }
  }
}

export class RelatorioPdf {
  salvar = async (janela: BrowserWindow, nome: string): Promise<string | null> => {
    const base = nome.replace(/[^\w-]/g, '').slice(0, 60) || 'relatorio'

    const { canceled, filePath } = await dialog.showSaveDialog(janela, {
      defaultPath: `${base}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (canceled || !filePath) return null

    const destino = filePath.toLowerCase().endsWith('.pdf') ? filePath : `${filePath}.pdf`
    const conteudo = await janela.webContents.printToPDF({ printBackground: true, landscape: true, pageSize: 'A4' })
    await writeFile(destino, conteudo)
    return destino
  }
}

export class RelatorioIpc {
  constructor(
    private readonly sessao: Sessao,
    private readonly repositorio: RelatorioRepository = new RelatorioRepository(),
    private readonly pdf: RelatorioPdf = new RelatorioPdf()
  ) {}

  registrar = (): void => {
    ipcMain.handle('relatorios:receitas', (_evento, periodo: unknown) => {
      this.sessao.exigir(['admin'])
      if (!this.repositorio.periodoValido(periodo)) throw new Error('Período inválido')
      return this.repositorio.receitas(periodo)
    })

    ipcMain.handle('relatorios:exportar-pdf', (evento, nome: unknown) => {
      this.sessao.exigir(['admin'])
      const janela = BrowserWindow.fromWebContents(evento.sender)
      if (!janela) throw new Error('Janela não encontrada')
      return this.pdf.salvar(janela, typeof nome === 'string' ? nome : 'relatorio')
    })
  }
}
