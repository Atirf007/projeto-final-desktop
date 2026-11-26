import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { PagamentoRepository } from '../src/pagamentos/PagamentoBackend'
import { InadimplenciaRepository } from '../src/inadimplencia/InadimplenciaBackend'
import { RegrasInadimplencia } from '../src/inadimplencia/RegrasInadimplencia'
import { Banco } from '../src/Banco'

after(async () => {
  await Banco.pool.end()
})

test('regras de inadimplência distinguem planos longos', () => {
  const regras = new RegrasInadimplencia()

  assert.equal(regras.planoLongo('semestral'), true)
  assert.equal(regras.planoLongo(' Anual '), true)
  assert.equal(regras.planoLongo('mensal'), false)
  assert.equal(regras.diasHistorico('semestral'), 120)
  assert.equal(regras.diasHistorico('trimestral'), 30)
  assert.equal(regras.atrasoExigeAlerta(30), false)
  assert.equal(regras.atrasoExigeAlerta(31), true)
})

test('dias de atraso usam a data injetada', () => {
  const regras = new RegrasInadimplencia(() => new Date('2026-03-01T12:00:00Z'))

  assert.equal(regras.diasAtraso('2026-02-01'), 28)
  assert.equal(regras.diasAtraso('2026-01-10'), 50)
  assert.equal(regras.diasAtraso('2026-05-01'), 0)
  assert.equal(regras.diasAtraso('2026-02-30'), 0)
})

test('resumo consolida atrasados com regras injetadas', async () => {
  const pagamentos = {
    listar: async () => [
      {
        id: 1,
        alunoId: 10,
        alunoNome: 'Ana',
        competencia: '2026-01',
        valor: 100,
        dataVencimento: '2026-01-10'
      },
      {
        id: 2,
        alunoId: 11,
        alunoNome: 'Bruno',
        competencia: '2026-02',
        valor: 50,
        dataVencimento: '2026-02-01'
      }
    ]
  } as unknown as PagamentoRepository

  const repositorio = new InadimplenciaRepository(
    pagamentos,
    new RegrasInadimplencia(() => new Date('2026-03-01T12:00:00Z'))
  )
  const resumo = await repositorio.resumo()

  assert.equal(resumo.atrasados, 2)
  assert.equal(resumo.atrasadosLongos, 1)
  assert.equal(resumo.totalAlunos, 2)
  assert.equal(resumo.valorTotal, 150)
  assert.equal(resumo.itens[0].diasAtraso, 50)
  assert.equal(resumo.itens[1].diasAtraso, 28)
})

test('resumo não conta atrasos de 30 dias ou menos como alerta', async () => {
  const pagamentos = {
    listar: async () => [
      {
        id: 3,
        alunoId: 12,
        alunoNome: 'Carla',
        competencia: '2026-02',
        valor: 80,
        dataVencimento: '2026-01-30'
      }
    ]
  } as unknown as PagamentoRepository

  const repositorio = new InadimplenciaRepository(
    pagamentos,
    new RegrasInadimplencia(() => new Date('2026-03-01T12:00:00Z'))
  )
  const resumo = await repositorio.resumo()

  assert.equal(resumo.atrasados, 1)
  assert.equal(resumo.atrasadosLongos, 0)
})
