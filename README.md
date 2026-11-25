# projeto-final-desktop

Sistema de gestão de academia em Electron, TypeScript, HTML/CSS e MySQL.

## Como iniciar

1. Preencha `DB_USER` e `DB_NAME` no arquivo `.env` (use o `.env.example` como modelo).
2. Rode os dois comandos:

```
npm install
npm start
```

O `npm install` baixa o binário do Electron automaticamente. Caso o binário esteja ausente ou corrompido, o `npm start` executa `scripts/garantir-electron.ts` e baixa novamente antes de abrir a aplicação.

O primeiro administrador precisa existir na tabela `usuarios`. A senha é guardada como hash `scrypt`, no formato `scrypt:<sal>:<hash>`. Depois de entrar como administrador, novos usuários são cadastrados pela opção Usuários do menu.

## Telas de feriados e exercícios

- `src/feriados/`: consulta os feriados nacionais pela BrasilAPI e verifica uma data específica; o cadastro de aulas avisa quando a data escolhida é feriado.
- `src/exercicios/`: biblioteca de exercícios do Wger com busca por termo e detalhes, disponível para administradores e instrutores.
- A tela de aulas reutiliza essa integração: `src/aulas/SugestoesExercicios.ts` busca exercícios do Wger pela modalidade e mostra sugestões nos detalhes da aula.

## Decisões sobre uso de IA

- IA generativa (OpenCode) apoia arquitetura, código e documentação, mas não faz parte da aplicação em execução.
- `docs/requisitos.md` e `docs/ARQUITETURA.md` são a referência: código sugerido por IA precisa respeitar as classes, o IPC e a segurança existentes.
- Nenhuma credencial ou dado de aluno é enviado a serviços de IA; segredos ficam apenas no `.env` local.

## Bot de clima

A tela **Gerenciar Bot** consulta a previsão do tempo para o dia seguinte usando a API pública Open-Meteo (sem chave de API).

- O bot considera apenas as aulas **ao ar livre** (`local = 'externa'`) de amanhã com status `agendada` ou `confirmada`.
- Ao ativar o bot, ele verifica a previsão no intervalo escolhido (1 minuto a 24 horas) e também faz uma verificação ao iniciar a aplicação.
- A chuva é avaliada no horário real dessas aulas. Sem previsão de chuva acima do limiar configurado, nenhuma mensagem é enviada.
- Havendo risco de chuva, o bot envia e-mail **somente para os alunos ativos inscritos nessas aulas** (inscrição `confirmada` ou `presente`) e com e-mail válido. Não envia para todos os alunos da academia.
- Cada aluno recebe um link assinado (HMAC, válido por 7 dias) para escolher entre manter a aula ou pedir remarcação. As respostas ficam registradas em `notificacoes` (`tipo = 'chuva'`, `canal = 'sistema'`).
- A notificação do sistema é exibida enquanto a data não estiver consolidada; depois que todos os avisos forem enviados, ela não se repete para a mesma data.
- A tela também permite verificar o clima manualmente e mostra o histórico de avisos enviados, com a quantidade de e-mails entregues e eventuais falhas.
- Avisos já enviados para o par aula/aluno não são duplicados; falhas são tentadas novamente no ciclo seguinte.

### Envio de e-mails (SMTP)

