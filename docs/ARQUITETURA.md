# Arquitetura — Sistema de Gestão de Academia

> Documento de arquitetura do projeto final de DAD.
> Stack: **Electron + TypeScript + HTML/CSS puro + MySQL (`mysql2`)**. Sem framework de UI e sem bundler.
> Este documento descreve a implementação real. Os documentos de requisitos e de arquitetura ficam em `docs/`.

---

## 1. Visão geral e stack

- O processo **main do Electron** (`src/main.ts`) concentra acesso ao MySQL, regras de negócio, integrações externas, sessão e canais IPC.
- A interface é **HTML + CSS**, sem React, Vue, Vite ou Tailwind. Cada tela é composta por um arquivo `<pagina>.html` e um `<pagina>.ts`.
- O `<pagina>.ts` de cada tela é registrado como **preload** em `JanelaApp` e roda com `contextIsolation: true`, `sandbox: true` e `nodeIntegration: false`. Ele manipula o DOM e chama `ipcRenderer.invoke`. As páginas HTML não incluem tags `<script>`.
- O build usa `tsc -p tsconfig.build.json` para gerar `dist/` e, em seguida, copia os arquivos não-`.ts` (HTML) de `src` para `dist`. O `package.json` aponta `main` para `dist/main.js`.
- Configuração por variáveis de ambiente com `dotenv`.
- Dependências de execução: `dotenv`, `mysql2` e `nodemailer`. Dependências de desenvolvimento: `electron`, `tsx`, `typescript`, `@types/node` e `@types/nodemailer`.
- Não existe `database/seed.sql`, framework de testes automatizados nem empacotador/instalador configurado. Os testes do clima são scripts manuais em `scripts/`.

---

## 2. Estrutura de pastas

```text
projeto-final-desktop/
├─ docs/
│  ├─ requisitos.md
│  ├─ ARQUITETURA.md
│  └─ AGENTS.md
├─ database/
│  └─ schema.sql
├─ scripts/
│  ├─ garantir-electron.ts
│  ├─ testar-email.ts
│  ├─ testar-clima.ts
│  ├─ preparar-teste-clima.ts
│  ├─ limpar-teste-clima.ts
│  └─ teste-clima-comum.ts
├─ src/
│  ├─ main.ts
│  ├─ JanelaApp.ts
│  ├─ Sessao.ts
│  ├─ SegurancaIpc.ts
│  ├─ Banco.ts
│  ├─ BancoErros.ts
│  ├─ alunos/
│  │  ├─ AlunoBackend.ts
│  │  ├─ alunos.html
│  │  └─ alunos.ts
│  ├─ aulas/
│  │  ├─ AulaBackend.ts
│  │  ├─ SugestoesExercicios.ts
│  │  ├─ aulas.html
│  │  └─ aulas.ts
│  ├─ autenticacao/
│  │  ├─ AutenticacaoBackend.ts
│  │  ├─ login.html
│  │  └─ login.ts
│  ├─ avaliacoes/
│  │  ├─ AvaliacaoBackend.ts
│  │  ├─ avaliacoes.html
│  │  └─ avaliacoes.ts
│  ├─ exercicios/
│  │  ├─ exercicios.html
│  │  └─ exercicios.ts
│  ├─ feriados/
│  │  ├─ feriados.html
│  │  └─ feriados.ts
│  ├─ funcionarios/
│  │  ├─ FuncionarioBackend.ts
│  │  ├─ funcionarios.html
│  │  └─ funcionarios.ts
│  ├─ integracoes/
│  │  ├─ CepBackend.ts
│  │  ├─ ClimaBackend.ts
│  │  ├─ EmailBackend.ts
│  │  ├─ FeriadosBackend.ts
│  │  └─ WgerBackend.ts
│  ├─ mensagens/
│  │  ├─ AulasAmanha.ts
│  │  ├─ BotClima.ts
│  │  ├─ DecisaoClima.ts
│  │  ├─ DestinatariosAlunos.ts
│  │  ├─ MensagemBackend.ts
│  │  ├─ NotificacaoChuva.ts
│  │  ├─ mensagens.html
│  │  └─ mensagens.ts
│  ├─ menu/
│  │  ├─ MenuBackend.ts
│  │  ├─ menu.html
│  │  └─ menu.ts
│  ├─ notificacoes/
│  │  ├─ BotVencimento.ts
│  │  ├─ NotificacaoBackend.ts
│  │  ├─ notificacoes.html
│  │  └─ notificacoes.ts
│  ├─ pagamentos/
│  │  ├─ Mensalidades.ts
│  │  ├─ PagamentoBackend.ts
│  │  ├─ pagamentos.html
│  │  └─ pagamentos.ts
│  ├─ planos/
│  │  ├─ PlanosBackend.ts
│  │  ├─ planos.html
│  │  └─ planos.ts
│  ├─ portal/
│  │  ├─ portal.html
│  │  └─ portal.ts
│  ├─ presencas/
│  │  └─ PresencaBackend.ts
│  ├─ relatorios/
│  │  ├─ RelatorioBackend.ts
│  │  ├─ relatorios.html
│  │  └─ relatorios.ts
│  ├─ usuarios/
│  │  ├─ UsuarioBackend.ts
│  │  ├─ usuarios.html
│  │  └─ usuarios.ts
│  └─ visitantes/
│     ├─ VisitanteBackend.ts
│     ├─ visitantes.html
│     └─ visitantes.ts
├─ package.json
├─ package-lock.json
├─ tsconfig.json
├─ tsconfig.build.json
├─ .env.example
└─ README.md
```

