import { ipcRenderer } from 'electron'

type ResultadoLogin = { ok: boolean; mensagem?: string }

class LoginView {
  private el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

  private entrar = async (evento: Event): Promise<void> => {
    evento.preventDefault()

    const email = this.el<HTMLInputElement>('email').value.trim()
    const campoSenha = this.el<HTMLInputElement>('senha')
    const botao = this.el<HTMLButtonElement>('entrar')
    const status = this.el('status')

    if (!email || !campoSenha.value) {
      status.textContent = 'Informe o e-mail e a senha.'
      return
    }

    botao.disabled = true
    status.textContent = ''

    try {
      const resultado: ResultadoLogin = await ipcRenderer.invoke('auth:login', email, campoSenha.value)
      if (!resultado.ok) {
        status.textContent = resultado.mensagem ?? 'Não foi possível entrar.'
        campoSenha.value = ''
        campoSenha.focus()
      }
    } catch {
      status.textContent = 'Não foi possível entrar.'
    } finally {
      botao.disabled = false
    }
  }

  iniciar = (): void => {
    this.el('formulario').addEventListener('submit', this.entrar)
    this.el('email').focus()
  }
}

window.addEventListener('DOMContentLoaded', () => new LoginView().iniciar())
