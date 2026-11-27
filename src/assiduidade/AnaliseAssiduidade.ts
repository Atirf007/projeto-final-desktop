export type FaixaFrequencia = 'baixa' | 'media' | 'alta'

export type AvaliacaoAssiduidade = {
  id: number
  alunoId: number
  alunoNome: string
  dataAvaliacao: string
  pesoKg: number
  alturaCm: number
  imc: number
  percentualGordura?: number
  cinturaCm?: number
}

export type PresencaAssiduidade = {
  id: number
  alunoId: number
  alunoNome: string
  aulaId?: number
  aulaTitulo?: string
  dataPresenca: string
  origem: 'aula' | 'livre' | 'experimental'
}

export type FrequenciaAssiduidade = {
  alunoId: number
  alunoNome: string
  totalPresencas: number
  ultimaPresenca?: string
  diasNoPeriodo: number
  percentual: number
}

export type ResumoFaixaFrequencia = {
  faixa: FaixaFrequencia
  rotulo: string
  avaliacoes: number
  frequenciaMedia: number
  pesoInicial?: number
  pesoFinal?: number
  variacaoPeso?: number
  variacaoImc?: number
}

export type ResumoAssiduidadeEvolucao = {
  faixaAtual: FaixaFrequencia
  percentualAtual: number
  totalPresencas: number
  diasNoPeriodo: number
  totalAvaliacoes: number
  variacaoPeso?: number
  variacaoImc?: number
  faixas: ResumoFaixaFrequencia[]
}

export class AnaliseAssiduidadeEvolucao {
  private static readonly DIAS_JANELA = 90
  private static readonly FAIXAS: { faixa: FaixaFrequencia; rotulo: string }[] = [
    { faixa: 'baixa', rotulo: 'Baixa (até 49,9%)' },
    { faixa: 'media', rotulo: 'Média (50% a 74,9%)' },
    { faixa: 'alta', rotulo: 'Alta (75% ou mais)' }
  ]

  private dataISO = (valor: string): string => String(valor ?? '').slice(0, 10)

  private somarDias = (data: string, dias: number): string => {
    const [ano, mes, dia] = data.split('-').map(Number)
    return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10)
  }

  private hojeISO = (): string => {
    const agora = new Date()
    const mes = String(agora.getMonth() + 1).padStart(2, '0')
    const dia = String(agora.getDate()).padStart(2, '0')
    return `${agora.getFullYear()}-${mes}-${dia}`
  }

  private ordenar = (avaliacoes: AvaliacaoAssiduidade[]): AvaliacaoAssiduidade[] =>
    [...avaliacoes].sort((a, b) => a.dataAvaliacao.localeCompare(b.dataAvaliacao) || a.id - b.id)

  private faixaDe = (percentual: number): FaixaFrequencia =>
    percentual >= 75 ? 'alta' : percentual >= 50 ? 'media' : 'baixa'

  private percentualAte = (presencas: PresencaAssiduidade[], fim: string): number => {
    const inicio = this.somarDias(fim, -(AnaliseAssiduidadeEvolucao.DIAS_JANELA - 1))
    const total = presencas.filter((presenca) => {
      const data = this.dataISO(presenca.dataPresenca)
      return data >= inicio && data <= fim
    }).length
    return Math.round((total / AnaliseAssiduidadeEvolucao.DIAS_JANELA) * 1000) / 10
  }

  periodoHistorico = (avaliacoes: AvaliacaoAssiduidade[]): { inicio: string; fim: string } => {
    const fim = this.hojeISO()
    const padrao = this.somarDias(fim, -(AnaliseAssiduidadeEvolucao.DIAS_JANELA - 1))
    const maisAntiga = this.ordenar(avaliacoes)[0]
    const inicio = maisAntiga
      ? this.somarDias(this.dataISO(maisAntiga.dataAvaliacao), -(AnaliseAssiduidadeEvolucao.DIAS_JANELA - 1))
      : padrao
    return { inicio: inicio > fim ? padrao : inicio, fim }
  }

  frequenciaAtual = (
    alunoId: number,
    alunoNome: string,
    presencas: PresencaAssiduidade[]
  ): FrequenciaAssiduidade => {
    const fim = this.hojeISO()
    const inicio = this.somarDias(fim, -(AnaliseAssiduidadeEvolucao.DIAS_JANELA - 1))
    const noPeriodo = presencas.filter((presenca) => {
      const data = this.dataISO(presenca.dataPresenca)
      return data >= inicio && data <= fim
    })
    const datas = noPeriodo.map((presenca) => this.dataISO(presenca.dataPresenca)).sort()
    return {
      alunoId,
      alunoNome,
      totalPresencas: noPeriodo.length,
      ultimaPresenca: datas[datas.length - 1],
      diasNoPeriodo: AnaliseAssiduidadeEvolucao.DIAS_JANELA,
      percentual: Math.round((noPeriodo.length / AnaliseAssiduidadeEvolucao.DIAS_JANELA) * 1000) / 10
    }
  }

  calcular = (
    frequencia: FrequenciaAssiduidade,
    presencas: PresencaAssiduidade[],
    avaliacoes: AvaliacaoAssiduidade[]
  ): ResumoAssiduidadeEvolucao => {
    const ordenadas = this.ordenar(avaliacoes)
    const grupos = new Map<FaixaFrequencia, { avaliacoes: AvaliacaoAssiduidade[]; percentuais: number[] }>()
    for (const avaliacao of ordenadas) {
      const percentual = this.percentualAte(presencas, this.dataISO(avaliacao.dataAvaliacao))
      const faixa = this.faixaDe(percentual)
      const grupo = grupos.get(faixa) ?? { avaliacoes: [], percentuais: [] }
      grupo.avaliacoes.push(avaliacao)
      grupo.percentuais.push(percentual)
      grupos.set(faixa, grupo)
    }

    const faixas = AnaliseAssiduidadeEvolucao.FAIXAS.map(
      ({ faixa, rotulo }): ResumoFaixaFrequencia => {
        const grupo = grupos.get(faixa)
        if (!grupo?.avaliacoes.length) return { faixa, rotulo, avaliacoes: 0, frequenciaMedia: 0 }
        const soma = grupo.percentuais.reduce((total, atual) => total + atual, 0)
        const primeira = grupo.avaliacoes[0]
        const ultima = grupo.avaliacoes[grupo.avaliacoes.length - 1]
        return {
          faixa,
          rotulo,
          avaliacoes: grupo.avaliacoes.length,
          frequenciaMedia: Math.round((soma / grupo.percentuais.length) * 10) / 10,
          pesoInicial: primeira.pesoKg,
          pesoFinal: ultima.pesoKg,
          variacaoPeso: ultima.pesoKg - primeira.pesoKg,
          variacaoImc: ultima.imc - primeira.imc
        }
      }
    )

    const primeira = ordenadas[0]
    const ultima = ordenadas[ordenadas.length - 1]
    return {
      faixaAtual: this.faixaDe(frequencia.percentual),
      percentualAtual: frequencia.percentual,
      totalPresencas: frequencia.totalPresencas,
      diasNoPeriodo: frequencia.diasNoPeriodo,
      totalAvaliacoes: ordenadas.length,
      variacaoPeso: primeira && ultima ? ultima.pesoKg - primeira.pesoKg : undefined,
      variacaoImc: primeira && ultima ? ultima.imc - primeira.imc : undefined,
      faixas
    }
  }
}
