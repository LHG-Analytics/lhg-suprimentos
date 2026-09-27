-- 0029_fichas_tecnicas.sql
--
-- Fichas técnicas por local de estoque: 1 venda no Automo baixa N insumos.
-- Generaliza `estoque_itens.fator_conversao` (1:1), que continua valendo para
-- revenda (Coca, cerveja). Quando um produto do Automo tem ficha, a ficha vence.
--
-- Decisões (transcrição das fichas do Lush Ipiranga, set/2026):
-- - Uma ficha por (local, produto do Automo, vigência): a mesma receita pode ter
--   quantidades diferentes por casa, e a ficha do Ipiranga NÃO vale para a Lapa.
-- - Sub-preparo (molho, espuma, xarope) é uma ficha SEM produto do Automo, usada
--   por outras fichas via `ficha_filha_id`. É a "ficha dentro de ficha".
-- - `perda_pct` explícita (a ficha dá o peso líquido; a compra é do bruto).
-- - Quantidade sempre em g/kg/ml/L/un; unidade de cozinha (fatia, folha, jarra)
--   é convertida ANTES de gravar — a tabela não aceita "fatia".
-- - Mesmo padrão de RLS de `estoque_itens`: leitura autenticada, escrita comprador/admin.
--
-- ⚠️ Não aplicada em produção até confirmação do Danilo (branch feat/fichas-tecnicas).

CREATE TABLE IF NOT EXISTS fichas_tecnicas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id           uuid NOT NULL REFERENCES locais_estoque(id) ON DELETE CASCADE,
  -- produto.id no banco do Automo (integer lá). NULL = sub-preparo.
  automo_produto_id  integer,
  nome               text NOT NULL,
  tipo               text NOT NULL DEFAULT 'venda' CHECK (tipo IN ('venda', 'sub_preparo')),
  -- Prato: porções que a ficha rende (quase sempre 1). Sub-preparo: quantidade
  -- produzida por lote, na `rendimento_unidade` (ex.: 0,960 kg de caramelo).
  rendimento         numeric(12,3) NOT NULL DEFAULT 1 CHECK (rendimento > 0),
  rendimento_unidade text NOT NULL DEFAULT 'un' CHECK (rendimento_unidade IN ('g', 'kg', 'ml', 'L', 'un')),
  vigencia_inicio    date NOT NULL DEFAULT '2026-09-01',
  vigencia_fim       date CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio),
  -- "PRATOS p.21" — de onde a ficha foi transcrita
  origem             text,
  obs                text,
  ativo              boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  -- venda precisa do produto do Automo; sub-preparo não pode ter
  CONSTRAINT fichas_tecnicas_tipo_automo CHECK (
    (tipo = 'venda' AND automo_produto_id IS NOT NULL) OR
    (tipo = 'sub_preparo' AND automo_produto_id IS NULL)
  )
);

-- Um produto do Automo tem no máximo UMA ficha por vigência em cada local.
CREATE UNIQUE INDEX IF NOT EXISTS fichas_tecnicas_local_automo_vigencia_idx
  ON fichas_tecnicas (local_id, automo_produto_id, vigencia_inicio)
  WHERE automo_produto_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fichas_tecnicas_local_idx ON fichas_tecnicas (local_id) WHERE ativo;

CREATE TABLE IF NOT EXISTS ficha_tecnica_itens (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ficha_id         uuid NOT NULL REFERENCES fichas_tecnicas(id) ON DELETE CASCADE,
  -- insumo comprado OU sub-preparo (outra ficha) — exatamente um dos dois
  estoque_item_id  uuid REFERENCES estoque_itens(id) ON DELETE RESTRICT,
  ficha_filha_id   uuid REFERENCES fichas_tecnicas(id) ON DELETE RESTRICT,
  -- por RENDIMENTO da ficha, na `unidade`
  quantidade       numeric(12,4) NOT NULL CHECK (quantidade > 0),
  unidade          text NOT NULL CHECK (unidade IN ('g', 'kg', 'ml', 'L', 'un')),
  -- % perdida antes de chegar ao prato (casca, aparas). Consumo = quantidade / (1 - perda/100).
  perda_pct        numeric(5,2) NOT NULL DEFAULT 0 CHECK (perda_pct >= 0 AND perda_pct < 100),
  ordem            integer NOT NULL DEFAULT 0,
  obs              text,
  CONSTRAINT ficha_tecnica_itens_um_destino CHECK (
    (estoque_item_id IS NOT NULL AND ficha_filha_id IS NULL) OR
    (estoque_item_id IS NULL AND ficha_filha_id IS NOT NULL)
  ),
  CONSTRAINT ficha_tecnica_itens_sem_auto_referencia CHECK (ficha_filha_id IS DISTINCT FROM ficha_id)
);

CREATE INDEX IF NOT EXISTS ficha_tecnica_itens_ficha_idx   ON ficha_tecnica_itens (ficha_id);
CREATE INDEX IF NOT EXISTS ficha_tecnica_itens_estoque_idx ON ficha_tecnica_itens (estoque_item_id) WHERE estoque_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ficha_tecnica_itens_filha_idx   ON ficha_tecnica_itens (ficha_filha_id)  WHERE ficha_filha_id  IS NOT NULL;

-- ── RLS (mesmo padrão de estoque_itens, migration 0026) ──────────────────────
ALTER TABLE fichas_tecnicas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ficha_tecnica_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read fichas_tecnicas"    ON fichas_tecnicas;
DROP POLICY IF EXISTS "comprador admin write fichas_tecnicas" ON fichas_tecnicas;
CREATE POLICY "authenticated read fichas_tecnicas" ON fichas_tecnicas
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "comprador admin write fichas_tecnicas" ON fichas_tecnicas
  FOR ALL USING (current_user_role() IN ('comprador', 'admin'));

DROP POLICY IF EXISTS "authenticated read ficha_tecnica_itens"    ON ficha_tecnica_itens;
DROP POLICY IF EXISTS "comprador admin write ficha_tecnica_itens" ON ficha_tecnica_itens;
CREATE POLICY "authenticated read ficha_tecnica_itens" ON ficha_tecnica_itens
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "comprador admin write ficha_tecnica_itens" ON ficha_tecnica_itens
  FOR ALL USING (current_user_role() IN ('comprador', 'admin'));

COMMENT ON TABLE fichas_tecnicas IS
  'Ficha técnica por local: 1 produto vendido no Automo → N insumos. tipo=sub_preparo é ficha usada por outras fichas (sem produto do Automo).';
COMMENT ON COLUMN fichas_tecnicas.rendimento IS
  'Prato: porções por preparo. Sub-preparo: quantidade produzida por lote, na rendimento_unidade.';
COMMENT ON COLUMN ficha_tecnica_itens.perda_pct IS
  'Perda antes do prato (casca, aparas). Consumo bruto = quantidade / (1 - perda_pct/100). Ver lib/estoque/fichas.ts.';
COMMENT ON COLUMN ficha_tecnica_itens.unidade IS
  'Só g/kg/ml/L/un. Unidade de cozinha (fatia, folha, jarra) é convertida antes de gravar; a conversão para a unidade de compra é feita em lib/estoque/fichas.ts.';
