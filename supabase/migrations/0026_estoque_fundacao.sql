-- 0026_estoque_fundacao.sql
--
-- Fundação do módulo de estoque. O estoque é do LHG Supplies: a estrutura é
-- plana (um local por local físico) e os ids do Omie/Automo entram apenas como
-- parâmetro de leitura, nunca como estrutura.
--
-- Ver docs/superpowers/specs/2026-08-20-modulo-estoque-design.md

-- ── Locais de estoque (nossos) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS locais_estoque (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            text NOT NULL,
  slug            text NOT NULL UNIQUE,
  -- Qual DATABASE_URL_LOCAL_* usar para ler as saídas do Automo
  automo_conn_key text,
  ativo           boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Unidades fiscais que abastecem cada local (N:1) ───────────────────────────
-- RCC e CONCAVO apontam para o mesmo local: as entradas dos dois CNPJs somam no
-- mesmo estoque e a venda baixa uma vez.
CREATE TABLE IF NOT EXISTS local_unidade (
  local_id   uuid NOT NULL REFERENCES locais_estoque(id) ON DELETE CASCADE,
  unidade_id uuid NOT NULL REFERENCES unidades(id)        ON DELETE CASCADE,
  PRIMARY KEY (local_id, unidade_id)
);

-- ── Lista curada de itens controlados ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS estoque_itens (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id          uuid NOT NULL REFERENCES locais_estoque(id) ON DELETE CASCADE,
  produto_id        uuid NOT NULL REFERENCES produtos(id),
  -- produto.id no banco do Automo (integer lá)
  automo_produto_id integer,
  -- 1 venda no Automo = N unidades de compra no Omie (0,4 kg por porção, etc)
  fator_conversao   numeric(12,4) NOT NULL DEFAULT 1 CHECK (fator_conversao > 0),
  estoque_ideal     numeric(12,3) NOT NULL DEFAULT 0 CHECK (estoque_ideal >= 0),
  ativo             boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (local_id, produto_id)
);

CREATE INDEX IF NOT EXISTS estoque_itens_local_idx  ON estoque_itens (local_id) WHERE ativo;
CREATE INDEX IF NOT EXISTS estoque_itens_automo_idx ON estoque_itens (local_id, automo_produto_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE locais_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_unidade  ENABLE ROW LEVEL SECURITY;
ALTER TABLE estoque_itens  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read locais_estoque"    ON locais_estoque;
DROP POLICY IF EXISTS "comprador admin write locais_estoque" ON locais_estoque;
CREATE POLICY "authenticated read locais_estoque" ON locais_estoque
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "comprador admin write locais_estoque" ON locais_estoque
  FOR ALL USING (current_user_role() IN ('comprador', 'admin'));

DROP POLICY IF EXISTS "authenticated read local_unidade"    ON local_unidade;
DROP POLICY IF EXISTS "comprador admin write local_unidade" ON local_unidade;
CREATE POLICY "authenticated read local_unidade" ON local_unidade
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "comprador admin write local_unidade" ON local_unidade
  FOR ALL USING (current_user_role() IN ('comprador', 'admin'));

DROP POLICY IF EXISTS "authenticated read estoque_itens"    ON estoque_itens;
DROP POLICY IF EXISTS "comprador admin write estoque_itens" ON estoque_itens;
CREATE POLICY "authenticated read estoque_itens" ON estoque_itens
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "comprador admin write estoque_itens" ON estoque_itens
  FOR ALL USING (current_user_role() IN ('comprador', 'admin'));

-- ── Seed: os 4 locais físicos ─────────────────────────────────────────────────
INSERT INTO locais_estoque (nome, slug, automo_conn_key) VALUES
  ('Lush Ipiranga',  'lush-ipiranga',  'DATABASE_URL_LOCAL_IPIRANGA'),
  ('Lush Lapa',      'lush-lapa',      'DATABASE_URL_LOCAL_LAPA'),
  ('Andar de Cima',  'andar-de-cima',  'DATABASE_URL_LOCAL_ANDAR_DE_CIMA'),
  ('Altana',         'altana',         'DATABASE_URL_LOCAL_ALTANA')
ON CONFLICT (slug) DO NOTHING;

-- ── Seed: vínculos fiscais ────────────────────────────────────────────────────
-- Ipiranga recebe RCC e CONCAVO (dois CNPJs, um estoque).
INSERT INTO local_unidade (local_id, unidade_id)
SELECT l.id, u.id
FROM locais_estoque l
JOIN unidades u ON u.slug IN ('lush-ipiranga', 'lush-ipiranga-concavo')
WHERE l.slug = 'lush-ipiranga'
ON CONFLICT DO NOTHING;

INSERT INTO local_unidade (local_id, unidade_id)
SELECT l.id, u.id
FROM locais_estoque l
JOIN unidades u ON u.slug = l.slug
WHERE l.slug IN ('lush-lapa', 'andar-de-cima', 'altana')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE locais_estoque IS
  'Locais de estoque do LHG Supplies. Estrutura própria e plana — não espelha os '
  'depósitos do Automo (frigobar por apartamento) nem os locais do Omie.';
COMMENT ON TABLE local_unidade IS
  'Unidades fiscais (CNPJs) que abastecem cada local. RCC e CONCAVO -> Lush Ipiranga.';
