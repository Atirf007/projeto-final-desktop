# Arquitetura — Projeto Final DAD

> Este documento descreve a aplicação **implementada**. Ele não é um plano de trabalho: o que está aqui precisa corresponder ao código em `src/`, `database/` e `scripts/`.

## 1. Stack e execução

- Desktop: **Electron 39.8.10**, processo `main` em TypeScript CommonJS (`dist/main.js`).
- Lógica de negócio, repositórios e handlers IPC: **TypeScript** em `src/**/*Backend.ts`.
- Telas: **HTML + CSS no próprio `.html`** e TypeScript compilado como preload de cada janela. Não há framework de UI nem bundler.
- Banco: **MySQL** acessado com `mysql2/promise`. Configuração em `.env` via `dotenv`.
- E-mail: **Nodemailer**. Utilitários de linha de comando: `tsx`.
- Testes unitários: **`node:test`**, executados por `tsx`, sem depender de MySQL.

Scripts relevantes do `package.json`:

- `npm run typecheck` → `tsc --noEmit`.
- `npm run build` → `tsc -p tsconfig.build.json` e cópia dos arquivos não-`.ts` de `src/` para `dist/`.
- `npm start` → build e `electron .`.
- `npm run criar-tabelas`, `npm run popular-tabelas`, `npm run criar-admin`, `npm run criar-funcionario`.
- `npm test` → testes unitários com `node:test`.
- `npm run testar-email`, `npm run testar-clima`, `npm run clima-servidor`, `npm run preparar-teste-clima`, `npm run limpar-teste-clima`.

O banco é definido por `DB_NAME` no `.env`; o `.env.example` documenta as variáveis e credenciais reais não são versionadas. Os scripts de setup (`criar-tabelas`, `popular-tabelas`, `criar-admin`, `criar-funcionario`) não criam o banco nem removem dados fora do escopo documentado. A aplicação não implementa exclusão lógica: quando uma tela oferece **Excluir**, o registro é removido fisicamente, respeitando as chaves estrangeiras. `npm run limpar-teste-clima` remove apenas os registros criados por `npm run preparar-teste-clima`, mediante confirmação.

## 2. Banco de dados

A conexão única está em `src/Banco.ts`:

- `host`, `port`, `user`, `password` e `database` vêm de `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` e `DB_NAME`.
- Pool com `connectionLimit: 5`, `connectTimeout: 10000`, `dateStrings: true`, keep-alive habilitado.

O `database/schema.sql` define **15 tabelas**:

- Cadastros: `usuarios`, `alunos`, `instrutores`, `modalidades`, `instrutores_modalidades`, `planos`.
- Contratos e finanças: `assinaturas`, `pagamentos`, `lancamentos`.
- Operação de aulas: `aulas`, `inscricoes_aula`, `presencas`, `visitantes`.
- Acompanhamento e comunicação: `avaliacoes`, `notificacoes`.

Os relacionamentos são chaves estrangeiras reais, com `ON DELETE` definido no schema; não há cláusula `ON UPDATE` nas chaves estrangeiras. Exemplos: `presencas.aluno_id → alunos.id`, `presencas.aula_id → aulas.id`, `inscricoes_aula.aluno_id → alunos.id`, `aulas.instrutor_id → instrutores.id`, `aulas.modalidade_id → modalidades.id`.

O `database/seed.sql` contém os dados iniciais e é aplicado por `npm run popular-tabelas`. Os usuários iniciais também podem ser criados com `npm run criar-admin` e `npm run criar-funcionario`.

## 3. Estrutura do código

```text
src/
  main.ts                    ponto de entrada, janela de login, menu e módulos
  Banco.ts                   pool mysql2
  BancoErros.ts              tradução de erros do MySQL
  JanelaApp.ts               criação das BrowserWindow
  SegurancaIpc.ts            validação da origem dos eventos IPC
  Sessao.ts                  usuário logado e perfis

  autenticacao/              Senha, Login e AutenticacaoIpc
  alunos/                    cadastro, endereço, ficha
  funcionarios/              instrutores e modalidades
  planos/                    planos e assinaturas
  pagamentos/                pagamentos e inadimplência
  lancamentos/               lançamentos financeiros
  aulas/                     agenda, inscrições e regras de lotação
  presencas/                 presença, listas e resumo
  assiduidade/               indicadores de frequência
  avaliacoes/                medidas e evolução
  visitantes/                visitantes e aulas experimentais
  notificacoes/              avisos e bot de vencimento
  mensagens/                 bot de clima, decisão por e-mail e e-mails
  integracoes/               clima, CEP, feriados e exercícios
  relatorios/                faturamento e relatórios
  usuarios/                  usuários do sistema
  menu/                      navegação entre módulos

  <modulo>/<Nome>Backend.ts  repositório + serviço + registro IPC
  <modulo>/<nome>.ts         código da tela, usa ipcRenderer.invoke
  <modulo>/<nome>.html       markup e estilos da tela

scripts/                     tarefas com tsx
database/schema.sql          DDL
database/seed.sql            dados iniciais
docs/requisitos.md           requisitos do sistema
docs/ARQUITETURA.md          este documento
```

