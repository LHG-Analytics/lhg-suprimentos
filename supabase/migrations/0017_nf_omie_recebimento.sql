-- Migration 0017: Colunas de controle de recebimento Omie em notas_fiscais
-- Permite associar e concluir recebimentos no Omie ERP.

ALTER TABLE notas_fiscais
  ADD COLUMN IF NOT EXISTS omie_receb_id  bigint  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS omie_concluido boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN notas_fiscais.omie_receb_id  IS 'ID do recebimento no Omie (nIdReceb)';
COMMENT ON COLUMN notas_fiscais.omie_concluido IS 'Indica se o recebimento foi concluído no Omie';
