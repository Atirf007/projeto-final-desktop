"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
class FuncionariosView {
    constructor() {
        this.funcionarios = [];
        this.modalidades = [];
        this.detalheAtual = null;
        this.funcionarioParaExcluir = null;
        this.timer = null;
        this.el = (id) => document.getElementById(id);
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
        this.modalidadesTexto = (funcionario) => funcionario.modalidades.length ? funcionario.modalidades.join(', ') : '—';
        this.criarLinha = (funcionario) => {
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
            selo.className = funcionario.ativo ? 'selo ativo' : 'selo inativo';
            selo.textContent = funcionario.ativo ? 'Ativo' : 'Inativo';
            seloTd.append(selo);
            const acoesTd = document.createElement('td');
            const acoes = document.createElement('div');
            acoes.className = 'acoes-linha';
            const btnVer = document.createElement('button');
            btnVer.type = 'button';
            btnVer.className = 'botao secundario pequeno';
            btnVer.textContent = 'Ver';
            btnVer.addEventListener('click', () => void this.abrirDetalhe(funcionario.id));
            const btnEditar = document.createElement('button');
            btnEditar.type = 'button';
            btnEditar.className = 'botao secundario pequeno';
            btnEditar.textContent = 'Editar';
            btnEditar.addEventListener('click', () => void this.abrirEdicao(funcionario.id));
            const btnExcluir = document.createElement('button');
            btnExcluir.type = 'button';
            btnExcluir.className = 'botao perigo pequeno';
            btnExcluir.textContent = 'Desativar';
            btnExcluir.disabled = !funcionario.ativo;
            btnExcluir.addEventListener('click', () => this.abrirExclusao(funcionario));
            acoes.append(btnVer, btnEditar, btnExcluir);
            acoesTd.append(acoes);
            tr.append(td(funcionario.nome, 'col-nome'), td(funcionario.email), td(funcionario.cref || '—'), td(this.modalidadesTexto(funcionario), 'col-modalidades'), seloTd, acoesTd);
            return tr;
        };
        this.carregar = async () => {
            this.status('Carregando funcionários...');
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
                this.funcionarios = await electron_1.ipcRenderer.invoke('instrutores:listar', filtro);
                this.el('corpo').replaceChildren(...this.funcionarios.map(this.criarLinha));
                this.status(this.funcionarios.length ? '' : 'Nenhum funcionário encontrado.');
            }
            catch (erro) {
                console.error(erro);
                this.el('corpo').replaceChildren();
                this.status('Não foi possível carregar os funcionários.', true);
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
            this.el('funcionario-id').value = '';
            this.el('erro-formulario').textContent = '';
        };
        this.renderModalidades = (selecionadas) => {
            const container = this.el('modalidades-check');
            const selecionadasSet = new Set(selecionadas);
            const visiveis = this.modalidades.filter((m) => m.ativo || selecionadasSet.has(m.id));
            if (!visiveis.length) {
                const aviso = document.createElement('p');
                aviso.className = 'msg-info';
                aviso.textContent = 'Nenhuma modalidade cadastrada. Use "Gerenciar modalidades" para cadastrar.';
                container.replaceChildren(aviso);
                return;
            }
            const itens = visiveis.map((modalidade) => {
                const label = document.createElement('label');
                label.className = 'check';
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.value = String(modalidade.id);
                input.checked = selecionadasSet.has(modalidade.id);
                const nome = document.createElement('span');
                nome.textContent = modalidade.ativo ? modalidade.nome : `${modalidade.nome} (inativa)`;
                label.append(input, nome);
                return label;
            });
            container.replaceChildren(...itens);
        };
        this.modalidadesSelecionadas = () => Array.from(this.el('modalidades-check').querySelectorAll('input[type="checkbox"]'))
            .filter((input) => input.checked)
            .map((input) => Number(input.value));
        this.abrirNovo = () => {
            this.limparForm();
            this.el('titulo-form').textContent = 'Novo funcionário';
            this.el('salvar').textContent = 'Cadastrar';
            this.el('campo-senha').classList.remove('oculto');
            this.el('campo-nova-senha').classList.add('oculto');
            this.el('campo-ativo').classList.add('oculto');
            this.renderModalidades([]);
            this.el('dialogo-form').showModal();
            this.el('nome').focus();
        };
        this.preencherForm = (funcionario) => {
            this.limparForm();
            this.el('funcionario-id').value = String(funcionario.id);
            this.el('nome').value = funcionario.nome;
            this.el('email').value = funcionario.email;
            this.el('cref').value = funcionario.cref;
            this.el('bio').value = funcionario.bio ?? '';
            this.el('ativo').value = String(funcionario.ativo);
            this.renderModalidades(funcionario.modalidades.map((m) => m.id));
        };
        this.abrirEdicao = async (id) => {
            try {
                const funcionario = await electron_1.ipcRenderer.invoke('instrutores:obter', id);
                if (!funcionario) {
                    this.status('Funcionário não encontrado.', true);
                    return;
                }
                this.preencherForm(funcionario);
                this.el('titulo-form').textContent = `Editar funcionário — ${funcionario.nome}`;
                this.el('salvar').textContent = 'Salvar alterações';
                this.el('campo-senha').classList.add('oculto');
                this.el('campo-nova-senha').classList.remove('oculto');
                this.el('campo-ativo').classList.remove('oculto');
                this.el('dialogo-form').showModal();
            }
            catch {
                this.status('Não foi possível carregar o funcionário.', true);
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
                const funcionario = await electron_1.ipcRenderer.invoke('instrutores:obter', id);
                if (!funcionario) {
                    this.status('Funcionário não encontrado.', true);
                    return;
                }
                this.detalheAtual = funcionario;
                this.el('titulo-detalhe').textContent = funcionario.nome;
                const dl = this.el('detalhes');
                dl.replaceChildren();
                this.detalheItem(dl, 'E-mail', funcionario.email);
                this.detalheItem(dl, 'CREF', funcionario.cref);
                this.detalheItem(dl, 'Status', funcionario.ativo ? 'Ativo' : 'Inativo');
                this.detalheItem(dl, 'Modalidades', funcionario.modalidades.map((m) => m.nome).join(', '));
                this.detalheItem(dl, 'Biografia', funcionario.bio, true);
                this.detalheItem(dl, 'Cadastrado em', this.dataFmt(funcionario.criadoEm));
                this.detalheItem(dl, 'Atualizado em', this.dataFmt(funcionario.atualizadoEm));
                this.el('dialogo-detalhe').showModal();
            }
            catch {
                this.status('Não foi possível carregar o funcionário.', true);
            }
        };
        this.salvar = async (evento) => {
            evento.preventDefault();
            const erro = this.el('erro-formulario');
            const botao = this.el('salvar');
            erro.textContent = '';
            const id = Number(this.el('funcionario-id').value || '0');
            const nome = this.el('nome').value.trim();
            const email = this.el('email').value.trim();
            const cref = this.el('cref').value.trim();
            const bio = this.el('bio').value.trim();
            const modalidadeIds = this.modalidadesSelecionadas();
            if (!id && !this.el('senha').value) {
                erro.textContent = 'Informe a senha de acesso do funcionário.';
                return;
            }
            botao.disabled = true;
            try {
                let resultado;
                if (id > 0) {
                    const novaSenha = this.el('nova-senha').value;
                    resultado = await electron_1.ipcRenderer.invoke('instrutores:atualizar', {
                        id,
                        nome,
                        email,
                        cref,
                        bio: bio || null,
                        modalidadeIds,
                        novaSenha: novaSenha || undefined,
                        ativo: this.el('ativo').value === 'true'
                    });
                }
                else {
                    resultado = await electron_1.ipcRenderer.invoke('instrutores:criar', {
                        nome,
                        email,
                        cref,
                        bio: bio || undefined,
                        modalidadeIds,
                        senha: this.el('senha').value
                    });
                }
                if (!resultado.ok) {
                    erro.textContent = resultado.mensagem;
                    return;
                }
                this.el('dialogo-form').close();
                await this.carregar();
                this.status(id > 0 ? 'Funcionário atualizado com sucesso.' : 'Funcionário cadastrado com sucesso.');
            }
            catch (e) {
                console.error(e);
                erro.textContent = 'Não foi possível salvar o funcionário.';
            }
            finally {
                botao.disabled = false;
            }
        };
        this.abrirExclusao = (funcionario) => {
            this.funcionarioParaExcluir = funcionario;
            this.el('texto-excluir').textContent = `Deseja desativar o funcionário "${funcionario.nome}"? O cadastro e o acesso de login serão desativados (exclusão lógica).`;
            this.el('erro-excluir').textContent = '';
            this.el('dialogo-excluir').showModal();
        };
        this.confirmarExclusao = async () => {
            if (!this.funcionarioParaExcluir)
                return;
            const botao = this.el('confirmar-excluir');
            botao.disabled = true;
            this.el('erro-excluir').textContent = '';
            try {
                const resultado = await electron_1.ipcRenderer.invoke('instrutores:excluir', this.funcionarioParaExcluir.id);
                if (!resultado.ok) {
                    this.el('erro-excluir').textContent = resultado.mensagem;
                    return;
                }
                this.el('dialogo-excluir').close();
                await this.carregar();
                this.status(`Funcionário "${this.funcionarioParaExcluir.nome}" desativado.`);
            }
            catch {
                this.el('erro-excluir').textContent = 'Não foi possível desativar o funcionário.';
            }
            finally {
                botao.disabled = false;
            }
        };
        this.carregarModalidades = async () => {
            this.modalidades = await electron_1.ipcRenderer.invoke('modalidades:listar', {});
        };
        this.criarLinhaModalidade = (modalidade) => {
            const tr = document.createElement('tr');
            const td = (texto) => {
                const cel = document.createElement('td');
                cel.textContent = texto;
                return cel;
            };
            const seloTd = document.createElement('td');
            const selo = document.createElement('span');
            selo.className = modalidade.ativo ? 'selo ativo' : 'selo inativo';
            selo.textContent = modalidade.ativo ? 'Ativa' : 'Inativa';
            seloTd.append(selo);
            const acoesTd = document.createElement('td');
            const acoes = document.createElement('div');
            acoes.className = 'acoes-linha';
            const btnEditar = document.createElement('button');
            btnEditar.type = 'button';
            btnEditar.className = 'botao secundario pequeno';
            btnEditar.textContent = 'Editar';
            btnEditar.addEventListener('click', () => this.editarModalidade(modalidade));
            const btnAlternar = document.createElement('button');
            btnAlternar.type = 'button';
            btnAlternar.className = modalidade.ativo ? 'botao perigo pequeno' : 'botao pequeno';
            btnAlternar.textContent = modalidade.ativo ? 'Desativar' : 'Reativar';
            btnAlternar.addEventListener('click', () => void this.alternarModalidade(modalidade));
            acoes.append(btnEditar, btnAlternar);
            acoesTd.append(acoes);
            tr.append(td(modalidade.nome), td(modalidade.descricao || '—'), seloTd, acoesTd);
            return tr;
        };
        this.renderTabelaModalidades = () => {
            this.el('corpo-modalidades').replaceChildren(...this.modalidades.map(this.criarLinhaModalidade));
        };
        this.limparFormModalidade = () => {
            this.el('form-modalidade').reset();
            this.el('modalidade-id').value = '';
            this.el('campo-modalidade-ativo').classList.add('oculto');
            this.el('salvar-modalidade').textContent = 'Cadastrar modalidade';
            this.el('erro-modalidade').textContent = '';
        };
        this.editarModalidade = (modalidade) => {
            this.el('modalidade-id').value = String(modalidade.id);
            this.el('modalidade-nome').value = modalidade.nome;
            this.el('modalidade-descricao').value = modalidade.descricao ?? '';
            this.el('modalidade-ativo').value = String(modalidade.ativo);
            this.el('campo-modalidade-ativo').classList.remove('oculto');
            this.el('salvar-modalidade').textContent = 'Salvar alterações';
            this.el('erro-modalidade').textContent = '';
            this.el('modalidade-nome').focus();
        };
        this.recarregarModalidades = async () => {
            const status = this.el('status-modalidades');
            try {
                await this.carregarModalidades();
                this.renderTabelaModalidades();
                status.classList.remove('erro');
                status.textContent = this.modalidades.length ? '' : 'Nenhuma modalidade cadastrada.';
            }
            catch {
                status.classList.add('erro');
                status.textContent = 'Não foi possível carregar as modalidades.';
            }
        };
        this.abrirModalidades = async () => {
            this.limparFormModalidade();
            this.el('dialogo-modalidades').showModal();
            await this.recarregarModalidades();
        };
        this.salvarModalidade = async (evento) => {
            evento.preventDefault();
            const erro = this.el('erro-modalidade');
            const botao = this.el('salvar-modalidade');
            erro.textContent = '';
            const id = Number(this.el('modalidade-id').value || '0');
            const nome = this.el('modalidade-nome').value.trim();
            const descricao = this.el('modalidade-descricao').value.trim();
            if (!nome) {
                erro.textContent = 'Informe o nome da modalidade.';
                return;
            }
            botao.disabled = true;
            try {
                const resultado = id > 0
                    ? await electron_1.ipcRenderer.invoke('modalidades:atualizar', {
                        id,
                        nome,
                        descricao: descricao || null,
                        ativo: this.el('modalidade-ativo').value === 'true'
                    })
                    : await electron_1.ipcRenderer.invoke('modalidades:criar', { nome, descricao: descricao || undefined });
                if (!resultado.ok) {
                    erro.textContent = resultado.mensagem;
                    return;
                }
                this.limparFormModalidade();
                await this.recarregarModalidades();
                this.el('status-modalidades').textContent = id > 0 ? 'Modalidade atualizada.' : 'Modalidade cadastrada.';
            }
            catch {
                erro.textContent = 'Não foi possível salvar a modalidade.';
            }
            finally {
                botao.disabled = false;
            }
        };
        this.alternarModalidade = async (modalidade) => {
            const status = this.el('status-modalidades');
            status.classList.remove('erro');
            try {
                const resultado = modalidade.ativo
                    ? await electron_1.ipcRenderer.invoke('modalidades:excluir', modalidade.id)
                    : await electron_1.ipcRenderer.invoke('modalidades:atualizar', { id: modalidade.id, ativo: true });
                if (!resultado.ok) {
                    status.classList.add('erro');
                    status.textContent = resultado.mensagem;
                    return;
                }
                await this.recarregarModalidades();
                this.el('status-modalidades').textContent = modalidade.ativo ? 'Modalidade desativada.' : 'Modalidade reativada.';
            }
            catch {
                status.classList.add('erro');
                status.textContent = 'Não foi possível alterar a modalidade.';
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
            this.el('voltar').addEventListener('click', () => void this.voltar());
            this.el('novo').addEventListener('click', this.abrirNovo);
            this.el('busca').addEventListener('input', this.agendarBusca);
            this.el('filtro-ativo').addEventListener('change', () => void this.carregar());
            this.el('formulario').addEventListener('submit', (e) => void this.salvar(e));
            this.el('cancelar-form').addEventListener('click', () => this.el('dialogo-form').close());
            this.el('fechar-detalhe').addEventListener('click', () => this.el('dialogo-detalhe').close());
            this.el('editar-detalhe').addEventListener('click', () => {
                if (this.detalheAtual) {
                    this.el('dialogo-detalhe').close();
                    void this.abrirEdicao(this.detalheAtual.id);
                }
            });
            this.el('cancelar-excluir').addEventListener('click', () => this.el('dialogo-excluir').close());
            this.el('confirmar-excluir').addEventListener('click', () => void this.confirmarExclusao());
            this.el('gerenciar-modalidades').addEventListener('click', () => void this.abrirModalidades());
            this.el('form-modalidade').addEventListener('submit', (e) => void this.salvarModalidade(e));
            this.el('limpar-modalidade').addEventListener('click', this.limparFormModalidade);
            this.el('fechar-modalidades').addEventListener('click', () => {
                this.el('dialogo-modalidades').close();
                void this.carregar();
            });
            try {
                await this.carregarModalidades();
            }
            catch {
                this.modalidades = [];
            }
            await this.carregar();
        };
    }
}
window.addEventListener('DOMContentLoaded', () => { void new FuncionariosView().iniciar(); });
