import { ipcMain, IpcMainInvokeEvent } from 'electron'
import * as path from 'path'

const raizApp = path.resolve(__dirname)

const remetenteValido = (evento: IpcMainInvokeEvent): boolean => {
  const frame = evento.senderFrame
  if (!frame || frame.parent) return false

  try {
    const url = new URL(frame.url)
    if (url.protocol !== 'file:') return false

    const caminho = decodeURIComponent(url.pathname)
    const caminhoNormalizado = process.platform === 'win32' ? caminho.replace(/^\//, '') : caminho
    const destino = path.resolve(caminhoNormalizado)

    return destino === raizApp || destino.startsWith(raizApp + path.sep)
  } catch {
    return false
  }
}

export const registrarCanal = <T extends unknown[]>(
  canal: string,
  handler: (evento: IpcMainInvokeEvent, ...args: T) => unknown
): void => {
  ipcMain.handle(canal, (evento, ...args) => {
    if (!remetenteValido(evento)) throw new Error('Origem IPC não autorizada')
    return handler(evento, ...(args as T))
  })
}