Observação: a tela do aluno carregada pelo aplicativo é `src/portal/portal.html`. O `portal.html` na raiz não é referenciado por nenhum código.

---

## 3. Processo main, janelas e IPC

### 3.1 Janelas

- `src/main.ts` define a classe `Aplicacao`, que cria uma instância de `JanelaApp` para cada tela: login, menu, relatórios, usuários, funcionários, alunos, aulas, planos, pagamentos, visitantes, avaliações, notificações, portal e bot.
- Ao iniciar, se houver usuário em `Sessao`, abre o menu; caso contrário, abre o login.
- `JanelaApp` carrega o HTML com `janela.loadFile` e define o preload como `<pasta>/<nome>.js`.
- `webPreferences`: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`.
- Links externos só são abertos no navegador do sistema quando usam `https:`; `setWindowOpenHandler` nega novas janelas e `will-navigate` bloqueia navegação para fora.

### 3.2 CSP e permissões

- `session.defaultSession.webRequest.onHeadersReceived` injeta a CSP:
  `default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`.
- `setPermissionRequestHandler` e `setPermissionCheckHandler` negam todas as permissões.
- Cada HTML também declara `default-src 'none'; style-src 'unsafe-inline'` em meta tag.

### 3.3 Sessão e autorização

- `src/Sessao.ts` mantém o usuário da sessão em memória, com `id`, `nome` e `perfil` (`admin`, `instrutor` ou `aluno`).
- `Sessao.exigir(perfis?)` lança erro quando não há sessão ou quando o perfil não está na lista permitida.
- Os canais protegidos chamam `sessao.exigir([...])` antes de executar a operação. A exceção é `auth:login`, que cria a sessão.

### 3.4 Registro de canais

- Todo canal é registrado por `registrarCanal` (`src/SegurancaIpc.ts`), que usa `ipcMain.handle`.
- Antes de chamar o handler, valida o `senderFrame`: precisa ser frame principal, protocolo `file:` e caminho dentro de `path.resolve(__dirname)`. Caso contrário, lança "Origem IPC não autorizada".

---

## 4. Autenticação

- Implementada em `src/autenticacao/AutenticacaoBackend.ts`.
- `Senha` usa `scrypt` do módulo `crypto`, com sal aleatório de 16 bytes e hash de 64 bytes. O formato armazenado é `scrypt:<sal_hex>:<hash_hex>`.
- A verificação usa `timingSafeEqual`.
- `LimitadorTentativas` bloqueia por 5 minutos após 5 tentativas falhas para o mesmo e-mail.
- Quando o e-mail não existe, um hash falso é calculado para evitar diferença de tempo e enumeração de usuários. A mensagem de erro é genérica: "E-mail ou senha inválidos."
- O login bem-sucedido inicia a sessão e atualiza `usuarios.ultimo_login`.
- Canais: `auth:login`, `auth:me` e `auth:sair`.

---

## 5. Módulos e classes principais

- `Banco`: pool `mysql2/promise` compartilhado.
- `BancoErros`: traduz erros do MySQL para mensagens amigáveis (duplicidade, timeout, conexão, tabela ausente, credenciais etc.).
- `Sessao`, `JanelaApp`, `SegurancaIpc`: base do processo main.
- `AutenticacaoBackend.ts`: `Senha`, `LimitadorTentativas`, `UsuarioRepository`, `AutenticacaoServico`, `AutenticacaoIpc`.
- `UsuarioBackend.ts`: `UsuarioRepository`, `UsuarioIpc`.
- `FuncionarioBackend.ts`: `FuncionarioIpc` (instrutores) e `ModalidadeIpc` (modalidades).
- `AlunoBackend.ts`: `AlunoIpc`.
- `AulaBackend.ts`: `AulaIpc`.
- `aulas/SugestoesExercicios.ts`: `SugestoesExercicios`, que busca exercícios no Wger e os mostra nos detalhes da aula.
- `exercicios/` e `feriados/`: `ExerciciosView` e `FeriadosView`, telas de consulta do Wger e da BrasilAPI.
- `PresencaBackend.ts`: `PresencaResumoIpc`.
- `AvaliacaoBackend.ts`: `AvaliacaoIpc`.
- `PlanosBackend.ts`: `PlanoIpc`, `AssinaturaIpc`.
- `PagamentoBackend.ts`: `PagamentoRepository`, `PagamentoIpc` (o arquivo `Mensalidades.ts` contém a lógica de geração de mensalidades).
- `VisitanteBackend.ts`: `VisitanteIpc`.
- `NotificacaoBackend.ts`: `NotificacaoServico`, `NotificacaoIpc` (inclui o envio de vencimentos).
- `BotVencimento.ts`: `ConfiguracaoVencimentoArquivo`, `BotVencimentoServico` (executa ao iniciar e a cada 24 horas).
- `RelatorioBackend.ts`: `RelatorioRepository`, `RelatorioPdf`, `RelatorioIpc`.
- `MenuBackend.ts`: `MenuIpc`, que lista as opções permitidas por perfil.
- `integracoes/`: `CepIpc` + cliente ViaCEP, `FeriadosIpc` + `FeriadoCliente`, `ClimaIpc` + `OpenMeteoClient`, `WgerIpc` + `WgerCliente`, `EmailServico`.
- `mensagens/`: `AulasAmanha`, `AlunoDestinatarios`, `NotificacaoChuvaRepositorio`, `ConfiguracaoBotArquivo`, `BotClimaServico`, `BotClimaIpc`, `MensagemServico`, `AssinadorDecisao`, `DecisaoClimaRepositorio`, `ServidorDecisaoClima`.

---

## 6. Canais IPC existentes

- Autenticação: `auth:login`, `auth:me`, `auth:sair`.
- Menu: `menu:carregar`, `menu:abrir`, `menu:voltar`.
- Usuários: `usuarios:listar`, `usuarios:criar`.
- Instrutores/funcionários: `instrutores:listar`, `instrutores:obter`, `instrutores:criar`, `instrutores:atualizar`, `instrutores:excluir`.
- Modalidades: `modalidades:listar`, `modalidades:criar`, `modalidades:atualizar`, `modalidades:excluir`.
- Alunos: `alunos:listar`, `alunos:obter`, `alunos:criar`, `alunos:atualizar`, `alunos:excluir`, `alunos:meuPerfil`, `alunos:atualizarMeuPerfil`.
- Aulas: `aulas:listar`, `aulas:obter`, `aulas:criar`, `aulas:atualizar`, `aulas:excluir`, `aulas:remarcar`, `aulas:inscrever`, `aulas:inscreverMe`, `aulas:cancelarInscricao`, `aulas:minhas`, `aulas:listaPresenca`, `aulas:marcarPresenca`, `aulas:vagas`.
- Presenças: `presencas:minhas`, `presencas:minhaFrequencia`.
- Avaliações: `avaliacoes:listar`, `avaliacoes:obter`, `avaliacoes:criar`, `avaliacoes:atualizar`, `avaliacoes:excluir`, `avaliacoes:minhas`, `avaliacoes:evolucao`.
- Planos: `planos:listar`, `planos:obter`, `planos:criar`, `planos:atualizar`, `planos:excluir`.
- Assinaturas: `assinaturas:listar`, `assinaturas:obter`, `assinaturas:criar`, `assinaturas:atualizar`, `assinaturas:excluir`, `assinaturas:renovar`, `assinaturas:minha`, `assinaturas:vencendo`.
- Pagamentos: `pagamentos:listar`, `pagamentos:registrar`, `pagamentos:cancelar`, `pagamentos:gerar`, `pagamentos:resumo`.
- Visitantes: `visitantes:listar`, `visitantes:obter`, `visitantes:criar`, `visitantes:atualizar`, `visitantes:excluir`.
- Notificações: `notificacoes:listar`, `notificacoes:minhas`, `notificacoes:excluir`.
- Relatórios: `relatorios:receitas`, `relatorios:exportar-pdf`.
- Bot de clima: `bot:estado`, `bot:verificar`, `bot:definir-ativo`, `bot:definir-intervalo`, `bot:definir-limiar`.
- Clima: `clima:previsao`.
- CEP: `cep:buscar`.
- Feriados: `feriados:listar`, `feriados:verificar`.
- Exercícios: `exercicios:buscar`, `exercicios:obter`.

---

## 7. Banco de dados

- `src/Banco.ts` cria o pool via `createPool` com `DB_HOST`, `DB_PORT` (padrão 3306), `DB_USER`, `DB_PASSWORD` e `DB_NAME`, além de `dateStrings: true`, `connectionLimit: 5`, `connectTimeout: 10000`, `waitForConnections: true`, `queueLimit: 0` e `enableKeepAlive: true`.
- As consultas usam `?` como placeholder e, em geral, `timeout` de 10 segundos.
- `database/schema.sql` define 15 tabelas, todas InnoDB com `utf8mb4_unicode_ci`:
  - `usuarios`: conta de acesso, e-mail único, perfil e hash de senha.
  - `alunos`: dados do aluno, `usuario_id` único e `cpf` único.
  - `instrutores`: dados do instrutor, `usuario_id` único e `cref` único.
  - `modalidades`: catálogo de modalidades.
  - `instrutores_modalidades`: associação N:N.
  - `planos`: planos com duração e valor.
  - `assinaturas`: vínculo aluno/plano com status.
  - `pagamentos`: mensalidades por competência.
  - `lancamentos`: receitas/despesas por categoria (`aula`, `aluguel`, `outros`).
  - `aulas`: turmas, horário, local (`interna`/`externa`), capacidade e status.
  - `inscricoes_aula`: reservas, com unicidade por aula/aluno.
  - `presencas`: check-in, com unicidade por aluno/data.
  - `avaliacoes`: medidas físicas.
  - `visitantes`: aulas experimentais e visitas.
  - `notificacoes`: histórico de avisos de vencimento, chuva, experimental e geral.
- Restrições e índices relevantes: FKs com `CASCADE`, `RESTRICT` ou `SET NULL`; `UNIQUE` em `usuarios.email`, `alunos.cpf`, `alunos.usuario_id`, `instrutores.usuario_id`, `instrutores.cref`, `modalidades.nome`, `planos.nome`, `(aula_id, aluno_id)`, `(aluno_id, data_presenca)` e `(assinatura_id, competencia)`; `CHECK` para `duracao_meses > 0`, `valor >= 0`, `duracao_min > 0` e `capacidade_max > 0`.

---

## 8. Integrações externas

Todas ficam no processo main e usam `fetch` com `AbortSignal.timeout(8000)`.

- **Open-Meteo** (`integracoes/ClimaBackend.ts`): `https://api.open-meteo.com/v1/forecast`, com `forecast_days=2`, fuso `America/Sao_Paulo`, dados diários e horários. Usa os modelos `ecmwf_ifs025`, `gfs_seamless`, `icon_seamless` e `gem_seamless`, combinando os resultados pela mediana. Cache em memória de 30 minutos, com chave baseada no limiar e nas janelas de horário.
- **ViaCEP** (`integracoes/CepBackend.ts`): `https://viacep.com.br/ws/{cep}/json/`, exige 8 dígitos, cache de 24 horas.
- **BrasilAPI Feriados** (`integracoes/FeriadosBackend.ts`): `https://brasilapi.com.br/api/feriados/v1/{ano}`, cache de 24 horas por ano.
- **Wger** (`integracoes/WgerBackend.ts`): `https://wger.de/api/v2/exerciseinfo/?limit=60`, com cache de 30 minutos. A busca por termo é feita localmente sobre o resultado carregado. A tela de aulas reutiliza `exercicios:buscar` por meio de `SugestoesExercicios` para sugerir exercícios pela modalidade; o bloco aparece apenas para `admin` e `instrutor`, perfis autorizados pelo canal.
- **SMTP** (`integracoes/EmailBackend.ts`): Nodemailer com pool (`maxConnections: 3`, `maxMessages: 50`) e timeouts de conexão, saudação e socket. Respeita `SMTP_SECURE`, `SMTP_REQUIRE_TLS` e `SMTP_TLS_REJECT_UNAUTHORIZED`. Os erros são convertidos em mensagens genéricas, sem expor host, usuário ou detalhes de autenticação.

