-- 0020_cotacao_frete_garantia.sql
-- Frete e garantia por fornecedor na cotação (rodapé do mapa de cotação).
-- Frete soma ao total do fornecedor; garantia é texto livre (ex: "12 meses").

ALTER TABLE cotacao_fornecedores
  ADD COLUMN IF NOT EXISTS frete    numeric(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS garantia text;
