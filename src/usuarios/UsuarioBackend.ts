import { ipcMain } from 'electron'
import { RowDataPacket } from 'mysql2/promise'
import { Banco } from '../Banco'
import { Perfil, Sessao } from '../Sessao'

export type UsuarioLista = {
  id: number
  nome: string
  email: string
  perfil: Perfil
  ativo: boolean
  ultimoLogin: string | null
  criadoEm: string
}

export class UsuarioRepository {
  private readonly pool = Banco.pool

  private readonly sqlListar = `
    SELECT id, nome, email, perfil, ativo, ultimo_login, criado_em
    FROM usuarios
    WHERE (? = '' OR nome LIKE ? OR email LIKE ?)
    ORDER BY nome ASC`

  listar = async (busca: string): Promise<UsuarioLista[]> => {
    const termo = busca ? `%${busca.replace(/[\\%_]/g, '\\$&')}%` : ''

    const [linhas] = await this.pool.query<RowDataPacket[]>(this.sqlListar, [termo, termo, termo])

    return linhas.map((linha) => ({
      id: Number(linha.id),
      nome: String(linha.nome),
      email: String(linha.email),
      perfil: linha.perfil as Perfil,
      ativo: Boolean(linha.ativo),
      ultimoLogin: linha.ultimo_login ?? null,
      criadoEm: String(linha.criado_em)
    }))
  }
}

export class UsuarioIpc {
  constructor(
    private readonly sessao: Sessao,
    private readonly repositorio: UsuarioRepository = new UsuarioRepository()
  ) {}

  registrar = (): void => {
    ipcMain.handle('usuarios:listar', async (_evento, busca: unknown): Promise<UsuarioLista[]> => {
      this.sessao.exigir(['admin'])

      if (busca !== undefined && typeof busca !== 'string') throw new Error('Consulta inválida')
      if (typeof busca === 'string' && busca.length > 120) throw new Error('Consulta inválida')

      return this.repositorio.listar(typeof busca === 'string' ? busca.trim() : '')
    })
  }
}
