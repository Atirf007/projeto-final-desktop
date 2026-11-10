import { ipcRenderer } from 'electron'

type UsuarioSessao = { id: number; nome: string; perfil: 'admin' | 'instrutor' | 'aluno' }

type AlunoResumo = {
  id: number
  usuarioId: number
  nome: string
  email: string
  telefone: string
  cpf: string
  ativo: boolean
  cidade?: string
  estado?: string
}

type Endereco = {
  cep?: string
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  cidade?: string
  estado?: string
}

type Aluno = {
  id: number
  usuarioId: number
  nome: string
  email: string
  cpf: string
  dataNascimento: string
  telefone: string
  endereco: Endereco
  contatoEmergencia?: string
  observacoesSaude?: string
  ativo: boolean
  criadoEm: string
  atualizadoEm: string
}

type ResultadoAluno = { ok: true; id?: number } | { ok: false; mensagem: string }
type ResultadoCep = { ok: true; endereco: { cep: string; logradouro: string; bairro: string; cidade: string; estado: string } } | { ok: false; mensagem: string }

class AlunosView {
  private usuario: UsuarioSessao | null = null
  private alunos: AlunoResumo[] = []
  private detalheAtual: Aluno | null = null
  private alunoParaExcluir: AlunoResumo | null = null
  private timer: ReturnType<typeof setTimeout> | null = null

  private el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

  private admin = (): boolean => this.usuario?.perfil === 'admin'

  private cpfFmt = (cpf: string): string => {
    const d = cpf.replace(/\D/g, '')
    return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : cpf
  }

  private cpfMask = (valor: string): string => {
    const d = valor.replace(/\D/g, '').slice(0, 11)
    if (d.length <= 3) return d
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  }

