export type Perfil = 'admin' | 'instrutor' | 'aluno'

export type UsuarioSessao = { id: number; nome: string; perfil: Perfil }

export class Sessao {
  private usuarioAtual: UsuarioSessao | null = null

  iniciar = (usuario: UsuarioSessao): void => {
    this.usuarioAtual = usuario
  }

  encerrar = (): void => {
    this.usuarioAtual = null
  }

  usuario = (): UsuarioSessao | null => this.usuarioAtual

  exigir = (perfis?: Perfil[]): UsuarioSessao => {
    if (!this.usuarioAtual) throw new Error('Sessão não iniciada')
    if (perfis && !perfis.includes(this.usuarioAtual.perfil)) throw new Error('Acesso negado')
    return this.usuarioAtual
  }
}