Os domínios `@unicamp.br` e `@cotil.unicamp.br` usam **Google Workspace**; o `.env.example` traz um exemplo apontando para o Gmail:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seu.email@cotil.unicamp.br
SMTP_PASS=sua_senha_de_app
SMTP_FROM=seu.email@cotil.unicamp.br
SMTP_REMETENTE_NOME=Academia Cotil
```

Passos para gerar a senha de app:

1. Ative a verificação em duas etapas na conta Google institucional.
2. Acesse **Conta Google → Segurança → Senhas de app**.
3. Crie uma senha para "E-mail" e copie os 16 caracteres (sem espaços) em `SMTP_PASS`.

> Se a instituição bloquear senhas de app, use o relay interno `smtp.unicamp.br` (só funciona dentro da rede da universidade) ou solicite a liberação ao setor de TI.

Para testar o envio sem abrir o app:

```
npm run testar-email
```

O teste envia uma mensagem para o próprio `SMTP_USER`. Para enviar a outro endereço:

```
npm run testar-email outro@email.com
```

Outras observações:

- `SMTP_SECURE=true` é usado normalmente na porta 465. Na porta 587 o padrão é `false` com STARTTLS automático.
- Se o servidor exigir STARTTLS obrigatório, use `SMTP_REQUIRE_TLS=true`.
- Se o servidor usar certificado autoassinado, use `SMTP_TLS_REJECT_UNAUTHORIZED=false`.
- Os destinatários são os alunos **ativos** (`alunos.ativo = 1`), com e-mail válido em `usuarios`, inscritos nas aulas externas de amanhã (`inscricoes_aula.status` `confirmada` ou `presente`).
- Sem `SMTP_HOST`, `SMTP_USER` e `SMTP_PASS`, o bot não envia e-mail nem registra o aviso como enviado; a tela informa que o e-mail não está configurado.

Configurações opcionais de clima no `.env`:

```
CLIMA_CIDADE=Limeira - SP
CLIMA_LATITUDE=-22.5645
CLIMA_LONGITUDE=-47.4017
CLIMA_LIMIAR_CHUVA=50
```

Configurações opcionais do link de decisão:

```
CLIMA_DECISAO_HOST=127.0.0.1
CLIMA_DECISAO_PORTA=39517
CLIMA_DECISAO_URL_BASE=http://127.0.0.1:39517
```

- O servidor de decisão escuta em `127.0.0.1:39517` por padrão. Para o link funcionar em outro computador, configure `CLIMA_DECISAO_HOST` e `CLIMA_DECISAO_URL_BASE` com um endereço acessível e libere a porta; em rede aberta, prefira HTTPS.

O estado do bot (ativo, intervalo, limiar e última data avisada) é salvo em `bot-clima.json` na pasta de dados do usuário do Electron. O segredo HMAC dos links de decisão fica em `bot-clima-decisao.json` na mesma pasta, criado com permissão restrita.

### Testes do bot de clima

```
npm run testar-clima
npm run testar-clima -- 1
npm run preparar-teste-clima -- aluno@exemplo.com
npm run limpar-teste-clima
```

- `testar-clima` executa a mesma verificação do botão "Verificar agora", lista as aulas externas de amanhã e imprime os links de decisão por aluno. O argumento opcional é o limiar de chuva.
- `preparar-teste-clima` cria (com confirmação) usuário/aluno de teste e uma aula externa amanhã, com títulos e observações prefixados por `TESTE CLIMA - `.
- `limpar-teste-clima` lista e remove (com confirmação) os registros marcados com esse prefixo.
- Os scripts usam o mesmo `.env`; o segredo de teste pode ser apontado por `CLIMA_DECISAO_ARQUIVO` (por padrão, um arquivo temporário).

## Lembretes de vencimento

A tela **Notificações** é exclusiva do administrador e mostra o histórico dos lembretes enviados aos alunos.

- O envio é **somente automático**: o bot executa ao iniciar a aplicação e a cada 24 horas.
- São consideradas mensalidades pendentes ou atrasadas com vencimento nos próximos 7 dias (ou vencidas há até 30 dias).
- Cada pagamento não recebe um novo lembrete enquanto houver um envio bem-sucedido nos últimos 7 dias.
- Falhas ficam registradas com o motivo e são tentadas novamente no ciclo seguinte; não existe botão de envio ou reenvio manual.
- Sem SMTP configurado, nenhuma notificação é registrada e a tela informa que o envio está desativado.

## Portal do aluno

O perfil **aluno** vê a opção **Meu painel**, somente para consulta, com:

- plano contratado e situação da assinatura;
- frequência dos últimos 90 dias;
- última avaliação física, gráfico de evolução do peso e histórico de medidas;
- presenças recentes;
- avisos recebidos, incluindo os lembretes de vencimento.

O portal não permite editar dados cadastrais, medidas ou avisos.
