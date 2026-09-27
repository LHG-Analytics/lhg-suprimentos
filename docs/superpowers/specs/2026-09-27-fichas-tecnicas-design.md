# Fichas técnicas — baixa de estoque 1:N (Lush Ipiranga)

**Data:** 2026-09-27 · **Branch:** `feat/fichas-tecnicas` · **Migration:** 0029

## Problema

O módulo de estoque baixa 1 venda do Automo em 1 item de estoque por `fator_conversao`
(1:1). Pratos, drinks e combos consomem N insumos, então a venda deles não baixava nada
e a divergência da contagem lia como furto (ver M18/"Ficha técnica" no CLAUDE.md).

## Fonte dos dados

- Dois PDFs escaneados (livro de montagem dos pratos, 61 pág.; manual de drinks, 52 pág.)
  transcritos para `docs/fichas-tecnicas/lush-ipiranga/fichas.csv` (pasta gitignored).
- Casamento com o **Automo do Ipiranga** (Postgres do PDV, `produto` com `dataexclusao IS NULL`,
  353 produtos) e com o **catálogo de compra LHG** (`produtos` das unidades fiscais RCC + CONCAVO,
  só códigos INS/CONS/PSV e revenda — o espelho do cardápio vindo do Omie, 303 produtos com
  código numérico, fica de fora).
- Resultado aceito pelo Danilo em 27/09/2026: 88/94 pratos e drinks, 24 + 94 insumos.

## Modelo

- `fichas_tecnicas` (por `local_id`): `tipo` venda (tem `automo_produto_id`) ou sub_preparo
  (sem produto; usada por outras fichas). `rendimento` + `rendimento_unidade`: prato = porções
  (1), sub-preparo = quantidade produzida por lote. Vigência (`vigencia_inicio` 2026-09-01).
- `ficha_tecnica_itens`: exatamente um destino — `estoque_item_id` (insumo comprado),
  `ficha_filha_id` (sub-preparo) ou `insumo_pendente` (decisão pendente: ambíguo, sem produto,
  sem unidade, q.b.). `quantidade`/`unidade` (g, kg, ml, L, un) por rendimento; `perda_pct`
  explícita, quantidade sempre líquida.
- RLS igual a `estoque_itens`: leitura autenticada, escrita comprador/admin.

## Cálculo (`lib/estoque/fichas.ts`)

`consumo = vendas ÷ rendimento × quantidade ÷ (1 − perda_pct/100)`, convertido para a
unidade de compra do item (`produtos.unidade_med`). Sub-preparo é recursivo; ciclo é erro.
Regras honestas: unidade incompatível (g × UN) e insumo pendente **não viram número** —
geram aviso e o item fica fora do mapa (ausência é "não sei"). Produto com ficha e vínculo
1:1 usa só a ficha. `converterSaidasComFichas` soma com o caminho 1:1 para revenda.

## Carga

`scripts/seed-fichas-ipiranga.mjs` (dry-run por padrão, `--apply` grava). Idempotente
por chaves naturais; só `local_id` do Lush Ipiranga. Carga de 27/09/2026: 94 estoque_itens,
89 fichas de venda, 13 sub-preparos com receita, 51 sub-preparos vazios pendentes,
514 itens (192 estoque, 103 ficha filha, 219 pendentes).

## Pendências

- 6 pratos `pendente_cadastro` no Automo; 219 itens pendentes (decisão do Danilo);
  51 sub-preparos sem receita (cozinha).
- Unidades de cozinha estimadas (marcadas com `~` na obs do CSV) a confirmar na prática.
- Integrar `converterSaidasComFichas` na importação de saídas do ciclo (tela de contagem)
  e exibir os avisos — fora desta rodada.