Nenhuma integração usa chave de API no código. As únicas credenciais externas são as de SMTP, vindas do `.env`.

---

## 9. Fluxo do bot de clima

### 9.1 Configuração e agendamento

- `ConfiguracaoBotArquivo` lê e grava `bot-clima.json` em `app.getPath('userData')`.
- Valores: `ativo` (padrão `false`), `intervaloMinutos` (1 a 1440, padrão 30), `limiarChuva` (0 a 100, padrão vindo de `CLIMA_LIMIAR_CHUVA` ou 50) e `ultimaDataAviso`.
- `BotClimaServico` agenda a verificação com `setInterval` e executa uma verificação imediata ao iniciar quando está ativo. Também aceita verificação manual por `bot:verificar`.
- O estado é exposto por `bot:estado`; `bot:definir-limiar` exige perfil `admin`, os demais canais do bot exigem `admin` ou `instrutor`.

### 9.2 Decisão de envio

`MensagemServico.verificar(limiar)` executa:

1. `AulasAmanha.listar()` busca apenas aulas de amanhã com `local = 'externa'` e status `agendada` ou `confirmada`.
2. Se não houver aulas externas, nada é enviado.
3. `OpenMeteoClient.buscar(limiar, janelas)` avalia a probabilidade de chuva no horário real dessas aulas. Se a probabilidade ficar abaixo do limiar, nada é enviado.
4. `AlunoDestinatarios.listarPorAulas()` busca alunos ativos com e-mail válido e inscrição `confirmada` ou `presente` nessas aulas. A lista é deduplicada por aula/e-mail.
5. Se não houver alunos inscritos, nada é enviado.
6. `NotificacaoChuvaRepositorio.existentes()` consulta avisos `tipo = 'chuva'` e `canal = 'email'`; quem já está com status `enviado` é ignorado.
7. Sem SMTP configurado, nenhum aviso é registrado como enviado.
8. Para cada par aula/aluno pendente, `preparar()` cria ou reaproveita uma linha em `notificacoes` com status `pendente`.
9. A notificação do sistema é exibida enquanto a data não estiver consolidada; depois que todos os avisos forem enviados, ela não se repete para a mesma data.
10. É enviado um e-mail por aluno, contendo os links assinados de todas as aulas dele. O status de cada aviso é atualizado para `enviado` ou `falhou`.
11. A data só é consolidada (e salva como `ultimaDataAviso`) quando todos os avisos foram preparados e todos os e-mails foram enviados.

