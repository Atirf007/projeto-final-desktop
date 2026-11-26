-- Carga de demonstracao do sistema de academia
-- Aplicada por scripts/popular-tabelas.ts apos scripts/criar-tabelas.ts
-- Pode ser reaplicada sem duplicar registros e recalcula as datas relativas
-- Os hashes scrypt abaixo foram gerados com o mesmo algoritmo de Senha.gerar
-- Formato scrypt:<sal em hex>:<hash de 64 bytes em hex>

INSERT INTO `usuarios`
  (`id`, `nome`, `email`, `senha_hash`, `perfil`, `ativo`, `ultimo_login`, `criado_em`, `atualizado_em`)
VALUES
  (1, 'Administrador da Academia', 'admin@cotil.unicamp.br', 'scrypt:ba9133230150da8bcf64e09872dbace3:62a263da48c1d6ff8af7e4d1cd1010ae035cc4a561dfb287646786b246ed33dd861c7817165c1befa8c02d513c6b048910f36f97adc14b29593b0e6d418082a4', 'admin', 1, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 400 DAY), NOW()),
  (2, 'Rafael — instrutor', 'funcionario@exemplo.com', 'scrypt:ee41cf1543f51f4f81cdd9c16889a3a9:96607b66d6ee6d1fd5147035b5a1b71cc32b18893ff231d9cb49b7616cd514e3e720386c0e076972b599b30f3fcbdd284a512e782cc28b52f562788cabc0193f', 'instrutor', 1, DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 380 DAY), NOW()),
  (3, 'Camila — instrutora', 'instrutora2@exemplo.com', 'scrypt:ee41cf1543f51f4f81cdd9c16889a3a9:96607b66d6ee6d1fd5147035b5a1b71cc32b18893ff231d9cb49b7616cd514e3e720386c0e076972b599b30f3fcbdd284a512e782cc28b52f562788cabc0193f', 'instrutor', 1, DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 350 DAY), NOW()),
  (4, 'Ana Souza', 'aluno1@exemplo.com', 'scrypt:7864572db4ebc7a3ba4917fa3d962e77:2bae304401a2aca4bfcdb45bf5e1115eac2e3eaa73119c93f2de709b1823d971f495c2971575c67b0822bbde305a3731d466b3d080edf85a1926bc7b9ff41e53', 'aluno', 1, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 300 DAY), NOW()),
  (5, 'Bruno Lima', 'aluno2@exemplo.com', 'scrypt:7864572db4ebc7a3ba4917fa3d962e77:2bae304401a2aca4bfcdb45bf5e1115eac2e3eaa73119c93f2de709b1823d971f495c2971575c67b0822bbde305a3731d466b3d080edf85a1926bc7b9ff41e53', 'aluno', 1, DATE_SUB(NOW(), INTERVAL 4 DAY), DATE_SUB(NOW(), INTERVAL 280 DAY), NOW()),
  (6, 'Carla Rocha', 'aluno3@exemplo.com', 'scrypt:7864572db4ebc7a3ba4917fa3d962e77:2bae304401a2aca4bfcdb45bf5e1115eac2e3eaa73119c93f2de709b1823d971f495c2971575c67b0822bbde305a3731d466b3d080edf85a1926bc7b9ff41e53', 'aluno', 1, DATE_SUB(NOW(), INTERVAL 6 DAY), DATE_SUB(NOW(), INTERVAL 260 DAY), NOW()),
  (7, 'Diego Alves', 'aluno4@exemplo.com', 'scrypt:7864572db4ebc7a3ba4917fa3d962e77:2bae304401a2aca4bfcdb45bf5e1115eac2e3eaa73119c93f2de709b1823d971f495c2971575c67b0822bbde305a3731d466b3d080edf85a1926bc7b9ff41e53', 'aluno', 1, DATE_SUB(NOW(), INTERVAL 8 DAY), DATE_SUB(NOW(), INTERVAL 240 DAY), NOW())
