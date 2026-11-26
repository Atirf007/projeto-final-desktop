export const TIPOS_PLANO_LONGO = ['semestral', 'anual'] as const
export const DIAS_ALERTA_INADIMPLENCIA = 30

export class RegrasInadimplencia {
  constructor(private readonly agora: () => Date = () => new Date()) {}

  planoLongo = (tipo: string): boolean =>
    TIPOS_PLANO_LONGO.some((item) => item === String(tipo ?? '').trim().toLowerCase())

  diasHistorico = (tipo: string): number => (this.planoLongo(tipo) ? 120 : 30)

  atrasoExigeAlerta = (diasAtraso: number): boolean => diasAtraso > DIAS_ALERTA_INADIMPLENCIA

  diasAtraso = (vencimento: string): number => {
    const [ano, mes, dia] = String(vencimento ?? '')
      .slice(0, 10)
      .split('-')
      .map(Number)
    if (!Number.isInteger(ano) || !Number.isInteger(mes) || !Number.isInteger(dia)) return 0
    if (ano < 1900 || ano > 2100 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return 0

    const venc = new Date(Date.UTC(ano, mes - 1, dia))
    if (
      venc.getUTCFullYear() !== ano ||
      venc.getUTCMonth() !== mes - 1 ||
      venc.getUTCDate() !== dia
    ) {
      return 0
    }

    const agora = this.agora()
    const hoje = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate())
    return Math.max(0, Math.round((hoje - venc.getTime()) / 86_400_000))
  }
}
