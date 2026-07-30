-- 0024_fornecedor_metricas.sql
--
-- View de métricas de fornecedor POR UNIDADE, com linha consolidada.
--
-- Motivação: `fornecedores.rating` é uma coluna `numeric DEFAULT 0` que nunca foi
-- escrita por ninguém — a UI mostrava "★ 0.0" para todos os 1.006 fornecedores.
-- Esta view calcula a nota a partir do histórico real, sem coluna materializada
-- e sem cron: sempre fresca, e reutilizável em /relatorios, /fornecedores,
-- na matriz de cotação e no chat IA.
--
-- Duas componentes (preço aparece UMA vez):
--   • Competitividade (60%) — gap médio vs o melhor preço da mesma disputa.
--     "% de vezes que foi o mais barato" NÃO entra: correlação de 0,892 com a
--     taxa de vitória, ou seja, contaria preço duas vezes.
--   • Pontualidade (40%) — entregas recebidas até `pedidos.entrega_prev`.
--
-- Convenção de linhas: `unidade_id = NULL` é o CONSOLIDADO (todas as unidades),
-- produzido via GROUPING SETS. O consolidado re-agrega as células cruas em vez de
-- fazer média de médias.
--
-- Amostra pequena não gera nota extrema: aplica-se shrinkage bayesiano puxando
-- o valor para a média da própria unidade (K_GAP = 10 células, K_PRAZO = 3 entregas).

DROP VIEW IF EXISTS fornecedor_metricas;