ON DUPLICATE KEY UPDATE
  nome = VALUES(nome), senha_hash = VALUES(senha_hash), perfil = VALUES(perfil),
  ativo = VALUES(ativo), ultimo_login = VALUES(ultimo_login),
  criado_em = VALUES(criado_em), atualizado_em = VALUES(atualizado_em);

INSERT INTO `alunos`
  (`id`, `usuario_id`, `cpf`, `data_nascimento`, `telefone`, `cep`, `logradouro`, `numero`, `complemento`, `bairro`, `cidade`, `estado`, `contato_emergencia`, `observacoes_saude`, `ativo`, `criado_em`, `atualizado_em`)
VALUES
  (1, 4, '12345678900', '1995-04-12', '(19) 99999-1001', '13084040', 'Rua das Palmeiras', '120', 'Apto 31', 'Cidade Universitaria', 'Campinas', 'SP', 'Maria Souza — (19) 98888-1001', 'Sem restricoes informadas', 1, DATE_SUB(NOW(), INTERVAL 300 DAY), NOW()),
  (2, 5, '12345678901', '1988-09-23', '(19) 99999-1002', '13085050', 'Avenida principal', '845', NULL, 'Jardim Florido', 'Campinas', 'SP', 'Lucia Lima — (19) 98888-1002', NULL, 1, DATE_SUB(NOW(), INTERVAL 280 DAY), NOW()),
  (3, 6, '12345678902', '1992-01-30', '(19) 99999-1003', '13086060', 'Rua do Lago', '57', NULL, 'Vila Rica', 'Campinas', 'SP', 'Pedro Rocha — (19) 98888-1003', 'Evitar exercicio de impacto alto', 1, DATE_SUB(NOW(), INTERVAL 260 DAY), NOW()),
  (4, 7, '12345678903', '2000-06-15', '(19) 99999-1004', '13087070', 'Rua Nova Esperanca', '210', 'Casa 2', 'Parque Industrial', 'Campinas', 'SP', 'Helena Alves — (19) 98888-1004', NULL, 1, DATE_SUB(NOW(), INTERVAL 240 DAY), NOW())
ON DUPLICATE KEY UPDATE
  usuario_id = VALUES(usuario_id), cpf = VALUES(cpf), data_nascimento = VALUES(data_nascimento),
  telefone = VALUES(telefone), cep = VALUES(cep), logradouro = VALUES(logradouro),
  numero = VALUES(numero), complemento = VALUES(complemento), bairro = VALUES(bairro),
  cidade = VALUES(cidade), estado = VALUES(estado), contato_emergencia = VALUES(contato_emergencia),
  observacoes_saude = VALUES(observacoes_saude), ativo = VALUES(ativo),
  criado_em = VALUES(criado_em), atualizado_em = VALUES(atualizado_em);

INSERT INTO `instrutores`
  (`id`, `usuario_id`, `cref`, `bio`, `ativo`, `criado_em`, `atualizado_em`)
VALUES
  (1, 2, 'CREF-SP-100001', 'Formado em Educacao Física, atua em musculacao e funcional.', 1, DATE_SUB(NOW(), INTERVAL 380 DAY), NOW()),
  (2, 3, 'CREF-SP-100002', 'Instrutora de spin e danca com foco em condicionamento.', 1, DATE_SUB(NOW(), INTERVAL 350 DAY), NOW())
ON DUPLICATE KEY UPDATE
  usuario_id = VALUES(usuario_id), cref = VALUES(cref), bio = VALUES(bio),
  ativo = VALUES(ativo), criado_em = VALUES(criado_em), atualizado_em = VALUES(atualizado_em);

INSERT INTO `modalidades`
  (`id`, `nome`, `descricao`, `ativo`, `criado_em`, `atualizado_em`)
VALUES
  (1, 'Musculação', 'Treino de força com equipamentos e peso corporal', 1, DATE_SUB(NOW(), INTERVAL 400 DAY), NOW()),
  (2, 'Funcional', 'Circuitos de movimentos funcionais em grupo', 1, DATE_SUB(NOW(), INTERVAL 400 DAY), NOW()),
  (3, 'Spin', 'Ciclismo indoor com ritmo e intervalos', 1, DATE_SUB(NOW(), INTERVAL 400 DAY), NOW()),
  (4, 'Dança', 'Aulas de dança e mobilidade', 1, DATE_SUB(NOW(), INTERVAL 400 DAY), NOW())
