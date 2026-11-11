"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BancoErros = void 0;
/**
 * Traduz erros do MySQL/mysql2 para mensagens seguras e compreensíveis
 * para o usuário final. Nenhum detalhe interno do banco é exposto na tela.
 */
class BancoErros {
    static mensagem(erro, padrao) {
        const codigo = erro.code ?? '';
        const detalhe = String(erro.sqlMessage ??
            erro.message ??
            '');
        if (codigo === 'ER_DUP_ENTRY') {
            if (/alunos\.cpf|\bcpf\b/i.test(detalhe))
                return 'Já existe um aluno com este CPF.';
            if (/instrutores\.cref/i.test(detalhe))
                return 'Já existe um funcionário com este CREF.';
            if (/modalidades\.nome/i.test(detalhe))
                return 'Já existe uma modalidade com este nome.';
            if (/planos\.nome/i.test(detalhe))
                return 'Já existe um plano com este nome.';
            if (/alunos\.usuario_id|usuario_id/i.test(detalhe))
                return 'Este usuário já está vinculado a um aluno.';
            if (/usuarios\.email|\bemail\b/i.test(detalhe))
                return 'Já existe um usuário com este e-mail.';
            return 'Já existe um registro com estes dados.';
        }
        if (codigo === 'ER_RECORD_FILE_FULL' || /is full/i.test(detalhe)) {
            return 'O servidor MySQL está sem espaço em disco e não conseguiu concluir a gravação. Avise o administrador do banco de dados.';
        }
        if (['PROTOCOL_SEQUENCE_TIMEOUT', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST'].includes(codigo)) {
            return 'O banco de dados demorou demais para responder. Tente novamente.';
        }
        if (['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'ENETUNREACH', 'ECONNRESET'].includes(codigo)) {
            return 'Não foi possível conectar ao banco de dados. Verifique a rede e o arquivo .env.';
        }
        if (codigo === 'ER_LOCK_WAIT_TIMEOUT') {
            return 'O banco de dados está ocupado no momento. Tente novamente em instantes.';
        }
        if (codigo === 'ER_NO_SUCH_TABLE') {
            return 'A tabela necessária não existe no banco de dados.';
        }
        if (codigo === 'ER_ACCESS_DENIED_ERROR') {
            return 'O MySQL recusou as credenciais do arquivo .env.';
        }
        return padrao;
    }
}
exports.BancoErros = BancoErros;
