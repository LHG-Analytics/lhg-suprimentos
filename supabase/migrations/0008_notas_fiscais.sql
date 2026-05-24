-- =============================================================================
-- LHG Suprimentos — Migration 0008: Notas Fiscais de Entrada
-- Tabelas para upload de XML NFe, conferência PC vs NF e lançamento no Omie.
-- =============================================================================

-- ─── NOTAS FISCAIS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notas_fiscais (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id        uuid        REFERENCES pedidos(id) ON DELETE SET NULL,
  chave_acesso     char(44)    NOT NULL UNIQUE,   -- chave de 44 dígitos da NFe
  numero           text,
  serie            text,
  emissao          timestamptz,                   -- data de emissão da NF
  valor_total      numeric(14,2),
  xml_url          text,                          -- caminho no Supabase Storage (futuro)
  status           text        NOT NULL DEFAULT 'conferencia',
    -- 'conferencia' | 'lancada' | 'erro_omie'
  lancada_no_omie  boolean     NOT NULL DEFAULT false,
  lancada_em       timestamptz,
  omie_cod_nota    bigint,                        -- nCodNota retornado pelo Omie
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ─── ITENS DA NF (conferência PC × NF) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS nf_itens (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  nf_id         uuid          NOT NULL REFERENCES notas_fiscais(id) ON DELETE CASCADE,
  produto_id    uuid          REFERENCES produtos(id) ON DELETE SET NULL,
  -- Divergência calculada automaticamente ao registrar
  divergencia   nf_item_kind  NOT NULL DEFAULT 'ok',
  -- Decisão do comprador (aceitar, contestar, ignorar)
  decisao       text,
  -- Valores vindos da NFe
  qtd_nf        numeric(14,4),
  preco_nf      numeric(14,4),
  -- Valores do pedido de compra (para comparação)
  qtd_pedido    numeric(14,4),
  preco_pedido  numeric(14,4),
  created_at    timestamptz   NOT NULL DEFAULT now()
);

-- ─── Trigger de updated_at (usa set_updated_at() de 0003_triggers.sql) ────────
CREATE TRIGGER set_notas_fiscais_updated_at
  BEFORE UPDATE ON notas_fiscais
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Índices ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_nf_pedido     ON notas_fiscais(pedido_id);
CREATE INDEX IF NOT EXISTS idx_nf_status     ON notas_fiscais(status);
CREATE INDEX IF NOT EXISTS idx_nf_itens_nf   ON nf_itens(nf_id);
CREATE INDEX IF NOT EXISTS idx_nf_itens_prod ON nf_itens(produto_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE notas_fiscais ENABLE ROW LEVEL SECURITY;
ALTER TABLE nf_itens      ENABLE ROW LEVEL SECURITY;

-- Compradores e admins podem ver/criar NFs
CREATE POLICY "nf_select" ON notas_fiscais
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND papel IN ('admin', 'comprador')
    )
  );

CREATE POLICY "nf_insert" ON notas_fiscais
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND papel IN ('admin', 'comprador')
    )
  );

CREATE POLICY "nf_update" ON notas_fiscais
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND papel IN ('admin', 'comprador')
    )
  );

CREATE POLICY "nf_itens_select" ON nf_itens
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND papel IN ('admin', 'comprador')
    )
  );

CREATE POLICY "nf_itens_insert" ON nf_itens
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND papel IN ('admin', 'comprador')
    )
  );

CREATE POLICY "nf_itens_update" ON nf_itens
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND papel IN ('admin', 'comprador')
    )
  );

-- ─── Comentários ─────────────────────────────────────────────────────────────
COMMENT ON TABLE  notas_fiscais           IS 'Notas Fiscais de entrada registradas via upload de XML NFe.';
COMMENT ON COLUMN notas_fiscais.chave_acesso IS 'Chave de acesso de 44 dígitos da NFe (identificador único fiscal).';
COMMENT ON COLUMN notas_fiscais.status    IS 'conferencia = aguardando revisão | lancada = lançada no Omie | erro_omie = falha no lançamento';
COMMENT ON TABLE  nf_itens                IS 'Itens da NFe com comparação vs pedido de compra. Divergências calculadas automaticamente.';
COMMENT ON COLUMN nf_itens.divergencia    IS 'ok | preco | qtd | extra (item não estava no PC) | faltante (estava no PC mas não veio na NF)';
COMMENT ON COLUMN nf_itens.decisao        IS 'Anotação do comprador: aceitar_divergencia | contestar | aguardar_credito';
