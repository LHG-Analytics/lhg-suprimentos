-- 0025_omie_pedido_itens.sql
-- Itens dos pedidos de compra do Omie (via ConsultarPedCompra), categorizados,
-- para alimentar o "Orçamento vs Realizado" com as compras feitas direto no Omie.
-- O cabeçalho (omie_pedidos_compra) só tem o total; aqui guardamos a quebra por
-- produto/categoria. A flag itens_sincronizados controla o backfill incremental.

ALTER TABLE omie_pedidos_compra
  ADD COLUMN IF NOT EXISTS itens_sincronizados boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS omie_pedido_itens (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  omie_pedido_id uuid NOT NULL REFERENCES omie_pedidos_compra(id) ON DELETE CASCADE,
  unidade_id     uuid NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  omie_codigo    bigint,                  -- nCodPedido (desnormalizado p/ dedup com pedidos.omie_codigo)
  data_pedido    date,                    -- desnormalizado p/ filtro por período
  omie_cod_prod  bigint,                  -- nCodProd do item
  descricao      text,
  quantidade     numeric(15,4),
  valor_total    numeric(15,2),           -- nValTot do item
  categoria      text,                    -- resolvida do produto local (ou 'Outros')
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_omie_ped_itens_unidade_data ON omie_pedido_itens (unidade_id, data_pedido);
CREATE INDEX IF NOT EXISTS idx_omie_ped_itens_pedido       ON omie_pedido_itens (omie_pedido_id);

ALTER TABLE omie_pedido_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "omie_ped_itens_read"    ON omie_pedido_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY "omie_ped_itens_service" ON omie_pedido_itens FOR ALL    TO service_role  USING (true) WITH CHECK (true);
