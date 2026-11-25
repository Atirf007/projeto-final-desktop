"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
class AulasView {
    constructor() {
        this.usuario = null;
        this.aulas = [];
        this.minhas = new Set();
        this.detalheAtual = null;
        this.aulaParaExcluir = null;
        this.instrutorId = null;
        this.alunosCarregados = false;
        this.climaConsulta = 0;
        this.el = (id) => document.getElementById(id);
        this.admin = () => this.usuario?.perfil === 'admin';
        this.gestor = () => this.usuario?.perfil === 'admin' || this.usuario?.perfil === 'instrutor';
        this.aluno = () => this.usuario?.perfil === 'aluno';
        this.criar = (tag, classe, texto) => {
            const elemento = document.createElement(tag);
            if (classe)
                elemento.className = classe;
            if (texto !== undefined)
                elemento.textContent = texto;
            return elemento;
        };
        this.criarBotao = (texto, classe) => {
            const botao = document.createElement('button');
            botao.type = 'button';
            botao.className = classe;
            botao.textContent = texto;
            return botao;
        };
        this.criarOpcao = (valor, texto) => {
            const opcao = document.createElement('option');
            opcao.value = valor;
            opcao.textContent = texto;
            return opcao;
        };
        this.criarSelo = (status, texto) => {
            const selo = document.createElement('span');
            selo.className = `selo ${status}`;
            selo.textContent = texto;
            return selo;
        };
        this.statusTexto = {
            agendada: 'Agendada',
            confirmada: 'Confirmada',
            cancelada: 'Cancelada',
            remarcada: 'Remarcada',
            concluida: 'Concluída'
        };
        this.inscricaoTexto = {
            confirmada: 'Confirmada',
            cancelada: 'Cancelada',
            presente: 'Presente',
            falta: 'Falta'
        };
        this.localTexto = (local) => (local === 'externa' ? 'Externa (ar livre)' : 'Interna');
        this.dataBr = (valor) => {
            if (!valor)
                return '—';
            const [ano, mes, dia] = String(valor).slice(0, 10).split('-');
            return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
        };
        this.dataHoraFmt = (valor) => {
            if (!valor)
                return '—';
            const [data, hora] = String(valor).split(/[ T]/);
            const [ano, mes, dia] = data.split('-');
            if (!ano || !mes || !dia)
                return valor;
            return hora ? `${dia}/${mes}/${ano} ${hora.slice(0, 5)}` : `${dia}/${mes}/${ano}`;
        };
        this.paraInputDataHora = (valor) => {
            const [data, hora = '00:00'] = valor.split(/[ T]/);
            return `${data}T${hora.slice(0, 5)}`;
        };
        this.proximoHorario = () => {
            const d = new Date();
            d.setMinutes(0, 0, 0);
            d.setHours(d.getHours() + 1);
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };
        this.statusPagina = (texto, erro = false) => {
            const el = this.el('status');
            el.textContent = texto;
            el.classList.toggle('erro', erro);
        };
        this.podeReservar = (aula) => ['agendada', 'confirmada', 'remarcada'].includes(aula.status) &&
            aula.vagasOcupadas < aula.capacidadeMax;
        this.criarLinha = (aula) => {
            const tr = document.createElement('tr');
            if (aula.status === 'cancelada')
                tr.className = 'linha-cancelada';
            const tdTitulo = document.createElement('td');
            tdTitulo.className = 'col-titulo';
            const titulo = document.createElement('strong');
            titulo.textContent = aula.titulo;
            const modalidade = document.createElement('small');
            modalidade.textContent =
                aula.modalidadeNome + (this.aluno() && this.minhas.has(aula.id) ? ' · Você está inscrito' : '');
            tdTitulo.append(titulo, modalidade);
            const tdData = document.createElement('td');
            tdData.className = 'col-data';
            tdData.textContent = this.dataHoraFmt(aula.dataHoraInicio);
            const tdInstrutor = document.createElement('td');
            tdInstrutor.textContent = aula.instrutorNome || '—';
            const tdLocal = document.createElement('td');
            const local = this.criar('span', `local${aula.local === 'externa' ? ' externa' : ''}`, this.localTexto(aula.local));
            tdLocal.append(local);
            if (aula.localDescricao) {
                const descricao = document.createElement('small');
                descricao.textContent = aula.localDescricao;
                descricao.style.display = 'block';
                descricao.style.marginTop = '4px';
                descricao.style.color = 'var(--primaria-500)';
                tdLocal.append(descricao);
            }
            const tdVagas = document.createElement('td');
            tdVagas.className = `vagas${aula.vagasOcupadas >= aula.capacidadeMax ? ' lotada' : ''}`;
            tdVagas.textContent = `${aula.vagasOcupadas}/${aula.capacidadeMax}`;
            const tdStatus = document.createElement('td');
            tdStatus.append(this.criarSelo(aula.status, this.statusTexto[aula.status]));
            const tdAcoes = document.createElement('td');
            const acoes = document.createElement('div');
            acoes.className = 'acoes-linha';
            const btnVer = this.criarBotao('Ver', 'botao secundario pequeno');
            btnVer.addEventListener('click', () => void this.abrirDetalhe(aula.id));
            acoes.append(btnVer);
            if (this.gestor()) {
                const btnEditar = this.criarBotao('Editar', 'botao secundario pequeno');
                btnEditar.addEventListener('click', () => void this.abrirEdicao(aula.id));
                const btnExcluir = this.criarBotao('Excluir', 'botao perigo pequeno');
                btnExcluir.addEventListener('click', () => this.abrirExclusao(aula));
                acoes.append(btnEditar, btnExcluir);
            }
            else if (this.aluno()) {
                if (this.minhas.has(aula.id) && !['cancelada', 'concluida'].includes(aula.status)) {
                    const btnCancelar = this.criarBotao('Cancelar', 'botao perigo pequeno');
                    btnCancelar.addEventListener('click', () => void this.cancelarMinhaReserva(aula.id));
                    acoes.append(btnCancelar);
                }
                else if (!this.minhas.has(aula.id) && this.podeReservar(aula)) {
                    const btnReservar = this.criarBotao('Reservar', 'botao verde pequeno');
                    btnReservar.addEventListener('click', () => void this.reservarMe(aula.id));
                    acoes.append(btnReservar);
                }
            }
            tdAcoes.append(acoes);
            tr.append(tdTitulo, tdData, tdInstrutor, tdLocal, tdVagas, tdStatus, tdAcoes);
            return tr;
        };
        this.carregar = async () => {
            this.statusPagina('Carregando aulas...');
            try {
                const filtro = {};
                const data = this.el('filtro-data').value;
                const modalidadeId = Number(this.el('filtro-modalidade').value);
                const instrutorId = Number(this.el('filtro-instrutor').value);
                const status = this.el('filtro-status').value;
                if (data)
                    filtro.data = data;
                if (modalidadeId > 0)
                    filtro.modalidadeId = modalidadeId;
                if (instrutorId > 0)
                    filtro.instrutorId = instrutorId;
                if (status)
                    filtro.status = status;
                this.aulas = (await electron_1.ipcRenderer.invoke('aulas:listar', filtro));
                if (this.aluno()) {
                    const minhas = (await electron_1.ipcRenderer.invoke('aulas:minhas'));
                    this.minhas = new Set(minhas.map((aula) => aula.id));
                }
                else {
                    this.minhas.clear();
                }
                this.el('corpo').replaceChildren(...this.aulas.map(this.criarLinha));
                this.statusPagina(this.aulas.length ? '' : 'Nenhuma aula encontrada para os filtros escolhidos.');
            }
            catch (erro) {
                console.error(erro);
                this.el('corpo').replaceChildren();
                this.statusPagina('Não foi possível carregar as aulas.', true);
            }
        };
        this.carregarAuxiliares = async () => {
            try {
                const modalidades = (await electron_1.ipcRenderer.invoke('modalidades:listar', { ativo: true }));
                const selFiltro = this.el('filtro-modalidade');
                const selForm = this.el('modalidade');
                selFiltro.replaceChildren(this.criarOpcao('', 'Todas'));
                selForm.replaceChildren(this.criarOpcao('', 'Selecione...'));
                for (const modalidade of modalidades) {
                    selFiltro.append(this.criarOpcao(String(modalidade.id), modalidade.nome));
                    selForm.append(this.criarOpcao(String(modalidade.id), modalidade.nome));
                }
                if (!this.gestor())
                    return;
                const instrutores = (await electron_1.ipcRenderer.invoke('instrutores:listar', { ativo: true }));
                const selFiltroInstrutor = this.el('filtro-instrutor');
                const selFormInstrutor = this.el('instrutor');
                selFiltroInstrutor.replaceChildren(this.criarOpcao('', 'Todos'));
                selFormInstrutor.replaceChildren(this.criarOpcao('', 'Selecione...'));
                for (const instrutor of instrutores) {
                    selFiltroInstrutor.append(this.criarOpcao(String(instrutor.id), instrutor.nome));
                    selFormInstrutor.append(this.criarOpcao(String(instrutor.id), instrutor.nome));
                }
                if (this.usuario?.perfil === 'instrutor') {
                    const proprio = instrutores.find((item) => item.usuarioId === this.usuario?.id);
                    this.instrutorId = proprio?.id ?? null;
                }
            }
            catch (erro) {
                console.error(erro);
                this.statusPagina('Não foi possível carregar modalidades e instrutores.', true);
            }
        };
        this.aplicarInstrutorFixo = () => {
            const select = this.el('instrutor');
            if (this.usuario?.perfil !== 'instrutor') {
                select.disabled = false;
                return;
            }
            if (this.instrutorId !== null)
                select.value = String(this.instrutorId);
            select.disabled = true;
        };
        this.limparForm = () => {
            this.el('formulario').reset();
            this.el('aula-id').value = '';
            this.el('erro-formulario').textContent = '';
            this.el('modalidade').value = '';
            this.el('instrutor').value = '';
            this.el('local').value = 'interna';
            this.el('duracao').value = '60';
            this.el('capacidade').value = '15';
        };
        this.abrirNovo = () => {
            if (!this.gestor())
                return;
            this.limparForm();
            this.el('titulo-form').textContent = 'Nova aula';
            this.el('salvar').textContent = 'Cadastrar';
            this.el('campo-status').classList.add('oculto');
            this.el('data-hora').value = this.proximoHorario();
            this.aplicarInstrutorFixo();
            this.el('dialogo-form').showModal();
            this.el('titulo').focus();
        };
        this.abrirEdicao = async (id) => {
            try {
                const aula = (await electron_1.ipcRenderer.invoke('aulas:obter', id));
                if (!aula) {
                    this.statusPagina('Aula não encontrada.', true);
                    return;
                }
                this.limparForm();
                this.el('aula-id').value = String(aula.id);
                this.el('titulo').value = aula.titulo;
                this.el('modalidade').value = String(aula.modalidadeId);
                this.el('instrutor').value = String(aula.instrutorId);
                this.el('data-hora').value = this.paraInputDataHora(aula.dataHoraInicio);
                this.el('duracao').value = String(aula.duracaoMin);
                this.el('capacidade').value = String(aula.capacidadeMax);
                this.el('local').value = aula.local;
                this.el('local-descricao').value = aula.localDescricao ?? '';
                this.el('aula-status').value = aula.status;
                this.el('titulo-form').textContent = `Editar aula — ${aula.titulo}`;
                this.el('salvar').textContent = 'Salvar alterações';
                this.el('campo-status').classList.remove('oculto');
                this.aplicarInstrutorFixo();
                this.el('dialogo-form').showModal();
            }
            catch (erro) {
                console.error(erro);
                this.statusPagina('Não foi possível carregar a aula.', true);
            }
        };
        this.salvar = async (evento) => {
            evento.preventDefault();
            const erro = this.el('erro-formulario');
            const botao = this.el('salvar');
            erro.textContent = '';
            const id = Number(this.el('aula-id').value || '0');
            const dados = {
                modalidadeId: Number(this.el('modalidade').value),
                instrutorId: Number(this.el('instrutor').value),
                titulo: this.el('titulo').value.trim(),
                dataHoraInicio: this.el('data-hora').value,
                duracaoMin: Number(this.el('duracao').value),
                capacidadeMax: Number(this.el('capacidade').value),
                local: this.el('local').value,
                localDescricao: this.el('local-descricao').value.trim() || undefined
            };
            if (!dados.titulo || dados.titulo.length < 2) {
                erro.textContent = 'Informe o título com pelo menos 2 caracteres.';
                return;
            }
            if (!dados.modalidadeId) {
                erro.textContent = 'Selecione a modalidade.';
                return;
            }
            if (!dados.instrutorId) {
                erro.textContent = 'Selecione o instrutor.';
                return;
            }
            if (!dados.dataHoraInicio) {
                erro.textContent = 'Informe a data e a hora de início.';
                return;
            }
            if (!Number.isInteger(dados.duracaoMin) || dados.duracaoMin < 1 || dados.duracaoMin > 600) {
                erro.textContent = 'Informe uma duração entre 1 e 600 minutos.';
                return;
            }
            if (!Number.isInteger(dados.capacidadeMax) || dados.capacidadeMax < 1 || dados.capacidadeMax > 500) {
                erro.textContent = 'Informe uma capacidade entre 1 e 500 alunos.';
                return;
            }
            botao.disabled = true;
            try {
                let resultado;
                if (id > 0) {
                    resultado = (await electron_1.ipcRenderer.invoke('aulas:atualizar', {
                        id,
                        ...dados,
                        localDescricao: dados.localDescricao ?? null,
                        status: this.el('aula-status').value
                    }));
                }
                else {
                    resultado = (await electron_1.ipcRenderer.invoke('aulas:criar', dados));
                }
                if (!resultado.ok) {
                    erro.textContent = resultado.mensagem;
                    return;
                }
                this.el('dialogo-form').close();
                await this.carregar();
                if (this.detalheAtual?.id === id)
                    await this.atualizarDetalhe();
                this.statusPagina(id > 0 ? 'Aula atualizada com sucesso.' : 'Aula cadastrada com sucesso.');
            }
            catch (e) {
                console.error(e);
                erro.textContent = 'Não foi possível salvar a aula.';
            }
            finally {
                botao.disabled = false;
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
        this.preencherDetalhe = (aula) => {
            this.el('titulo-detalhe').textContent = aula.titulo;
            const dl = this.el('detalhes');
            dl.replaceChildren();
            this.detalheItem(dl, 'Modalidade', aula.modalidadeNome);
            this.detalheItem(dl, 'Instrutor', aula.instrutorNome);
            this.detalheItem(dl, 'Início', this.dataHoraFmt(aula.dataHoraInicio));
            this.detalheItem(dl, 'Duração', `${aula.duracaoMin} minutos`);
            this.detalheItem(dl, 'Capacidade', `${aula.capacidadeMax} alunos`);
            this.detalheItem(dl, 'Vagas', `${aula.vagasOcupadas} ocupadas · ${Math.max(0, aula.capacidadeMax - aula.vagasOcupadas)} disponíveis`);
            this.detalheItem(dl, 'Local', this.localTexto(aula.local));
            this.detalheItem(dl, 'Descrição do local', aula.localDescricao || '—');
            this.detalheItem(dl, 'Status', this.statusTexto[aula.status]);
            const gestor = this.gestor();
            this.el('editar-detalhe').classList.toggle('oculto', !gestor);
            this.el('remarcar-detalhe').classList.toggle('oculto', !gestor || ['cancelada', 'concluida'].includes(aula.status));
            this.el('msg-detalhe').textContent = '';
            this.el('msg-detalhe').className = 'msg-info';
            this.renderInscritos(aula);
            void this.consultarClima(aula);
        };
        this.abrirDetalhe = async (id) => {
            try {
                const aula = (await electron_1.ipcRenderer.invoke('aulas:obter', id));
                if (!aula) {
                    this.statusPagina('Aula não encontrada.', true);
                    return;
                }
                this.detalheAtual = aula;
                this.preencherDetalhe(aula);
                const dialogo = this.el('dialogo-detalhe');
                if (!dialogo.open)
                    dialogo.showModal();
            }
            catch (erro) {
                console.error(erro);
                this.statusPagina('Não foi possível carregar a aula.', true);
            }
        };
        this.atualizarDetalhe = async () => {
            if (!this.detalheAtual)
                return;
            try {
                const aula = (await electron_1.ipcRenderer.invoke('aulas:obter', this.detalheAtual.id));
                if (!aula)
                    return;
                this.detalheAtual = aula;
                this.preencherDetalhe(aula);
            }
            catch (erro) {
                console.error(erro);
            }
        };
        this.renderInscritos = (aula) => {
            const gestor = this.gestor();
            const container = this.el('inscritos');
            container.replaceChildren();
            this.el('titulo-inscritos').textContent = gestor ? `Inscritos (${aula.inscritos.length})` : 'Minha reserva';
            this.el('msg-inscritos').textContent = '';
            this.el('msg-inscritos').className = 'msg-info';
            const ativa = !['cancelada', 'concluida'].includes(aula.status);
            if (!aula.inscritos.length) {
                const vazio = document.createElement('p');
                vazio.className = 'inscrito-vazio';
                vazio.textContent = gestor ? 'Nenhum aluno inscrito nesta aula.' : 'Você não possui reserva nesta aula.';
                container.append(vazio);
            }
            else {
                for (const inscricao of aula.inscritos) {
                    const linha = this.criar('div', 'inscrito');
                    const nomeDiv = this.criar('div', 'inscrito-nome');
                    const nome = document.createElement('span');
                    nome.textContent = inscricao.alunoNome;
                    nomeDiv.append(nome, this.criarSelo(inscricao.status, this.inscricaoTexto[inscricao.status]));
                    const acoes = this.criar('div', 'inscrito-acoes');
                    if (gestor) {
                        if (ativa && inscricao.status !== 'cancelada') {
                            const presente = inscricao.status === 'presente';
                            const btnPresenca = this.criarBotao(presente ? 'Marcar falta' : 'Marcar presença', presente ? 'botao secundario pequeno' : 'botao verde pequeno');
                            btnPresenca.addEventListener('click', () => void this.marcarPresenca(inscricao.id, !presente));
                            acoes.append(btnPresenca);
                        }
                        if (ativa && inscricao.status !== 'presente' && inscricao.status !== 'cancelada') {
                            const btnCancelar = this.criarBotao('Cancelar', 'botao perigo pequeno');
                            btnCancelar.addEventListener('click', () => void this.cancelarInscricao(inscricao.id));
                            acoes.append(btnCancelar);
                        }
                    }
                    else if (ativa && inscricao.status !== 'presente' && inscricao.status !== 'cancelada') {
                        const btnCancelar = this.criarBotao('Cancelar reserva', 'botao perigo pequeno');
                        btnCancelar.addEventListener('click', () => void this.cancelarInscricao(inscricao.id));
                        acoes.append(btnCancelar);
                    }
                    if (!acoes.childElementCount)
                        acoes.remove();
                    linha.append(nomeDiv, acoes);
                    container.append(linha);
                }
            }
            if (!gestor && !aula.inscritos.length && this.podeReservar(aula)) {
                const btnReservar = this.criarBotao('Reservar minha vaga', 'botao verde pequeno');
                btnReservar.addEventListener('click', () => void this.reservarMe(aula.id));
                container.append(btnReservar);
            }
            const area = this.el('area-inscrever');
            area.classList.toggle('oculto', !gestor || !ativa);
            if (gestor && ativa)
                void this.carregarAlunos();
        };
        this.carregarAlunos = async () => {
            if (!this.gestor() || this.alunosCarregados)
                return;
            try {
                const alunos = (await electron_1.ipcRenderer.invoke('alunos:listar', { ativo: true }));
                const select = this.el('aluno-inscrever');
                const opcoes = [this.criarOpcao('', 'Selecione um aluno')];
                for (const aluno of alunos)
                    opcoes.push(this.criarOpcao(String(aluno.id), aluno.nome));
                select.replaceChildren(...opcoes);
                this.alunosCarregados = true;
            }
            catch (erro) {
                console.error(erro);
                this.el('aluno-inscrever').replaceChildren(this.criarOpcao('', 'Não foi possível carregar os alunos'));
            }
        };
        this.consultarClima = async (aula) => {
            const bloco = this.el('bloco-clima');
            if (!this.gestor() || aula.local !== 'externa') {
                bloco.classList.add('oculto');
                this.climaConsulta += 1;
                return;
            }
            bloco.classList.remove('oculto');
            const msg = this.el('msg-clima');
            msg.className = 'msg-info';
            msg.textContent = 'Consultando Open-Meteo...';
            const token = ++this.climaConsulta;
            try {
                const resultado = (await electron_1.ipcRenderer.invoke('clima:previsao'));
                if (token !== this.climaConsulta || this.detalheAtual?.id !== aula.id)
                    return;
                if (!resultado.ok) {
                    msg.className = 'msg-info erro';
                    msg.textContent = resultado.mensagem;
                    return;
                }
                const previsao = resultado.previsao;
                const texto = `Amanhã (${this.dataBr(previsao.data)}) em ${resultado.local}: ${previsao.descricao}, ${Math.round(previsao.temperaturaMinC)}–${Math.round(previsao.temperaturaMaxC)} °C, ${previsao.probabilidadeChuva}% de chance de chuva (${previsao.precipitacaoMm} mm).`;
                const mesmaData = aula.dataHoraInicio.slice(0, 10) === previsao.data;
                if (mesmaData && previsao.vaiChover) {
                    msg.className = 'msg-info aviso';
                    msg.textContent = `${texto} Risco de chuva para esta aula externa: considere remarcar ou transferir para a área interna.`;
                }
                else if (mesmaData) {
                    msg.className = 'msg-info sucesso';
                    msg.textContent = `${texto} Sem risco relevante de chuva para esta aula externa.`;
                }
                else {
                    msg.className = 'msg-info';
                    msg.textContent = `${texto} A previsão disponível é a de amanhã; confira novamente na véspera da aula.`;
                }
            }
            catch (erro) {
                if (token !== this.climaConsulta)
                    return;
                console.error(erro);
                msg.className = 'msg-info erro';
                msg.textContent = 'Não foi possível consultar a previsão do tempo.';
            }
        };
        this.marcarPresenca = async (inscricaoId, presente) => {
            const msg = this.el('msg-inscritos');
            msg.className = 'msg-info';
            msg.textContent = presente ? 'Registrando presença...' : 'Registrando falta...';
            try {
                const resultado = (await electron_1.ipcRenderer.invoke('aulas:marcarPresenca', {
                    inscricaoId,
                    presente
                }));
                if (!resultado.ok) {
                    msg.className = 'msg-info erro';
                    msg.textContent = resultado.mensagem;
                    return;
                }
                await this.atualizarDetalhe();
                await this.carregar();
                const atualizada = this.el('msg-inscritos');
                atualizada.className = 'msg-info sucesso';
                atualizada.textContent = presente ? 'Presença registrada com sucesso.' : 'Falta registrada.';
            }
            catch (erro) {
                console.error(erro);
                msg.className = 'msg-info erro';
                msg.textContent = 'Não foi possível registrar a presença.';
            }
        };
        this.cancelarInscricao = async (inscricaoId) => {
            if (!window.confirm('Cancelar esta inscrição?'))
                return;
            const msg = this.el('msg-inscritos');
            msg.className = 'msg-info';
            msg.textContent = 'Cancelando inscrição...';
            try {
                const resultado = (await electron_1.ipcRenderer.invoke('aulas:cancelarInscricao', inscricaoId));
                if (!resultado.ok) {
                    msg.className = 'msg-info erro';
                    msg.textContent = resultado.mensagem;
                    return;
                }
                await this.atualizarDetalhe();
                await this.carregar();
                const atualizada = this.el('msg-inscritos');
                atualizada.className = 'msg-info sucesso';
                atualizada.textContent = 'Inscrição cancelada.';
            }
            catch (erro) {
                console.error(erro);
                msg.className = 'msg-info erro';
                msg.textContent = 'Não foi possível cancelar a inscrição.';
            }
        };
        this.reservarMe = async (aulaId) => {
            try {
                const resultado = (await electron_1.ipcRenderer.invoke('aulas:inscreverMe', { aulaId }));
                if (!resultado.ok) {
                    this.statusPagina(resultado.mensagem, true);
                    const msg = this.el('msg-detalhe');
                    msg.className = 'msg-info erro';
                    msg.textContent = resultado.mensagem;
                    return;
                }
                await this.carregar();
                if (this.detalheAtual?.id === aulaId) {
                    await this.atualizarDetalhe();
                    const msg = this.el('msg-detalhe');
                    msg.className = 'msg-info sucesso';
                    msg.textContent = 'Reserva confirmada com sucesso.';
                }
                this.statusPagina('Reserva confirmada com sucesso.');
            }
            catch (erro) {
                console.error(erro);
                this.statusPagina('Não foi possível reservar a vaga.', true);
            }
        };
        this.cancelarMinhaReserva = async (aulaId) => {
            if (!window.confirm('Cancelar sua reserva nesta aula?'))
                return;
            try {
                const aula = (await electron_1.ipcRenderer.invoke('aulas:obter', aulaId));
                const inscricao = aula?.inscritos.find((item) => item.status !== 'cancelada');
                if (!inscricao) {
                    this.statusPagina('Reserva não encontrada.', true);
                    return;
                }
                const resultado = (await electron_1.ipcRenderer.invoke('aulas:cancelarInscricao', inscricao.id));
                if (!resultado.ok) {
                    this.statusPagina(resultado.mensagem, true);
                    return;
                }
                await this.carregar();
                if (this.detalheAtual?.id === aulaId)
                    await this.atualizarDetalhe();
                this.statusPagina('Reserva cancelada.');
            }
            catch (erro) {
                console.error(erro);
                this.statusPagina('Não foi possível cancelar a reserva.', true);
            }
        };
        this.inscreverAluno = async () => {
            const aula = this.detalheAtual;
            if (!aula)
                return;
            const alunoId = Number(this.el('aluno-inscrever').value);
            const msg = this.el('msg-inscritos');
            if (!alunoId) {
                msg.className = 'msg-info erro';
                msg.textContent = 'Selecione um aluno para inscrever.';
                return;
            }
            msg.className = 'msg-info';
            msg.textContent = 'Inscrevendo aluno...';
            try {
                const resultado = (await electron_1.ipcRenderer.invoke('aulas:inscrever', {
                    aulaId: aula.id,
                    alunoId
                }));
                if (!resultado.ok) {
                    msg.className = 'msg-info erro';
                    msg.textContent = resultado.mensagem;
                    return;
                }
                await this.atualizarDetalhe();
                await this.carregar();
                const atualizada = this.el('msg-inscritos');
                atualizada.className = 'msg-info sucesso';
                atualizada.textContent = 'Aluno inscrito com sucesso.';
            }
            catch (erro) {
                console.error(erro);
                msg.className = 'msg-info erro';
                msg.textContent = 'Não foi possível inscrever o aluno.';
            }
        };
        this.abrirRemarcar = () => {
            if (!this.detalheAtual || !this.gestor())
                return;
            const aula = this.detalheAtual;
            this.el('remarcar-data').value = this.paraInputDataHora(aula.dataHoraInicio);
            this.el('remarcar-local').value = aula.local;
            this.el('remarcar-descricao').value = aula.localDescricao ?? '';
            this.el('erro-remarcar').textContent = '';
            this.el('dialogo-remarcar').showModal();
        };
        this.salvarRemarcar = async (evento) => {
            evento.preventDefault();
            const aula = this.detalheAtual;
            if (!aula)
                return;
            const erro = this.el('erro-remarcar');
            const botao = this.el('salvar-remarcar');
            erro.textContent = '';
            const novaDataHora = this.el('remarcar-data').value;
            if (!novaDataHora) {
                erro.textContent = 'Informe a nova data e hora.';
                return;
            }
            botao.disabled = true;
            try {
                const resultado = (await electron_1.ipcRenderer.invoke('aulas:remarcar', {
                    id: aula.id,
                    novaDataHora,
                    novoLocal: this.el('remarcar-local').value,
                    localDescricao: this.el('remarcar-descricao').value.trim() || null
                }));
                if (!resultado.ok) {
                    erro.textContent = resultado.mensagem;
                    return;
                }
                this.el('dialogo-remarcar').close();
                await this.carregar();
                await this.atualizarDetalhe();
                const msg = this.el('msg-detalhe');
                msg.className = 'msg-info sucesso';
                msg.textContent = 'Aula remarcada com sucesso.';
            }
            catch (e) {
                console.error(e);
                erro.textContent = 'Não foi possível remarcar a aula.';
            }
            finally {
                botao.disabled = false;
            }
        };
        this.abrirExclusao = (aula) => {
            this.aulaParaExcluir = aula;
            this.el('texto-excluir').textContent = `Deseja excluir a aula "${aula.titulo}" de ${this.dataHoraFmt(aula.dataHoraInicio)}? As inscrições vinculadas serão removidas.`;
            this.el('erro-excluir').textContent = '';
            this.el('dialogo-excluir').showModal();
        };
        this.confirmarExclusao = async () => {
            if (!this.aulaParaExcluir)
                return;
            const botao = this.el('confirmar-excluir');
            botao.disabled = true;
            this.el('erro-excluir').textContent = '';
            try {
                const resultado = (await electron_1.ipcRenderer.invoke('aulas:excluir', this.aulaParaExcluir.id));
                if (!resultado.ok) {
                    this.el('erro-excluir').textContent = resultado.mensagem;
                    return;
                }
                const excluida = this.aulaParaExcluir;
                this.el('dialogo-excluir').close();
                if (this.detalheAtual?.id === excluida.id) {
                    this.el('dialogo-detalhe').close();
                    this.detalheAtual = null;
                }
                await this.carregar();
                this.statusPagina(`Aula "${excluida.titulo}" excluída.`);
            }
            catch (erro) {
                console.error(erro);
                this.el('erro-excluir').textContent = 'Não foi possível excluir a aula.';
            }
            finally {
                botao.disabled = false;
            }
        };
        this.limparFiltros = () => {
            this.el('filtro-data').value = '';
            this.el('filtro-modalidade').value = '';
            this.el('filtro-instrutor').value = '';
            this.el('filtro-status').value = '';
            void this.carregar();
        };
        this.voltar = async () => {
            try {
                await electron_1.ipcRenderer.invoke('menu:voltar');
            }
            catch {
                this.statusPagina('Não foi possível voltar ao menu.', true);
            }
        };
        this.iniciar = async () => {
            try {
                this.usuario = (await electron_1.ipcRenderer.invoke('auth:me'));
            }
            catch {
                this.usuario = null;
            }
            if (!this.usuario) {
                this.statusPagina('Sessão inválida. Faça login novamente.', true);
                return;
            }
            const gestor = this.gestor();
            this.el('nova-aula').classList.toggle('oculto', !gestor);
            if (!gestor)
                this.el('campo-filtro-instrutor').classList.add('oculto');
            if (this.admin())
                this.el('campo-filtro-instrutor').classList.remove('oculto');
            this.el('voltar').addEventListener('click', () => void this.voltar());
            this.el('nova-aula').addEventListener('click', this.abrirNovo);
            this.el('limpar-filtros').addEventListener('click', this.limparFiltros);
            this.el('filtro-data').addEventListener('change', () => void this.carregar());
            this.el('filtro-modalidade').addEventListener('change', () => void this.carregar());
            this.el('filtro-instrutor').addEventListener('change', () => void this.carregar());
            this.el('filtro-status').addEventListener('change', () => void this.carregar());
            this.el('formulario').addEventListener('submit', (evento) => void this.salvar(evento));
            this.el('cancelar-form').addEventListener('click', () => this.el('dialogo-form').close());
            this.el('fechar-detalhe').addEventListener('click', () => this.el('dialogo-detalhe').close());
            this.el('editar-detalhe').addEventListener('click', () => {
                if (!this.detalheAtual)
                    return;
                this.el('dialogo-detalhe').close();
                void this.abrirEdicao(this.detalheAtual.id);
            });
            this.el('remarcar-detalhe').addEventListener('click', this.abrirRemarcar);
            this.el('inscrever').addEventListener('click', () => void this.inscreverAluno());
            this.el('form-remarcar').addEventListener('submit', (evento) => void this.salvarRemarcar(evento));
            this.el('cancelar-remarcar').addEventListener('click', () => this.el('dialogo-remarcar').close());
            this.el('cancelar-excluir').addEventListener('click', () => this.el('dialogo-excluir').close());
            this.el('confirmar-excluir').addEventListener('click', () => void this.confirmarExclusao());
            await this.carregarAuxiliares();
            await this.carregar();
        };
    }
}
window.addEventListener('DOMContentLoaded', () => {
    void new AulasView().iniciar();
});
