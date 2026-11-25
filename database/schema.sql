-- Configuração inicial do banco de dados
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Tabela: usuarios
CREATE TABLE IF NOT EXISTS `usuarios` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nome` VARCHAR(120) NOT NULL,
  `email` VARCHAR(160) NOT NULL UNIQUE,
  `senha_hash` VARCHAR(255) NOT NULL,
  `perfil` ENUM('admin', 'instrutor', 'aluno') NOT NULL,
  `ativo` BOOLEAN NOT NULL DEFAULT TRUE,
  `ultimo_login` DATETIME NULL,
  `criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_perfil_ativo` (`perfil`, `ativo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabela: alunos
CREATE TABLE IF NOT EXISTS `alunos` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `usuario_id` BIGINT UNSIGNED NOT NULL UNIQUE,
  `cpf` CHAR(11) NOT NULL UNIQUE,
  `data_nascimento` DATE NOT NULL,
  `telefone` VARCHAR(20) NOT NULL,
  `cep` CHAR(8) NULL,
  `logradouro` VARCHAR(160) NULL,
  `numero` VARCHAR(20) NULL,
  `complemento` VARCHAR(80) NULL,
  `bairro` VARCHAR(80) NULL,
  `cidade` VARCHAR(80) NULL,
  `estado` CHAR(2) NULL,
  `contato_emergencia` VARCHAR(120) NULL,
  `observacoes_saude` TEXT NULL,
  `ativo` BOOLEAN NOT NULL DEFAULT TRUE,
  `criado_em` DATETIME NOT NULL,
  `atualizado_em` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_alunos_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabela: instrutores
CREATE TABLE IF NOT EXISTS `instrutores` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `usuario_id` BIGINT UNSIGNED NOT NULL UNIQUE,
  `cref` VARCHAR(30) NOT NULL UNIQUE,
  `bio` TEXT NULL,
  `ativo` BOOLEAN NOT NULL DEFAULT TRUE,
  `criado_em` DATETIME NOT NULL,
  `atualizado_em` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_instrutores_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Tabela: modalidades
CREATE TABLE IF NOT EXISTS `modalidades` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nome` VARCHAR(80) NOT NULL UNIQUE,
  `descricao` VARCHAR(255) NULL,
  `ativo` BOOLEAN NOT NULL DEFAULT TRUE,
  `criado_em` DATETIME NOT NULL,
  `atualizado_em` DATETIME NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Tabela: instrutores_modalidades
CREATE TABLE IF NOT EXISTS `instrutores_modalidades` (
  `instrutor_id` BIGINT UNSIGNED NOT NULL,
  `modalidade_id` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`instrutor_id`, `modalidade_id`),
  INDEX `idx_modalidade` (`modalidade_id`),
  CONSTRAINT `fk_im_instrutor` FOREIGN KEY (`instrutor_id`) REFERENCES `instrutores` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_im_modalidade` FOREIGN KEY (`modalidade_id`) REFERENCES `modalidades` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Tabela: planos
CREATE TABLE IF NOT EXISTS `planos` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nome` VARCHAR(80) NOT NULL UNIQUE,
  `tipo` ENUM('mensal', 'trimestral', 'semestral', 'anual') NOT NULL,
  `duracao_meses` TINYINT UNSIGNED NOT NULL CHECK (`duracao_meses` > 0),
  `valor` DECIMAL(10,2) NOT NULL CHECK (`valor` >= 0),
  `descricao` VARCHAR(255) NULL,
  `ativo` BOOLEAN NOT NULL DEFAULT TRUE,
  `criado_em` DATETIME NOT NULL,
  `atualizado_em` DATETIME NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Tabela: assinaturas
CREATE TABLE IF NOT EXISTS `assinaturas` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `aluno_id` BIGINT UNSIGNED NOT NULL,
  `plano_id` BIGINT UNSIGNED NOT NULL,
  `data_inicio` DATE NOT NULL,
  `data_fim` DATE NOT NULL,
  `valor_contratado` DECIMAL(10,2) NOT NULL,
  `status` ENUM('ativa', 'vencida', 'cancelada', 'suspensa') NOT NULL DEFAULT 'ativa',
  `criado_em` DATETIME NOT NULL,
  `atualizado_em` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_aluno_status` (`aluno_id`, `status`),
  INDEX `idx_data_fim` (`data_fim`),
  CONSTRAINT `fk_assinaturas_aluno` FOREIGN KEY (`aluno_id`) REFERENCES `alunos` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_assinaturas_plano` FOREIGN KEY (`plano_id`) REFERENCES `planos` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Tabela: pagamentos
CREATE TABLE IF NOT EXISTS `pagamentos` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `assinatura_id` BIGINT UNSIGNED NOT NULL,
  `competencia` DATE NOT NULL,
  `valor` DECIMAL(10,2) NOT NULL,
  `data_vencimento` DATE NOT NULL,
  `data_pagamento` DATE NULL,
  `status` ENUM('pendente', 'pago', 'atrasado', 'cancelado') NOT NULL DEFAULT 'pendente',
  `metodo` ENUM('dinheiro', 'pix', 'cartao', 'boleto', 'transferencia') NULL,
  `observacao` VARCHAR(255) NULL,
  `criado_em` DATETIME NOT NULL,
  `atualizado_em` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_assinatura_competencia` (`assinatura_id`, `competencia`),
  INDEX `idx_status_vencimento` (`status`, `data_vencimento`),
  INDEX `idx_data_pagamento` (`data_pagamento`),
  CONSTRAINT `fk_pagamentos_assinatura` FOREIGN KEY (`assinatura_id`) REFERENCES `assinaturas` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Tabela: aulas
