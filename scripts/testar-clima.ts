import 'dotenv/config'
import { mkdirSync } from 'fs'
import { createServer as criarServidorNet } from 'net'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { Banco } from '../src/Banco'
import { OpenMeteoClient } from '../src/integracoes/ClimaBackend'
import { EmailServico } from '../src/integracoes/EmailBackend'
import { AulaExternaAmanha, AulasAmanha } from '../src/mensagens/AulasAmanha'
import { AlunoDestinatarios } from '../src/mensagens/DestinatariosAlunos'
import { NotificacaoChuvaRepositorio } from '../src/mensagens/NotificacaoChuva'
import { AssinadorDecisao, ServidorDecisaoClima } from '../src/mensagens/DecisaoClima'
import { MensagemServico } from '../src/mensagens/MensagemBackend'

const PORTA_PADRAO = 39517
const HOST_PADRAO = '127.0.0.1'

const lerLimiar = (): number => {
  const bruto = process.argv[2]
  const numero = Number(bruto ?? process.env.CLIMA_LIMIAR_CHUVA ?? 50)
  if (!Number.isFinite(numero)) {
    console.log('Limiar inválido. Use um número entre 0 e 100, por exemplo: npm run testar-clima -- 1')
    process.exit(1)
  }
  return Math.min(100, Math.max(0, Math.round(numero)))
}

const portaServidor = (): number => {
  const numero = Number(process.env.CLIMA_DECISAO_PORTA ?? PORTA_PADRAO)
  return Number.isInteger(numero) && numero > 0 && numero <= 65535 ? numero : PORTA_PADRAO
}

const hostServidor = (): string => (process.env.CLIMA_DECISAO_HOST ?? HOST_PADRAO).trim() || HOST_PADRAO

const configurarUrlBase = (porta: number, host: string): string => {
  const configurada = (process.env.CLIMA_DECISAO_URL_BASE ?? '').trim()
  if (configurada) return configurada.replace(/\/+$/, '')

  const hostLink = host === '0.0.0.0' || host === '::' ? HOST_PADRAO : host
  const url = `http://${hostLink}:${porta}`
  process.env.CLIMA_DECISAO_URL_BASE = url
  return url
}

const caminhoSegredo = (): string => {
  const configurado = (process.env.CLIMA_DECISAO_ARQUIVO ?? '').trim()
  return configurado || join(tmpdir(), 'projeto-final-dad-bot-clima-decisao.json')
}

const formatarDataHora = (aula: AulaExternaAmanha): string => {
  const [ano, mes, dia] = aula.data.split('-')
  const hora = String(Math.floor(aula.inicioMin / 60)).padStart(2, '0')
  const minuto = String(aula.inicioMin % 60).padStart(2, '0')
  return `${dia}/${mes}/${ano} às ${hora}:${minuto}`
}

const esperar = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const portaDisponivel = (porta: number, host: string): Promise<boolean> =>
  new Promise((resolve) => {
    const teste = criarServidorNet()
    teste.once('error', () => resolve(false))
    teste.once('listening', () => teste.close(() => resolve(true)))
    teste.listen(porta, host)
  })

const escolherPorta = async (preferida: number, host: string): Promise<number | null> => {
  const configuracaoExplicita =
    (process.env.CLIMA_DECISAO_PORTA ?? '').trim() || (process.env.CLIMA_DECISAO_URL_BASE ?? '').trim()
  if (configuracaoExplicita) {
    return (await portaDisponivel(preferida, host)) ? preferida : null
  }

  const limite = Math.min(65535, preferida + 20)
  for (let porta = preferida; porta <= limite; porta++) {
    if (await portaDisponivel(porta, host)) return porta
  }
  return null
}

