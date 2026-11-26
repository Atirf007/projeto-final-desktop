# projeto-final-desktop

Sistema de gestão de academia em Electron, TypeScript e MySQL.

## Como iniciar

1. Preencha `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` e `DB_NAME` no arquivo `.env` (use o `.env.example` como modelo).
2. Rode os comandos:

```
npm install
npm run criar-tabelas
npm run popular-tabelas
npm start
```

`criar-tabelas` aplica `database/schema.sql` e executa migrações idempotentes no banco `DB_NAME` do `.env`, que precisa existir e ser acessível com `DB_USER`. `popular-tabelas` aplica `database/seed.sql`, uma carga de demonstração que cobre as 15 tabelas — inclusive `lancamentos`, usada pelos relatórios.

Para um ambiente sem dados de demonstração, substitua `popular-tabelas` por:

```
npm run criar-admin
npm run criar-funcionario
```

`criar-admin` cria ou atualiza o administrador usando `ADMIN_NOME`, `ADMIN_EMAIL` e `ADMIN_SENHA` do `.env`. `criar-funcionario` cria ou atualiza um usuário com perfil de funcionário (`instrutor`) usando `FUNCIONARIO_NOME`, `FUNCIONARIO_EMAIL` e `FUNCIONARIO_SENHA` do `.env`.

### Dados de demonstração

O seed é idempotente: pode ser reaplicado sem duplicar registros; ele atualiza as linhas de demonstração e recalcula as datas relativas ao dia da execução. Credenciais disponíveis após `npm run popular-tabelas`:

| Perfil | E-mail | Senha |
|---|---|---|
| Administrador | `admin@cotil.unicamp.br` | `Admin@123456` |
| Funcionário (`instrutor`) | `funcionario@exemplo.com` | `Funcionario@123456` |
| Alunos | `aluno1@exemplo.com` a `aluno4@exemplo.com` | `Aluno@123456` |

As senhas são gravadas como hash `scrypt`, no formato `scrypt:<sal>:<hash>`, compatível com `Senha.gerar` em `src/autenticacao/AutenticacaoBackend.ts`. Os usuários-aluno entram no app em **Aulas** (para consultar a agenda e gerenciar apenas a própria reserva) e no **Meu painel**, sem acesso às telas de gestão. Detalhes em `database/README.md`.

O `npm install` baixa o binário do Electron automaticamente. Caso o binário esteja ausente ou corrompido, o `npm start` executa `scripts/garantir-electron` e baixa novamente antes de abrir a aplicação.

## Tela inicial

A janela de login abre em 1200×760 e traz a foto da academia. Para usar a sua foto, salve o arquivo como:

```
src/autenticacao/assets/login-foto.jpg
```

(crie a pasta `assets` se ela não existir) e rode `npm run build` antes de `npm start`. Sem o arquivo, a tela mostra um fundo verde automático no lugar da foto.

O primeiro administrador precisa existir na tabela `usuarios`. A senha é guardada como hash `scrypt`, no formato `scrypt:<sal>:<hash>`. Depois de entrar como administrador, novos usuários são cadastrados pela opção Usuários do menu.

## Permissões

- **Administrador:** acessa todas as telas, incluindo Gerenciar Bot, Relatórios, Funcionários e Lançamentos.
- **Funcionário (`instrutor`):** acessa as telas de rotina (Alunos, Aulas, Avaliações e Visitantes); não acessa Gerenciar Bot, Relatórios, Funcionários, Usuários, Planos, Pagamentos, Notificações nem Lançamentos.
- **Aluno:** consulta a agenda em **Aulas**, inscreve-se ou cancela somente a própria reserva, e usa o **Meu painel** para consulta.

As regras são aplicadas também nos canais IPC, no processo principal — esconder o botão no menu não é a única proteção.

## Bot de clima

A tela **Gerenciar Bot** consulta a previsão do tempo para o dia seguinte usando a API pública Open-Meteo (sem chave de API).

- Ao ativar o bot, ele verifica a previsão no intervalo escolhido (5 minutos a 24 horas) e também faz uma verificação ao iniciar a aplicação.
- Se houver previsão de chuva, o bot envia e-mail para todos os alunos ativos com e-mail cadastrado e também exibe uma notificação do sistema avisando que a aula será realizada dentro da academia.
- O e-mail inclui um link de decisão para o aluno confirmar se comparecerá à aula; a resposta é registrada pelo servidor local do bot.
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
SMTP_TESTE_DESTINATARIO=seu.email@cotil.unicamp.br
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

Dentro do aplicativo, abra **Gerenciar Bot** e clique em **Enviar e-mail de teste**. O destinatário vem de `SMTP_TESTE_DESTINATARIO` (ou de `SMTP_USER`, se não estiver definido).

Outras observações:

- `SMTP_SECURE=true` é usado normalmente na porta 465. Na porta 587 o padrão é `false` com STARTTLS automático.
- Se o servidor exigir STARTTLS obrigatório, use `SMTP_REQUIRE_TLS=true`.
- Se o servidor usar certificado autoassinado, use `SMTP_TLS_REJECT_UNAUTHORIZED=false`.
- Os destinatários são os alunos **ativos** (`alunos.ativo = 1`) com e-mail válido na tabela `usuarios`.
- Sem SMTP configurado, o bot continua exibindo apenas a notificação do sistema e informa na tela que o e-mail não está configurado.
- O botão **Enviar e-mail de teste** usa `SMTP_TESTE_DESTINATARIO` quando definido; caso contrário usa o próprio `SMTP_USER`.

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
- Sem SMTP configurado, os lembretes são registrados como notificações internas (`canal = sistema`), sem e-mail.