ON DUPLICATE KEY UPDATE
  nome = VALUES(nome), descricao = VALUES(descricao), ativo = VALUES(ativo),
  criado_em = VALUES(criado_em), atualizado_em = VALUES(atualizado_em);

INSERT INTO `instrutores_modalidades` (`instrutor_id`, `modalidade_id`) VALUES
  (1, 1), (1, 2), (2, 3), (2, 4)
ON DUPLICATE KEY UPDATE instrutor_id = VALUES(instrutor_id), modalidade_id = VALUES(modalidade_id);

INSERT INTO `planos`
  (`id`, `nome`, `tipo`, `duracao_meses`, `valor`, `descricao`, `ativo`, `criado_em`, `atualizado_em`)
VALUES
  (1, 'Mensal Demo', 'mensal', 1, 149.90, 'Plano mensal com acesso as aulas coletivas', 1, DATE_SUB(NOW(), INTERVAL 400 DAY), NOW()),
  (2, 'Trimestral Demo', 'trimestral', 3, 399.90, 'Trimestre com desconto progressivo', 1, DATE_SUB(NOW(), INTERVAL 400 DAY), NOW()),
  (3, 'Semestral Demo', 'semestral', 6, 729.90, 'Semestre com acompanhamento de avaliacoes', 1, DATE_SUB(NOW(), INTERVAL 400 DAY), NOW()),
  (4, 'Anual Demo', 'anual', 12, 1299.90, 'Plano anual com prioridade nas reservas', 1, DATE_SUB(NOW(), INTERVAL 400 DAY), NOW())
ON DUPLICATE KEY UPDATE
  nome = VALUES(nome), tipo = VALUES(tipo), duracao_meses = VALUES(duracao_meses),
  valor = VALUES(valor), descricao = VALUES(descricao), ativo = VALUES(ativo),
  criado_em = VALUES(criado_em), atualizado_em = VALUES(atualizado_em);

INSERT INTO `assinaturas`
  (`id`, `aluno_id`, `plano_id`, `data_inicio`, `data_fim`, `valor_contratado`, `status`, `criado_em`, `atualizado_em`)
VALUES
  (1, 1, 1, DATE_SUB(CURDATE(), INTERVAL 20 DAY), DATE_ADD(CURDATE(), INTERVAL 10 DAY), 149.90, 'ativa', DATE_SUB(NOW(), INTERVAL 20 DAY), NOW()),
  (2, 2, 2, DATE_SUB(CURDATE(), INTERVAL 60 DAY), DATE_ADD(CURDATE(), INTERVAL 30 DAY), 399.90, 'ativa', DATE_SUB(NOW(), INTERVAL 60 DAY), NOW()),
  (3, 3, 3, DATE_SUB(CURDATE(), INTERVAL 90 DAY), DATE_ADD(CURDATE(), INTERVAL 90 DAY), 729.90, 'ativa', DATE_SUB(NOW(), INTERVAL 90 DAY), NOW()),
  (4, 4, 4, DATE_SUB(CURDATE(), INTERVAL 120 DAY), DATE_ADD(CURDATE(), INTERVAL 245 DAY), 1299.90, 'ativa', DATE_SUB(NOW(), INTERVAL 120 DAY), NOW())
ON DUPLICATE KEY UPDATE
  aluno_id = VALUES(aluno_id), plano_id = VALUES(plano_id), data_inicio = VALUES(data_inicio),
  data_fim = VALUES(data_fim), valor_contratado = VALUES(valor_contratado),
  status = VALUES(status), criado_em = VALUES(criado_em), atualizado_em = VALUES(atualizado_em);

INSERT INTO `pagamentos`
  (`id`, `assinatura_id`, `competencia`, `valor`, `data_vencimento`, `data_pagamento`, `status`, `metodo`, `observacao`, `criado_em`, `atualizado_em`)
