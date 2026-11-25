# projeto-final-desktop

Sistema de gestão de academia em Electron, TypeScript e MySQL.

## Como iniciar

1. Preencha `DB_USER` e `DB_NAME` no arquivo `.env` (use o `.env.example` como modelo).
2. Rode os dois comandos:

```
npm install
npm start
```

O `npm install` baixa o binário do Electron automaticamente. Caso o binário esteja ausente ou corrompido, o `npm start` executa `scripts/garantir-electron.js` e baixa novamente antes de abrir a aplicação.

O primeiro administrador precisa existir na tabela `usuarios`. A senha é guardada como hash `scrypt`, no formato `scrypt:<sal>:<hash>`. Depois de entrar como administrador, novos usuários são cadastrados pela opção Usuários do menu.

## Bot de clima

A tela **Gerenciar Bot** consulta a previsão do tempo para o dia seguinte usando a API pública Open-Meteo (sem chave de API).

- Ao ativar o bot, ele verifica a previsão no intervalo escolhido (5 minutos a 24 horas) e também faz uma verificação ao iniciar a aplicação.
- Se houver previsão de chuva, o bot envia e-mail para todos os alunos ativos com e-mail cadastrado e também exibe uma notificação do sistema avisando que a aula será realizada dentro da academia.
- Sem previsão de chuva, nenhuma mensagem é enviada.
- A tela também permite verificar o clima manualmente e mostra o histórico de avisos enviados, com a quantidade de e-mails entregues e eventuais falhas.

### Envio de e-mails (SMTP)

Os domínios `@unicamp.br` e `@cotil.unicamp.br` usam **Google Workspace**, então o `.env` já vem apontando para o Gmail:

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
- Os destinatários são os alunos **ativos** (`alunos.ativo = 1`) com e-mail válido na tabela `usuarios`.
- Sem `SMTP_HOST`, `SMTP_USER` e `SMTP_PASS`, o bot continua exibindo apenas a notificação do sistema e informa na tela que o e-mail não está configurado.

Configurações opcionais de clima no `.env`:

```
CLIMA_CIDADE=Limeira - SP
CLIMA_LATITUDE=-22.5645
CLIMA_LONGITUDE=-47.4017
CLIMA_LIMIAR_CHUVA=50
```

O estado do bot (ativo, intervalo e última data avisada) é salvo em `bot-clima.json` na pasta de dados do usuário do Electron.

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