## Lançamentos

A tela **Lançamentos**, exclusiva do administrador, faz o cadastro, a edição, a consulta e a exclusão das receitas avulsas nas categorias **Aulas**, **Aluguel** e **Outros**. Os filtros combinam categoria, intervalo de datas e trecho da descrição.

Toda alteração é refletida nos relatórios: `src/relatorios/RelatorioBackend.ts` soma `lancamentos` pela `data_lancamento` dentro do período escolhido. A categoria **Planos** continua sendo calculada a partir de assinaturas e pagamentos e, por isso, não é editável nesta tela.

Antes dessa tela, essas três categorias dependiam apenas dos dados de demonstração; agora o gestor pode mantê-las sem acessar o banco diretamente.

## Relatórios — participação da categoria líder

A tela **Relatórios** trabalha com quatro categorias de receita no período escolhido (mensal ou anual): **Planos**, **Aulas**, **Aluguel** e **Outros**. A **categoria líder** é aquela com o maior valor no período.

A "Participação da líder", mostrada nos indicadores, é calculada assim:

```
participação da líder = (valor da categoria líder / receita total do período) × 100
```

Onde:

```
receita total do período = planos + aulas + aluguel + outros
```

Regras de apresentação:

- O percentual aparece com uma casa decimal e vírgula, por exemplo `80,0%`.
- Se não houver receita no período (`receita total = 0`) ou não houver categorias, o indicador mostra `0,0%`.
- Em caso de empate, vale a ordem **Planos → Aulas → Aluguel → Outros**.
- O cartão **Categoria líder** mostra o nome da categoria e, abaixo, o valor arrecadado por ela.
- No **ranking**, a largura das barras é relativa à líder — a líder ocupa 100% da trilha —, mas o percentual escrito em cada linha continua sendo calculado sobre a receita total do período.

Exemplo:

| Categoria | Valor | Participação no total |
|---|---:|---:|
| Planos | R$ 800,00 | 80,0% |
| Aulas | R$ 150,00 | 15,0% |
| Aluguel | R$ 50,00 | 5,0% |
| Outros | R$ 0,00 | 0,0% |
| **Total** | **R$ 1.000,00** | **100,0%** |

Nesse exemplo, a categoria líder é **Planos** e a participação da líder é **80,0%**.

Origem dos valores:

- **Planos:** soma dos valores dos planos das assinaturas não canceladas iniciadas no período, menos a soma dos pagamentos cancelados dessas assinaturas; o resultado nunca é negativo.
- **Aulas, Aluguel e Outros:** soma dos lançamentos (`lancamentos`) de cada categoria no período.

O cálculo e a formatação ficam em `src/relatorios/relatorios.ts`, nas funções `renderResumo`, `renderRanking` e `renderGrafico`; a consulta ao banco está em `src/relatorios/RelatorioBackend.ts`.

### Visualização e ranking

No campo **Gráfico** é possível alternar entre:

- **Barras** — barras tradicionais, com a barra **Total** em destaque.
- **Blocos** — 100 blocos em uma grade de 20 colunas por 5 linhas; cada bloco equivale a 1% da receita total e é preenchido na ordem Planos → Aulas → Aluguel → Outros. Blocos não preenchidos aparecem quando não há receita no período.

A legenda do gráfico de blocos mostra, para cada categoria, o valor em reais e o percentual sobre o total. As cores são estáveis entre os dois gráficos. PDF e PNG capturam a tela como ela está, incluindo o tipo de gráfico e a visibilidade do ranking; CSV e JSON contêm apenas os dados do período.

O botão **Mostrar ranking** exibe o painel com as categorias ordenadas pela receita; ao clicar novamente, o botão passa a **Ocultar ranking** e o gráfico ocupa toda a largura disponível. A largura da trilha de cada linha do ranking é relativa à categoria líder, enquanto o percentual exibido continua sendo calculado sobre a receita total.

### Exportação

No campo **Formato**, ao lado do botão **Exportar**, é possível escolher:

- **PDF** — impressão em A4 paisagem com os estilos da tela.
- **CSV (Excel)** — separador `;`, decimais com vírgula e BOM UTF-8 para abrir corretamente no Excel.
- **JSON** — dados estruturados com período, receitas, total, participações e categoria líder.
- **Imagem PNG** — captura da janela do relatório.

CSV e JSON usam exatamente os valores carregados para o período selecionado, incluindo totais e participações percentuais.

## Portal do aluno

O perfil **aluno** vê a opção **Meu painel**, somente para consulta, com:

- plano contratado e situação da assinatura;
- frequência dos últimos 90 dias;
- última avaliação física, gráfico de evolução do peso e histórico de medidas;
- presenças recentes;
- avisos recebidos, incluindo os lembretes de vencimento.

O portal não permite editar dados cadastrais, medidas ou avisos.

## Clima sem o Electron

Para rodar o agendador do bot fora da janela do Electron:

```
npm run clima-servidor
```

Os scripts `preparar-teste-clima`, `testar-clima` e `limpar-teste-clima` permitem validar o envio e a decisão do aluno sem depender da interface.