VALUES
  (1, 1, DATE_FORMAT(CURDATE(), '%Y-%m-01'), 149.90, DATE_FORMAT(CURDATE(), '%Y-%m-10'), DATE_FORMAT(CURDATE(), '%Y-%m-05'), 'pago', 'pix', 'Demonstracao de mensalidade paga', DATE_SUB(NOW(), INTERVAL 20 DAY), NOW()),
  (2, 1, DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01'), 149.90, DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-10'), DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-05'), 'pago', 'pix', 'Demonstracao de mensalidade paga', DATE_SUB(NOW(), INTERVAL 50 DAY), NOW()),
  (3, 2, DATE_FORMAT(CURDATE(), '%Y-%m-01'), 133.30, DATE_FORMAT(CURDATE(), '%Y-%m-10'), DATE_FORMAT(CURDATE(), '%Y-%m-05'), 'pago', 'boleto', 'Parcela do plano trimestral', DATE_SUB(NOW(), INTERVAL 60 DAY), NOW()),
  (4, 2, DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01'), 133.30, DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-10'), DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-05'), 'pago', 'boleto', 'Parcela do plano trimestral', DATE_SUB(NOW(), INTERVAL 90 DAY), NOW()),
  (5, 3, DATE_FORMAT(CURDATE(), '%Y-%m-01'), 121.65, DATE_FORMAT(CURDATE(), '%Y-%m-10'), DATE_FORMAT(CURDATE(), '%Y-%m-05'), 'pago', 'cartao', 'Parcela do plano semestral', DATE_SUB(NOW(), INTERVAL 90 DAY), NOW()),
  (6, 3, DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01'), 121.65, DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-10'), DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-05'), 'pago', 'cartao', 'Parcela do plano semestral', DATE_SUB(NOW(), INTERVAL 120 DAY), NOW()),
  (7, 4, DATE_FORMAT(CURDATE(), '%Y-%m-01'), 108.33, DATE_SUB(CURDATE(), INTERVAL 5 DAY), NULL, 'atrasado', NULL, 'Demonstracao de inadimplencia para o gestor', DATE_SUB(NOW(), INTERVAL 120 DAY), NOW()),
  (8, 4, DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01'), 108.33, DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-10'), DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-05'), 'pago', 'pix', 'Parcela do plano anual', DATE_SUB(NOW(), INTERVAL 150 DAY), NOW())
ON DUPLICATE KEY UPDATE
  assinatura_id = VALUES(assinatura_id), competencia = VALUES(competencia), valor = VALUES(valor),
  data_vencimento = VALUES(data_vencimento), data_pagamento = VALUES(data_pagamento),
  status = VALUES(status), metodo = VALUES(metodo), observacao = VALUES(observacao),
  criado_em = VALUES(criado_em), atualizado_em = VALUES(atualizado_em);

INSERT INTO `aulas`
  (`id`, `modalidade_id`, `instrutor_id`, `titulo`, `data_hora_inicio`, `duracao_min`, `capacidade_max`, `local`, `local_descricao`, `status`, `criado_em`, `atualizado_em`)