  private cepFmt = (cep?: string): string => {
    if (!cep) return '—'
    const d = cep.replace(/\D/g, '')
    return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, '$1-$2') : cep
  }

  private dataFmt = (valor?: string): string => {
    if (!valor) return '—'
    const [data, hora] = String(valor).split(/[ T]/)
    const [ano, mes, dia] = data.split('-')
    if (!ano || !mes || !dia) return valor
    return hora ? `${dia}/${mes}/${ano} ${hora.slice(0, 5)}` : `${dia}/${mes}/${ano}`
  }

  private status = (texto: string, erro = false): void => {
    const el = this.el('status')
    el.textContent = texto
    el.classList.toggle('erro', erro)
  }

  private criarLinha = (aluno: AlunoResumo): HTMLTableRowElement => {
    const tr = document.createElement('tr')
    const td = (texto: string, classe?: string): HTMLTableCellElement => {
      const cel = document.createElement('td')
      cel.textContent = texto
      if (classe) cel.className = classe
      return cel
    }

    const seloTd = document.createElement('td')
    const selo = document.createElement('span')
    selo.className = aluno.ativo ? 'selo ativo' : 'selo inativo'
    selo.textContent = aluno.ativo ? 'Ativo' : 'Inativo'
    seloTd.append(selo)

    const acoesTd = document.createElement('td')
    const acoes = document.createElement('div')
    acoes.className = 'acoes-linha'
    const btnVer = document.createElement('button')
    btnVer.type = 'button'
    btnVer.className = 'botao secundario pequeno'
    btnVer.textContent = 'Ver'
    btnVer.addEventListener('click', () => void this.abrirDetalhe(aluno.id))
    acoes.append(btnVer)
    if (this.admin()) {
      const btnEditar = document.createElement('button')
      btnEditar.type = 'button'
      btnEditar.className = 'botao secundario pequeno'
      btnEditar.textContent = 'Editar'
      btnEditar.addEventListener('click', () => void this.abrirEdicao(aluno.id))
      const btnExcluir = document.createElement('button')
      btnExcluir.type = 'button'
      btnExcluir.className = 'botao perigo pequeno'
      btnExcluir.textContent = 'Desativar'
      btnExcluir.disabled = !aluno.ativo
      btnExcluir.addEventListener('click', () => this.abrirExclusao(aluno))
      acoes.append(btnEditar, btnExcluir)
    }
    acoesTd.append(acoes)

    tr.append(
      td(aluno.nome, 'col-nome'),
      td(aluno.email),
      td(aluno.telefone || '—'),
      td(this.cpfFmt(aluno.cpf)),
      td([aluno.cidade, aluno.estado].filter(Boolean).join('/') || '—'),
      seloTd,
      acoesTd
    )
    return tr
  }

  private carregar = async (): Promise<void> => {
    this.status('Carregando alunos...')
    try {
      const busca = this.el<HTMLInputElement>('busca').value.trim()
      const ativoRaw = this.el<HTMLSelectElement>('filtro-ativo').value
      const filtro: { busca?: string; ativo?: boolean } = {}
      if (busca) filtro.busca = busca
      if (ativoRaw === 'true') filtro.ativo = true
      if (ativoRaw === 'false') filtro.ativo = false
      this.alunos = await ipcRenderer.invoke('alunos:listar', filtro)
      this.el<HTMLTableSectionElement>('corpo').replaceChildren(...this.alunos.map(this.criarLinha))
      this.status(this.alunos.length ? '' : 'Nenhum aluno encontrado.')
    } catch (erro) {
      console.error(erro)
      this.el<HTMLTableSectionElement>('corpo').replaceChildren()
      this.status('Não foi possível carregar os alunos.', true)
    }
  }

  private agendarBusca = (): void => {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.carregar()
    }, 300)
  }

  private limparForm = (): void => {
    this.el<HTMLFormElement>('formulario').reset()
    this.el<HTMLInputElement>('aluno-id').value = ''
    this.el('erro-formulario').textContent = ''
    this.el('msg-cep').textContent = ''
    this.el('msg-cep').className = 'msg-info span2'
  }

  private abrirNovo = (): void => {
    this.limparForm()
    this.el('titulo-form').textContent = 'Novo aluno'
    this.el<HTMLButtonElement>('salvar').textContent = 'Cadastrar'
    this.el('campo-senha').classList.remove('oculto')
    this.el('campo-nova-senha').classList.add('oculto')
    this.el('campo-ativo').classList.add('oculto')
    this.el<HTMLDialogElement>('dialogo-form').showModal()
    this.el<HTMLInputElement>('nome').focus()
  }

  private preencherForm = (aluno: Aluno): void => {
    this.limparForm()
    this.el<HTMLInputElement>('aluno-id').value = String(aluno.id)
    this.el<HTMLInputElement>('nome').value = aluno.nome
    this.el<HTMLInputElement>('email').value = aluno.email
    this.el<HTMLInputElement>('cpf').value = this.cpfMask(aluno.cpf)
    this.el<HTMLInputElement>('data-nascimento').value = aluno.dataNascimento
    this.el<HTMLInputElement>('telefone').value = aluno.telefone
    this.el<HTMLInputElement>('cep').value = aluno.endereco.cep ?? ''
    this.el<HTMLInputElement>('logradouro').value = aluno.endereco.logradouro ?? ''
    this.el<HTMLInputElement>('numero').value = aluno.endereco.numero ?? ''
    this.el<HTMLInputElement>('complemento').value = aluno.endereco.complemento ?? ''
    this.el<HTMLInputElement>('bairro').value = aluno.endereco.bairro ?? ''
    this.el<HTMLInputElement>('cidade').value = aluno.endereco.cidade ?? ''
    this.el<HTMLInputElement>('estado').value = aluno.endereco.estado ?? ''
    this.el<HTMLInputElement>('contato-emergencia').value = aluno.contatoEmergencia ?? ''
    this.el<HTMLTextAreaElement>('observacoes-saude').value = aluno.observacoesSaude ?? ''
    this.el<HTMLSelectElement>('ativo').value = String(aluno.ativo)
  }

  private abrirEdicao = async (id: number): Promise<void> => {
    try {
      const aluno: Aluno | null = await ipcRenderer.invoke('alunos:obter', id)
      if (!aluno) { this.status('Aluno não encontrado.', true); return }
      this.preencherForm(aluno)
      this.el('titulo-form').textContent = `Editar aluno — ${aluno.nome}`
      this.el<HTMLButtonElement>('salvar').textContent = 'Salvar alterações'
      this.el('campo-senha').classList.add('oculto')
      this.el('campo-nova-senha').classList.remove('oculto')
      this.el('campo-ativo').classList.remove('oculto')
      this.el<HTMLDialogElement>('dialogo-form').showModal()
    } catch {
      this.status('Não foi possível carregar o aluno.', true)
    }
  }

  private detalheItem = (dl: HTMLElement, titulo: string, valor: string | undefined, span2 = false): void => {
    const div = document.createElement('div')
    if (span2) div.className = 'span2'
    const dt = document.createElement('dt')
    dt.textContent = titulo
    const dd = document.createElement('dd')
    dd.textContent = valor && valor.trim() ? valor : '—'
    div.append(dt, dd)
    dl.append(div)
  }

  private abrirDetalhe = async (id: number): Promise<void> => {
    try {
      const aluno: Aluno | null = await ipcRenderer.invoke('alunos:obter', id)
      if (!aluno) { this.status('Aluno não encontrado.', true); return }
      this.detalheAtual = aluno
      this.el('titulo-detalhe').textContent = aluno.nome
      const dl = this.el('detalhes')
      dl.replaceChildren()
      this.detalheItem(dl, 'E-mail', aluno.email)
      this.detalheItem(dl, 'CPF', this.cpfFmt(aluno.cpf))
      this.detalheItem(dl, 'Data de nascimento', this.dataFmt(aluno.dataNascimento))
      this.detalheItem(dl, 'Telefone', aluno.telefone)
      this.detalheItem(dl, 'Status', aluno.ativo ? 'Ativo' : 'Inativo')
      this.detalheItem(dl, 'Contato de emergência', aluno.contatoEmergencia)
      const e = aluno.endereco
      this.detalheItem(dl, 'CEP', this.cepFmt(e.cep))
      this.detalheItem(dl, 'Logradouro', [e.logradouro, e.numero].filter(Boolean).join(', '))
      this.detalheItem(dl, 'Bairro', e.bairro)
      this.detalheItem(dl, 'Cidade/UF', [e.cidade, e.estado].filter(Boolean).join('/'))
      this.detalheItem(dl, 'Complemento', e.complemento, true)
      if (this.admin()) this.detalheItem(dl, 'Observações de saúde', aluno.observacoesSaude, true)
      this.detalheItem(dl, 'Cadastrado em', this.dataFmt(aluno.criadoEm))
      this.detalheItem(dl, 'Atualizado em', this.dataFmt(aluno.atualizadoEm))
      const msgCep = this.el('msg-cep-detalhe')
      msgCep.textContent = ''
      msgCep.className = 'msg-info'
      this.el('editar-detalhe').classList.toggle('oculto', !this.admin())
      this.el<HTMLDialogElement>('dialogo-detalhe').showModal()
    } catch {
      this.status('Não foi possível carregar o aluno.', true)
    }
  }

  private coletarEndereco = (): Endereco => ({
    cep: this.el<HTMLInputElement>('cep').value.replace(/\D/g, '') || undefined,
    logradouro: this.el<HTMLInputElement>('logradouro').value.trim() || undefined,
    numero: this.el<HTMLInputElement>('numero').value.trim() || undefined,
    complemento: this.el<HTMLInputElement>('complemento').value.trim() || undefined,
    bairro: this.el<HTMLInputElement>('bairro').value.trim() || undefined,
    cidade: this.el<HTMLInputElement>('cidade').value.trim() || undefined,
    estado: this.el<HTMLInputElement>('estado').value.trim().toUpperCase() || undefined
  })

  private salvar = async (evento: Event): Promise<void> => {
    evento.preventDefault()
    const erro = this.el('erro-formulario')
    const botao = this.el<HTMLButtonElement>('salvar')
    erro.textContent = ''
    const id = Number(this.el<HTMLInputElement>('aluno-id').value || '0')
    const payload = {
      nome: this.el<HTMLInputElement>('nome').value.trim(),
      email: this.el<HTMLInputElement>('email').value.trim(),
      cpf: this.el<HTMLInputElement>('cpf').value,
      dataNascimento: this.el<HTMLInputElement>('data-nascimento').value,
      telefone: this.el<HTMLInputElement>('telefone').value.trim(),
      endereco: this.coletarEndereco(),
      contatoEmergencia: this.el<HTMLInputElement>('contato-emergencia').value.trim() || undefined,
      observacoesSaude: this.el<HTMLTextAreaElement>('observacoes-saude').value.trim() || undefined
    }
    if (!id && !this.el<HTMLInputElement>('senha').value) {
      erro.textContent = 'Informe a senha de acesso do aluno.'
      return
    }
    botao.disabled = true
    try {
      let resultado: ResultadoAluno
      if (id > 0) {
        const novaSenha = this.el<HTMLInputElement>('nova-senha').value
        resultado = await ipcRenderer.invoke('alunos:atualizar', {
          id,
          ...payload,
          novaSenha: novaSenha || undefined,
          ativo: this.el<HTMLSelectElement>('ativo').value === 'true'
        })
      } else {
        resultado = await ipcRenderer.invoke('alunos:criar', {
          ...payload,
          senha: this.el<HTMLInputElement>('senha').value
        })
      }
      if (!resultado.ok) { erro.textContent = resultado.mensagem; return }
      this.el<HTMLDialogElement>('dialogo-form').close()
      await this.carregar()
      this.status(id > 0 ? 'Aluno atualizado com sucesso.' : 'Aluno cadastrado com sucesso.')
    } catch (e) {
      console.error(e)
      erro.textContent = 'Não foi possível salvar o aluno.'
    } finally {
      botao.disabled = false
    }
  }

  private buscarCepForm = async (): Promise<void> => {
    const cep = this.el<HTMLInputElement>('cep').value
    const msg = this.el('msg-cep')
    msg.className = 'msg-info span2'
    msg.textContent = 'Consultando ViaCEP...'
    try {
      const resultado: ResultadoCep = await ipcRenderer.invoke('cep:buscar', cep)
      if (!resultado.ok) {
        msg.className = 'msg-info span2 erro'
        msg.textContent = resultado.mensagem
        return
      }
      this.el<HTMLInputElement>('logradouro').value = resultado.endereco.logradouro || this.el<HTMLInputElement>('logradouro').value
      this.el<HTMLInputElement>('bairro').value = resultado.endereco.bairro || this.el<HTMLInputElement>('bairro').value
      this.el<HTMLInputElement>('cidade').value = resultado.endereco.cidade || this.el<HTMLInputElement>('cidade').value
      this.el<HTMLInputElement>('estado').value = resultado.endereco.estado || this.el<HTMLInputElement>('estado').value
      msg.className = 'msg-info span2 sucesso'
      msg.textContent = `Endereço encontrado: ${resultado.endereco.logradouro || '(sem logradouro)'}, ${resultado.endereco.bairro || ''} — ${resultado.endereco.cidade}/${resultado.endereco.estado}.`
    } catch {
      msg.className = 'msg-info span2 erro'
      msg.textContent = 'Não foi possível consultar o CEP.'
    }
  }

  private consultarCepDetalhe = async (): Promise<void> => {
    const msg = this.el('msg-cep-detalhe')
    const cep = this.detalheAtual?.endereco.cep
    if (!cep) { msg.className = 'msg-info erro'; msg.textContent = 'Este aluno não possui CEP cadastrado.'; return }
    msg.className = 'msg-info'
    msg.textContent = 'Consultando ViaCEP...'
    try {
      const resultado: ResultadoCep = await ipcRenderer.invoke('cep:buscar', cep)
      if (!resultado.ok) { msg.className = 'msg-info erro'; msg.textContent = resultado.mensagem; return }
      msg.className = 'msg-info sucesso'
      msg.textContent = `ViaCEP: ${resultado.endereco.logradouro || '(sem logradouro)'}, ${resultado.endereco.bairro || ''} — ${resultado.endereco.cidade}/${resultado.endereco.estado} (CEP ${this.cepFmt(resultado.endereco.cep)}).`
    } catch {
      msg.className = 'msg-info erro'
      msg.textContent = 'Não foi possível consultar o CEP.'
    }
  }

  private abrirExclusao = (aluno: AlunoResumo): void => {
    this.alunoParaExcluir = aluno
    this.el('texto-excluir').textContent = `Deseja desativar o aluno "${aluno.nome}"? O cadastro e o acesso de login serão desativados (exclusão lógica).`
    this.el('erro-excluir').textContent = ''
    this.el<HTMLDialogElement>('dialogo-excluir').showModal()
  }

  private confirmarExclusao = async (): Promise<void> => {
    if (!this.alunoParaExcluir) return
    const botao = this.el<HTMLButtonElement>('confirmar-excluir')
    botao.disabled = true
    this.el('erro-excluir').textContent = ''
    try {
      const resultado: ResultadoAluno = await ipcRenderer.invoke('alunos:excluir', this.alunoParaExcluir.id)
      if (!resultado.ok) { this.el('erro-excluir').textContent = resultado.mensagem; return }
      this.el<HTMLDialogElement>('dialogo-excluir').close()
      await this.carregar()
      this.status(`Aluno "${this.alunoParaExcluir.nome}" desativado.`)
    } catch {
      this.el('erro-excluir').textContent = 'Não foi possível desativar o aluno.'
    } finally {
      botao.disabled = false
    }
  }

  private voltar = async (): Promise<void> => {
    try { await ipcRenderer.invoke('menu:voltar') } catch { this.status('Não foi possível voltar ao menu.', true) }
  }

  iniciar = async (): Promise<void> => {
    try { this.usuario = await ipcRenderer.invoke('auth:me') } catch { this.usuario = null }
    if (this.admin()) this.el('novo').classList.remove('oculto')
    if (!this.admin()) this.el('campo-saude').classList.add('oculto')
    this.el('voltar').addEventListener('click', () => void this.voltar())
    this.el('novo').addEventListener('click', this.abrirNovo)
    this.el<HTMLInputElement>('busca').addEventListener('input', this.agendarBusca)
    this.el('filtro-ativo').addEventListener('change', () => void this.carregar())
    this.el<HTMLInputElement>('cpf').addEventListener('input', (evento) => {
      const campo = evento.target as HTMLInputElement
      campo.value = this.cpfMask(campo.value)
    })
    this.el('formulario').addEventListener('submit', (e) => void this.salvar(e))
    this.el('cancelar-form').addEventListener('click', () => this.el<HTMLDialogElement>('dialogo-form').close())
    this.el('buscar-cep').addEventListener('click', () => void this.buscarCepForm())
    this.el('fechar-detalhe').addEventListener('click', () => this.el<HTMLDialogElement>('dialogo-detalhe').close())
    this.el('editar-detalhe').addEventListener('click', () => {
      if (this.detalheAtual) {
        this.el<HTMLDialogElement>('dialogo-detalhe').close()
        void this.abrirEdicao(this.detalheAtual.id)
      }
    })
    this.el('consultar-cep-detalhe').addEventListener('click', () => void this.consultarCepDetalhe())
    this.el('cancelar-excluir').addEventListener('click', () => this.el<HTMLDialogElement>('dialogo-excluir').close())
    this.el('confirmar-excluir').addEventListener('click', () => void this.confirmarExclusao())
    await this.carregar()
  }
}

window.addEventListener('DOMContentLoaded', () => { void new AlunosView().iniciar() })