## 4. Telas, janelas e IPC

`src/JanelaApp.ts` cria cada `BrowserWindow` com:

- `preload: dist/<pasta>/<nome>.js` — o TypeScript da tela compilado como preload;
- `loadFile: dist/<pasta>/<nome>.html`;
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`.

O CSP é definido em `src/main.ts`: `script-src 'none'`, estilos inline permitidos, imagens de `self`, `data:`, `file:` e `https://wger.de`, `connect-src 'none'`. Links externos abertos pelas telas são limitados a `https:` e enviados ao navegador padrão.

Todos os handlers são registrados por `registrarCanal`, em `src/SegurancaIpc.ts`. Antes de executar qualquer canal, a função:

1. exige `evento.senderFrame` sem `parent`;
2. exige URL com protocolo `file:`;
3. resolve o caminho e exige que esteja dentro de `dist`;
4. rejeita com `Origem IPC não autorizada` caso contrário.

Não existe lista branca de canais nem API `window.api`. As telas chamam `ipcRenderer.invoke` diretamente, com tratamento de erro local. Canais típicos incluem `auth:login`, `auth:sair`, `alunos:listar`, `aulas:inscrever`, `aulas:marcarPresenca`, `presencas:criar`, `notificacoes:listar`, `clima:previsao` e `bot:verificar`.

## 5. Sessão e autorização

- A classe `Sessao` guarda `UsuarioSessao = { id, nome, perfil }`, com perfis `admin`, `instrutor` e `aluno`.
- **Existe uma única instância**, criada em `Aplicacao` (`src/main.ts`) e injetada nos IPCs.
- Métodos: `iniciar`, `encerrar`, `usuario` e `exigir(perfis?)`. `exigir` lança `Sessão não iniciada` ou `Acesso negado`.
- Não há token persistido, cookie ou sessão no renderer.
- Canais de autenticação: `auth:login`, `auth:me` e `auth:sair`. **Não existe `auth:alterarSenha`**; a redefinição é feita pelo administrador via `*:atualizar` com `novaSenha` (por exemplo, em usuários, alunos ou instrutores).
- Módulos financeiros e de usuários exigem `admin`. Criação/edição de aulas e visitantes aceita `admin` e `instrutor`; inscrições do próprio aluno usam `exigir(['aluno'])`, e consultas gerais usam `exigir()` (qualquer usuário logado).

## 6. Segurança de senha

Implementada em `src/autenticacao/AutenticacaoBackend.ts`:

- `Senha.gerar` usa `crypto.scrypt` com salt aleatório de **16 bytes** e `keylen` **64**.
- Não há parâmetros `N`, `r` ou `p` explícitos no código; valem os padrões do Node.
- Formato armazenado: `scrypt:<salt_em_hex>:<hash_em_hex>`.
- `Senha.verificar` exige exatamente `scrypt:<salt>:<hash>`, com salt de 32 caracteres hex e hash de 128 caracteres hex, antes de usar `timingSafeEqual`.
- Para e-mail inexistente, o serviço deriva um hash falso para reduzir diferença de tempo.
- `LimitadorTentativas` bloqueia após **5 falhas por 5 minutos** por e-mail normalizado; a mensagem ao usuário é genérica: `E-mail ou senha inválidos.`
- O login também tem timeout de 15 s e mensagens específicas para falhas de conexão com o MySQL.

## 7. Regras de negócio de aulas

As regras compartilhadas estão na classe `RegrasAulaService` (`src/aulas/RegrasAula.ts`), com o pool injetado no construtor:

- `executarTransacao` abre conexão do pool, inicia transação, faz commit/rollback e libera a conexão.
- `travarAula` e `travarAluno` usam `SELECT ... FOR UPDATE`.
- `validarUmaAulaPorDia` bloqueia inscrição ou presença em outra aula no mesmo dia; também aceita ignorar a própria presença em edição.
- `contarOcupacao` soma `inscricoes_aula` com status `confirmada`/`presente` e `visitantes` com status `agendado`/`compareceu`.
- `validarCapacidade` impede inscrição, visita ou redução de `capacidade_max` abaixo da ocupação atual.

`AulaRepository` (`src/aulas/AulaBackend.ts`) aplica essas regras em `criar`, `atualizar`, `remarcar`, `inscrever`, `cancelarInscricao`, `excluirInscricao`, `marcarPresenca` e `atualizarStatusInscricao`. Status já registrado como `presente` não pode ser alterado. Mensagens de erro incluem:

- `O aluno já possui aula ou presença registrada nesta data. O limite é de uma aula por dia.`
- `Aula lotada. Não há vagas disponíveis.`
- `A presença já foi registrada; não é possível alterar o status desta inscrição.`

`VisitanteRepository` (`src/visitantes/VisitanteBackend.ts`) valida capacidade em `criar` e `atualizar` dentro da mesma transação. A duplicidade no mesmo dia é verificada por `RegrasAulaService.validarVisitanteUnicoPorDia` (`src/aulas/RegrasAula.ts`): visitantes com status `cancelado` são ignorados, telefone e e-mail normalizados têm prioridade e o nome é comparado apenas quando ambos estão ausentes. A mesma regra também verifica inscrições e presenças de alunos vinculados pelos identificadores informados. Os casos estão cobertos em `tests/regras-aula.test.ts`.