VALUES
  (1, 1, 1, 'Musculação — turma da manhã', DATE_ADD(CURDATE(), INTERVAL 1 DAY) + INTERVAL 9 HOUR, 60, 12, 'interna', NULL, 'agendada', DATE_SUB(NOW(), INTERVAL 10 DAY), NOW()),
  (2, 2, 1, 'Funcional ao ar livre', DATE_ADD(CURDATE(), INTERVAL 2 DAY) + INTERVAL 18 HOUR, 50, 15, 'externa', 'Quadra externa 1', 'agendada', DATE_SUB(NOW(), INTERVAL 8 DAY), NOW()),
  (3, 3, 2, 'Spin — turma da manhã', DATE_ADD(CURDATE(), INTERVAL 3 DAY) + INTERVAL 7 HOUR, 45, 10, 'interna', NULL, 'confirmada', DATE_SUB(NOW(), INTERVAL 7 DAY), NOW()),
  (4, 4, 2, 'Dança — turma da noite', DATE_ADD(CURDATE(), INTERVAL 5 DAY) + INTERVAL 19 HOUR, 60, 14, 'externa', 'Salao externo', 'remarcada', DATE_SUB(NOW(), INTERVAL 6 DAY), NOW()),
  (5, 1, 1, 'Musculação — concluída', DATE_SUB(CURDATE(), INTERVAL 3 DAY) + INTERVAL 9 HOUR, 60, 12, 'interna', NULL, 'concluida', DATE_SUB(NOW(), INTERVAL 20 DAY), NOW()),
  (6, 2, 1, 'Funcional — concluída', DATE_SUB(CURDATE(), INTERVAL 10 DAY) + INTERVAL 18 HOUR, 50, 15, 'interna', NULL, 'concluida', DATE_SUB(NOW(), INTERVAL 25 DAY), NOW()),
  (7, 3, 2, 'Spin — concluída', DATE_SUB(CURDATE(), INTERVAL 25 DAY) + INTERVAL 7 HOUR, 45, 10, 'interna', NULL, 'concluida', DATE_SUB(NOW(), INTERVAL 40 DAY), NOW()),
  (8, 4, 2, 'Dança — concluída', DATE_SUB(CURDATE(), INTERVAL 45 DAY) + INTERVAL 19 HOUR, 60, 14, 'interna', NULL, 'concluida', DATE_SUB(NOW(), INTERVAL 60 DAY), NOW()),
  (9, 1, 1, 'Musculação — histórico', DATE_SUB(CURDATE(), INTERVAL 60 DAY) + INTERVAL 9 HOUR, 60, 12, 'interna', NULL, 'concluida', DATE_SUB(NOW(), INTERVAL 75 DAY), NOW()),
  (10, 2, 1, 'Funcional — histórico', DATE_SUB(CURDATE(), INTERVAL 80 DAY) + INTERVAL 18 HOUR, 50, 15, 'interna', NULL, 'concluida', DATE_SUB(NOW(), INTERVAL 95 DAY), NOW())
ON DUPLICATE KEY UPDATE
  modalidade_id = VALUES(modalidade_id), instrutor_id = VALUES(instrutor_id), titulo = VALUES(titulo),
  data_hora_inicio = VALUES(data_hora_inicio), duracao_min = VALUES(duracao_min),
  capacidade_max = VALUES(capacidade_max), local = VALUES(local), local_descricao = VALUES(local_descricao),
  status = VALUES(status), criado_em = VALUES(criado_em), atualizado_em = VALUES(atualizado_em);

INSERT INTO `inscricoes_aula`
  (`id`, `aula_id`, `aluno_id`, `status`, `criado_em`, `atualizado_em`)
VALUES
  (1, 1, 1, 'confirmada', DATE_SUB(NOW(), INTERVAL 9 DAY), NOW()),
  (2, 1, 2, 'confirmada', DATE_SUB(NOW(), INTERVAL 8 DAY), NOW()),
  (3, 2, 3, 'confirmada', DATE_SUB(NOW(), INTERVAL 7 DAY), NOW()),
  (4, 2, 4, 'cancelada', DATE_SUB(NOW(), INTERVAL 6 DAY), NOW()),
  (5, 3, 1, 'confirmada', DATE_SUB(NOW(), INTERVAL 6 DAY), NOW()),
  (6, 5, 1, 'presente', DATE_SUB(NOW(), INTERVAL 19 DAY), NOW()),
  (7, 5, 2, 'presente', DATE_SUB(NOW(), INTERVAL 19 DAY), NOW()),
  (8, 6, 1, 'presente', DATE_SUB(NOW(), INTERVAL 24 DAY), NOW()),
  (9, 6, 2, 'presente', DATE_SUB(NOW(), INTERVAL 24 DAY), NOW()),
  (10, 6, 3, 'presente', DATE_SUB(NOW(), INTERVAL 24 DAY), NOW()),
  (11, 7, 1, 'presente', DATE_SUB(NOW(), INTERVAL 39 DAY), NOW()),
  (12, 7, 4, 'presente', DATE_SUB(NOW(), INTERVAL 39 DAY), NOW()),
  (13, 8, 2, 'presente', DATE_SUB(NOW(), INTERVAL 59 DAY), NOW()),
  (14, 9, 3, 'presente', DATE_SUB(NOW(), INTERVAL 74 DAY), NOW()),
  (15, 9, 4, 'presente', DATE_SUB(NOW(), INTERVAL 74 DAY), NOW()),
  (16, 10, 1, 'presente', DATE_SUB(NOW(), INTERVAL 94 DAY), NOW()),
  (17, 10, 3, 'presente', DATE_SUB(NOW(), INTERVAL 94 DAY), NOW())
