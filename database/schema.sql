-- Configuração inicial do banco de dados
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `usuarios` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `nome` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `senha_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `perfil` enum('admin','instrutor','aluno') COLLATE utf8mb4_unicode_ci NOT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `ultimo_login` datetime DEFAULT NULL,
  `criado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_perfil_ativo` (`perfil`,`ativo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `alunos` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` bigint unsigned NOT NULL,
  `cpf` char(11) COLLATE utf8mb4_unicode_ci NOT NULL,
  `data_nascimento` date NOT NULL,
  `telefone` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cep` char(8) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `logradouro` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `numero` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `complemento` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bairro` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cidade` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `estado` char(2) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contato_emergencia` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `observacoes_saude` text COLLATE utf8mb4_unicode_ci,
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `criado_em` datetime NOT NULL,
  `atualizado_em` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `usuario_id` (`usuario_id`),
  UNIQUE KEY `cpf` (`cpf`),
  CONSTRAINT `fk_alunos_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `instrutores` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` bigint unsigned NOT NULL,
  `cref` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `bio` text COLLATE utf8mb4_unicode_ci,
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `criado_em` datetime NOT NULL,
  `atualizado_em` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `usuario_id` (`usuario_id`),
  UNIQUE KEY `cref` (`cref`),
  CONSTRAINT `fk_instrutores_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `modalidades` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `nome` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `descricao` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `criado_em` datetime NOT NULL,
  `atualizado_em` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nome` (`nome`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `instrutores_modalidades` (
  `instrutor_id` bigint unsigned NOT NULL,
  `modalidade_id` bigint unsigned NOT NULL,
  PRIMARY KEY (`instrutor_id`,`modalidade_id`),
  KEY `idx_modalidade` (`modalidade_id`),
  CONSTRAINT `fk_im_instrutor` FOREIGN KEY (`instrutor_id`) REFERENCES `instrutores` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_im_modalidade` FOREIGN KEY (`modalidade_id`) REFERENCES `modalidades` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `planos` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `nome` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipo` enum('mensal','trimestral','semestral','anual') COLLATE utf8mb4_unicode_ci NOT NULL,
  `duracao_meses` tinyint unsigned NOT NULL,
  `valor` decimal(10,2) NOT NULL,
  `descricao` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ativo` tinyint(1) NOT NULL DEFAULT '1',
  `criado_em` datetime NOT NULL,
  `atualizado_em` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nome` (`nome`),
  CONSTRAINT `planos_chk_1` CHECK ((`duracao_meses` > 0)),
  CONSTRAINT `planos_chk_2` CHECK ((`valor` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `assinaturas` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `aluno_id` bigint unsigned NOT NULL,
  `plano_id` bigint unsigned NOT NULL,
  `data_inicio` date NOT NULL,
  `data_fim` date NOT NULL,
  `valor_contratado` decimal(10,2) NOT NULL,
  `status` enum('ativa','vencida','cancelada','suspensa') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ativa',
  `criado_em` datetime NOT NULL,
  `atualizado_em` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_aluno_status` (`aluno_id`,`status`),
  KEY `idx_data_fim` (`data_fim`),
  KEY `fk_assinaturas_plano` (`plano_id`),
  CONSTRAINT `fk_assinaturas_aluno` FOREIGN KEY (`aluno_id`) REFERENCES `alunos` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_assinaturas_plano` FOREIGN KEY (`plano_id`) REFERENCES `planos` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pagamentos` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `assinatura_id` bigint unsigned NOT NULL,
  `competencia` date NOT NULL,
  `valor` decimal(10,2) NOT NULL,
  `data_vencimento` date NOT NULL,
  `data_pagamento` date DEFAULT NULL,
  `status` enum('pendente','pago','atrasado','cancelado') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pendente',
  `metodo` enum('dinheiro','pix','cartao','boleto','transferencia') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `observacao` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `criado_em` datetime NOT NULL,
  `atualizado_em` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_assinatura_competencia` (`assinatura_id`,`competencia`),
  KEY `idx_status_vencimento` (`status`,`data_vencimento`),
  KEY `idx_data_pagamento` (`data_pagamento`),
  CONSTRAINT `fk_pagamentos_assinatura` FOREIGN KEY (`assinatura_id`) REFERENCES `assinaturas` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lancamentos` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `categoria` enum('aula','aluguel','outros') COLLATE utf8mb4_unicode_ci NOT NULL,
  `descricao` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `valor` decimal(10,2) NOT NULL,
  `data_lancamento` date NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_lancamentos_data` (`data_lancamento`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `aulas` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `modalidade_id` bigint unsigned NOT NULL,
  `instrutor_id` bigint unsigned NOT NULL,
  `titulo` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `data_hora_inicio` datetime NOT NULL,
  `duracao_min` smallint unsigned NOT NULL,
  `capacidade_max` smallint unsigned NOT NULL,
  `local` enum('interna','externa') COLLATE utf8mb4_unicode_ci NOT NULL,
  `local_descricao` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('agendada','confirmada','cancelada','remarcada','concluida') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'agendada',
  `criado_em` datetime NOT NULL,
  `atualizado_em` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_data_status` (`data_hora_inicio`,`status`),
  KEY `idx_instrutor` (`instrutor_id`),
  KEY `idx_modalidade` (`modalidade_id`),
  CONSTRAINT `fk_aulas_instrutor` FOREIGN KEY (`instrutor_id`) REFERENCES `instrutores` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_aulas_modalidade` FOREIGN KEY (`modalidade_id`) REFERENCES `modalidades` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `aulas_chk_1` CHECK ((`duracao_min` > 0)),
  CONSTRAINT `aulas_chk_2` CHECK ((`capacidade_max` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inscricoes_aula` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `aula_id` bigint unsigned NOT NULL,
  `aluno_id` bigint unsigned NOT NULL,
  `status` enum('confirmada','cancelada','presente','falta') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'confirmada',
  `criado_em` datetime NOT NULL,
  `atualizado_em` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_aula_aluno` (`aula_id`,`aluno_id`),
  KEY `fk_inscricoes_aluno` (`aluno_id`),
  CONSTRAINT `fk_inscricoes_aluno` FOREIGN KEY (`aluno_id`) REFERENCES `alunos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_inscricoes_aula` FOREIGN KEY (`aula_id`) REFERENCES `aulas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `presencas` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `aluno_id` bigint unsigned NOT NULL,
  `aula_id` bigint unsigned DEFAULT NULL,
  `data_presenca` date NOT NULL,
  `origem` enum('aula','livre','experimental') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'aula',
  `criado_em` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_aluno_data` (`aluno_id`,`data_presenca`),
  KEY `fk_presencas_aula` (`aula_id`),
  CONSTRAINT `fk_presencas_aluno` FOREIGN KEY (`aluno_id`) REFERENCES `alunos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_presencas_aula` FOREIGN KEY (`aula_id`) REFERENCES `aulas` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `avaliacoes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `aluno_id` bigint unsigned NOT NULL,
  `instrutor_id` bigint unsigned DEFAULT NULL,
  `data_avaliacao` date NOT NULL,
  `peso_kg` decimal(5,2) NOT NULL,
  `altura_cm` smallint unsigned NOT NULL,
  `percentual_gordura` decimal(5,2) DEFAULT NULL,
  `cintura_cm` decimal(5,2) DEFAULT NULL,
  `quadril_cm` decimal(5,2) DEFAULT NULL,
  `peito_cm` decimal(5,2) DEFAULT NULL,
  `braco_cm` decimal(5,2) DEFAULT NULL,
  `coxa_cm` decimal(5,2) DEFAULT NULL,
  `observacoes` text COLLATE utf8mb4_unicode_ci,
  `criado_em` datetime NOT NULL,
  `atualizado_em` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_aluno_data` (`aluno_id`,`data_avaliacao`),
  KEY `fk_avaliacoes_instrutor` (`instrutor_id`),
  CONSTRAINT `fk_avaliacoes_aluno` FOREIGN KEY (`aluno_id`) REFERENCES `alunos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_avaliacoes_instrutor` FOREIGN KEY (`instrutor_id`) REFERENCES `instrutores` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `visitantes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `nome` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `telefone` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aula_id` bigint unsigned DEFAULT NULL,
  `data_visita` date NOT NULL,
  `tipo` enum('experimental','visitante') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('agendado','compareceu','faltou','convertido') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'agendado',
  `observacoes` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `criado_em` datetime NOT NULL,
  `atualizado_em` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_data_status` (`data_visita`,`status`),
  KEY `fk_visitantes_aula` (`aula_id`),
  CONSTRAINT `fk_visitantes_aula` FOREIGN KEY (`aula_id`) REFERENCES `aulas` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notificacoes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` bigint unsigned DEFAULT NULL,
  `aula_id` bigint unsigned DEFAULT NULL,
  `pagamento_id` bigint unsigned DEFAULT NULL,
  `destinatario_email` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipo` enum('vencimento','chuva','experimental','geral') COLLATE utf8mb4_unicode_ci NOT NULL,
  `canal` enum('email','sistema') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'email',
  `assunto` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mensagem` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('pendente','enviado','falhou') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pendente',
  `erro` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `criado_em` datetime NOT NULL,
  `enviado_em` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_notificacoes_usuario` (`usuario_id`),
  KEY `fk_notificacoes_aula` (`aula_id`),
  KEY `fk_notificacoes_pagamento` (`pagamento_id`),
  UNIQUE KEY `uk_notificacao_decisao_clima` (`tipo`,`canal`,`status`,`aula_id`,`usuario_id`,`assunto`),
  UNIQUE KEY `uk_notificacao_alerta_inadimplencia` (`usuario_id`,`tipo`,`canal`,`assunto`),
  CONSTRAINT `fk_notificacoes_aula` FOREIGN KEY (`aula_id`) REFERENCES `aulas` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_notificacoes_pagamento` FOREIGN KEY (`pagamento_id`) REFERENCES `pagamentos` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_notificacoes_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
