-- Migration 0016: Tabela para pedidos de compra sincronizados do Omie
-- Armazena o espelho dos pedidos existentes no Omie ERP por unidade.
-- Atualizada via cron a cada 5 minutos (GET /api/omie/sync-pedidos).

CREATE TABLE IF NOT EXISTS omie_pedidos_compra (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  unidade_id            uuid NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,

  -- Identificação no Omie
  omie_codigo           bigint NOT NULL,        -- nCodPedido (ID interno Omie)
  numero                integer,                -- nNumPedido (número sequencial visível)

  -- Datas
  data_pedido           date,
  data_previsao         date,                   -- previsão de entrega

  -- Fornecedor
  fornecedor_codigo     bigint,                 -- nCodFornecedor
  fornecedor_nome       text,                   -- razao_social / nome_fantasia

  -- Valor
  valor_total           numeric(15,2),

  -- Status / Etapa
  situacao              text,                   -- ex: "Aguardando entrega", "Previsão de entrega atrasada"
  situacao_aprovacao    text,                   -- ex: "Aprovado", null quando não aprovado
  etapa                 text,                   -- ex: "Pedido de Compra", "Aprovação"

  -- Referência do fornecedor
  numero_pedido_forn    text,                   -- N° do Pedido do Fornecedor

  -- Controle de sync
  omie_sincronizado_em  timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT omie_pedidos_compra_unique UNIQUE (omie_codigo, unidade_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_omie_pedidos_unidade ON omie_pedidos_compra (unidade_id);
CREATE INDEX IF NOT EXISTS idx_omie_pedidos_data    ON omie_pedidos_compra (data_previsao DESC);
CREATE INDEX IF NOT EXISTS idx_omie_pedidos_numero  ON omie_pedidos_compra (numero DESC);

-- RLS
ALTER TABLE omie_pedidos_compra ENABLE ROW LEVEL SECURITY;

CREATE POLICY "omie_pedidos_authenticated_read"
  ON omie_pedidos_compra FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "omie_pedidos_service_all"
  ON omie_pedidos_compra FOR ALL
  TO service_role USING (true) WITH CHECK (true);