CREATE VIEW fornecedor_metricas
WITH (security_invoker = on) AS
WITH disputa AS (
  -- Só itens realmente disputados. Com 1 único fornecedor cotando, ele é
  -- trivialmente "o mais barato" e a nota seria inflada de graça.
  SELECT cotacao_item_id
  FROM cotacao_matriz
  WHERE preco_unitario > 0
  GROUP BY cotacao_item_id
  HAVING count(*) >= 2
),
melhor AS (
  SELECT cm.cotacao_item_id, min(cm.preco_unitario) AS menor
  FROM cotacao_matriz cm
  JOIN disputa d ON d.cotacao_item_id = cm.cotacao_item_id
  WHERE cm.preco_unitario > 0
  GROUP BY cm.cotacao_item_id
),
celulas AS (
  SELECT cu.unidade_id,
         cm.fornecedor_id,
         (cm.preco_unitario - m.menor) / m.menor AS gap
  FROM cotacao_matriz cm
  JOIN melhor           m  ON m.cotacao_item_id = cm.cotacao_item_id
  JOIN cotacao_itens    ci ON ci.id            = cm.cotacao_item_id
  JOIN cotacoes         c  ON c.id             = ci.cotacao_id
  JOIN cotacao_unidades cu ON cu.cotacao_id    = c.id
  WHERE cm.preco_unitario > 0
    AND c.deleted_at IS NULL
),
comp AS (
  SELECT unidade_id,
         fornecedor_id,
         count(*)::int AS cotacao_celulas,
         avg(gap)      AS gap_medio
  FROM celulas
  GROUP BY GROUPING SETS ((unidade_id, fornecedor_id), (fornecedor_id))
),
comp_ref AS (
  -- Média de gap da unidade (e global), destino do shrinkage
  SELECT unidade_id, avg(gap) AS gap_ref
  FROM celulas
  GROUP BY GROUPING SETS ((unidade_id), ())
),
recebimento AS (
  SELECT pedido_id, min(created_at)::date AS recebido
  FROM pedido_eventos
  WHERE tipo = 'recebimento'
  GROUP BY pedido_id
),
entregas AS (
  SELECT pu.unidade_id,
         p.fornecedor_id,
         (r.recebido <= p.entrega_prev) AS no_prazo
  FROM pedidos          p
  JOIN recebimento      r  ON r.pedido_id  = p.id
  JOIN pedido_unidades  pu ON pu.pedido_id = p.id
  WHERE p.status IN ('recebido', 'finalizado')
    AND p.entrega_prev IS NOT NULL
),
pont AS (
  SELECT unidade_id,
         fornecedor_id,
         count(*)::int                             AS entregas,
         (count(*) FILTER (WHERE no_prazo))::int   AS entregas_no_prazo
  FROM entregas
  GROUP BY GROUPING SETS ((unidade_id, fornecedor_id), (fornecedor_id))
),
pont_ref AS (
  SELECT unidade_id,
         avg(CASE WHEN no_prazo THEN 1.0 ELSE 0.0 END) AS taxa_ref
  FROM entregas
  GROUP BY GROUPING SETS ((unidade_id), ())
),
base AS (
  SELECT unidade_id, fornecedor_id FROM comp
  UNION
  SELECT unidade_id, fornecedor_id FROM pont
),
ajustado AS (
  SELECT b.unidade_id,
         b.fornecedor_id,
         c.cotacao_celulas,
         c.gap_medio,
         p.entregas,
         p.entregas_no_prazo,
         -- Shrinkage: n pequeno → puxa para a média da unidade; n grande → valor próprio
         CASE WHEN c.cotacao_celulas >= 10 THEN
           (c.cotacao_celulas * c.gap_medio + 10 * cr.gap_ref) / (c.cotacao_celulas + 10)
         END AS gap_ajustado,
         CASE WHEN p.entregas >= 3 THEN
           (p.entregas_no_prazo + 3 * pr.taxa_ref) / (p.entregas + 3)
         END AS taxa_prazo_ajustada
  FROM base b
  LEFT JOIN comp     c  ON c.fornecedor_id  = b.fornecedor_id
                       AND c.unidade_id     IS NOT DISTINCT FROM b.unidade_id
  LEFT JOIN pont     p  ON p.fornecedor_id  = b.fornecedor_id
                       AND p.unidade_id     IS NOT DISTINCT FROM b.unidade_id
  LEFT JOIN comp_ref cr ON cr.unidade_id    IS NOT DISTINCT FROM b.unidade_id
  LEFT JOIN pont_ref pr ON pr.unidade_id    IS NOT DISTINCT FROM b.unidade_id
),
scores AS (
  SELECT a.*,
         -- gap 0% → 1,0 · gap >= 20% → 0
         -- ⚠️ O CASE externo é obrigatório: no Postgres GREATEST/LEAST IGNORAM NULL
         -- (`least(1, NULL)` = 1), então sem ele um fornecedor sem amostra receberia
         -- competitividade 1,0 — nota máxima de graça.
         CASE WHEN a.gap_ajustado IS NULL THEN NULL
              ELSE greatest(0, least(1, 1 - a.gap_ajustado / 0.20))
         END                   AS score_comp,
         a.taxa_prazo_ajustada AS score_pont
  FROM ajustado a
)
SELECT
  fornecedor_id,
  unidade_id,                                        -- NULL = consolidado
  coalesce(cotacao_celulas, 0)   AS cotacao_celulas,
  round(gap_medio * 100, 1)      AS gap_medio_pct,
  coalesce(entregas, 0)          AS entregas,
  coalesce(entregas_no_prazo, 0) AS entregas_no_prazo,
  round(score_pont * 100)        AS pontualidade_pct,
  round(score_comp * 100)        AS competitividade_pct,
  -- Pesos renormalizados quando só uma das componentes tem amostra suficiente
  CASE WHEN score_comp IS NULL AND score_pont IS NULL THEN NULL
       ELSE round(
         1 + 4 * (
           ( coalesce(score_comp, 0) * CASE WHEN score_comp IS NULL THEN 0 ELSE 0.6 END
           + coalesce(score_pont, 0) * CASE WHEN score_pont IS NULL THEN 0 ELSE 0.4 END )
           /
           ( CASE WHEN score_comp IS NULL THEN 0 ELSE 0.6 END
           + CASE WHEN score_pont IS NULL THEN 0 ELSE 0.4 END )
         ), 1)
  END AS rating,
  -- Lastro da nota, para a UI não igualar um 4,5 de 165 cotações a um 4,6 de 3 entregas
  CASE
    WHEN score_comp IS NULL AND score_pont IS NULL THEN NULL
    WHEN score_comp IS NULL OR  score_pont IS NULL THEN 'parcial'
    WHEN cotacao_celulas >= 30 AND entregas >= 5   THEN 'alta'
    ELSE 'media'
  END AS confianca
FROM scores;

COMMENT ON VIEW fornecedor_metricas IS
  'Rating de fornecedor por unidade (unidade_id NULL = consolidado). '
  'rating = 1 + 4 * (0.6*competitividade + 0.4*pontualidade), escala 1.0-5.0, '
  'NULL quando a amostra é insuficiente. Ver 0024_fornecedor_metricas.sql.';

GRANT SELECT ON fornecedor_metricas TO authenticated;
