-- 0027_estoque_ciclos.sql
--
-- Ciclos de contagem de estoque. Um ciclo = um mês por local; a equipe conta no
-- celular, dentro do estoque, e o resultado alimenta a divergência.
--
-- Ver spec: D6b (mobile, item a item, quem contou) e D6c (movimento NULL).

CREATE TABLE IF NOT EXISTS estoque_ciclos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id    uuid NOT NULL REFERENCES locais_estoque(id) ON DELETE CASCADE,
  -- Sempre o dia 1 do mês de referência (contagem é mensal)
  mes         date NOT NULL,
  status      text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'fechado')),
  aberto_em   timestamptz NOT NULL DEFAULT now(),
  aberto_por  uuid REFERENCES user_profiles(id),
  fechado_em  timestamptz,
  fechado_por uuid REFERENCES user_profiles(id),
  UNIQUE (local_id, mes)
);

-- Um único ciclo aberto por local: contagem mensal não se sobrepõe, e dois
-- ciclos abertos deixariam ambíguo em qual a equipe está contando.
CREATE UNIQUE INDEX IF NOT EXISTS estoque_ciclos_um_aberto_idx
  ON estoque_ciclos (local_id) WHERE status = 'aberto';

CREATE TABLE IF NOT EXISTS estoque_ciclo_itens (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id          uuid NOT NULL REFERENCES estoque_ciclos(id) ON DELETE CASCADE,
  estoque_item_id   uuid NOT NULL REFERENCES estoque_itens(id) ON DELETE CASCADE,
  -- Do contagem_atual do ciclo anterior deste mesmo item
  contagem_anterior numeric(12,3),
  -- NULL = ainda não importado (D6c). NUNCA default 0: com zero o teórico viraria
  -- contagem_anterior e a divergência acusaria furo inventado.
  entradas          numeric(12,3),
  saidas            numeric(12,3),
  contagem_atual    numeric(12,3),
  contado_por       uuid REFERENCES user_profiles(id),
  contado_em        timestamptz,
  UNIQUE (ciclo_id, estoque_item_id)
);

CREATE INDEX IF NOT EXISTS estoque_ciclo_itens_ciclo_idx ON estoque_ciclo_itens (ciclo_id);

ALTER TABLE estoque_ciclos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE estoque_ciclo_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read estoque_ciclos"  ON estoque_ciclos;
DROP POLICY IF EXISTS "authenticated write estoque_ciclos" ON estoque_ciclos;
CREATE POLICY "authenticated read estoque_ciclos" ON estoque_ciclos
  FOR SELECT USING (auth.uid() IS NOT NULL);
-- Contagem é trabalho de campo: solicitante também conta, não só comprador.
CREATE POLICY "authenticated write estoque_ciclos" ON estoque_ciclos
  FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated read estoque_ciclo_itens"  ON estoque_ciclo_itens;
DROP POLICY IF EXISTS "authenticated write estoque_ciclo_itens" ON estoque_ciclo_itens;
CREATE POLICY "authenticated read estoque_ciclo_itens" ON estoque_ciclo_itens
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated write estoque_ciclo_itens" ON estoque_ciclo_itens
  FOR ALL USING (auth.uid() IS NOT NULL);

COMMENT ON TABLE estoque_ciclos IS
  'Ciclo mensal de contagem por local. Índice parcial garante um único aberto por local.';
COMMENT ON COLUMN estoque_ciclo_itens.entradas IS
  'NULL = ainda não importado do Omie. Nunca 0 por default — ver D6c do spec.';
