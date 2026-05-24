-- migration 0011 — alçada de aprovação por usuário
-- Adiciona campo alcada_valor ao user_profiles.
-- Representa o valor máximo (R$) que o usuário pode aprovar em pedidos.
-- NULL = sem limite (admin implícito). Default 50.000 para compradores.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS alcada_valor NUMERIC(15,2) DEFAULT 50000.00;

COMMENT ON COLUMN user_profiles.alcada_valor IS
  'Valor máximo (R$) que este usuário pode aprovar em pedidos de compra. NULL = sem limite (admin).';
