import { randomInt } from 'crypto'

export const PREFIXO_TESTE_CLIMA = 'TESTE CLIMA - '
export const LIKE_TESTE_CLIMA = `${PREFIXO_TESTE_CLIMA}%`
export const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const normalizarEmail = (email: string): string => email.trim().toLowerCase()

export const emailValido = (email: string): boolean =>
  email.length > 0 && email.length <= 160 && EMAIL_VALIDO.test(email)

export const dataBr = (iso: string): string => {
  const [ano, mes, dia] = iso.split('-')
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso
}

export const amanha = (): string => {
  const data = new Date()
  data.setDate(data.getDate() + 1)
  const ano = data.getFullYear()
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

export const tituloTeste = (email: string, data: string): string =>
  `${PREFIXO_TESTE_CLIMA}${email} - ${dataBr(data)}`.slice(0, 120)

export const nomeUsuarioTeste = (email: string): string => `${PREFIXO_TESTE_CLIMA}${email}`.slice(0, 120)

export const observacoesAlunoTeste = (email: string): string =>
  `${PREFIXO_TESTE_CLIMA}aluno de teste criado por preparar-teste-clima para ${email}`

export const localDescricaoTeste = (): string => `${PREFIXO_TESTE_CLIMA}área externa`

export const gerarCpfTeste = (): string =>
  `999${String(randomInt(0, 100_000_000)).padStart(8, '0')}`

export const formatarDataHora = (dataHora: string): string => {
  const data = dataHora.slice(0, 10)
  const hora = dataHora.slice(11, 16)
  return hora ? `${dataBr(data)} às ${hora}` : dataBr(data)
}
