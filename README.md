# projeto-final-desktop

Sistema de gestão de academia em Electron, TypeScript e MySQL.

## Como iniciar

1. Preencha `DB_USER` e `DB_NAME` no arquivo `.env` (use o `.env.example` como modelo).
2. Rode os dois comandos:

```
npm install
npm start
```

O Electron já vem na pasta `electron-dist`, que não vai para o GitHub. Quem clonar o repositório e conseguir baixar o Electron roda `npm rebuild electron --ignore-scripts=false` depois do `npm install`.

O primeiro administrador precisa existir na tabela `usuarios`. A senha é guardada como hash `scrypt`, no formato `scrypt:<sal>:<hash>`. Depois de entrar como administrador, novos usuários são cadastrados pela opção Usuários do menu.
