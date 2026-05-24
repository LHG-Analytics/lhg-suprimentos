-- =============================================================================
-- LHG Suprimentos — Migration 0009: Família de Produto em NF Itens
-- Adiciona campos para o novo fluxo de entrada de NF via consulta Omie.
-- =============================================================================

-- ─── nf_itens: campos para o novo fluxo ──────────────────────────────────────
ALTER TABLE nf_itens
  ADD COLUMN IF NOT EXISTS familia_omie   text,      -- família selecionada pelo usuário
  ADD COLUMN IF NOT EXISTS descricao_omie text;      -- descrição do item vindo do Omie

-- ─── notas_fiscais: fornecedor direto + unidade (sem obrigatoriedade de pedido) ──
ALTER TABLE notas_fiscais
  ADD COLUMN IF NOT EXISTS fornecedor_id  uuid REFERENCES fornecedores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unidade_id     uuid REFERENCES unidades(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS omie_num_nf    text;      -- número da NF no Omie (busca)

-- chave_acesso pode ser omitida quando a NF não é NF-e (papel/manual)
ALTER TABLE notas_fiscais
  ALTER COLUMN chave_acesso DROP NOT NULL;

-- Índice para busca por número no Omie
CREATE INDEX IF NOT EXISTS idx_nf_omie_num ON notas_fiscais(omie_num_nf);
CREATE INDEX IF NOT EXISTS idx_nf_forn     ON notas_fiscais(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_nf_unidade  ON notas_fiscais(unidade_id);

-- Comentários
COMMENT ON COLUMN nf_itens.familia_omie    IS 'Família de produto selecionada pelo usuário (ex: ESTOQUE SECO, CARNES BOVINAS)';
COMMENT ON COLUMN nf_itens.descricao_omie  IS 'Descrição do item conforme retornado pelo Omie';
COMMENT ON COLUMN notas_fiscais.fornecedor_id IS 'Fornecedor direto (para NFs sem pedido de compra vinculado)';
COMMENT ON COLUMN notas_fiscais.unidade_id    IS 'Unidade que recebeu a NF (usada para credenciais Omie)';
COMMENT ON COLUMN notas_fiscais.omie_num_nf   IS 'Número da NF no Omie (usado para lookup/consulta)';
