"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MenuIpc = void 0;
const electron_1 = require("electron");
class MenuIpc {
    constructor(sessao, telas, aoVoltar) {
        this.sessao = sessao;
        this.telas = telas;
        this.aoVoltar = aoVoltar;
        this.opcoes = [
            { id: 'relatorios', titulo: 'Relatórios', descricao: 'Receitas por categoria, mensal e anual', perfis: ['admin'] },
            { id: 'bot', titulo: 'Gerenciar Bot', descricao: 'Automação de avisos por clima', perfis: ['admin', 'instrutor'] },
            { id: 'funcionarios', titulo: 'Funcionários', descricao: 'Instrutores e equipe', perfis: ['admin'] },
            { id: 'alunos', titulo: 'Alunos', descricao: 'Cadastro e consulta de alunos', perfis: ['admin', 'instrutor'] },
            { id: 'aulas', titulo: 'Aulas', descricao: 'Agenda, inscrições e presenças', perfis: ['admin', 'instrutor', 'aluno'] },
            { id: 'avaliacoes', titulo: 'Avaliações físicas', descricao: 'Medidas, histórico e evolução dos alunos', perfis: ['admin', 'instrutor'] },
            { id: 'planos', titulo: 'Planos e assinaturas', descricao: 'Planos contratados pelos alunos', perfis: ['admin'] },
            { id: 'pagamentos', titulo: 'Pagamentos', descricao: 'Mensalidades e cobranças', perfis: ['admin'] },
            { id: 'visitantes', titulo: 'Visitantes', descricao: 'Aulas experimentais e visitas', perfis: ['admin', 'instrutor'] },
            { id: 'notificacoes', titulo: 'Notificações', descricao: 'Histórico dos lembretes de vencimento', perfis: ['admin'] },
            { id: 'portal', titulo: 'Meu painel', descricao: 'Minhas medidas, frequência e avisos', perfis: ['aluno'] },
            { id: 'usuarios', titulo: 'Usuários', descricao: 'Cadastro e consulta de usuários', perfis: ['admin'] }
        ];
        this.registrar = () => {
            electron_1.ipcMain.handle('menu:carregar', () => {
                const usuario = this.sessao.exigir();
                return {
                    nome: usuario.nome,
                    perfil: usuario.perfil,
                    opcoes: this.opcoes
                        .filter((opcao) => opcao.perfis.includes(usuario.perfil))
                        .map(({ id, titulo, descricao }) => ({ id, titulo, descricao, disponivel: id in this.telas }))
                };
            });
            electron_1.ipcMain.handle('menu:abrir', (_evento, id) => {
                const usuario = this.sessao.exigir();
                const opcao = this.opcoes.find((item) => item.id === id);
                if (!opcao || !opcao.perfis.includes(usuario.perfil))
                    throw new Error('Acesso negado');
                const abrir = this.telas[opcao.id];
                if (!abrir)
                    return false;
                abrir();
                return true;
            });
            electron_1.ipcMain.handle('menu:voltar', (evento) => {
                this.sessao.exigir();
                const origem = electron_1.BrowserWindow.fromWebContents(evento.sender);
                setImmediate(() => this.aoVoltar(origem));
            });
        };
    }
}
exports.MenuIpc = MenuIpc;
