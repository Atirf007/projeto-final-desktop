import { BrowserWindow } from 'electron'
import { registrarCanal } from '../SegurancaIpc'
import { Perfil, Sessao } from '../Sessao'

type Opcao = { id: string; titulo: string; descricao: string; grupo: string; perfis: Perfil[] }

export class MenuIpc {
  private readonly opcoes: Opcao[] = [
    { id: 'relatorios', titulo: 'Relatórios', descricao: 'Receitas por categoria, mensal e anual', grupo: 'Ferramentas', perfis: ['admin'] },
    { id: 'assiduidade', titulo: 'Evolução da assiduidade', descricao: 'Presenças cruzadas com avaliações físicas', grupo: 'Ferramentas', perfis: ['admin', 'instrutor'] },
    { id: 'bot', titulo: 'Gerenciar Bot', descricao: 'Automação de avisos por clima', grupo: 'Ferramentas', perfis: ['admin', 'instrutor'] },
    { id: 'funcionarios', titulo: 'Funcionários', descricao: 'Instrutores e equipe', grupo: 'Cadastros', perfis: ['admin'] },
    { id: 'alunos', titulo: 'Alunos', descricao: 'Cadastro e consulta de alunos', grupo: 'Cadastros', perfis: ['admin', 'instrutor'] },
    { id: 'aulas', titulo: 'Aulas', descricao: 'Agenda, inscrições e presenças', grupo: 'Rotina da academia', perfis: ['admin', 'instrutor'] },
    { id: 'presencas', titulo: 'Presenças', descricao: 'Registros de presença dos alunos', grupo: 'Rotina da academia', perfis: ['admin', 'instrutor'] },
    { id: 'inscricoes', titulo: 'Inscrições', descricao: 'Inscrições nas aulas e status', grupo: 'Rotina da academia', perfis: ['admin', 'instrutor'] },
    { id: 'feriados', titulo: 'Feriados', descricao: 'Calendário nacional da BrasilAPI', grupo: 'Rotina da academia', perfis: ['admin', 'instrutor'] },
    { id: 'exercicios', titulo: 'Biblioteca de exercícios', descricao: 'Catálogo Wger para treinos', grupo: 'Rotina da academia', perfis: ['admin', 'instrutor'] },
    { id: 'avaliacoes', titulo: 'Avaliações físicas', descricao: 'Medidas, histórico e evolução dos alunos', grupo: 'Rotina da academia', perfis: ['admin', 'instrutor'] },
    { id: 'planos', titulo: 'Planos e assinaturas', descricao: 'Planos contratados pelos alunos', grupo: 'Cadastros', perfis: ['admin'] },
    { id: 'pagamentos', titulo: 'Pagamentos', descricao: 'Mensalidades e cobranças', grupo: 'Cadastros', perfis: ['admin'] },
    { id: 'lancamentos', titulo: 'Lançamentos', descricao: 'Receitas avulsas por categoria', grupo: 'Ferramentas', perfis: ['admin'] },
    { id: 'visitantes', titulo: 'Visitantes', descricao: 'Aulas experimentais e visitas', grupo: 'Rotina da academia', perfis: ['admin', 'instrutor'] },
    { id: 'notificacoes', titulo: 'Notificações', descricao: 'Histórico dos lembretes de vencimento', grupo: 'Ferramentas', perfis: ['admin'] },
    { id: 'usuarios', titulo: 'Usuários', descricao: 'Cadastro e consulta de usuários', grupo: 'Cadastros', perfis: ['admin'] }
  ]

  constructor(
    private readonly sessao: Sessao,
    private readonly telas: Record<string, () => void>,
    private readonly aoVoltar: (origem: BrowserWindow | null) => void
  ) {}

  registrar = (): void => {
    registrarCanal('menu:carregar', () => {
      const usuario = this.sessao.exigir()

      return {
        nome: usuario.nome,
        perfil: usuario.perfil,
        opcoes: this.opcoes
          .filter((opcao) => opcao.perfis.includes(usuario.perfil))
          .map(({ id, titulo, descricao, grupo }) => ({ id, titulo, descricao, grupo, disponivel: id in this.telas }))
      }
    })

    registrarCanal('menu:abrir', (_evento, id: unknown): boolean => {
      const usuario = this.sessao.exigir()
      const opcao = this.opcoes.find((item) => item.id === id)
      if (!opcao || !opcao.perfis.includes(usuario.perfil)) throw new Error('Acesso negado')

      const abrir = this.telas[opcao.id]
      if (!abrir) return false

      abrir()
      return true
    })

    registrarCanal('menu:voltar', (evento): void => {
      const origem = BrowserWindow.fromWebContents(evento.sender)
      this.aoVoltar(origem)
    })
  }
}
