# AGENTS.md — Instruções para agentes de IA

## 1. Orientações iniciais

Este projeto é um sistema desktop desenvolvido com Electron, TypeScript e MySQL.

Antes de realizar qualquer alteração no código, leia obrigatoriamente os seguintes documentos, localizados na raiz do projeto:

- `requisitos.md`
- `ARQUITETURA.md`

Esses documentos são as principais referências para compreender o funcionamento, as funcionalidades e a estrutura do projeto.

Não comece a implementar alterações sem antes compreender os dois documentos.

## 2. Prioridade dos documentos

Cada documento possui uma finalidade específica:

- `requisitos.md`: define as funcionalidades, regras de negócio e comportamentos esperados do sistema.
- `ARQUITETURA.md`: define a organização do código, responsabilidades dos arquivos, comunicação entre os componentes e decisões técnicas.

As implementações devem respeitar os dois documentos simultaneamente.

Caso encontre contradições entre eles ou alguma informação ausente, informe o problema antes de tomar decisões que possam modificar o funcionamento ou a estrutura do projeto.

Não invente requisitos ou decisões arquiteturais.

## 3. Preservação do projeto

- Não remova funcionalidades existentes sem autorização.
- Não altere regras de negócio sem necessidade.
- Não modifique a arquitetura definida em `ARQUITETURA.md` por conveniência.
- Não substitua tecnologias ou bibliotecas sem justificativa.
- Não reescreva arquivos inteiros quando uma alteração pontual for suficiente.
- Preserve os padrões de nomenclatura e organização já utilizados no projeto.
- Evite criar arquivos, pastas ou dependências desnecessárias.

## 4. Desenvolvimento

Ao implementar uma funcionalidade ou corrigir um problema:

1. Analise os arquivos relacionados à alteração.
2. Consulte os requisitos correspondentes em `requisitos.md`.
3. Verifique se a implementação respeita `ARQUITETURA.md`.
4. Explique brevemente o que pretende alterar.
5. Faça as modificações necessárias, preservando o restante do projeto.
6. Verifique se a alteração não prejudicou funcionalidades existentes.

Não faça alterações fora do escopo solicitado.

## 5. Banco de dados

- Respeite a estrutura e as regras de acesso ao banco de dados definidas na arquitetura.
- Preserve a compatibilidade com o MySQL.
- Não altere tabelas, colunas ou relacionamentos sem verificar os requisitos.
- Não exponha senhas, credenciais ou informações sensíveis.
- Utilize as configurações de ambiente existentes quando necessário.

## 6. Segurança e qualidade

- Valide os dados recebidos pelos formulários.
- Trate erros de operações e de comunicação com o banco de dados.
- Evite inserir dados diretamente no HTML sem tratamento adequado.
- Preserve as medidas de segurança já implementadas no Electron.
- Não desative validações ou proteções para contornar erros.

## 7. Testes e validação

Após realizar alterações:

- Verifique se os arquivos TypeScript compilam corretamente.
- Execute `npm run build` quando aplicável.
- Verifique se os caminhos e importações continuam corretos.
- Teste o funcionamento da funcionalidade alterada sempre que possível.
- Informe claramente os testes realizados e os que não puderam ser executados.

Não afirme que algo foi testado se não foi.

## 8. Documentação

Se uma alteração modificar efetivamente algum requisito ou decisão arquitetural:

- Atualize `requisitos.md` quando houver mudança nos requisitos funcionais ou regras de negócio.
- Atualize `ARQUITETURA.md` quando houver mudança na estrutura ou nas decisões técnicas.

Não altere esses documentos apenas para registrar pequenas mudanças de implementação que não modificam seu conteúdo.

## 9. Comunicação

Ao finalizar uma tarefa, apresente:

- O que foi alterado.
- Quais arquivos foram modificados.
- Como a alteração atende aos requisitos.
- Se a arquitetura existente foi preservada.
- Quais testes foram realizados.
- Se existe algum problema pendente.

Priorize soluções simples, consistentes com o projeto e que não introduzam complexidade desnecessária.