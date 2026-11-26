import { ipcRenderer } from 'electron'
import type { AlunoAssiduidade, RelatorioAssiduidade } from './AssiduidadeBackend'
import type { FaixaFrequencia, ResumoFaixaFrequencia } from './AnaliseAssiduidade'

type AlunoOpcao = { id: number; nome: string }
type UsuarioSessao = { perfil: string }

class AssiduidadeView {
  private readonly faixas: Record<FaixaFrequencia, string> = {
    baixa: 'Baixa',
    media: 'Média',
    alta: 'Alta'
  }

  private el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

  private criar = (tag: string, classe?: string, texto?: string): HTMLElement => {
    const elemento = document.createElement(tag)
    if (classe) elemento.className = classe
    if (texto !== undefined) elemento.textContent = texto
    return elemento
  }

  private numeroFmt = (valor: number, sufixo = ''): string =>
    `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${sufixo}`

  private variacaoFmt = (valor: number | undefined, sufixo = ''): string =>
    valor === undefined ? '—' : `${valor > 0 ? '+' : ''}${this.numeroFmt(valor, sufixo)}`

  private dataBr = (valor: string): string => {
    const [ano, mes, dia] = String(valor).slice(0, 10).split('-')
    return ano && mes && dia ? `${dia}/${mes}/${ano}` : '—'
  }

  private statusPagina = (texto: string, erro = false): void => {
    const el = this.el('status')
    el.textContent = texto
    el.classList.toggle('erro', erro)
  }

  private carregarAlunos = async (): Promise<void> => {
    try {
      const alunos = (await ipcRenderer.invoke('alunos:listar', {})) as AlunoOpcao[]
      const selecao = this.el<HTMLSelectElement>('aluno')
      selecao.replaceChildren(
        this.criar('option', undefined, 'Todos os alunos') as HTMLOptionElement,
        ...alunos.map((aluno) => {
          const opcao = document.createElement('option')
          opcao.value = String(aluno.id)
          opcao.textContent = aluno.nome
          return opcao
        })
      )
      selecao.firstElementChild?.setAttribute('value', '')
    } catch (erro) {
      console.error(erro)
      this.statusPagina('Não foi possível carregar a lista de alunos.', true)
    }
  }

  private renderizarKpis = (dados: RelatorioAssiduidade): void => {
    const cartoes = [
      { rotulo: 'Alunos no relatório', valor: String(dados.alunos.length), detalhe: 'Alunos com cadastro ativo ou inativo' },
      { rotulo: 'Frequência média', valor: this.numeroFmt(dados.frequenciaMedia, '%'), detalhe: 'Média da presença em 90 dias' },
      { rotulo: 'Presenças', valor: String(dados.totalPresencas), detalhe: 'Registros na janela atual' },
      { rotulo: 'Avaliações', valor: String(dados.totalAvaliacoes), detalhe: 'Medidas usadas no cruzamento' },
      {
        rotulo: 'Distribuição',
        valor: `${dados.distribuicao.baixa} / ${dados.distribuicao.media} / ${dados.distribuicao.alta}`,
        detalhe: 'Baixa / média / alta frequência'
      }
    ]

    this.el('kpis').replaceChildren(
      ...cartoes.map(({ rotulo, valor, detalhe }) => {
        const cartao = this.criar('div', 'kpi')
        cartao.append(
          this.criar('span', undefined, rotulo),
          this.criar('strong', undefined, valor),
          this.criar('small', undefined, detalhe)
        )
        return cartao
      })
    )
  }

  private linhaFaixa = (faixa: ResumoFaixaFrequencia): HTMLLIElement => {
    const item = document.createElement('li')
    const peso =
      faixa.pesoInicial !== undefined && faixa.pesoFinal !== undefined
        ? ` • peso ${this.numeroFmt(faixa.pesoInicial, ' kg')} → ${this.numeroFmt(faixa.pesoFinal, ' kg')}`
        : ''
    item.textContent =
      `${faixa.rotulo}: ${faixa.avaliacoes} avaliação(ões) • ` +
      `presença média ${this.numeroFmt(faixa.frequenciaMedia, '%')}${peso} • ` +
      `Δ peso ${this.variacaoFmt(faixa.variacaoPeso, ' kg')} • Δ IMC ${this.variacaoFmt(faixa.variacaoImc)}`
    return item
  }

