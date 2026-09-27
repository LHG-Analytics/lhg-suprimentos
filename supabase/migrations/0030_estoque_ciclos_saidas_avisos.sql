-- 0030_estoque_ciclos_saidas_avisos.sql
--
-- Resumo dos avisos da última importação de saídas, guardado junto ao ciclo.
--
-- Por que persistir em vez de recalcular na tela: os avisos dependem de QUAIS
-- fichas venderam no mês, e isso só se sabe consultando o Automo — a mesma
-- consulta que leva até 9 s no Andar de Cima e cai com frequência. A importação
-- é o momento em que `estoque_ciclo_itens.saidas` é gravado; o resumo dos avisos
-- vai junto, para a tela mostrar os dois com a mesma origem e o mesmo instante.
--
-- Formato (JSON): { gerado_em, total, por_tipo: { insumo_pendente, unidade_incompativel,
--   sub_preparo_sem_receita, fora_do_ciclo, outro }, avisos: [{ tipo, texto }],
--   produtos_ignorados, itens_fora_do_ciclo } — ver lib/estoque/saidas-ciclo.ts.
-- NULL = nunca importou saídas (ou importou antes desta migration).

ALTER TABLE estoque_ciclos
  ADD COLUMN IF NOT EXISTS saidas_avisos jsonb,
  ADD COLUMN IF NOT EXISTS saidas_importadas_em timestamptz;

COMMENT ON COLUMN estoque_ciclos.saidas_avisos IS
  'Resumo dos avisos da última importação de saídas (baixa por ficha). NULL = ainda não importou. Ver lib/estoque/saidas-ciclo.ts.';
COMMENT ON COLUMN estoque_ciclos.saidas_importadas_em IS
  'Instante da última importação de saídas do Automo para este ciclo.';