### 9.3 Link de decisão assinado

- `AssinadorDecisao` gera um segredo HMAC de 32 bytes em `bot-clima-decisao.json`, em `app.getPath('userData')`, com permissão `0600` quando possível.
- O token tem o formato `<expiraEm>.<assinatura_hex>`, com validade de 7 dias. A validação compara a assinatura com `timingSafeEqual`.
- `ServidorDecisaoClima` sobe um servidor HTTP local (padrão `127.0.0.1:39517`) com:
  - `GET /clima/:id?t=<token>`: mostra a aula e os botões de decisão.
  - `POST /clima/:id/manter?t=<token>` e `POST /clima/:id/remarcar?t=<token>`: registram a decisão.
- A decisão só é aceita se o aviso existir, a aula estiver em status `agendada`, `confirmada` ou `remarcada` e a inscrição estiver `confirmada` ou `presente`.
- A decisão é gravada em `notificacoes` com `tipo = 'chuva'`, `canal = 'sistema'` e status `enviado`, sem duplicar uma decisão já registrada para a mesma aula/aluno.
- As páginas do servidor de decisão têm CSP própria, com `form-action 'self'`, e escapam o conteúdo HTML.
- Variáveis: `CLIMA_DECISAO_HOST` (padrão `127.0.0.1`), `CLIMA_DECISAO_PORTA` (padrão `39517`), `CLIMA_DECISAO_URL_BASE` (URL usada nos links) e `CLIMA_DECISAO_ARQUIVO` (usada apenas pelos scripts de teste).