  private renderizarLinha = (item: AlunoAssiduidade): HTMLTableRowElement => {
    const tr = document.createElement('tr')

    const tdAluno = document.createElement('td')
    tdAluno.append(this.criar('strong', undefined, item.alunoNome))

    const tdSituacao = document.createElement('td')
    tdSituacao.append(
      this.criar('span', item.ativo ? 'selo alta' : 'selo inativo', item.ativo ? 'Ativo' : 'Inativo')
    )

    const tdFaixa = document.createElement('td')
    const detalhes = document.createElement('details')
    const resumo = document.createElement('summary')
    const selo = this.criar(
      'span',
      `selo ${item.analise.faixaAtual}`,
      this.faixas[item.analise.faixaAtual]
    )
    resumo.append(selo, document.createTextNode(` ${this.numeroFmt(item.frequencia.percentual, '%')}`))
    const lista = document.createElement('ul')
    const faixasComAvaliacao = item.analise.faixas.filter((faixa) => faixa.avaliacoes > 0)
    if (faixasComAvaliacao.length) {
      lista.append(...faixasComAvaliacao.map(this.linhaFaixa))
    } else {
      lista.append(this.criar('li', undefined, 'Sem avaliações para cruzar com as presenças.'))
    }
    detalhes.append(resumo, lista)
    tdFaixa.append(detalhes)

    const trLinha = [
      tdAluno,
      tdSituacao,
      tdFaixa,
      this.criar('td', 'destaque', this.numeroFmt(item.frequencia.percentual, '%')),
      this.criar('td', undefined, `${item.frequencia.totalPresencas} em ${item.frequencia.diasNoPeriodo} dias`),
      this.criar('td', undefined, String(item.analise.totalAvaliacoes)),
      this.criar('td', undefined, this.variacaoFmt(item.analise.variacaoPeso, ' kg')),
      this.criar('td', undefined, this.variacaoFmt(item.analise.variacaoImc))
    ]
    tr.append(...trLinha)
    return tr
  }

  private renderizar = (dados: RelatorioAssiduidade): void => {
    this.el('periodo').textContent =
      `Histórico de ${this.dataBr(dados.periodo.inicio)} a ${this.dataBr(dados.periodo.fim)}`
    this.renderizarKpis(dados)

    const corpo = this.el<HTMLTableSectionElement>('corpo')
    if (!dados.alunos.length) {
      const linha = document.createElement('tr')
      const celula = this.criar('td', 'vazio', 'Nenhum aluno encontrado para este filtro.')
      celula.setAttribute('colspan', '8')
      linha.append(celula)
      corpo.replaceChildren(linha)
      return
    }
    corpo.replaceChildren(...dados.alunos.map(this.renderizarLinha))
  }

  private carregar = async (): Promise<void> => {
    try {
      const valor = this.el<HTMLSelectElement>('aluno').value
      const dados = (await ipcRenderer.invoke('assiduidade:relatorio', {
        alunoId: valor ? Number(valor) : null
      })) as RelatorioAssiduidade
      this.renderizar(dados)
      this.statusPagina('')
    } catch (erro) {
      console.error(erro)
      this.statusPagina('Não foi possível carregar o relatório de assiduidade.', true)
    }
  }

  private voltar = async (): Promise<void> => {
    try {
      await ipcRenderer.invoke('menu:voltar')
    } catch {
      this.statusPagina('Não foi possível voltar ao menu.', true)
    }
  }

  iniciar = async (): Promise<void> => {
    let usuario: UsuarioSessao | null = null
    try {
      usuario = (await ipcRenderer.invoke('auth:me')) as UsuarioSessao | null
    } catch {
      usuario = null
    }
    if (!usuario || !['admin', 'instrutor'].includes(usuario.perfil)) {
      this.statusPagina('Acesso negado para este perfil.', true)
      return
    }

    this.el('voltar').addEventListener('click', () => void this.voltar())
    this.el('atualizar').addEventListener('click', () => void this.carregar())
    this.el<HTMLSelectElement>('aluno').addEventListener('change', () => void this.carregar())

    await this.carregarAlunos()
    await this.carregar()
  }
}

window.addEventListener('DOMContentLoaded', () => {
  void new AssiduidadeView().iniciar()
})
