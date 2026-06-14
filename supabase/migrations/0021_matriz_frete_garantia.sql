-- 0021_matriz_frete_garantia.sql
-- Frete e garantia passam a ser por célula (item × fornecedor), preenchidos
-- junto com preço/entrega/pagamento. O frete soma ao total do fornecedor.
-- As colunas em cotacao_fornecedores (migration 0020) ficam órfãs e podem
-- ser removidas no futuro — deixadas aqui para evitar janela de quebra.

ALTER TABLE cotacao_matriz
  ADD COLUMN IF NOT EXISTS frete    numeric(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS garantia text;