CREATE TABLE IF NOT EXISTS `aulas` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `modalidade_id` BIGINT UNSIGNED NOT NULL,
  `instrutor_id` BIGINT UNSIGNED NOT NULL,
  `titulo` VARCHAR(120) NOT NULL,
  `data_hora_inicio` DATETIME NOT NULL,
  `duracao_min` SMALLINT UNSIGNED NOT NULL CHECK (`duracao_min` > 0),
  `capacidade_max` SMALLINT UNSIGNED NOT NULL CHECK (`capacidade_max` > 0),
  `local` ENUM('interna', 'externa') NOT NULL,
  `local_descricao` VARCHAR(120) NULL,
  `status` ENUM('agendada', 'confirmada', 'cancelada', 'remarcada', 'concluida') NOT NULL DEFAULT 'agendada',
  `criado_em` DATETIME NOT NULL,
  `atualizado_em` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_data_status` (`data_hora_inicio`, `status`),
  INDEX `idx_instrutor` (`instrutor_id`),
  INDEX `idx_modalidade` (`modalidade_id`),
  CONSTRAINT `fk_aulas_modalidade` FOREIGN KEY (`modalidade_id`) REFERENCES `modalidades` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_aulas_instrutor` FOREIGN KEY (`instrutor_id`) REFERENCES `instrutores` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Tabela: inscricoes_aula
CREATE TABLE IF NOT EXISTS `inscricoes_aula` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `aula_id` BIGINT UNSIGNED NOT NULL,
  `aluno_id` BIGINT UNSIGNED NOT NULL,
  `status` ENUM('confirmada', 'cancelada', 'presente', 'falta') NOT NULL DEFAULT 'confirmada',
  `criado_em` DATETIME NOT NULL,
  `atualizado_em` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_aula_aluno` (`aula_id`, `aluno_id`),
  CONSTRAINT `fk_inscricoes_aula` FOREIGN KEY (`aula_id`) REFERENCES `aulas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_inscricoes_aluno` FOREIGN KEY (`aluno_id`) REFERENCES `alunos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Tabela: presencas
CREATE TABLE IF NOT EXISTS `presencas` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `aluno_id` BIGINT UNSIGNED NOT NULL,
  `aula_id` BIGINT UNSIGNED NULL,
  `data_presenca` DATE NOT NULL,
  `origem` ENUM('aula', 'livre', 'experimental') NOT NULL DEFAULT 'aula',
  `criado_em` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_aluno_data` (`aluno_id`, `data_presenca`),
  CONSTRAINT `fk_presencas_aluno` FOREIGN KEY (`aluno_id`) REFERENCES `alunos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_presencas_aula` FOREIGN KEY (`aula_id`) REFERENCES `aulas` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. Tabela: avaliacoes
CREATE TABLE IF NOT EXISTS `avaliacoes` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `aluno_id` BIGINT UNSIGNED NOT NULL,
  `instrutor_id` BIGINT UNSIGNED NULL,
  `data_avaliacao` DATE NOT NULL,
  `peso_kg` DECIMAL(5,2) NOT NULL,
  `altura_cm` SMALLINT UNSIGNED NOT NULL,
  `percentual_gordura` DECIMAL(5,2) NULL,
  `cintura_cm` DECIMAL(5,2) NULL,
  `quadril_cm` DECIMAL(5,2) NULL,
  `peito_cm` DECIMAL(5,2) NULL,
  `braco_cm` DECIMAL(5,2) NULL,
  `coxa_cm` DECIMAL(5,2) NULL,
  `observacoes` TEXT NULL,
  `criado_em` DATETIME NOT NULL,
  `atualizado_em` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_aluno_data` (`aluno_id`, `data_avaliacao`),
  CONSTRAINT `fk_avaliacoes_aluno` FOREIGN KEY (`aluno_id`) REFERENCES `alunos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_avaliacoes_instrutor` FOREIGN KEY (`instrutor_id`) REFERENCES `instrutores` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. Tabela: visitantes
