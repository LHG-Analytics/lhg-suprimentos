-- =============================================================================
-- LHG Suprimentos — Migration 0005: Integração Omie
-- Adiciona credenciais Omie por unidade + tabela de logs de integração.
-- =============================================================================

-- ─── Credenciais Omie por unidade ────────────────────────────────────────────
-- Cada unidade tem seu próprio app_key/app_secret no Omie.
-- Guardamos criptografados via pgcrypto se disponível; se não, texto simples
-- (proteção via RLS e service_role na app).
ALTER TABLE unidades
  ADD COLUMN IF NOT EXISTS omie_app_key    text,
  ADD COLUMN IF NOT EXISTS omie_app_secret text;

-- ─── Corrige o seed inicial para refletir as 4 unidades reais ────────────────
-- Remove unidades antigas (do protótipo) e insere as corretas.
DELETE FROM unidades WHERE slug IN (
  'lush-vila-mariana', 'lush-moema', 'lush-santo-amaro',
  'lush-tatuape', 'lush-guarulhos'
);

INSERT INTO unidades (slug, nome, cidade, uf, cor_hex, ativa) VALUES
  ('lush-ipiranga', 'Lush Ipiranga',   'São Paulo', 'SP', '#10b981', true),  -- emerald-500
  ('lush-lapa',     'Lush Lapa',       'São Paulo', 'SP', '#38bdf8', true),  -- sky-400
  ('andar-de-cima', 'Andar de Cima',   'São Paulo', 'SP', '#f59e0b', true),  -- amber-500
  ('altana',        'Altana',          'São Paulo', 'SP', '#a78bfa', true)   -- violet-400
ON CONFLICT (slug) DO UPDATE SET
  nome      = EXCLUDED.nome,
  cidade    = EXCLUDED.cidade,
  uf        = EXCLUDED.uf,
  cor_hex   = EXCLUDED.cor_hex,
  ativa     = EXCLUDED.ativa;

-- ─── Tabela de logs de integração ────────────────────────────────────────────
-- Registra cada tentativa de sync (sucesso ou falha) por unidade + entidade.
CREATE TABLE IF NOT EXISTS integracao_logs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id   uuid        REFERENCES unidades(id) ON DELETE SET NULL,
  entidade     text        NOT NULL,     -- 'fornecedores' | 'produtos' | 'pedido'
  operacao     text        NOT NULL,     -- 'sync_full' | 'sync_page' | 'push_pedido'
  status       text        NOT NULL,     -- 'ok' | 'erro' | 'parcial'
  total        int         DEFAULT 0,    -- registros processados
  novos        int         DEFAULT 0,    -- upserts realizados
  erros        int         DEFAULT 0,    -- falhas
  detalhe      jsonb,                    -- payload extra (erro, paginação, etc.)
  duracao_ms   int,                      -- tempo total de execução
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integracao_logs_unidade
  ON integracao_logs(unidade_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_integracao_logs_entidade
  ON integracao_logs(entidade, status, created_at DESC);

-- ─── Colunas extras em fornecedores (originadas do Omie) ─────────────────────
ALTER TABLE fornecedores
  ADD COLUMN IF NOT EXISTS omie_unidade_id uuid REFERENCES unidades(id),
  ADD COLUMN IF NOT EXISTS omie_sincronizado_em timestamptz,
  ADD COLUMN IF NOT EXISTS cep          text,
  ADD COLUMN IF NOT EXISTS endereco     text,
  ADD COLUMN IF NOT EXISTS cidade       text,
  ADD COLUMN IF NOT EXISTS uf           text,
  ADD COLUMN IF NOT EXISTS contato      text;

-- ─── Colunas extras em produtos (originadas do Omie) ─────────────────────────
ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS omie_codigo           text UNIQUE,
  ADD COLUMN IF NOT EXISTS omie_descricao        text,
  ADD COLUMN IF NOT EXISTS omie_sincronizado_em  timestamptz,
  ADD COLUMN IF NOT EXISTS preco_custo           numeric(14,4),
  ADD COLUMN IF NOT EXISTS ncm                   text,
  ADD COLUMN IF NOT EXISTS ean                   text;
