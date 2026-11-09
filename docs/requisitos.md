# Projeto Final — DAD (Desenvolvimento de Aplicações Desktop)

## Contexto

Este é o projeto final da disciplina. Cada grupo vai receber (por entrevista com o professor) a descrição de um sistema pedido por um “cliente fictício” e terá que, a partir disso, levantar os requisitos, projetar e construir uma aplicação desktop completa.

O uso de IA generativa para ajudar a construir o projeto é permitido e esperado — mas o trabalho precisa ter complexidade suficiente para que copiar e colar respostas de uma IA sem entender o resultado não seja uma opção viável. Por isso os requisitos abaixo são mínimos obrigatórios, não sugestões.

## Requisitos técnicos obrigatórios

1. Banco de dados relacional com no mínimo 6 tabelas relacionadas entre si — relacionamentos reais (chaves estrangeiras), não tabelas soltas sem nenhuma ligação entre elas.
2. CRUD completo (Create, Read, Update, Delete) para todas as entidades do sistema, não só para a tabela principal.
3. Consumo de dados de API em pelo menos 4 situações distintas dentro do fluxo do app. Pode ser API pública já existente, API própria feita pelo próprio grupo, ou uma combinação das duas — mas as 4 situações precisam ser genuinamente diferentes entre si (fontes/finalidades diferentes), e cada uma precisa ter um propósito real dentro do sistema, não existir só para cumprir o requisito.
4. Segurança. O grupo precisa pensar em segurança como parte do projeto, não como item esquecido no fim — por exemplo: senhas nunca em texto puro, validação de entradas, controle de acesso adequado ao domínio do sistema, cuidado com dados sensíveis. Cada grupo deve justificar as decisões de segurança que tomou para o seu sistema específico.
5. Código modularizado em classes. Lógica de negócio organizada em classes (POO), não funções soltas e desorganizadas.
6. Aplicação desktop em Electron, com TypeScript no lugar de JavaScript. Toda a lógica da aplicação deve ser escrita em TypeScript (sem arquivos .js de lógica da aplicação).

## Uso de IA generativa

O uso de IA para ajudar a arquitetar e construir o projeto é incentivado, desde que o grupo entenda e saiba explicar qualquer decisão tomada com ajuda dela. Recomendações:

- Usar o OpenCode (ou outro cliente de IA local equivalente) para arquitetar o projeto antes de começar a codar — não só pedir código pedaço por pedaço sem plano.
- Considerar a criação de agentes especializados e skills reutilizáveis para as tarefas recorrentes do projeto.
- Avaliar, já na fase de arquitetura, se o projeto precisa de:
  - MCP, caso seja necessário conectar a aplicação a algum serviço ou aplicação externa específica;
  - RAG, caso seja necessário que a IA consulte documentos específicos do domínio do projeto.

Essas são recomendações de como tirar melhor proveito da IA como ferramenta de desenvolvimento — não dispensam o grupo de entender a arquitetura final do próprio sistem

---

# Especificação Detalhada de Requisitos do Sistema (Academia)

## 1. Gestão de Alunos e Planos

- Cadastro de Alunos: O sistema deve permitir o cadastro completo dos alunos da academia.
- Tipos de Planos: Suporte a diferentes modalidades de planos, sendo eles mensal, trimestral, semestral e anual.
- Assinatura e Controle de Vínculo: O sistema deve registrar qual plano cada aluno assinou para validação de acesso.
- Controle de Inadimplência: O sistema deve identificar e alertar o gestor sobre alunos com pagamentos atrasados ou em aberto, com foco especial nos planos semestrais e anuais onde o controle manual é mais difícil.
- Notificação de Vencimento: Envio de avisos automáticos para lembrar o aluno sobre a proximidade do vencimento da mensalidade.
- Limite de Frequência Diária: O aluno possui o limite de uma aula por dia. O sistema deve bloquear novas entradas caso o aluno tente frequentar mais de uma vez ou já tenha registrado presença no mesmo dia.
- Aulas Experimentais e Visitantes: Controle para registrar visitas e aulas experimentais, gerando uma lista de presença para acompanhamento.

## 2. Gestão de Instrutores e Aulas

- Cadastro de Instrutores: O sistema deve permitir o cadastro dos profissionais da academia, que ministram múltiplas modalidades (como musculação, funcional, dança, spin, entre outras).
- Vínculo de Aulas: Os instrutores podem cadastrar e gerenciar as aulas e horários que ministram.
- Capacidade de Alunos por Turma: Definição de limites de lotação por aula (por exemplo, limite de 15 alunos por turma de funcional).
- Monitoramento de Previsão do Tempo (Aulas ao Ar Livre):
  - Integração para verificar risco de chuva nos horários das aulas ao ar livre.
  - Envio automático de alerta/e-mail ao aluno 1 dia antes caso haja previsão de chuva.
  - O aluno poderá decidir se cancela ou se a aula será transferida para a área interna.
- Remarcação: Possibilidade de remanejar horários ou adaptar as aulas internas em caso de imprevistos climáticos.

## 3. Acompanhamento Físico (Avaliações)

- Registro de Avaliações Periódicas: O sistema deve armazenar dados de peso, medidas corporais e percentual de gordura coletados periodicamente.
- Histórico de Evolução: Acompanhamento gráfico ou em lista da evolução física do aluno ao longo do tempo.
- Portal do Cliente: O aluno deve conseguir acessar o sistema para consultar o histórico de suas medidas (ex: quanto pesava há 2 meses comparado ao peso atual).
- Lista de Presença e Assiduidade: Registro de presença vinculado às avaliações para que o gestor saiba quais alunos frequentam com mais ou menos frequência, cruzando esses dados com o desempenho físico.

## 4. Gestão Financeira e Relatórios

- Controle de Pagamentos: Registro de mensalidades pagas e status de adimplência por aluno.
- Restrição de Acesso (Privacidade): O módulo financeiro e visualização de pagamentos devem ser exclusivos para o administrador/gestor, ficando ocultos para os instrutores.
- Relatório de Faturamento: Tela de relatórios gerenciais para o gestor acompanhar o faturamento total do mês.

## 5. Notificações e Comunicação

- Avisos de Chuva: E-mail ou alerta enviado aos alunos com antecedência de 1 dia sobre alterações de aulas ao ar livre devido ao clima.
- Lembretes de Cobrança: Alertas automáticos direcionados aos alunos de planos semestrais/anuais ou mensais próximos ao vencimento para reduzir a inadimplência.

## 6. Interface e Requisitos Visuais

- Identidade Visual: O design do sistema deve utilizar primariamente as cores cinza e verde.
  - Justificativa visual: O cinza remete aos equipamentos de metal da academia e o verde remete às aulas ao ar livre.
- Elementos Visuais: Inclusão de ilustrações e ícones que remetam a pessoas fitness e musculação.
