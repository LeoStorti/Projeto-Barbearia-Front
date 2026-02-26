-- Seed DEV (Docker) - dados mínimos para a tela de performance
-- Observação: este script TRUNCA tabelas relacionadas (use apenas em DEV).

SET NAMES utf8mb4;

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE ItensVenda;
TRUNCATE TABLE Vendas;
TRUNCATE TABLE Agendamentos;
TRUNCATE TABLE Profissionais;
TRUNCATE TABLE Servicos;
TRUNCATE TABLE Clientes;

SET FOREIGN_KEY_CHECKS = 1;

-- Clientes
INSERT INTO Clientes (ClienteId, Nome, Telefone, Email, DataNascimento, Endereco, Observacoes, Alergias)
VALUES
  (1, 'Joao Silva',   '11999990001', 'joao.silva@email.com',   '1991-05-10', 'Rua A, 123', 'Cliente recorrente', ''),
  (2, 'Maria Santos', '11999990002', 'maria.santos@email.com', '1994-09-22', 'Rua B, 456', 'Prefere horário manhã', '');

-- Profissionais
INSERT INTO Profissionais (ProfissionalId, Nome, Especializacao, Telefone)
VALUES
  (1, 'Carlos Barber', 'Corte Masculino', '11988880001'),
  (2, 'Ana Barber',    'Barba e Acabamento', '11988880002');

-- Serviços
INSERT INTO Servicos (ServicoId, NomeServico, Preco, Descricao, Duracao, Categoria)
VALUES
  (1, 'Corte Masculino', 50.00, 'Corte tradicional', 45, 'Cabelo'),
  (2, 'Barba',           35.00, 'Barba completa', 30, 'Barba'),
  (3, 'Corte + Barba',   75.00, 'Combo corte e barba', 70, 'Combo');

-- Agendamentos (datas recentes para aparecer no período padrão de 30 dias)
INSERT INTO Agendamentos (AgendamentoId, ClienteId, ProfissionalId, ServicoId, DataHora, Status, Observacoes)
VALUES
  (1, 1, 1, 1, '2026-02-10T10:00:00', 'Finalizado', ''),
  (2, 2, 2, 2, '2026-02-12T11:00:00', 'Finalizado', ''),
  (3, 1, 2, 3, '2026-02-15T15:30:00', 'Agendado',   '');

-- Vendas (datas recentes)
INSERT INTO Vendas (VendaId, DataVenda, ClienteId, ProfissionalId, TotalVenda, ServicoId)
VALUES
  (1, '2026-02-10T10:50:00', 1, 1, 50.00, 1),
  (2, '2026-02-12T11:40:00', 2, 2, 35.00, 2);
