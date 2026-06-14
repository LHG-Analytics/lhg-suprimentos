-- 0022_pedido_frete.sql
-- Frete do pedido de compra (soma do frete das células da cotação por fornecedor).
-- Enviado ao Omie como frete_incluir.nValFrete; somado ao valor_total do pedido.

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS frete numeric(12,4) DEFAULT 0;