---

## 10. Scripts de teste

- `scripts/garantir-electron.ts`: verifica o binário do Electron e executa o instalador quando necessário. É chamado por `postinstall` e `prestart`.
- `scripts/testar-email.ts`: envia um e-mail de teste pelo SMTP configurado.
- `scripts/testar-clima.ts`: executa a mesma verificação do bot, lista as aulas externas de amanhã, tenta portas próximas da configurada quando ela está ocupada e imprime os links de decisão.
- `scripts/preparar-teste-clima.ts`: cria, mediante confirmação, usuário/aluno de teste e uma aula externa para amanhã, tudo marcado com o prefixo `TESTE CLIMA - `.
- `scripts/limpar-teste-clima.ts`: lista e remove, mediante confirmação, os registros marcados com esse prefixo.
- `scripts/teste-clima-comum.ts`: constantes e funções compartilhadas pelos scripts (prefixo, e-mail válido, datas, geração de CPF de teste etc.).

---

## 11. Segurança implementada

- `contextIsolation: true`, `sandbox: true` e `nodeIntegration: false` em todas as janelas.
- CSP restritiva aplicada pelo main; `script-src 'none'`, `connect-src 'none'` e `form-action 'none'` nas telas do aplicativo.
- Negação de todas as permissões do Electron.
- Bloqueio de novas janelas e de navegação; links externos só abrem via `shell.openExternal` quando são `https:`.
- Validação da origem de todo IPC por `registrarCanal`.
- Sessão em memória com checagem de perfil em cada handler.
- Senhas com `scrypt` e comparação em tempo constante; limite de tentativas no login; mensagem genérica para não revelar existência de e-mail.
- Consultas SQL com placeholders `?`; erros do banco traduzidos por `BancoErros`.
- Erros de e-mail sanitizados para não expor host, usuário ou autenticação.
- Links de decisão assinados com HMAC e comparação em tempo constante.
- `.env` fora do Git; `.env.example` documenta as variáveis sem valores reais.

