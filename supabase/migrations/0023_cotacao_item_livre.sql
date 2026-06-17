-- 0023_cotacao_item_livre.sql
-- Permite cotar produtos ainda sem cadastro no Omie:
--  - item livre vindo da requisição (sem produto_id) → produto_id passa a aceitar NULL
--  - guarda nome/unidade livres e a flag produto_novo (pendente de cadastro Omie)
-- Espelha o que requisicao_itens já faz.

ALTER TABLE cotacao_itens
  ALTER COLUMN produto_id DROP NOT NULL;

ALTER TABLE cotacao_itens
  ADD COLUMN IF NOT EXISTS produto_nome_livre  text,
  ADD COLUMN IF NOT EXISTS produto_unidade_med text,
  ADD COLUMN IF NOT EXISTS produto_novo        boolean NOT NULL DEFAULT false;
