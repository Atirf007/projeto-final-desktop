# Banco de dados

Este diretório versiona os scripts SQL do sistema:

- `schema.sql` — cria as tabelas quando executado por `npm run criar-tabelas`.
- `seed.sql` — carga de demonstração aplicada por `npm run popular-tabelas`.

## Como aplicar

1. Configure `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` e `DB_NAME` no `.env` da raiz. O banco apontado por `DB_NAME` precisa existir e o usuário precisa ter permissão de escrita nele.
2. Rode `npm run criar-tabelas`.
3. Rode `npm run popular-tabelas`.

`scripts/criar-tabelas.ts` e `scripts/popular-tabelas.ts` leem a conexão exclusivamente do `.env` por meio de `src/Banco.ts`. Nenhum script cria outro database nem executa `USE` em um schema diferente de `DB_NAME`.

## Idempotência

O seed usa IDs fixos para as linhas de demonstração e `INSERT ... ON DUPLICATE KEY UPDATE` em todas as tabelas. Reaplicá-lo atualiza as mesmas linhas, sem duplicar registros. As datas são calculadas com `CURDATE()` e `NOW()` a cada execução, então aulas, avaliações e presenças continuam dentro da janela recente usada pelo painel.

Atenção: os IDs reservados para a demonstração são substituídos a cada aplicação. Não execute o seed em um banco de produção.

## Usuários de demonstração

O seed cria contas para os três perfis do sistema:

- administrador: `admin@cotil.unicamp.br`
- instrutores: `funcionario@exemplo.com` e `instrutora2@exemplo.com`
- alunos: `aluno1@exemplo.com` a `aluno4@exemplo.com`

As senhas ficam apenas como hash `scrypt:<sal>:<hash>` no `seed.sql`, gerado com o mesmo algoritmo de `Senha.gerar` (`src/autenticacao/AutenticacaoBackend.ts`): sal aleatório de 16 bytes e chave de 64 bytes. As credenciais de login estão documentadas no `README.md` da raiz; nenhuma senha em texto puro é versionada aqui.

## Dados incluídos

A carga cobre as 15 tabelas do schema: `usuarios`, `alunos`, `instrutores`, `modalidades`, `instrutores_modalidades`, `planos`, `assinaturas`, `pagamentos`, `aulas`, `inscricoes_aula`, `presencas`, `avaliacoes`, `visitantes`, `notificacoes` e `lancamentos`.

O cenário é coerente entre as tabelas: cada aluno tem assinatura ativa, mensalidades, presenças em aulas concluídas e três avaliações físicas ao longo do tempo. O aluno 4 tem uma mensalidade `atrasado` para demonstrar o alerta de inadimplência, e já existe uma notificação interna de exemplo para o administrador.