Não há uso de Zod nem de biblioteca de validação de esquema. As validações são feitas manualmente nos handlers/serviços. O hash de senha é `scrypt`, não bcrypt.

---

## 12. Variáveis de ambiente usadas

- Banco: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
- SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_REMETENTE_NOME`, `SMTP_REQUIRE_TLS`, `SMTP_TLS_REJECT_UNAUTHORIZED`.
- Clima: `CLIMA_CIDADE`, `CLIMA_LATITUDE`, `CLIMA_LONGITUDE`, `CLIMA_LIMIAR_CHUVA`.
- Link de decisão: `CLIMA_DECISAO_HOST`, `CLIMA_DECISAO_PORTA`, `CLIMA_DECISAO_URL_BASE`, `CLIMA_DECISAO_ARQUIVO`.

Não há variáveis `ADMIN_*` no código; o primeiro administrador precisa existir diretamente na tabela `usuarios`.

---

## 13. Scripts npm

- `postinstall` e `prestart`: `scripts/garantir-electron.ts`.
- `build`: compila com `tsconfig.build.json` e copia HTML/assets para `dist`.
- `typecheck`: `tsc --noEmit`.
- `start`: build e abertura do Electron.
- `testar-email`, `testar-clima`, `preparar-teste-clima` e `limpar-teste-clima`: scripts manuais descritos na seção 10.

---

## 14. Decisões sobre uso de IA

- IA generativa (OpenCode) é usada como apoio no desenvolvimento (arquitetura, código e documentação), não como componente da aplicação em execução.
- `docs/requisitos.md` e este documento orientam qualquer alteração sugerida pela IA, preservando classes, canais IPC e validações existentes.
- Não há chamadas a modelos de IA em runtime nem envio de dados de alunos para serviços de IA; credenciais ficam somente no `.env` local.