CREATE TABLE IF NOT EXISTS `visitantes` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nome` VARCHAR(120) NOT NULL,
  `telefone` VARCHAR(20) NOT NULL,
  `email` VARCHAR(160) NULL,
  `aula_id` BIGINT UNSIGNED NULL,
  `data_visita` DATE NOT NULL,
  `tipo` ENUM('experimental', 'visitante') NOT NULL,
  `status` ENUM('agendado', 'compareceu', 'faltou', 'convertido') NOT NULL DEFAULT 'agendado',
  `observacoes` VARCHAR(255) NULL,
  `criado_em` DATETIME NOT NULL,
  `atualizado_em` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_data_status` (`data_visita`, `status`),
  CONSTRAINT `fk_visitantes_aula` FOREIGN KEY (`aula_id`) REFERENCES `aulas` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. Tabela: notificacoes (nova tabela enviada)
CREATE TABLE IF NOT EXISTS `notificacoes` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `usuario_id` BIGINT UNSIGNED NULL,
  `aula_id` BIGINT UNSIGNED NULL,
  `pagamento_id` BIGINT UNSIGNED NULL,
  `destinatario_email` VARCHAR(160) NOT NULL,
  `tipo` ENUM('vencimento', 'chuva', 'experimental', 'geral') NOT NULL,
  `canal` ENUM('email', 'sistema') NOT NULL DEFAULT 'email',
  `assunto` VARCHAR(160) NOT NULL,
  `mensagem` TEXT NOT NULL,
  `status` ENUM('pendente', 'enviado', 'falhou') NOT NULL DEFAULT 'pendente',
  `erro` VARCHAR(255) NULL,
  `criado_em` DATETIME NOT NULL,
  `enviado_em` DATETIME NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_notificacoes_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_notificacoes_aula` FOREIGN KEY (`aula_id`) REFERENCES `aulas` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_notificacoes_pagamento` FOREIGN KEY (`pagamento_id`) REFERENCES `pagamentos` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Restaura a verificação de chaves estrangeiras
SET FOREIGN_KEY_CHECKS = 1;


INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES
  ('Administrador Teste', 'admin@teste.com', 'scrypt:bcfc4b12db22e8599f646766b304ee79:918319a69eea9d3013f340ae0daf7e93b4dbf7810d0ea018cacd1e5deaafacf19ed56542ac328589d07c4db5c261a03f6515306e6cf2edfaf8661087882699d9', 'admin'),
  ('Instrutor Teste', 'instrutor@teste.com', 'scrypt:153ed10c6c758f8c98708f2b2e9a496b:c2179ee89caa0e6f6049cef96851005ab96948f48eb218bc2ec013b76ee0d70b07b94ee65a4248ad36fe82a92354e87596a6b3be09c4d589eac40af5db6c0521', 'instrutor'),
  ('Aluno Teste', 'aluno@teste.com', 'scrypt:6f1a852f5d32470a53317e6443e1ee35:708a9512a2ad2038f69c64aca448702d6950446dad395d115167786810d4fa9b5d30db79207f72a23c39997c1ebcbe9e26f59f8aac4cf12959ed9b19ae5f6858', 'aluno')
ON DUPLICATE KEY UPDATE
  nome = VALUES(nome),
  senha_hash = VALUES(senha_hash),
  perfil = VALUES(perfil),
  ativo = 1;
  
  CREATE TABLE IF NOT EXISTS lancamentos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  categoria ENUM('aula','aluguel','outros') NOT NULL,
  descricao VARCHAR(160) NULL,
  valor DECIMAL(10,2) NOT NULL,
  data_lancamento DATE NOT NULL,
  KEY idx_lancamentos_data (data_lancamento)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO lancamentos (categoria, descricao, valor, data_lancamento) VALUES
('aula', 'TESTE-RELATORIO', 1800.00, DATE_FORMAT(CURDATE(), '%Y-%m-05')),
('aula', 'TESTE-RELATORIO', 950.50, DATE_FORMAT(CURDATE(), '%Y-%m-18')),
('aluguel', 'TESTE-RELATORIO', 1200.00, DATE_FORMAT(CURDATE(), '%Y-%m-10')),
('outros', 'TESTE-RELATORIO', 340.00, DATE_FORMAT(CURDATE(), '%Y-%m-22')),
('aula', 'TESTE-RELATORIO', 1500.00, DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-12'), INTERVAL 1 MONTH)),
('aluguel', 'TESTE-RELATORIO', 1200.00, DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-10'), INTERVAL 1 MONTH)),
('outros', 'TESTE-RELATORIO', 210.00, DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-20'), INTERVAL 2 MONTH));

INSERT INTO pagamentos (assinatura_id, competencia, valor, data_vencimento, data_pagamento, status, metodo, observacao)
SELECT a.id, DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL m.n MONTH), '%Y-%m-01'), m.valor,
       DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL m.n MONTH), '%Y-%m-10'),
       DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL m.n MONTH), '%Y-%m-05'),
       'pago', 'pix', 'TESTE-RELATORIO'
FROM (SELECT id FROM assinaturas ORDER BY id LIMIT 1) a
JOIN (SELECT 0 AS n, 3200.00 AS valor UNION ALL SELECT 1, 2800.00 UNION ALL SELECT 2, 2500.00) m;
