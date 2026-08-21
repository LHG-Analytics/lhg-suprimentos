-- 0028_estoque_entradas_por_cnpj.sql
--
-- Detalhamento das entradas por unidade fiscal (CNPJ) dentro de um mesmo estoque.
--
-- Decisão do usuário (21/08): o Lush Ipiranga tem UM estoque físico, alimentado por
-- dois CNPJs (RCC e CONCAVO). O saldo e a divergência são do motel — a prateleira é
-- uma só e a mercadoria não vem etiquetada por CNPJ, então repartir a contagem
-- física exigiria uma regra de rateio e a divergência de cada CNPJ viraria ficção.
--
-- O que é possível e é o que esta tabela entrega: mostrar de onde veio cada entrada.
-- `estoque_ciclo_itens.entradas` continua sendo o TOTAL; aqui fica o rateio real
-- por origem, que veio do próprio Omie de cada conta.

CREATE TABLE IF NOT EXISTS estoque_ciclo_item_entradas (
  ciclo_item_id uuid NOT NULL REFERENCES estoque_ciclo_itens(id) ON DELETE CASCADE,
  unidade_id    uuid NOT NULL REFERENCES unidades(id)            ON DELETE CASCADE,
  quantidade    numeric(12,3) NOT NULL DEFAULT 0,
  importado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ciclo_item_id, unidade_id)
);

CREATE INDEX IF NOT EXISTS estoque_ciclo_item_entradas_item_idx
  ON estoque_ciclo_item_entradas (ciclo_item_id);

ALTER TABLE estoque_ciclo_item_entradas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read estoque_ciclo_item_entradas"  ON estoque_ciclo_item_entradas;
DROP POLICY IF EXISTS "authenticated write estoque_ciclo_item_entradas" ON estoque_ciclo_item_entradas;
CREATE POLICY "authenticated read estoque_ciclo_item_entradas" ON estoque_ciclo_item_entradas
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated write estoque_ciclo_item_entradas" ON estoque_ciclo_item_entradas
  FOR ALL USING (auth.uid() IS NOT NULL);

COMMENT ON TABLE estoque_ciclo_item_entradas IS
  'Entradas de um item do ciclo, detalhadas por CNPJ de origem. O total fica em '
  'estoque_ciclo_itens.entradas; aqui é o rateio por conta Omie. O saldo e a '
  'divergência continuam sendo do local físico — ver migration 0028 e o spec.';
