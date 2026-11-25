"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
class AlunosView {
    constructor() {
        this.usuario = null;
        this.alunos = [];
        this.detalheAtual = null;
        this.alunoParaExcluir = null;
        this.timer = null;
        this.el = (id) => document.getElementById(id);
        this.admin = () => this.usuario?.perfil === 'admin';
        this.cpfFmt = (cpf) => {
            const d = cpf.replace(/\D/g, '');
            return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : cpf;
        };
        this.cpfMask = (valor) => {
            const d = valor.replace(/\D/g, '').slice(0, 11);
            if (d.length <= 3)
                return d;
            if (d.length <= 6)
                return `${d.slice(0, 3)}.${d.slice(3)}`;
            if (d.length <= 9)
                return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
            return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
        };
        this.cepFmt = (cep) => {
            if (!cep)
                return '—';
            const d = cep.replace(/\D/g, '');
            return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, '$1-$2') : cep;
        };
        this.dataFmt = (valor) => {
            if (!valor)
                return '—';
            const [data, hora] = String(valor).split(/[ T]/);
            const [ano, mes, dia] = data.split('-');
            if (!ano || !mes || !dia)
                return valor;
            return hora ? `${dia}/${mes}/${ano} ${hora.slice(0, 5)}` : `${dia}/${mes}/${ano}`;
        };
        this.status = (texto, erro = false) => {
            const el = this.el('status');
            el.textContent = texto;
            el.classList.toggle('erro', erro);
        };
        this.criarLinha = (aluno) => {
            const tr = document.createElement('tr');
            const td = (texto, classe) => {
                const cel = document.createElement('td');
                cel.textContent = texto;
                if (classe)
                    cel.className = classe;
                return cel;
            };
            const seloTd = document.createElement('td');
            const selo = document.createElement('span');
            selo.className = aluno.ativo ? 'selo ativo' : 'selo inativo';
            selo.textContent = aluno.ativo ? 'Ativo' : 'Inativo';
            seloTd.append(selo);
            const acoesTd = document.createElement('td');
            const acoes = document.createElement('div');
            acoes.className = 'acoes-linha';
            const btnVer = document.createElement('button');
            btnVer.type = 'button';
            btnVer.className = 'botao secundario pequeno';
            btnVer.textContent = 'Ver';
            btnVer.addEventListener('click', () => void this.abrirDetalhe(aluno.id));
            acoes.append(btnVer);
            if (this.admin()) {
                const btnEditar = document.createElement('button');
                btnEditar.type = 'button';
                btnEditar.className = 'botao secundario pequeno';
                btnEditar.textContent = 'Editar';
                btnEditar.addEventListener('click', () => void this.abrirEdicao(aluno.id));
                const btnExcluir = document.createElement('button');
                btnExcluir.type = 'button';
                btnExcluir.className = 'botao perigo pequeno';
                btnExcluir.textContent = 'Desativar';
                btnExcluir.disabled = !aluno.ativo;
                btnExcluir.addEventListener('click', () => this.abrirExclusao(aluno));
                acoes.append(btnEditar, btnExcluir);
            }
            acoesTd.append(acoes);
            tr.append(td(aluno.nome, 'col-nome'), td(aluno.email), td(aluno.telefone || '—'), td(this.cpfFmt(aluno.cpf)), td([aluno.cidade, aluno.estado].filter(Boolean).join('/') || '—'), seloTd, acoesTd);
            return tr;
        };
        this.carregar = async () => {
            this.status('Carregando alunos...');
            try {
                const busca = this.el('busca').value.trim();
                const ativoRaw = this.el('filtro-ativo').value;
                const filtro = {};
                if (busca)
                    filtro.busca = busca;
                if (ativoRaw === 'true')
                    filtro.ativo = true;
                if (ativoRaw === 'false')
                    filtro.ativo = false;
                this.alunos = await electron_1.ipcRenderer.invoke('alunos:listar', filtro);
                this.el('corpo').replaceChildren(...this.alunos.map(this.criarLinha));
                this.status(this.alunos.length ? '' : 'Nenhum aluno encontrado.');
            }
            catch (erro) {
                console.error(erro);
                this.el('corpo').replaceChildren();
                this.status('Não foi possível carregar os alunos.', true);
            }
        };
        this.agendarBusca = () => {
            if (this.timer)
                clearTimeout(this.timer);
            this.timer = setTimeout(() => {
                this.timer = null;
                void this.carregar();
            }, 300);
        };
        this.limparForm = () => {
            this.el('formulario').reset();
            this.el('aluno-id').value = '';
            this.el('erro-formulario').textContent = '';
            this.el('msg-cep').textContent = '';
            this.el('msg-cep').className = 'msg-info span2';
        };
        this.abrirNovo = () => {
            this.limparForm();
            this.el('titulo-form').textContent = 'Novo aluno';
            this.el('salvar').textContent = 'Cadastrar';
            this.el('campo-senha').classList.remove('oculto');
            this.el('campo-nova-senha').classList.add('oculto');
            this.el('campo-ativo').classList.add('oculto');
            this.el('dialogo-form').showModal();
            this.el('nome').focus();
        };
        this.preencherForm = (aluno) => {
            this.limparForm();
            this.el('aluno-id').value = String(aluno.id);
            this.el('nome').value = aluno.nome;
            this.el('email').value = aluno.email;
            this.el('cpf').value = this.cpfMask(aluno.cpf);
            this.el('data-nascimento').value = aluno.dataNascimento;
            this.el('telefone').value = aluno.telefone;
            this.el('cep').value = aluno.endereco.cep ?? '';
            this.el('logradouro').value = aluno.endereco.logradouro ?? '';
            this.el('numero').value = aluno.endereco.numero ?? '';
            this.el('complemento').value = aluno.endereco.complemento ?? '';
            this.el('bairro').value = aluno.endereco.bairro ?? '';
            this.el('cidade').value = aluno.endereco.cidade ?? '';
            this.el('estado').value = aluno.endereco.estado ?? '';
            this.el('contato-emergencia').value = aluno.contatoEmergencia ?? '';
            this.el('observacoes-saude').value = aluno.observacoesSaude ?? '';
            this.el('ativo').value = String(aluno.ativo);
        };
        this.abrirEdicao = async (id) => {
            try {
                const aluno = await electron_1.ipcRenderer.invoke('alunos:obter', id);
                if (!aluno) {
                    this.status('Aluno não encontrado.', true);
                    return;
                }
                this.preencherForm(aluno);
                this.el('titulo-form').textContent = `Editar aluno — ${aluno.nome}`;
                this.el('salvar').textContent = 'Salvar alterações';
                this.el('campo-senha').classList.add('oculto');
                this.el('campo-nova-senha').classList.remove('oculto');
                this.el('campo-ativo').classList.remove('oculto');
                this.el('dialogo-form').showModal();
            }
            catch {
                this.status('Não foi possível carregar o aluno.', true);
            }
        };
        this.detalheItem = (dl, titulo, valor, span2 = false) => {
            const div = document.createElement('div');
            if (span2)
                div.className = 'span2';
            const dt = document.createElement('dt');
            dt.textContent = titulo;
            const dd = document.createElement('dd');
            dd.textContent = valor && valor.trim() ? valor : '—';
            div.append(dt, dd);
            dl.append(div);
        };
        this.abrirDetalhe = async (id) => {
            try {
                const aluno = await electron_1.ipcRenderer.invoke('alunos:obter', id);
                if (!aluno) {
                    this.status('Aluno não encontrado.', true);
                    return;
                }
                this.detalheAtual = aluno;
                this.el('titulo-detalhe').textContent = aluno.nome;
                const dl = this.el('detalhes');
                dl.replaceChildren();
                this.detalheItem(dl, 'E-mail', aluno.email);
                this.detalheItem(dl, 'CPF', this.cpfFmt(aluno.cpf));
                this.detalheItem(dl, 'Data de nascimento', this.dataFmt(aluno.dataNascimento));
                this.detalheItem(dl, 'Telefone', aluno.telefone);
                this.detalheItem(dl, 'Status', aluno.ativo ? 'Ativo' : 'Inativo');
                this.detalheItem(dl, 'Contato de emergência', aluno.contatoEmergencia);
                const e = aluno.endereco;
                this.detalheItem(dl, 'CEP', this.cepFmt(e.cep));
                this.detalheItem(dl, 'Logradouro', [e.logradouro, e.numero].filter(Boolean).join(', '));
                this.detalheItem(dl, 'Bairro', e.bairro);
                this.detalheItem(dl, 'Cidade/UF', [e.cidade, e.estado].filter(Boolean).join('/'));
                this.detalheItem(dl, 'Complemento', e.complemento, true);
                if (this.admin())
                    this.detalheItem(dl, 'Observações de saúde', aluno.observacoesSaude, true);
                this.detalheItem(dl, 'Cadastrado em', this.dataFmt(aluno.criadoEm));
                this.detalheItem(dl, 'Atualizado em', this.dataFmt(aluno.atualizadoEm));
                const msgCep = this.el('msg-cep-detalhe');
                msgCep.textContent = '';
                msgCep.className = 'msg-info';
                this.el('editar-detalhe').classList.toggle('oculto', !this.admin());
                this.el('dialogo-detalhe').showModal();
            }
            catch {
                this.status('Não foi possível carregar o aluno.', true);
            }
        };
        this.coletarEndereco = () => ({
            cep: this.el('cep').value.replace(/\D/g, '') || undefined,
            logradouro: this.el('logradouro').value.trim() || undefined,
            numero: this.el('numero').value.trim() || undefined,
            complemento: this.el('complemento').value.trim() || undefined,
            bairro: this.el('bairro').value.trim() || undefined,
            cidade: this.el('cidade').value.trim() || undefined,
            estado: this.el('estado').value.trim().toUpperCase() || undefined
        });
        this.salvar = async (evento) => {
            evento.preventDefault();
            const erro = this.el('erro-formulario');
            const botao = this.el('salvar');
            erro.textContent = '';
            const id = Number(this.el('aluno-id').value || '0');
            const payload = {
                nome: this.el('nome').value.trim(),
                email: this.el('email').value.trim(),
                cpf: this.el('cpf').value,
                dataNascimento: this.el('data-nascimento').value,
                telefone: this.el('telefone').value.trim(),
                endereco: this.coletarEndereco(),
                contatoEmergencia: this.el('contato-emergencia').value.trim() || undefined,
                observacoesSaude: this.el('observacoes-saude').value.trim() || undefined
            };
            if (!id && !this.el('senha').value) {
                erro.textContent = 'Informe a senha de acesso do aluno.';
                return;
            }
            botao.disabled = true;
            try {
                let resultado;
                if (id > 0) {
                    const novaSenha = this.el('nova-senha').value;
                    resultado = await electron_1.ipcRenderer.invoke('alunos:atualizar', {
                        id,
                        ...payload,
                        novaSenha: novaSenha || undefined,
                        ativo: this.el('ativo').value === 'true'
                    });
                }
                else {
                    resultado = await electron_1.ipcRenderer.invoke('alunos:criar', {
                        ...payload,
                        senha: this.el('senha').value
                    });
                }
                if (!resultado.ok) {
                    erro.textContent = resultado.mensagem;
                    return;
                }
                this.el('dialogo-form').close();
                await this.carregar();
                this.status(id > 0 ? 'Aluno atualizado com sucesso.' : 'Aluno cadastrado com sucesso.');
            }
            catch (e) {
                console.error(e);
                erro.textContent = 'Não foi possível salvar o aluno.';
            }
            finally {
                botao.disabled = false;
            }
        };
        this.buscarCepForm = async () => {
            const cep = this.el('cep').value;
            const msg = this.el('msg-cep');
            msg.className = 'msg-info span2';
            msg.textContent = 'Consultando ViaCEP...';
            try {
                const resultado = await electron_1.ipcRenderer.invoke('cep:buscar', cep);
                if (!resultado.ok) {
                    msg.className = 'msg-info span2 erro';
                    msg.textContent = resultado.mensagem;
                    return;
                }
                this.el('logradouro').value = resultado.endereco.logradouro || this.el('logradouro').value;
                this.el('bairro').value = resultado.endereco.bairro || this.el('bairro').value;
                this.el('cidade').value = resultado.endereco.cidade || this.el('cidade').value;
                this.el('estado').value = resultado.endereco.estado || this.el('estado').value;
                msg.className = 'msg-info span2 sucesso';
                msg.textContent = `Endereço encontrado: ${resultado.endereco.logradouro || '(sem logradouro)'}, ${resultado.endereco.bairro || ''} — ${resultado.endereco.cidade}/${resultado.endereco.estado}.`;
            }
            catch {
                msg.className = 'msg-info span2 erro';
                msg.textContent = 'Não foi possível consultar o CEP.';
            }
        };
        this.consultarCepDetalhe = async () => {
            const msg = this.el('msg-cep-detalhe');
            const cep = this.detalheAtual?.endereco.cep;
            if (!cep) {
                msg.className = 'msg-info erro';
                msg.textContent = 'Este aluno não possui CEP cadastrado.';
                return;
            }
            msg.className = 'msg-info';
            msg.textContent = 'Consultando ViaCEP...';
            try {
                const resultado = await electron_1.ipcRenderer.invoke('cep:buscar', cep);
                if (!resultado.ok) {
                    msg.className = 'msg-info erro';
                    msg.textContent = resultado.mensagem;
                    return;
                }
                msg.className = 'msg-info sucesso';
                msg.textContent = `ViaCEP: ${resultado.endereco.logradouro || '(sem logradouro)'}, ${resultado.endereco.bairro || ''} — ${resultado.endereco.cidade}/${resultado.endereco.estado} (CEP ${this.cepFmt(resultado.endereco.cep)}).`;
            }
            catch {
                msg.className = 'msg-info erro';
                msg.textContent = 'Não foi possível consultar o CEP.';
            }
        };
        this.abrirExclusao = (aluno) => {
            this.alunoParaExcluir = aluno;
            this.el('texto-excluir').textContent = `Deseja desativar o aluno "${aluno.nome}"? O cadastro e o acesso de login serão desativados (exclusão lógica).`;
            this.el('erro-excluir').textContent = '';
            this.el('dialogo-excluir').showModal();
        };
        this.confirmarExclusao = async () => {
            if (!this.alunoParaExcluir)
                return;
            const botao = this.el('confirmar-excluir');
            botao.disabled = true;
            this.el('erro-excluir').textContent = '';
            try {
                const resultado = await electron_1.ipcRenderer.invoke('alunos:excluir', this.alunoParaExcluir.id);
                if (!resultado.ok) {
                    this.el('erro-excluir').textContent = resultado.mensagem;
                    return;
                }
                this.el('dialogo-excluir').close();
                await this.carregar();
                this.status(`Aluno "${this.alunoParaExcluir.nome}" desativado.`);
            }
            catch {
                this.el('erro-excluir').textContent = 'Não foi possível desativar o aluno.';
            }
            finally {
                botao.disabled = false;
            }
        };
        this.voltar = async () => {
            try {
                await electron_1.ipcRenderer.invoke('menu:voltar');
            }
            catch {
                this.status('Não foi possível voltar ao menu.', true);
            }
        };
        this.iniciar = async () => {
            try {
                this.usuario = await electron_1.ipcRenderer.invoke('auth:me');
            }
            catch {
                this.usuario = null;
            }
            if (this.admin())
                this.el('novo').classList.remove('oculto');
            if (!this.admin())
                this.el('campo-saude').classList.add('oculto');
            this.el('voltar').addEventListener('click', () => void this.voltar());
            this.el('novo').addEventListener('click', this.abrirNovo);
            this.el('busca').addEventListener('input', this.agendarBusca);
            this.el('filtro-ativo').addEventListener('change', () => void this.carregar());
            this.el('cpf').addEventListener('input', (evento) => {
                const campo = evento.target;
                campo.value = this.cpfMask(campo.value);
            });
            this.el('formulario').addEventListener('submit', (e) => void this.salvar(e));
            this.el('cancelar-form').addEventListener('click', () => this.el('dialogo-form').close());
            this.el('buscar-cep').addEventListener('click', () => void this.buscarCepForm());
            this.el('fechar-detalhe').addEventListener('click', () => this.el('dialogo-detalhe').close());
            this.el('editar-detalhe').addEventListener('click', () => {
                if (this.detalheAtual) {
                    this.el('dialogo-detalhe').close();
                    void this.abrirEdicao(this.detalheAtual.id);
                }
            });
            this.el('consultar-cep-detalhe').addEventListener('click', () => void this.consultarCepDetalhe());
            this.el('cancelar-excluir').addEventListener('click', () => this.el('dialogo-excluir').close());
            this.el('confirmar-excluir').addEventListener('click', () => void this.confirmarExclusao());
            await this.carregar();
        };
    }
}
window.addEventListener('DOMContentLoaded', () => { void new AlunosView().iniciar(); });
