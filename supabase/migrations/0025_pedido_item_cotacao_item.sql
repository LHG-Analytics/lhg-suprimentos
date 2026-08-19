-- 0025_pedido_item_cotacao_item.sql
--
-- Vínculo explícito entre a linha do pedido e o item da cotação que a originou.
--
-- Motivação: a cotação pode ser fechada em rodadas (um fornecedor agora, o resto
-- depois), então o sistema precisa saber quais itens JÁ viraram pedido para decidir
-- se a cotação está completa. Hoje isso só é inferível por `produto_id`, o que:
--   • falha se o mesmo produto aparece em dois itens da cotação;
--   • obriga a derivar de `cotacao_itens.selecionado_forn`, que é estado mutável —
--     desmarcar uma célula na matriz "desfazia" uma compra já enviada ao Omie.
--
-- Com esta coluna, "item já pedido" passa a ser fato registrado, não inferência.

ALTER TABLE pedido_itens
  ADD COLUMN IF NOT EXISTS cotacao_item_id uuid REFERENCES cotacao_itens(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pedido_itens_cotacao_item_idx
  ON pedido_itens (cotacao_item_id)
  WHERE cotacao_item_id IS NOT NULL;

-- Backfill: casa por (cotação do pedido, produto). Onde o mesmo produto aparece em
-- mais de um item da mesma cotação a correspondência é ambígua — nesses casos a
-- coluna fica NULL em vez de chutar, e o vínculo passa a ser gravado corretamente
-- daqui pra frente pela Server Action.
WITH candidatos AS (
  SELECT pi.id AS pedido_item_id,
         ci.id AS cotacao_item_id,
         count(*) OVER (PARTITION BY pi.id) AS quantos
  FROM pedido_itens  pi
  JOIN pedidos       p  ON p.id = pi.pedido_id
  JOIN cotacao_itens ci ON ci.cotacao_id = p.cotacao_id
                       AND ci.produto_id = pi.produto_id
  WHERE p.cotacao_id IS NOT NULL
    AND pi.produto_id IS NOT NULL
    AND pi.cotacao_item_id IS NULL
)
UPDATE pedido_itens pi
SET cotacao_item_id = c.cotacao_item_id
FROM candidatos c
WHERE pi.id = c.pedido_item_id
  AND c.quantos = 1;

COMMENT ON COLUMN pedido_itens.cotacao_item_id IS
  'Item da cotação que originou esta linha. NULL em pedidos avulsos ou em linhas '
  'antigas cuja correspondência por produto era ambígua. Ver 0025.';