`PresencaRepository` (`src/presencas/PresencaBackend.ts`) usa o mesmo serviço em `criar` e `atualizar`, dentro de transação, antes de gravar ou alterar a presença. O índice único `uk_aluno_data` (`aluno_id`, `data_presenca`) permanece como proteção no banco.

`BotVencimentoServico` (`src/notificacoes/BotVencimento.ts`) marca atrasos, envia lembretes e `NotificacaoServico.registrarAlertaInadimplencia` registra no máximo uma notificação `geral`/`sistema` por dia para cada administrador quando há atrasos ou pendências em aberto. `ResumoInadimplencia` (`src/inadimplencia/InadimplenciaBackend.ts`) separa atrasos superiores a **30 dias**, atrasos leves e pendências em aberto; o alerta distingue esses grupos e inclui valor em atraso, valor em aberto e destaques de alunos. O assunto inclui a data (`Alerta de inadimplência — AAAA-MM-DD`) e o índice único `uk_notificacao_alerta_inadimplencia` (`usuario_id`, `tipo`, `canal`, `assunto`) impede duplicatas. `RegrasInadimplencia` usa janela histórica de **30 dias** para planos mensais/trimestrais e **120 dias** para semestrais/anuais; essa janela não limita o alerta diário ao gestor.

## 8. Bot de clima e decisão do aluno

Fluxo implementado:

1. `BotClimaServico` consulta a previsão e registra avisos de chuva para aulas externas do dia seguinte.
2. `AulasAmanha` seleciona aulas `local = 'externa'`, data de amanhã e status `agendada`/`confirmada`.
3. `DestinatariosAlunos` seleciona alunos com inscrição `confirmada` ou `presente`, `ativo = 1` e e-mail válido.
4. `MensagemServico` envia o e-mail com um link assinado por `AssinadorDecisao` (HMAC, validade de 2 dias).
5. `ServidorDecisaoClima` escuta `CLIMA_DECISAO_HOST`/`CLIMA_DECISAO_PORTA` (padrão `127.0.0.1:39517`) e serve `GET /clima/:id` e `POST /clima/:id/(cancelar|mover)?t=token`.

Em `src/mensagens/DecisaoClima.ts`, `registrarDecisao` roda em transação:

- `cancelar` trava a aula, valida os alunos da turma e executa:

```sql
UPDATE aulas
   SET status = 'cancelada', atualizado_em = NOW()
 WHERE id = ?
```

- `mover` chama `moverParaAreaInterna`, que bloqueia a aula com `FOR UPDATE`, rejeita status `cancelada`/`concluida`, valida capacidade e alunos, e executa:

```sql
UPDATE aulas
   SET local = 'interna', local_descricao = NULL,
       status = 'remarcada', atualizado_em = NOW()
 WHERE id = ?
```

A data e o horário são mantidos. A página do link mostra o local atual, os botões `Cancelar a aula` e `Mover para a área interna` e as confirmações `A aula foi cancelada.` ou `A aula foi movida para a área interna.` A decisão é única por aluno e turma: uma resposta registrada impede uma nova resposta; aulas canceladas ou já internas recebem essa informação, sem duplicar registros e sem excluir linhas. O índice único `uk_notificacao_decisao_clima` (`tipo`, `canal`, `status`, `aula_id`, `usuario_id`, `assunto`) reforça o dedupe no banco; uma colisão concorrente é tratada como decisão já registrada, com rollback da alteração da aula.

## 9. Integrações externas

O app consome quatro APIs com finalidades distintas:

- **Open-Meteo** (`https://api.open-meteo.com/v1/forecast`): risco de chuva nas aulas externas.
- **ViaCEP** (`https://viacep.com.br/ws/<cep>/json/`): preenchimento de endereço de alunos.
- **BrasilAPI** (`https://brasilapi.com.br/api/feriados/v1/<ano>`): feriados para a agenda.
- **Wger** (`https://wger.de/api/v2`): catálogo de exercícios.

Cada integração tem sua classe IPC em `src/integracoes/` e trata falha de rede/resposta inesperada sem derrubar o app.

## 10. O que não existe nesta implementação

Para evitar documentação futura inventada, registre explicitamente o que **não** faz parte do código atual:

- Vite, `electron.vite.config.ts`, React, Tailwind, React Router, Recharts, React Hook Form.
- Zod, envelopes `ApiError`/`SessionUser` compartilhados, `src/shared/`, `src/features/`.
- `contextBridge`, `preload/index.ts`, `window.api`, `src/mocks/`.
- `auth:alterarSenha`, bcrypt, troca de senha pelo próprio usuário.
- `electron-builder`, Vitest, Playwright.
- Bancos criados ou dados apagados automaticamente pelo app.

Se algum desses itens passar a existir, este documento e o código devem ser atualizados juntos.