async function main(): Promise<void> {
  const limiar = lerLimiar()
  const portaPreferida = portaServidor()
  const host = hostServidor()
  const porta = await escolherPorta(portaPreferida, host)

  if (porta === null) {
    console.log(
      `Não foi possível usar a porta ${portaPreferida} no host ${host}. ` +
        'Feche o aplicativo ou ajuste CLIMA_DECISAO_PORTA/CLIMA_DECISAO_HOST antes de rodar o teste.'
    )
    process.exit(1)
  }

  if (porta !== portaPreferida) {
    console.log(`A porta ${portaPreferida} está ocupada; usando a porta ${porta}.`)
  }
  process.env.CLIMA_DECISAO_PORTA = String(porta)
  const urlBase = configurarUrlBase(porta, host)

  const arquivoSegredo = caminhoSegredo()
  mkdirSync(dirname(arquivoSegredo), { recursive: true })
  const assinador = new AssinadorDecisao(arquivoSegredo)

  const aulasRepositorio = new AulasAmanha()
  const alunosRepositorio = new AlunoDestinatarios()
  const notificacoesRepositorio = new NotificacaoChuvaRepositorio()
  const clima = new OpenMeteoClient()
  const emails = new EmailServico()

  const servidor = new ServidorDecisaoClima(assinador)
  servidor.iniciar()
  await esperar(300)

  let encerrando = false
  const encerrar = async (codigo: number): Promise<void> => {
    if (encerrando) return
    encerrando = true
    console.log('\nEncerrando o servidor de decisão...')
    servidor.encerrar()
    emails.fechar()
    try {
      await Banco.pool.end()
    } catch {
      // O processo será encerrado de qualquer forma.
    }
    process.exit(codigo)
  }

  process.once('SIGINT', () => {
    void encerrar(0)
  })
  process.once('SIGTERM', () => {
    void encerrar(0)
  })

  console.log('=== Teste do bot de clima ===')
  console.log(`Limiar de chuva: ${limiar}%`)
  console.log(`Servidor de decisão: ${urlBase}/clima`)
  console.log(`SMTP configurado: ${emails.configurado() ? 'sim' : 'não'}`)
  if (emails.configurado()) console.log(`Remetente: ${emails.remetenteFormatado()}`)
  console.log('')

  try {
    const aulas = await aulasRepositorio.listar()
    console.log(`Aulas externas de amanhã encontradas: ${aulas.length}`)
    if (aulas.length === 0) {
      console.log('- Nenhuma aula ao ar livre para amanhã.')
    } else {
      for (const aula of aulas) {
        console.log(`- Aula #${aula.id}: ${aula.titulo} (${formatarDataHora(aula)})`)
      }
    }
    console.log('')

    const destinatarios = await alunosRepositorio.listarPorAulas(aulas.map((aula) => aula.id))
    if (!destinatarios.ok) {
      console.log(`Alunos inscritos: não foi possível carregar (${destinatarios.mensagem})`)
    } else {
      console.log(`Alunos inscritos nas aulas externas: ${destinatarios.alunos.length}`)
    }
    console.log('')

    console.log('Executando a mesma verificação do botão "Verificar agora"...')
    const mensagens = new MensagemServico(
      clima,
      emails,
      alunosRepositorio,
      aulasRepositorio,
      notificacoesRepositorio,
      assinador
    )
    const resultado = await mensagens.verificar(limiar)

    if (!resultado.ok) {
      console.log(`Falha na verificação: ${resultado.mensagem}`)
      console.log('Nenhum e-mail foi enviado nesta execução.')
    } else {
      console.log(`Previsão para amanhã: ${resultado.previsao.descricao}`)
      console.log(
        `Probabilidade de chuva considerada: ${Math.round(resultado.previsao.probabilidadeChuva)}%` +
          (resultado.previsao.janela ? ` (janela ${resultado.previsao.janela})` : '')
      )
      console.log(`Resultado: ${resultado.motivo}`)
      console.log(`E-mails enviados: ${resultado.emails.enviados} de ${resultado.emails.total}`)
      console.log(`E-mails com falha: ${resultado.emails.falhas.length}`)
      for (const falha of resultado.emails.falhas) {
        console.log(`- ${falha.email}: ${falha.erro}`)
      }
      if (resultado.emails.erroGeral) console.log(`Erro geral de e-mail: ${resultado.emails.erroGeral}`)
    }
    console.log('')

    const mapaAulas = new Map(aulas.map((aula) => [aula.id, aula]))
    const existentes = await notificacoesRepositorio.existentes(aulas.map((aula) => aula.id))
    const alunos = destinatarios.ok ? destinatarios.alunos : []

    console.log('Links de decisão por aluno:')
    let totalLinks = 0
    for (const aluno of alunos) {
      const chave = `${aluno.aulaId}|${aluno.email.trim().toLowerCase()}`
      const aviso = existentes.get(chave)
      if (!aviso) continue

      const aula = mapaAulas.get(aluno.aulaId)
      const link = assinador.gerarLink(aviso.id)
      console.log(
        `- ${aluno.email} | Aula #${aluno.aulaId} ${aula?.titulo ?? ''} | aviso ${aviso.status} (id ${aviso.id})`
      )
      console.log(`  ${link}`)
      totalLinks++
    }
    if (totalLinks === 0) {
      console.log('- Nenhum link gerado. Nenhum aviso de chuva foi criado para as aulas de amanhã.')
    }
  } catch (erro) {
    console.error('Erro inesperado:', erro instanceof Error ? erro.message : erro)
    await encerrar(1)
    return
  }

  console.log('')
  console.log('Servidor de decisão ativo. Deixe este terminal aberto e use os links acima.')
  console.log('Pressione Ctrl+C para encerrar.')
}

main().catch((erro: unknown) => {
  console.error('Erro inesperado:', erro instanceof Error ? erro.message : erro)
  process.exitCode = 1
})
