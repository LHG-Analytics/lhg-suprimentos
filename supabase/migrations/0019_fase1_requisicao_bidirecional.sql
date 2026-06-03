-- Migration 0019: Fase 1 - Requisições bidirecionais + produto livre
-- Rodada manualmente no Supabase SQL Editor em 2026-06-03

-- 1. Adicionar campos de sync Omie na tabela requisicoes
ALTER TABLE requisicoes
  ADD COLUMN IF NOT EXISTS omie_codigo          BIGINT,
  ADD COLUMN IF NOT EXISTS omie_unidade_id      UUID REFERENCES unidades(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS omie_sincronizado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS origem               TEXT NOT NULL DEFAULT 'plataforma';

-- 2. Adicionar novos valores ao enum req_status
ALTER TYPE req_status ADD VALUE IF NOT EXISTS 'pendente_produto';
ALTER TYPE req_status ADD VALUE IF NOT EXISTS 'aguardando_cotacao';

-- 3. Modificar requisicao_itens para suportar produto livre
ALTER TABLE requisicao_itens
  ALTER COLUMN produto_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS produto_nome_livre  TEXT,
  ADD COLUMN IF NOT EXISTS produto_unidade_med TEXT,
  ADD COLUMN IF NOT EXISTS produto_novo        BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE requisicao_itens
  DROP CONSTRAINT IF EXISTS chk_produto_definido;
ALTER TABLE requisicao_itens
  ADD CONSTRAINT chk_produto_definido
  CHECK (produto_id IS NOT NULL OR produto_nome_livre IS NOT NULL);

-- 4. Criar tabela espelho omie_requisicoes
CREATE TABLE IF NOT EXISTS omie_requisicoes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id            UUID NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  omie_codigo           BIGINT NOT NULL,
  numero                TEXT,
  data_requisicao       DATE,
  data_necessidade      DATE,
  observacao            TEXT,
  situacao              TEXT,
  departamento          TEXT,
  solicitante_nome      TEXT,
  valor_total           NUMERIC(12,2),
  itens                 JSONB,
  requisicao_id         UUID REFERENCES requisicoes(id) ON DELETE SET NULL,
  omie_sincronizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(omie_codigo, unidade_id)
);

ALTER TABLE omie_requisicoes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'omie_requisicoes'
      AND policyname = 'usuarios_autenticados_podem_ler_omie_requisicoes'
  ) THEN
    EXECUTE 'CREATE POLICY "usuarios_autenticados_podem_ler_omie_requisicoes"
             ON omie_requisicoes FOR SELECT USING (auth.role() = ''authenticated'')';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'omie_requisicoes'
      AND policyname = 'service_role_gerencia_omie_requisicoes'
  ) THEN
    EXECUTE 'CREATE POLICY "service_role_gerencia_omie_requisicoes"
             ON omie_requisicoes FOR ALL USING (auth.role() = ''service_role'')';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_omie_requisicoes_unidade    ON omie_requisicoes(unidade_id);
CREATE INDEX IF NOT EXISTS idx_omie_requisicoes_data       ON omie_requisicoes(data_requisicao DESC);
CREATE INDEX IF NOT EXISTS idx_omie_requisicoes_requisicao ON omie_requisicoes(requisicao_id);
