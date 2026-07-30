# Rating de fornecedores + Top Produtos + Top Categorias

**Data:** 2026-07-30
**Issue:** LHG-250
**Escopo:** tela `/relatorios`

---

## Problema

1. **`★ 0.0` em todos os fornecedores.** `fornecedores.rating` é uma coluna `numeric(2,1) DEFAULT 0` criada na migration 0001 e **nunca escrita por nenhum código**. As colunas irmãs `pontualidade_pct` e `competitividade_pct` estão no mesmo estado. Não era bug de cálculo — nunca existiu cálculo.
2. **Economia acumulada ignorava a unidade ativa.** O filtro por unidade era aplicado só a `pedidos` (via `pedido_unidades`); as três queries de `cotacoes` rodavam sem filtro, então toda unidade exibia os R$ 29.114,63 do consolidado.
3. **Duas abas redundantes.** "Top fornecedores" e "Por fornecedor" mostravam os mesmos 12 fornecedores, só mudando tabela vs cards — o próprio código admitia (`{/* mesmo conteúdo, view alternativa */}`).
4. **Sem visão de produto ou de concentração por categoria.** A pizza mostrava o peso de cada categoria, mas nada dizia onde o dinheiro está por item nem onde há dependência de fornecedor único.

## Inventário de sinais disponíveis

Levantado no banco antes de desenhar a fórmula:

| Sinal | Dado | Viável |
|---|---|---|
| Competitividade de preço | 2.629 células em `cotacao_matriz`, 53 fornecedores | ✅ |
| Pontualidade | `entrega_prev` em 213/213 pedidos + 217 eventos `recebimento` | ✅ |
| Taxa de vitória | 1.119/1.146 `cotacao_itens` com `selecionado_forn` | ✅ mas redundante (ver abaixo) |
| Tempo de resposta à cotação | `email_enviado_em` preenchido em **1 de 354** | ❌ |
| Divergência de NF | tabela `notas_fiscais` **não existe** no banco | ❌ |
| Prazo cotado | `prazo_entrega_dias` em 28/2.629 células | ❌ |
| Categoria do fornecedor | `fornecedores.categoria` NULL nos 1.006 | ❌ (derivada) |

## Decisões

### 1. Duas componentes, não três

`%_de_vezes_mais_barato` tem **correlação de 0,892** com `taxa_de_vitória` entre os 18 fornecedores com amostra relevante — quem escolhe é o comprador, e ele escolhe o mais barato. Somar as duas contaria preço duas vezes e diluiria a pontualidade. Taxa de vitória fica fora do score.

A competitividade usa **gap médio vs o melhor preço da mesma disputa**, não o binário "foi o mais barato": é contínuo e discrimina muito melhor (2,2% no DOCES VAZ até 23,9% no CASTELÃO).

### 2. Só itens realmente disputados

263 dos 1.135 itens cotados tiveram um único fornecedor cotando — nesses ele é trivialmente "o mais barato". A view exige `count(*) >= 2` por item, senão fornecedor com pouca disputa ganha nota inflada.

### 3. Fórmula

```
competitividade = max(0, 1 − gap_ajustado / 0,20)     -- gap 0% → 1,0 · gap ≥20% → 0
pontualidade    = entregas_no_prazo / entregas
rating          = 1 + 4 × (0,6 × competitividade + 0,4 × pontualidade)   -- escala 1,0–5,0
```

Quando só uma componente tem amostra, os pesos são **renormalizados** e a linha é marcada `confianca = 'parcial'`.

### 4. Rating por unidade, com linha consolidada

Decisão do usuário (2026-07-30): o rating é **por unidade**, não global. Ressalva registrada na época: divide a amostra por 4 e reduz a cobertura.

A view emite uma linha por `(unidade_id, fornecedor_id)` mais uma linha `unidade_id IS NULL` = consolidado, via `GROUPING SETS`. O consolidado **re-agrega as células cruas**, não faz média de médias.

### 5. Limiar 10 + shrinkage bayesiano

Com limiar 20 por unidade, Andar de Cima daria nota a só 2 fornecedores. Em vez de subir o limiar, o valor de amostra pequena é puxado para a média da própria unidade:

```
gap_ajustado = (n × gap_próprio + 10 × gap_médio_da_unidade) / (n + 10)
taxa_prazo   = (no_prazo + 3 × taxa_média_da_unidade) / (entregas + 3)
```

Resultado: Andar de Cima passa de 2 para 7 fornecedores avaliados sem gerar notas extremas.

### 6. Amostra insuficiente → `NULL`, nunca zero

Menos de 10 células cotadas **e** menos de 3 entregas → sem nota, UI mostra "—". Dos 1.006 fornecedores só 53 foram cotados; a maioria passa a mostrar "—" honestamente.

### 7. Cálculo em VIEW, não coluna materializada