ON DUPLICATE KEY UPDATE
  aula_id = VALUES(aula_id), aluno_id = VALUES(aluno_id), status = VALUES(status),
  criado_em = VALUES(criado_em), atualizado_em = VALUES(atualizado_em);

INSERT INTO `presencas`
  (`id`, `aluno_id`, `aula_id`, `data_presenca`, `origem`, `criado_em`)
VALUES
  (1, 1, 10, DATE_SUB(CURDATE(), INTERVAL 80 DAY), 'aula', DATE_SUB(NOW(), INTERVAL 80 DAY)),
  (2, 3, 10, DATE_SUB(CURDATE(), INTERVAL 80 DAY), 'aula', DATE_SUB(NOW(), INTERVAL 80 DAY)),
  (3, 1, 9, DATE_SUB(CURDATE(), INTERVAL 60 DAY), 'aula', DATE_SUB(NOW(), INTERVAL 60 DAY)),
  (4, 3, 9, DATE_SUB(CURDATE(), INTERVAL 60 DAY), 'aula', DATE_SUB(NOW(), INTERVAL 60 DAY)),
  (5, 4, 9, DATE_SUB(CURDATE(), INTERVAL 60 DAY), 'aula', DATE_SUB(NOW(), INTERVAL 60 DAY)),
  (6, 2, 8, DATE_SUB(CURDATE(), INTERVAL 45 DAY), 'aula', DATE_SUB(NOW(), INTERVAL 45 DAY)),
  (7, 1, 7, DATE_SUB(CURDATE(), INTERVAL 25 DAY), 'aula', DATE_SUB(NOW(), INTERVAL 25 DAY)),
  (8, 4, 7, DATE_SUB(CURDATE(), INTERVAL 25 DAY), 'aula', DATE_SUB(NOW(), INTERVAL 25 DAY)),
  (9, 1, 6, DATE_SUB(CURDATE(), INTERVAL 10 DAY), 'aula', DATE_SUB(NOW(), INTERVAL 10 DAY)),
  (10, 2, 6, DATE_SUB(CURDATE(), INTERVAL 10 DAY), 'aula', DATE_SUB(NOW(), INTERVAL 10 DAY)),
  (11, 3, 6, DATE_SUB(CURDATE(), INTERVAL 10 DAY), 'aula', DATE_SUB(NOW(), INTERVAL 10 DAY)),
  (12, 1, 5, DATE_SUB(CURDATE(), INTERVAL 3 DAY), 'aula', DATE_SUB(NOW(), INTERVAL 3 DAY)),
  (13, 2, 5, DATE_SUB(CURDATE(), INTERVAL 3 DAY), 'aula', DATE_SUB(NOW(), INTERVAL 3 DAY)),
  (14, 1, NULL, DATE_SUB(CURDATE(), INTERVAL 1 DAY), 'livre', DATE_SUB(NOW(), INTERVAL 1 DAY))
ON DUPLICATE KEY UPDATE
  aluno_id = VALUES(aluno_id), aula_id = VALUES(aula_id), data_presenca = VALUES(data_presenca),
  origem = VALUES(origem), criado_em = VALUES(criado_em);

INSERT INTO `avaliacoes`
  (`id`, `aluno_id`, `instrutor_id`, `data_avaliacao`, `peso_kg`, `altura_cm`, `percentual_gordura`, `cintura_cm`, `quadril_cm`, `peito_cm`, `braco_cm`, `coxa_cm`, `observacoes`, `criado_em`, `atualizado_em`)
