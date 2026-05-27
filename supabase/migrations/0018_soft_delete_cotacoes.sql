-- supabase/migrations/0018_soft_delete_cotacoes.sql
-- Adiciona soft delete à tabela cotacoes.
-- Linhas com deleted_at preenchido são consideradas excluídas.
-- Rodar no Supabase SQL Editor manualmente.

ALTER TABLE cotacoes
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Índice parcial para acelerar queries que filtram apenas registros ativos
CREATE INDEX IF NOT EXISTS idx_cotacoes_not_deleted
  ON cotacoes(created_at DESC)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN cotacoes.deleted_at IS
  'Timestamp de exclusão lógica. NULL = ativo. Preenchido = excluído (soft delete).';