`fornecedor_metricas`, com `security_invoker = on`. Motivos: reutilizável em `/fornecedores`, na matriz de cotação e no chat IA sem reimplementar; sempre fresca, sem cron; e a regra fica no Postgres, coerente com "RLS é a verdade".

As colunas `rating`, `pontualidade_pct` e `competitividade_pct` de `fornecedores` ficam órfãs — candidatas a remoção numa migration de limpeza.

### 8. Top Produtos = curva ABC por valor

Ordenação por R$ gasto com classificação de Pareto: **A** = primeiros 80% do gasto, **B** = até 95%, **C** = a cauda. Responde "onde negociar primeiro". No consolidado: A = 73 produtos (79,8%), B = 84 (15,1%), C = 135 (5,0%).

Colunas extras: preço médio, e **variação** entre o menor e o maior preço unitário pago no período (destaque âmbar ≥10%, vermelho ≥30%).

### 9. Top Categorias = concentração, não volume

A pizza já mostra volume. A tabela entrega o que ela não entrega: nº de produtos, pedidos e fornecedores distintos, produto líder e **fornecedor líder com sua fatia** — fatia ≥80% é destacada como risco de dependência.

### 10. Três abas, não blocos empilhados

A aba redundante "Por fornecedor" vira **toggle tabela/cards** dentro da aba Fornecedores, liberando espaço para as abas Produtos e Categorias no mesmo bloco. Exportação CSV por aba (a exibição limita a 12 fornecedores / 25 produtos; o CSV leva a lista completa).

## Arquitetura

```
supabase/migrations/0024_fornecedor_metricas.sql
  └─ VIEW fornecedor_metricas (fornecedor_id, unidade_id, rating, confianca,
     competitividade_pct, pontualidade_pct, gap_medio_pct, cotacao_celulas,
     entregas, entregas_no_prazo)

lib/relatorios.ts                    ← agregações puras, sem Supabase nem React
  ├─ computeTopProdutos()      → curva ABC
  ├─ computeTopCategorias()    → concentração por categoria
  ├─ categoriaPorFornecedor()  → deriva a categoria ausente no cadastro
  ├─ classeAbc() / valorDoItem()
  └─ tipos ItemPedido, ProdutoAbc, CategoriaDetalhe, ClasseAbc

app/(app)/relatorios/page.tsx        ← Server Component: só I/O e orquestração
  ├─ restrictTo()      → filtro por unidade (null = consolidado, [] = vazio)
  ├─ fetchAllPages()   → pagina o teto de 1.000 linhas do PostgREST
  ├─ fetchMetricasFornecedor()  → lê a view
  └─ fetchItens()      → UMA leitura de pedido_itens alimenta as 3 agregações

app/(app)/relatorios/_components/relatorios-client.tsx
  └─ 3 abas + toggle tabela/cards + estrelas fracionárias + selos ABC

tests/lib/relatorios.test.ts         ← 17 testes
```

## Armadilhas encontradas

1. **`GREATEST`/`LEAST` ignoram NULL no Postgres.** `least(1, NULL)` = `1`, não `NULL`. Sem um `CASE WHEN ... IS NULL` externo, fornecedor sem amostra recebia competitividade 1,0 — nota máxima de graça. Pego em verificação: `GAZIN S.A` com 1 célula tirou 5,0.
2. **Teto de 1.000 linhas do PostgREST.** São 949 itens em 12 meses — margem de 5%. A query de categorias anterior tinha a mesma bomba armada. Resolvido com `fetchAllPages()`.
3. **`Get-Content -Raw` lê UTF-8 como ANSI no PS 5.1.** Corrompia acentos do SQL e a Management API respondia `Expected ',' or '}' after property value in JSON`. `scripts/supabase-lhg.ps1` ganhou `Apply-LhgMigration -Path` (lê UTF-8) e envio do body como bytes UTF-8.
4. **`downloadCsv` já concatena data e extensão** — passar `"x.csv"` geraria `x.csv-2026-07-30.csv`.

## Verificação

- `pnpm typecheck` · `pnpm build` · `pnpm lint` (sem novos problemas; os 312 existentes são pré-existentes, maioria em `prototype/`)
- `pnpm test`: 24 passando (7 pré-existentes + 17 novos)
- View executada contra o banco em todas as unidades
- Embed `pedidos!inner` executado: 949 linhas, R$ 184.225,74 — confere com a soma A+B+C do SQL
- Economia por unidade confere com o consolidado: 12.980,17 + 8.245,71 + 5.837,67 + 2.051,08 = 29.114,63

## Fora de escopo

- Avaliação manual do comprador (usuário optou por 100% automático)
- Tempo de resposta à cotação — inviável enquanto o e-mail sai fora da plataforma (1/354)
- Divergência de NF — tabela não existe no banco
- Migration de limpeza das colunas órfãs de `fornecedores`