VALUES
  (1, 1, 1, DATE_SUB(CURDATE(), INTERVAL 90 DAY), 82.00, 175, 22.00, 92.00, 102.00, 98.00, 33.00, 58.00, 'Avaliacao inicial do aluno 1', DATE_SUB(NOW(), INTERVAL 90 DAY), NOW()),
  (2, 1, 1, DATE_SUB(CURDATE(), INTERVAL 45 DAY), 79.50, 175, 20.00, 88.00, 100.00, 96.00, 32.50, 56.50, 'Boa evolucao de peso e cintura', DATE_SUB(NOW(), INTERVAL 45 DAY), NOW()),
  (3, 1, 1, CURDATE(), 77.80, 175, 18.50, 85.00, 98.00, 95.00, 32.00, 55.00, 'Meta de gordura atingida', NOW(), NOW()),
  (4, 2, 1, DATE_SUB(CURDATE(), INTERVAL 90 DAY), 70.00, 165, 28.00, 88.00, 100.00, 90.00, 30.00, 52.00, 'Avaliacao inicial do aluno 2', DATE_SUB(NOW(), INTERVAL 90 DAY), NOW()),
  (5, 2, 1, DATE_SUB(CURDATE(), INTERVAL 45 DAY), 68.20, 165, 26.00, 84.00, 97.00, 88.00, 29.50, 51.00, 'Constancia nas aulas funcionais', DATE_SUB(NOW(), INTERVAL 45 DAY), NOW()),
  (6, 2, 1, CURDATE(), 66.00, 165, 24.00, 82.00, 95.00, 86.00, 29.00, 50.00, 'Continuar com treino de forca', NOW(), NOW()),
  (7, 3, 2, DATE_SUB(CURDATE(), INTERVAL 90 DAY), 95.00, 180, 30.00, 104.00, 112.00, 108.00, 36.00, 64.00, 'Avaliacao inicial do aluno 3', DATE_SUB(NOW(), INTERVAL 90 DAY), NOW()),
  (8, 3, 2, DATE_SUB(CURDATE(), INTERVAL 45 DAY), 92.00, 180, 28.00, 100.00, 109.00, 105.00, 35.50, 62.00, 'Reducao gradual de medidas', DATE_SUB(NOW(), INTERVAL 45 DAY), NOW()),
  (9, 3, 2, CURDATE(), 89.00, 180, 26.50, 96.00, 106.00, 102.00, 35.00, 60.00, 'Frequencia regular em spin', NOW(), NOW()),
  (10, 4, 2, DATE_SUB(CURDATE(), INTERVAL 90 DAY), 64.00, 170, 24.00, 80.00, 94.00, 88.00, 28.00, 50.00, 'Avaliacao inicial do aluno 4', DATE_SUB(NOW(), INTERVAL 90 DAY), NOW()),
  (11, 4, 2, DATE_SUB(CURDATE(), INTERVAL 45 DAY), 63.00, 170, 23.00, 78.00, 92.00, 87.00, 27.50, 49.00, 'Manter acompanhamento mensal', DATE_SUB(NOW(), INTERVAL 45 DAY), NOW()),
  (12, 4, 2, CURDATE(), 62.50, 170, 22.00, 76.00, 90.00, 86.00, 27.00, 48.50, 'Evolucao lenta porem constante', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  aluno_id = VALUES(aluno_id), instrutor_id = VALUES(instrutor_id),
  data_avaliacao = VALUES(data_avaliacao), peso_kg = VALUES(peso_kg), altura_cm = VALUES(altura_cm),
  percentual_gordura = VALUES(percentual_gordura), cintura_cm = VALUES(cintura_cm),
  quadril_cm = VALUES(quadril_cm), peito_cm = VALUES(peito_cm), braco_cm = VALUES(braco_cm),
  coxa_cm = VALUES(coxa_cm), observacoes = VALUES(observacoes),
  criado_em = VALUES(criado_em), atualizado_em = VALUES(atualizado_em);

INSERT INTO `visitantes`
  (`id`, `nome`, `telefone`, `email`, `aula_id`, `data_visita`, `tipo`, `status`, `observacoes`, `criado_em`, `atualizado_em`)
VALUES
  (1, 'Elisa Martins', '(19) 99999-2001', 'elisa@exemplo.com', 1, DATE_ADD(CURDATE(), INTERVAL 1 DAY), 'experimental', 'agendado', 'Aula experimental de musculacao', NOW(), NOW()),
  (2, 'Felipe Gomes', '(19) 99999-2002', 'felipe@exemplo.com', 5, DATE_SUB(CURDATE(), INTERVAL 3 DAY), 'visitante', 'compareceu', 'Visitou a estrutura da academia', NOW(), NOW()),
  (3, 'Gabriela Costa', '(19) 99999-2003', 'gabriela@exemplo.com', 4, DATE_ADD(CURDATE(), INTERVAL 5 DAY), 'experimental', 'agendado', 'Interesse na turma de danca', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  nome = VALUES(nome), telefone = VALUES(telefone), email = VALUES(email), aula_id = VALUES(aula_id),
  data_visita = VALUES(data_visita), tipo = VALUES(tipo), status = VALUES(status),
  observacoes = VALUES(observacoes), criado_em = VALUES(criado_em), atualizado_em = VALUES(atualizado_em);

INSERT INTO `notificacoes`
  (`id`, `usuario_id`, `aula_id`, `pagamento_id`, `destinatario_email`, `tipo`, `canal`, `assunto`, `mensagem`, `status`, `erro`, `criado_em`, `enviado_em`)
VALUES
  (1, 7, NULL, 7, 'aluno4@exemplo.com', 'vencimento', 'email', 'Lembrete de vencimento — Anual Demo', 'Sua mensalidade do plano Anual Demo venceu. Regularize para continuar frequentando.', 'enviado', NULL, DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY)),
  (2, 6, NULL, 5, 'aluno3@exemplo.com', 'vencimento', 'email', 'Lembrete de vencimento — Semestral Demo', 'Sua mensalidade do plano Semestral Demo vence em breve.', 'enviado', NULL, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY)),
  (3, 1, NULL, 7, 'admin@cotil.unicamp.br', 'geral', 'sistema', 'Inadimplência — Diego Alves', 'Demonstracao de aviso interno ao gestor sobre o pagamento atrasado do aluno Diego Alves.', 'enviado', NULL, DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY))
