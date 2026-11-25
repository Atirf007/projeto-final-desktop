"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
class AvaliacoesView {
    constructor() {
        this.usuario = null;
        this.avaliacoes = [];
        this.alunos = [];
        this.detalheAtual = null;
        this.avaliacaoParaExcluir = null;
        this.el = (id) => document.getElementById(id);
        this.gestor = () => this.usuario?.perfil === 'admin' || this.usuario?.perfil === 'instrutor';
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
        this.dataBr = (valor) => {
            if (!valor)
                return '—';
            const [ano, mes, dia] = String(valor).slice(0, 10).split('-');
            return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
        };
        this.dataCurta = (valor) => {
            const [, mes, dia] = String(valor).slice(0, 10).split('-');
            return dia && mes ? `${dia}/${mes}` : valor;
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
        this.numeroFmt = (valor, sufixo = '') => `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${sufixo}`;
        this.numeroOpcaoFmt = (valor, sufixo = '') => valor === undefined ? '—' : this.numeroFmt(valor, sufixo);
        this.hoje = () => {
            const d = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        };
        this.statusPagina = (texto, erro = false) => {
            const el = this.el('status');
            el.textContent = texto;
            el.classList.toggle('erro', erro);
        };
        this.criarLinha = (avaliacao) => {
            const tr = document.createElement('tr');
            const tdAluno = document.createElement('td');
            tdAluno.className = 'col-nome';
            const nome = document.createElement('strong');
            nome.textContent = avaliacao.alunoNome;
            const instrutor = document.createElement('small');
            instrutor.textContent = avaliacao.instrutorNome
                ? `Avaliado por ${avaliacao.instrutorNome}`
                : 'Sem instrutor vinculado';
            tdAluno.append(nome, instrutor);
            const tdData = document.createElement('td');
            tdData.className = 'col-data';
            tdData.textContent = this.dataBr(avaliacao.dataAvaliacao);
            const tdPeso = document.createElement('td');
            tdPeso.className = 'destaque';
            tdPeso.textContent = this.numeroFmt(avaliacao.pesoKg, ' kg');
            const tdAltura = document.createElement('td');
            tdAltura.textContent = this.numeroFmt(avaliacao.alturaCm, ' cm');
            const tdImc = document.createElement('td');
            tdImc.textContent = this.numeroFmt(avaliacao.imc);
            const tdGordura = document.createElement('td');
            tdGordura.textContent = this.numeroOpcaoFmt(avaliacao.percentualGordura, '%');
            const tdCintura = document.createElement('td');
            tdCintura.textContent = this.numeroOpcaoFmt(avaliacao.cinturaCm, ' cm');
            const tdAcoes = document.createElement('td');
            const acoes = document.createElement('div');
            acoes.className = 'acoes-linha';
            const btnVer = this.criarBotao('Ver', 'botao secundario pequeno');
            btnVer.addEventListener('click', () => void this.abrirDetalhe(avaliacao.id));
            acoes.append(btnVer);
            if (avaliacao.podeEditar) {
                const btnEditar = this.criarBotao('Editar', 'botao secundario pequeno');
                btnEditar.addEventListener('click', () => void this.abrirEdicao(avaliacao.id));
                const btnExcluir = this.criarBotao('Excluir', 'botao perigo pequeno');
                btnExcluir.addEventListener('click', () => this.abrirExclusao(avaliacao));
                acoes.append(btnEditar, btnExcluir);
            }
            tdAcoes.append(acoes);
            tr.append(tdAluno, tdData, tdPeso, tdAltura, tdImc, tdGordura, tdCintura, tdAcoes);
            return tr;
        };
        this.carregarAlunos = async () => {
            const filtro = this.el('filtro-aluno');
            const formulario = this.el('aluno');
            try {
                this.alunos = (await electron_1.ipcRenderer.invoke('alunos:listar', { ativo: true }));
                filtro.replaceChildren(this.criarOpcao('', 'Todos os alunos'), ...this.alunos.map((aluno) => this.criarOpcao(String(aluno.id), aluno.nome)));
                formulario.replaceChildren(this.criarOpcao('', 'Selecione o aluno'), ...this.alunos.map((aluno) => this.criarOpcao(String(aluno.id), aluno.nome)));
            }
            catch (erro) {
                console.error(erro);
                const opcao = this.criarOpcao('', 'Não foi possível carregar os alunos');
                filtro.replaceChildren(opcao);
                formulario.replaceChildren(this.criarOpcao('', 'Não foi possível carregar os alunos'));
            }
        };
        this.carregar = async () => {
            this.statusPagina('Carregando avaliações...');
            try {
                const filtro = {};
                const aluno = this.el('filtro-aluno').value;
                const inicio = this.el('filtro-inicio').value;
                const fim = this.el('filtro-fim').value;
                if (aluno)
                    filtro.alunoId = Number(aluno);
                if (inicio)
                    filtro.inicio = inicio;
                if (fim)
                    filtro.fim = fim;
                this.avaliacoes = (await electron_1.ipcRenderer.invoke('avaliacoes:listar', filtro));
                this.el('corpo').replaceChildren(...this.avaliacoes.map(this.criarLinha));
                this.statusPagina(this.avaliacoes.length ? '' : 'Nenhuma avaliação encontrada para os filtros escolhidos.');
                await this.carregarEvolucao(aluno ? Number(aluno) : null);
            }
            catch (erro) {
                console.error(erro);
                this.el('corpo').replaceChildren();
                this.statusPagina('Não foi possível carregar as avaliações.', true);
            }
        };
        this.svg = (tag, atributos) => {
            const elemento = document.createElementNS('http://www.w3.org/2000/svg', tag);
            for (const [nome, valor] of Object.entries(atributos)) {
                elemento.setAttribute(nome, String(valor));
            }
            return elemento;
        };
        this.desenharGrafico = (pontos) => {
            const container = this.el('grafico');
            container.replaceChildren();
            if (!pontos.length)
                return;
            const largura = 900;
            const altura = 230;
            const margem = { esquerda: 56, direita: 24, topo: 20, base: 36 };
            const larguraUtil = largura - margem.esquerda - margem.direita;
            const alturaUtil = altura - margem.topo - margem.base;
            const pesos = pontos.map((ponto) => ponto.pesoKg);
            let minimo = Math.min(...pesos);
            let maximo = Math.max(...pesos);
            if (minimo === maximo) {
                minimo -= 1;
                maximo += 1;
            }
            const folga = (maximo - minimo) * 0.15;
            minimo -= folga;
            maximo += folga;
            const x = (indice) => pontos.length === 1
                ? margem.esquerda + larguraUtil / 2
                : margem.esquerda + (indice / (pontos.length - 1)) * larguraUtil;
            const y = (valor) => margem.topo + (1 - (valor - minimo) / (maximo - minimo)) * alturaUtil;
            const svg = this.svg('svg', {
                viewBox: `0 0 ${largura} ${altura}`,
                role: 'img',
                'aria-label': 'Gráfico de evolução do peso do aluno'
            });
            for (let i = 0; i <= 4; i++) {
                const valor = minimo + ((maximo - minimo) * i) / 4;
                const linhaY = y(valor);
                svg.append(this.svg('line', {
                    x1: margem.esquerda,
                    x2: largura - margem.direita,
                    y1: linhaY,
                    y2: linhaY,
                    stroke: '#e5e7eb',
                    'stroke-width': 1
                }), this.svg('text', {
                    x: margem.esquerda - 10,
                    y: linhaY + 4,
                    'text-anchor': 'end',
                    'font-size': 11,
                    fill: '#6b7280'
                }));
                const rotulo = svg.lastElementChild;
                rotulo.textContent = valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
            }
            const pontosTexto = pontos.map((ponto, indice) => `${x(indice)},${y(ponto.pesoKg)}`).join(' ');
            svg.append(this.svg('polyline', {
                points: pontosTexto,
                fill: 'none',
                stroke: '#059669',
                'stroke-width': 2.5,
                'stroke-linecap': 'round',
                'stroke-linejoin': 'round'
            }));
            const passo = pontos.length <= 6 ? 1 : Math.ceil(pontos.length / 6);
            pontos.forEach((ponto, indice) => {
                const circulo = this.svg('circle', {
                    cx: x(indice),
                    cy: y(ponto.pesoKg),
                    r: 4,
                    fill: '#ffffff',
                    stroke: '#059669',
                    'stroke-width': 2
                });
                const titulo = this.svg('title', {});
                titulo.textContent = `${this.dataBr(ponto.data)} — ${this.numeroFmt(ponto.pesoKg, ' kg')}`;
                circulo.append(titulo);
                svg.append(circulo);
                if (indice % passo === 0 || indice === pontos.length - 1) {
                    const rotulo = this.svg('text', {
                        x: x(indice),
                        y: altura - 12,
                        'text-anchor': 'middle',
                        'font-size': 11,
                        fill: '#6b7280'
                    });
                    rotulo.textContent = this.dataCurta(ponto.data);
                    svg.append(rotulo);
                }
            });
            container.append(svg);
        };
        this.carregarEvolucao = async (alunoId) => {
            const painel = this.el('evolucao-painel');
            if (alunoId === null) {
                painel.classList.add('oculto');
                return;
            }
            painel.classList.remove('oculto');
            this.el('titulo-evolucao').textContent = 'Evolução do aluno';
            this.el('resumo-evolucao').textContent = '';
            try {
                const serie = (await electron_1.ipcRenderer.invoke('avaliacoes:evolucao', alunoId));
                if (!serie) {
                    this.el('grafico').replaceChildren();
                    this.el('grafico-vazio').classList.remove('oculto');
                    return;
                }
                this.el('titulo-evolucao').textContent = `Evolução de ${serie.alunoNome}`;
                const pontos = serie.pontos;
                if (pontos.length < 2) {
                    this.el('grafico').replaceChildren();
                    this.el('grafico-vazio').classList.remove('oculto');
                    this.el('resumo-evolucao').textContent = `${pontos.length} avaliação registrada`;
                    return;
                }
                const variacao = pontos[pontos.length - 1].pesoKg - pontos[0].pesoKg;
                const sinal = variacao > 0 ? '+' : '';
                this.el('resumo-evolucao').textContent =
                    `${pontos.length} avaliações • variação de ${sinal}${this.numeroFmt(variacao)} kg no período`;
                this.el('grafico-vazio').classList.add('oculto');
                this.desenharGrafico(pontos);
            }
            catch (erro) {
                console.error(erro);
                this.el('grafico').replaceChildren();
                this.el('grafico-vazio').classList.remove('oculto');
            }
        };
        this.limparForm = () => {
            this.el('formulario').reset();
            this.el('avaliacao-id').value = '';
            this.el('erro-formulario').textContent = '';
            this.el('data-avaliacao').value = this.hoje();
            this.el('aluno').disabled = false;
        };
        this.abrirNovo = () => {
            if (!this.gestor())
                return;
            this.limparForm();
            const filtroAluno = this.el('filtro-aluno').value;
            if (filtroAluno)
                this.el('aluno').value = filtroAluno;
            this.el('titulo-form').textContent = 'Nova avaliação';
            this.el('salvar').textContent = 'Registrar';
            this.el('dialogo-form').showModal();
            this.el('aluno').focus();
        };
        this.preencherForm = (avaliacao) => {
            this.limparForm();
            this.el('avaliacao-id').value = String(avaliacao.id);
            const selectAluno = this.el('aluno');
            selectAluno.value = String(avaliacao.alunoId);
            if (!selectAluno.value) {
                selectAluno.append(this.criarOpcao(String(avaliacao.alunoId), avaliacao.alunoNome));
                selectAluno.value = String(avaliacao.alunoId);
            }
            selectAluno.disabled = true;
            this.el('data-avaliacao').value = avaliacao.dataAvaliacao;
            this.el('peso').value = String(avaliacao.pesoKg);
            this.el('altura').value = String(avaliacao.alturaCm);
            this.el('percentual-gordura').value =
                avaliacao.percentualGordura === undefined ? '' : String(avaliacao.percentualGordura);
            this.el('cintura').value =
                avaliacao.cinturaCm === undefined ? '' : String(avaliacao.cinturaCm);
            this.el('quadril').value =
                avaliacao.quadrilCm === undefined ? '' : String(avaliacao.quadrilCm);
            this.el('peito').value =
                avaliacao.peitoCm === undefined ? '' : String(avaliacao.peitoCm);
            this.el('braco').value =
                avaliacao.bracoCm === undefined ? '' : String(avaliacao.bracoCm);
            this.el('coxa').value =
                avaliacao.coxaCm === undefined ? '' : String(avaliacao.coxaCm);
            this.el('observacoes').value = avaliacao.observacoes ?? '';
        };
        this.abrirEdicao = async (id) => {
            try {
                const avaliacao = (await electron_1.ipcRenderer.invoke('avaliacoes:obter', id));
                if (!avaliacao) {
                    this.statusPagina('Avaliação não encontrada.', true);
                    return;
                }
                if (!avaliacao.podeEditar) {
                    this.statusPagina('Você só pode editar avaliações que registrou.', true);
                    return;
                }
                this.preencherForm(avaliacao);
                this.el('titulo-form').textContent = `Editar avaliação — ${avaliacao.alunoNome}`;
                this.el('salvar').textContent = 'Salvar alterações';
                this.el('dialogo-form').showModal();
            }
            catch (erro) {
                console.error(erro);
                this.statusPagina('Não foi possível carregar a avaliação.', true);
            }
        };
        this.numeroDoCampo = (id) => {
            const valor = this.el(id).value.trim();
            if (!valor)
                return null;
            const numero = Number(valor);
            return Number.isFinite(numero) ? numero : null;
        };
        this.salvar = async (evento) => {
            evento.preventDefault();
            const erro = this.el('erro-formulario');
            const botao = this.el('salvar');
            erro.textContent = '';
            const id = Number(this.el('avaliacao-id').value || '0');
            const alunoId = Number(this.el('aluno').value || '0');
            const dataAvaliacao = this.el('data-avaliacao').value;
            const pesoKg = this.numeroDoCampo('peso');
            const alturaCm = this.numeroDoCampo('altura');
            if (!alunoId) {
                erro.textContent = 'Selecione o aluno da avaliação.';
                return;
            }
            if (!dataAvaliacao) {
                erro.textContent = 'Informe a data da avaliação.';
                return;
            }
            if (pesoKg === null || pesoKg < 20 || pesoKg > 400) {
                erro.textContent = 'Informe o peso entre 20 e 400 kg.';
                return;
            }
            if (alturaCm === null || alturaCm < 80 || alturaCm > 250) {
                erro.textContent = 'Informe a altura entre 80 e 250 cm.';
                return;
            }
            const opcionais = {};
            for (const [campo, idCampo] of [
                ['percentualGordura', 'percentual-gordura'],
                ['cinturaCm', 'cintura'],
                ['quadrilCm', 'quadril'],
                ['peitoCm', 'peito'],
                ['bracoCm', 'braco'],
                ['coxaCm', 'coxa']
            ]) {
                const valor = this.numeroDoCampo(idCampo);
                if (this.el(idCampo).value.trim() && valor === null) {
                    erro.textContent = 'Preencha as medidas com números válidos ou deixe em branco.';
                    return;
                }
                opcionais[campo] = valor;
            }
            const observacoes = this.el('observacoes').value.trim();
            botao.disabled = true;
            try {
                let resultado;
                if (id > 0) {
                    resultado = (await electron_1.ipcRenderer.invoke('avaliacoes:atualizar', {
                        id,
                        dataAvaliacao,
                        pesoKg,
                        alturaCm,
                        ...opcionais,
                        observacoes: observacoes || null
                    }));
                }
                else {
                    const dados = {
                        alunoId,
                        dataAvaliacao,
                        pesoKg,
                        alturaCm,
                        observacoes: observacoes || undefined
                    };
                    for (const [campo, valor] of Object.entries(opcionais)) {
                        if (valor !== null)
                            dados[campo] = valor;
                    }
                    resultado = (await electron_1.ipcRenderer.invoke('avaliacoes:criar', dados));
                }
                if (!resultado.ok) {
                    erro.textContent = resultado.mensagem;
                    return;
                }
                this.el('dialogo-form').close();
                await this.carregar();
                if (this.detalheAtual?.id === id)
                    await this.atualizarDetalhe();
                this.statusPagina(id > 0 ? 'Avaliação atualizada com sucesso.' : 'Avaliação registrada com sucesso.');
            }
            catch (e) {
                console.error(e);
                erro.textContent = 'Não foi possível salvar a avaliação.';
            }
            finally {
                botao.disabled = false;
            }
        };
        this.detalheItem = (dl, titulo, valor, span3 = false) => {
            const div = document.createElement('div');
            if (span3)
                div.className = 'span3';
            const dt = document.createElement('dt');
            dt.textContent = titulo;
            const dd = document.createElement('dd');
            dd.textContent = valor && valor.trim() ? valor : '—';
            div.append(dt, dd);
            dl.append(div);
        };
        this.preencherDetalhe = (avaliacao) => {
            this.el('titulo-detalhe').textContent = `${avaliacao.alunoNome} — ${this.dataBr(avaliacao.dataAvaliacao)}`;
            const dl = this.el('detalhes');
            dl.replaceChildren();
            this.detalheItem(dl, 'Peso', this.numeroFmt(avaliacao.pesoKg, ' kg'));
            this.detalheItem(dl, 'Altura', this.numeroFmt(avaliacao.alturaCm, ' cm'));
            this.detalheItem(dl, 'IMC', this.numeroFmt(avaliacao.imc));
            this.detalheItem(dl, '% de gordura', this.numeroOpcaoFmt(avaliacao.percentualGordura, '%'));
            this.detalheItem(dl, 'Cintura', this.numeroOpcaoFmt(avaliacao.cinturaCm, ' cm'));
            this.detalheItem(dl, 'Quadril', this.numeroOpcaoFmt(avaliacao.quadrilCm, ' cm'));
            this.detalheItem(dl, 'Peito', this.numeroOpcaoFmt(avaliacao.peitoCm, ' cm'));
            this.detalheItem(dl, 'Braço', this.numeroOpcaoFmt(avaliacao.bracoCm, ' cm'));
            this.detalheItem(dl, 'Coxa', this.numeroOpcaoFmt(avaliacao.coxaCm, ' cm'));
            this.detalheItem(dl, 'Instrutor', avaliacao.instrutorNome);
            this.detalheItem(dl, 'Registrada em', this.dataHoraFmt(avaliacao.criadoEm));
            this.detalheItem(dl, 'Observações', avaliacao.observacoes, true);
            this.el('editar-detalhe').classList.toggle('oculto', !avaliacao.podeEditar);
        };
        this.abrirDetalhe = async (id) => {
            try {
                const avaliacao = (await electron_1.ipcRenderer.invoke('avaliacoes:obter', id));
                if (!avaliacao) {
                    this.statusPagina('Avaliação não encontrada.', true);
                    return;
                }
                this.detalheAtual = avaliacao;
                this.preencherDetalhe(avaliacao);
                const dialogo = this.el('dialogo-detalhe');
                if (!dialogo.open)
                    dialogo.showModal();
            }
            catch (erro) {
                console.error(erro);
                this.statusPagina('Não foi possível carregar a avaliação.', true);
            }
        };
        this.atualizarDetalhe = async () => {
            if (!this.detalheAtual)
                return;
            try {
                const avaliacao = (await electron_1.ipcRenderer.invoke('avaliacoes:obter', this.detalheAtual.id));
                if (!avaliacao)
                    return;
                this.detalheAtual = avaliacao;
                this.preencherDetalhe(avaliacao);
            }
            catch (erro) {
                console.error(erro);
            }
        };
        this.abrirExclusao = (avaliacao) => {
            if (!avaliacao.podeEditar)
                return;
            this.avaliacaoParaExcluir = avaliacao;
            this.el('texto-excluir').textContent =
                `Deseja excluir a avaliação de ${avaliacao.alunoNome} registrada em ${this.dataBr(avaliacao.dataAvaliacao)}?`;
            this.el('erro-excluir').textContent = '';
            this.el('dialogo-excluir').showModal();
        };
        this.confirmarExclusao = async () => {
            if (!this.avaliacaoParaExcluir)
                return;
            const botao = this.el('confirmar-excluir');
            botao.disabled = true;
            this.el('erro-excluir').textContent = '';
            try {
                const resultado = (await electron_1.ipcRenderer.invoke('avaliacoes:excluir', this.avaliacaoParaExcluir.id));
                if (!resultado.ok) {
                    this.el('erro-excluir').textContent = resultado.mensagem;
                    return;
                }
                const excluida = this.avaliacaoParaExcluir;
                this.el('dialogo-excluir').close();
                if (this.detalheAtual?.id === excluida.id) {
                    this.el('dialogo-detalhe').close();
                    this.detalheAtual = null;
                }
                await this.carregar();
                this.statusPagina(`Avaliação de ${excluida.alunoNome} excluída.`);
            }
            catch (erro) {
                console.error(erro);
                this.el('erro-excluir').textContent = 'Não foi possível excluir a avaliação.';
            }
            finally {
                botao.disabled = false;
            }
        };
        this.limparFiltros = () => {
            this.el('filtro-aluno').value = '';
            this.el('filtro-inicio').value = '';
            this.el('filtro-fim').value = '';
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
            if (!this.gestor()) {
                this.statusPagina('Acesso negado para este perfil.', true);
                return;
            }
            this.el('nova').classList.remove('oculto');
            this.el('voltar').addEventListener('click', () => void this.voltar());
            this.el('nova').addEventListener('click', this.abrirNovo);
            this.el('limpar-filtros').addEventListener('click', this.limparFiltros);
            this.el('filtro-aluno').addEventListener('change', () => void this.carregar());
            this.el('filtro-inicio').addEventListener('change', () => void this.carregar());
            this.el('filtro-fim').addEventListener('change', () => void this.carregar());
            this.el('formulario').addEventListener('submit', (evento) => void this.salvar(evento));
            this.el('cancelar-form').addEventListener('click', () => this.el('dialogo-form').close());
            this.el('fechar-detalhe').addEventListener('click', () => this.el('dialogo-detalhe').close());
            this.el('editar-detalhe').addEventListener('click', () => {
                if (!this.detalheAtual)
                    return;
                this.el('dialogo-detalhe').close();
                void this.abrirEdicao(this.detalheAtual.id);
            });
            this.el('cancelar-excluir').addEventListener('click', () => this.el('dialogo-excluir').close());
            this.el('confirmar-excluir').addEventListener('click', () => void this.confirmarExclusao());
            await this.carregarAlunos();
            await this.carregar();
        };
    }
}
window.addEventListener('DOMContentLoaded', () => {
    void new AvaliacoesView().iniciar();
});
