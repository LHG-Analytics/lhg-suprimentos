-- migration 0012 — rastreio de email por fornecedor na cotação
-- Adiciona email_enviado_em em cotacao_fornecedores para registrar
-- quando o convite de cotação foi enviado a cada fornecedor.

ALTER TABLE cotacao_fornecedores
  ADD COLUMN IF NOT EXISTS email_enviado_em TIMESTAMPTZ;

COMMENT ON COLUMN cotacao_fornecedores.email_enviado_em IS
  'Timestamp do último envio de email de cotação para este fornecedor. NULL = não enviado.';
