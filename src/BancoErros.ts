export class BancoErros {
  static mensagem(erro: unknown, padrao: string): string {
    const codigo = (erro as { code?: string }).code ?? ''
    const detalhe = String(
      (erro as { sqlMessage?: string }).sqlMessage ??
        (erro as { message?: string }).message ??
        ''
    )

    if (codigo || detalhe) console.error('[banco]', { codigo, detalhe })

    if (codigo === 'ER_DUP_ENTRY') {
      if (/alunos\.cpf|\bcpf\b/i.test(detalhe)) return 'Já existe um aluno com este CPF.'
      if (/instrutores\.cref/i.test(detalhe)) return 'Já existe um funcionário com este CREF.'
      if (/modalidades\.nome/i.test(detalhe)) return 'Já existe uma modalidade com este nome.'
      if (/planos\.nome/i.test(detalhe)) return 'Já existe um plano com este nome.'
      if (/alunos\.usuario_id|usuario_id/i.test(detalhe)) return 'Este usuário já está vinculado a um aluno.'
      if (/usuarios\.email|\bemail\b/i.test(detalhe)) return 'Já existe um usuário com este e-mail.'
      if (/assinatura_competencia|pagamentos/i.test(detalhe)) return 'Já existe um pagamento para esta assinatura e competência.'
      if (/uk_aluno_data|presencas/i.test(detalhe)) return 'Já existe uma presença registrada para este aluno nesta data.'
      if (/uk_aula_aluno|inscricoes_aula/i.test(detalhe)) return 'Este aluno já está inscrito nesta aula.'
      return 'Já existe um registro com estes dados.'
    }

    if (codigo === 'ER_NO_REFERENCED_ROW_2' || codigo === 'ER_NO_REFERENCED_ROW') {
      return 'O registro vinculado não foi encontrado. Verifique a seleção e tente novamente.'
    }

    if (codigo === 'ER_RECORD_FILE_FULL' || /is full/i.test(detalhe)) {
      return 'O servidor MySQL está sem espaço em disco e não conseguiu concluir a gravação. Avise o administrador do banco de dados.'
    }

    if (['PROTOCOL_SEQUENCE_TIMEOUT', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST'].includes(codigo)) {
      return 'O banco de dados demorou demais para responder. Tente novamente.'
    }

    if (['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'ENETUNREACH', 'ECONNRESET'].includes(codigo)) {
      return 'Não foi possível conectar ao banco de dados. Verifique a rede e o arquivo .env.'
    }

    if (codigo === 'ER_LOCK_WAIT_TIMEOUT') {
      return 'O banco de dados está ocupado no momento. Tente novamente em instantes.'
    }

    if (codigo === 'ER_NO_SUCH_TABLE') {
      return 'A tabela necessária não existe no banco de dados.'
    }

    if (codigo === 'ER_BAD_FIELD_ERROR') {
      return 'Campo inexistente no banco de dados. Execute npm run criar-tabelas.'
    }

    if (
      codigo === 'ER_BAD_NULL_ERROR' ||
      codigo === 'ER_DATA_TOO_LONG' ||
      codigo === 'ER_DATA_OUT_OF_RANGE' ||
      codigo === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD' ||
      codigo === 'ER_WRONG_VALUE_FOR_TYPE'
    ) {
      return 'Dado inválido para o banco de dados. Verifique os campos e tente novamente.'
    }

    if (codigo === 'ER_ACCESS_DENIED_ERROR') {
      return 'O MySQL recusou as credenciais do arquivo .env.'
    }

    if (codigo === 'ER_BAD_DB_ERROR' || codigo === 'ER_DBACCESS_DENIED_ERROR') {
      return 'Não foi possível acessar o banco configurado no arquivo .env.'
    }

    return padrao
  }
}
