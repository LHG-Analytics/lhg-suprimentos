-- =============================================================================
-- LHG Suprimentos — Migration 0007: Google Sheet ID por Unidade
-- Cada unidade tem sua própria planilha de orçamento no Google Sheets.
-- =============================================================================

-- Adiciona colunas de configuração do Google Sheets na tabela unidades.
ALTER TABLE unidades
  ADD COLUMN IF NOT EXISTS google_sheet_id   text,
  ADD COLUMN IF NOT EXISTS google_sheet_name text NOT NULL DEFAULT 'Custos';

-- ── Seed: Lush Ipiranga ───────────────────────────────────────────────────────
-- Atualiza a unidade Lush Ipiranga com o ID da planilha de orçamento.
-- Identificada pelo slug 'lush-ipiranga'.
UPDATE unidades
  SET
    google_sheet_id   = '1g-pJVqA4jyHE2UEshKAlX6wCvRHQX6N9zQNSnDiYl84',
    google_sheet_name = 'Custos'
  WHERE slug = 'lush-ipiranga';

-- ── Comentários ───────────────────────────────────────────────────────────────
COMMENT ON COLUMN unidades.google_sheet_id IS
  'ID da planilha Google Sheets de orçamento desta unidade (parte da URL: /spreadsheets/d/ID/edit). Planilha deve ser pública ("Qualquer pessoa com o link pode ver").';

COMMENT ON COLUMN unidades.google_sheet_name IS
  'Nome da aba na planilha que contém o orçamento (padrão: Custos).';
