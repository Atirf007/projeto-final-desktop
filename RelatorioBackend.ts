import { BrowserWindow, dialog } from 'electron'
import { registrarCanal } from '../SegurancaIpc'
import { writeFile } from 'fs/promises'
import { RowDataPacket } from 'mysql2/promise'
import { Banco } from '../Banco'
import { Sessao } from '../Sessao'

export type Periodo = { tipo: 'mensal'; ano: number; mes: number } | { tipo: 'anual'; ano: number }

export type Receitas = {
  planos: number
  aulas: number
  aluguel: number
  outros: number
}

export type FormatoExportacao = 'pdf' | 'csv' | 'json' | 'png'

export type PedidoExportacao = {
  nome: string
  formato: FormatoExportacao
  periodo: Periodo
  receitas: Receitas
}

const FORMATOS: Record<FormatoExportacao, { extensao: string; rotulo: string }> = {
  pdf: { extensao: 'pdf', rotulo: 'PDF' },
  csv: { extensao: 'csv', rotulo: 'CSV para Excel' },
  json: { extensao: 'json', rotulo: 'JSON' },
  png: { extensao: 'png', rotulo: 'Imagem PNG' }
}

export class RelatorioRepository {
  private readonly pool = Banco.pool

  private readonly sqlReceitas = `
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
    const [linhas] = await this.pool.query<RowDataPacket[]>(this.sqlReceitas, [
      inicio,
      fim,
      inicio,
      fim,
      inicio,
      fim
    ])
    const linha = linhas[0]

    return {
      planos: Number(linha.planos),
      aulas: Number(linha.aulas),
      aluguel: Number(linha.aluguel),
      outros: Number(linha.outros)
    }
  }
}

export class RelatorioExportador {
  constructor(private readonly repositorio: RelatorioRepository) {}

  private dois = (numero: number): string => String(numero).padStart(2, '0')

  private decimal = (valor: number): string => valor.toFixed(2).replace('.', ',')

  private percentual = (valor: number): string => valor.toFixed(1).replace('.', ',')

  private celulaCsv = (valor: string | number): string => {
    const texto = String(valor)
    return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
  }

  private periodoTexto = (periodo: Periodo): string =>
    periodo.tipo === 'anual' ? `Ano ${periodo.ano}` : `${this.dois(periodo.mes)}/${periodo.ano}`

  private total = (receitas: Receitas): number =>
    receitas.planos + receitas.aulas + receitas.aluguel + receitas.outros

  private participacoes = (receitas: Receitas): Receitas => {
    const total = this.total(receitas)
    const parte = (valor: number): number => (total > 0 ? (valor / total) * 100 : 0)

    return {
      planos: parte(receitas.planos),
      aulas: parte(receitas.aulas),
      aluguel: parte(receitas.aluguel),
      outros: parte(receitas.outros)
    }
  }

  private lider = (receitas: Receitas): { rotulo: string; valor: number } => {
    const itens = [
      { rotulo: 'Planos', valor: receitas.planos },
      { rotulo: 'Aulas', valor: receitas.aulas },
      { rotulo: 'Aluguel', valor: receitas.aluguel },
      { rotulo: 'Outros', valor: receitas.outros }
    ]
    return itens.reduce((atual, item) => (item.valor > atual.valor ? item : atual), itens[0])
  }

  private csv = (pedido: PedidoExportacao): string => {
    const total = this.total(pedido.receitas)
    const partes = this.participacoes(pedido.receitas)

    const linhas: Array<Array<string | number>> = [
      ['Relatório de receitas - Academia Cotil'],
      ['Período', this.periodoTexto(pedido.periodo)],
      [],
      ['Categoria', 'Valor (R$)', 'Participação (%)'],
      ['Planos', this.decimal(pedido.receitas.planos), this.percentual(partes.planos)],
      ['Aulas', this.decimal(pedido.receitas.aulas), this.percentual(partes.aulas)],
      ['Aluguel', this.decimal(pedido.receitas.aluguel), this.percentual(partes.aluguel)],
      ['Outros', this.decimal(pedido.receitas.outros), this.percentual(partes.outros)],
      ['Total', this.decimal(total), '100,0']
    ]

    return '\uFEFF' + linhas.map((linha) => linha.map(this.celulaCsv).join(';')).join('\r\n')
  }

  private json = (pedido: PedidoExportacao): string => {
    const total = this.total(pedido.receitas)
    const partes = this.participacoes(pedido.receitas)
    const lider = this.lider(pedido.receitas)

    return JSON.stringify(
      {
        sistema: 'Academia Cotil',
        periodo: pedido.periodo,
        periodoTexto: this.periodoTexto(pedido.periodo),
        geradoEm: new Date().toISOString(),
        receitas: pedido.receitas,
        total,
        participacoesPercentuais: partes,
        categoriaLider: lider.rotulo,
        valorCategoriaLider: lider.valor,
        participacaoLiderPercentual: total > 0 ? (lider.valor / total) * 100 : 0
      },
      null,
      2
    )
  }

  private escolherDestino = async (
    janela: BrowserWindow,
    nome: string,
    formato: FormatoExportacao
  ): Promise<string | null> => {
    const config = FORMATOS[formato]
    const base = nome.replace(/[^\w-]/g, '').slice(0, 60) || 'relatorio'

    const { canceled, filePath } = await dialog.showSaveDialog(janela, {
      defaultPath: `${base}.${config.extensao}`,
      filters: [{ name: config.rotulo, extensions: [config.extensao] }]
    })
    if (canceled || !filePath) return null

    return filePath.toLowerCase().endsWith(`.${config.extensao}`)
      ? filePath
      : `${filePath}.${config.extensao}`
  }

  salvarPdf = async (janela: BrowserWindow, nome: string): Promise<string | null> => {
    const destino = await this.escolherDestino(janela, nome, 'pdf')
    if (!destino) return null

    const conteudo = await janela.webContents.printToPDF({ printBackground: true, landscape: true, pageSize: 'A4' })
    await writeFile(destino, conteudo)
    return destino
  }

  salvar = async (janela: BrowserWindow, pedido: PedidoExportacao): Promise<string | null> => {
    if (pedido.formato === 'pdf') return this.salvarPdf(janela, pedido.nome)

    const destino = await this.escolherDestino(janela, pedido.nome, pedido.formato)
    if (!destino) return null

    if (pedido.formato === 'png') {
      const imagem = await janela.webContents.capturePage()
      await writeFile(destino, imagem.toPNG())
      return destino
    }

    const conteudo = pedido.formato === 'csv' ? this.csv(pedido) : this.json(pedido)
    await writeFile(destino, conteudo, 'utf8')
    return destino
  }

  validar = (entrada: unknown): PedidoExportacao | null => {
    if (typeof entrada !== 'object' || entrada === null) return null

    const { nome, formato, periodo, receitas } = entrada as Record<string, unknown>
    if (typeof nome !== 'string' || !Object.prototype.hasOwnProperty.call(FORMATOS, formato as string)) return null
    if (!this.repositorio.periodoValido(periodo)) return null
    if (typeof receitas !== 'object' || receitas === null) return null

    const valores = receitas as Record<string, unknown>
    const numero = (valor: unknown): number | null =>
      typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 ? valor : null

    const planos = numero(valores.planos)
    const aulas = numero(valores.aulas)
    const aluguel = numero(valores.aluguel)
    const outros = numero(valores.outros)
    if (planos === null || aulas === null || aluguel === null || outros === null) return null

    return {
      nome: nome.slice(0, 60),
      formato: formato as FormatoExportacao,
      periodo: periodo as Periodo,
      receitas: { planos, aulas, aluguel, outros }
    }
  }
}

export class RelatorioIpc {
  private readonly exportador: RelatorioExportador

  constructor(
    private readonly sessao: Sessao,
    private readonly repositorio: RelatorioRepository = new RelatorioRepository()
  ) {
    this.exportador = new RelatorioExportador(this.repositorio)
  }

  registrar = (): void => {
    registrarCanal('relatorios:receitas', (_evento, periodo: unknown) => {
      this.sessao.exigir(['admin'])
      if (!this.repositorio.periodoValido(periodo)) throw new Error('Período inválido')
      return this.repositorio.receitas(periodo)
    })

    registrarCanal('relatorios:exportar', async (evento, entrada: unknown) => {
      this.sessao.exigir(['admin'])
      const pedido = this.exportador.validar(entrada)
      if (!pedido) throw new Error('Dados de exportação inválidos')

      const janela = BrowserWindow.fromWebContents(evento.sender)
      if (!janela) throw new Error('Janela não encontrada')
      return this.exportador.salvar(janela, pedido)
    })

    registrarCanal('relatorios:exportar-pdf', async (evento, nome: unknown) => {
      this.sessao.exigir(['admin'])
      const janela = BrowserWindow.fromWebContents(evento.sender)
      if (!janela) throw new Error('Janela não encontrada')
      return this.exportador.salvarPdf(janela, typeof nome === 'string' ? nome : 'relatorio')
    })
  }
}
