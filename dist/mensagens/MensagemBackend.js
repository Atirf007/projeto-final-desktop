"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MensagemServico = void 0;
const electron_1 = require("electron");
const ClimaBackend_1 = require("../integracoes/ClimaBackend");
const EmailBackend_1 = require("../integracoes/EmailBackend");
const DestinatariosAlunos_1 = require("./DestinatariosAlunos");
const AulasAmanha_1 = require("./AulasAmanha");
class MensagemServico {
    constructor(clima = new ClimaBackend_1.OpenMeteoClient(), emails = new EmailBackend_1.EmailServico(), destinatarios = new DestinatariosAlunos_1.AlunoDestinatarios(), aulas = new AulasAmanha_1.AulasAmanha()) {
        this.clima = clima;
        this.emails = emails;
        this.destinatarios = destinatarios;
        this.aulas = aulas;
        this.historico = [];
        this.avisosPorData = new Map();
        this.datasAvisadas = new Set();
        this.proximoId = 1;
        this.marcarAvisoAnterior = (data) => {
            if (data)
                this.datasAvisadas.add(data);
        };
        this.emailConfigurado = () => this.emails.configurado();
        this.emailRemetente = () => this.emails.remetenteFormatado();
        this.dataBr = (iso) => {
            const [ano, mes, dia] = iso.split('-');
            return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso;
        };
        this.textoDoAviso = (previsao) => {
            const janela = previsao.janela ? ` no horário das aulas (${previsao.janela})` : '';
            return (`Atenção alunos: a previsão para amanhã (${this.dataBr(previsao.data)}) indica chuva${janela}. ` +
                'Por isso, a aula será realizada dentro da academia, no espaço coberto. ' +
                'Compareça no horário habitual.');
        };
        this.horariosDasAulas = async () => {
            try {
                const horarios = await this.aulas.listar();
                return horarios.length > 0 ? horarios : undefined;
            }
            catch {
                return undefined;
            }
        };
        this.enviarNotificacao = (assunto, texto) => {
            if (!electron_1.Notification.isSupported()) {
                return { status: 'falhou', erro: 'Notificações do sistema não estão disponíveis.' };
            }
            try {
                new electron_1.Notification({ title: assunto, body: texto }).show();
                return { status: 'enviado' };
            }
            catch (erro) {
                return {
                    status: 'falhou',
                    erro: erro instanceof Error ? erro.message : 'Falha ao enviar a notificação.'
                };
            }
        };
        this.enviarEmails = async (assunto, texto) => {
            const lista = await this.destinatarios.listar();
            if (!lista.ok) {
                return {
                    configurado: this.emails.configurado(),
                    total: 0,
                    enviados: 0,
                    falhas: [],
                    erroGeral: lista.mensagem
                };
            }
            return this.emails.enviar(lista.emails, assunto, texto);
        };
        this.montarMotivo = (emails, previsao) => {
            const quando = `para amanhã (${this.dataBr(previsao.data)})`;
            if (!emails.configurado) {
                return (`Previsão de chuva ${quando}: aviso exibido como notificação do sistema. ` +
                    'O envio por e-mail não está configurado (defina SMTP_HOST, SMTP_USER e SMTP_PASS no .env).');
            }
            if (emails.total === 0) {
                return `Previsão de chuva ${quando}, mas nenhum aluno ativo possui e-mail cadastrado.`;
            }
            const alunos = emails.total === 1 ? 'aluno' : 'alunos';
            if (emails.enviados === emails.total) {
                return `Previsão de chuva ${quando}: aviso enviado por e-mail para ${emails.enviados} ${alunos}.`;
            }
            if (emails.enviados > 0) {
                return (`Previsão de chuva ${quando}: aviso enviado para ${emails.enviados} de ${emails.total} ${alunos}. ` +
                    `${emails.falhas.length} envio(s) falharam.`);
            }
            return (`Previsão de chuva ${quando}, mas nenhum e-mail pôde ser enviado. ` +
                (emails.erroGeral ?? 'Verifique as configurações de SMTP.'));
        };
        this.listar = () => [...this.historico].sort((a, b) => b.id - a.id);
        this.verificar = async (limiarChuva = 50) => {
            const numeroLimiar = Number(limiarChuva);
            const limiar = Number.isFinite(numeroLimiar)
                ? Math.min(100, Math.max(0, Math.round(numeroLimiar)))
                : 50;
            const resultado = await this.clima.buscar(limiar, await this.horariosDasAulas());
            if (!resultado.ok) {
                return { ok: false, mensagem: resultado.mensagem, historico: this.listar() };
            }
            const { previsao, local, hoje } = resultado;
            if (!previsao.vaiChover) {
                return {
                    ok: true,
                    local,
                    previsao,
                    hoje,
                    enviada: false,
                    consolidar: false,
                    emails: {
                        configurado: this.emails.configurado(),
                        total: 0,
                        enviados: 0,
                        falhas: []
                    },
                    motivo: `Chance de chuva de ${Math.round(previsao.probabilidadeChuva)}%` +
                        (previsao.janela ? ` no horário das aulas (${previsao.janela})` : '') +
                        ` para amanhã (${this.dataBr(previsao.data)}) abaixo do mínimo configurado (${limiar}%). ` +
                        'Nenhuma mensagem foi enviada.',
                    historico: this.listar()
                };
            }
            const jaEnviada = this.avisosPorData.get(previsao.data);
            if (jaEnviada) {
                return {
                    ok: true,
                    local,
                    previsao,
                    hoje,
                    enviada: false,
                    consolidar: true,
                    emails: {
                        configurado: this.emails.configurado(),
                        total: jaEnviada.destinatarios,
                        enviados: 0,
                        falhas: []
                    },
                    motivo: `O aviso para ${this.dataBr(previsao.data)} já foi enviado nesta sessão.`,
                    mensagem: jaEnviada,
                    historico: this.listar()
                };
            }
            if (this.datasAvisadas.has(previsao.data)) {
                return {
                    ok: true,
                    local,
                    previsao,
                    hoje,
                    enviada: false,
                    consolidar: true,
                    emails: {
                        configurado: this.emails.configurado(),
                        total: 0,
                        enviados: 0,
                        falhas: []
                    },
                    motivo: `O aviso para ${this.dataBr(previsao.data)} já foi enviado anteriormente.`,
                    historico: this.listar()
                };
            }
            const assunto = 'Aula de amanhã será dentro da academia';
            const texto = this.textoDoAviso(previsao);
            const notificacao = this.enviarNotificacao(assunto, texto);
            const emails = await this.enviarEmails(assunto, texto);
            const enviada = emails.configurado ? emails.enviados > 0 : notificacao.status === 'enviado';
            const consolidar = !emails.configurado || emails.total === 0 || emails.enviados > 0;
            const status = enviada ? 'enviado' : 'falhou';
            const mensagem = {
                id: this.proximoId++,
                criadaEm: new Date().toISOString(),
                tipo: 'chuva',
                assunto,
                texto,
                status,
                erro: status === 'falhou' ? emails.erroGeral ?? notificacao.erro : undefined,
                dataAula: previsao.data,
                previsao,
                emailConfigurado: emails.configurado,
                destinatarios: emails.total,
                emailsEnviados: emails.enviados,
                falhasEmail: emails.falhas
            };
            this.historico.push(mensagem);
            this.avisosPorData.set(previsao.data, mensagem);
            if (consolidar)
                this.datasAvisadas.add(previsao.data);
            return {
                ok: true,
                local,
                previsao,
                hoje,
                enviada: status === 'enviado',
                consolidar,
                emails,
                motivo: this.montarMotivo(emails, previsao),
                mensagem,
                historico: this.listar()
            };
        };
    }
}
exports.MensagemServico = MensagemServico;