ON DUPLICATE KEY UPDATE
  usuario_id = VALUES(usuario_id), aula_id = VALUES(aula_id), pagamento_id = VALUES(pagamento_id),
  destinatario_email = VALUES(destinatario_email), tipo = VALUES(tipo), canal = VALUES(canal),
  assunto = VALUES(assunto), mensagem = VALUES(mensagem), status = VALUES(status),
  erro = VALUES(erro), criado_em = VALUES(criado_em), enviado_em = VALUES(enviado_em);

INSERT INTO `lancamentos` (`id`, `categoria`, `descricao`, `valor`, `data_lancamento`) VALUES
  (1, 'aula', 'Receita de aulas — DEMO', 1800.00, DATE_FORMAT(CURDATE(), '%Y-%m-05')),
  (2, 'aula', 'Receita de aulas — DEMO', 950.50, DATE_FORMAT(CURDATE(), '%Y-%m-18')),
  (3, 'aluguel', 'Aluguel do espaço — DEMO', 1200.00, DATE_FORMAT(CURDATE(), '%Y-%m-10')),
  (4, 'outros', 'Venda de materiais — DEMO', 340.00, DATE_FORMAT(CURDATE(), '%Y-%m-22')),
  (5, 'aula', 'Receita de aulas — DEMO', 1500.00, DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-12')),
  (6, 'aluguel', 'Aluguel do espaço — DEMO', 1200.00, DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-10'))
ON DUPLICATE KEY UPDATE
  categoria = VALUES(categoria), descricao = VALUES(descricao), valor = VALUES(valor),
  data_lancamento = VALUES(data_lancamento);
