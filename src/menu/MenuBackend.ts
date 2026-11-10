import { BrowserWindow, ipcMain } from 'electron'
import { Perfil, Sessao } from '../Sessao'

type Opcao = { id: string; titulo: string; descricao: string; perfis: Perfil[] }

export class MenuIpc {
  private readonly opcoes: Opcao[] = [
    { id: 'relatorios', titulo: 'Relatórios', descricao: 'Receitas por categoria, mensal e anual', perfis: ['admin'] },
    { id: 'bot', titulo: 'Gerenciar Bot', descricao: 'Automação de avisos por clima', perfis: ['admin', 'instrutor'] },
    { id: 'funcionarios', titulo: 'Funcionários', descricao: 'Instrutores e equipe', perfis: ['admin'] },
    { id: 'alunos', titulo: 'Alunos', descricao: 'Cadastro e consulta de alunos', perfis: ['admin', 'instrutor'] },
    { id: 'aulas', titulo: 'Aulas', descricao: 'Agenda, inscrições e presenças', perfis: ['admin', 'instrutor', 'aluno'] },
    { id: 'planos', titulo: 'Planos e assinaturas', descricao: 'Planos contratados pelos alunos', perfis: ['admin'] },
    { id: 'pagamentos', titulo: 'Pagamentos', descricao: 'Mensalidades e cobranças', perfis: ['admin'] },
    { id: 'visitantes', titulo: 'Visitantes', descricao: 'Aulas experimentais e visitas', perfis: ['admin', 'instrutor'] },
    { id: 'usuarios', titulo: 'Usuários', descricao: 'Cadastro e consulta de usuários', perfis: ['admin'] }
  ]

  constructor(
    private readonly sessao: Sessao,
    private readonly telas: Record<string, () => void>,
    private readonly aoVoltar: (origem: BrowserWindow | null) => void
  ) {}

  registrar = (): void => {
    ipcMain.handle('menu:carregar', () => {
      const usuario = this.sessao.exigir()

      return {
        nome: usuario.nome,
        perfil: usuario.perfil,
        opcoes: this.opcoes
          .filter((opcao) => opcao.perfis.includes(usuario.perfil))
          .map(({ id, titulo, descricao }) => ({ id, titulo, descricao, disponivel: id in this.telas }))
      }
    })

    ipcMain.handle('menu:abrir', (_evento, id: unknown): boolean => {
      const usuario = this.sessao.exigir()
      const opcao = this.opcoes.find((item) => item.id === id)
      if (!opcao || !opcao.perfis.includes(usuario.perfil)) throw new Error('Acesso negado')

      const abrir = this.telas[opcao.id]
      if (!abrir) return false

      abrir()
      return true
    })

    ipcMain.handle('menu:voltar', (evento): void => {
      this.sessao.exigir()

      const origem = BrowserWindow.fromWebContents(evento.sender)
      setImmediate(() => this.aoVoltar(origem))
    })
  }
}
