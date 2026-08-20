# Módulo de Estoque — LHG Supplies

**Data:** 2026-08-20
**Escopo:** novo módulo, 4 blocos
**Status:** desenho aprovado após spike no Automo e verificação da API do Omie

---

## Princípio

**O estoque é do LHG Supplies.** Nem o Omie nem o Automo definem a estrutura, e nenhum dos
dois saldos é copiado para cá. O LHG mantém seu **próprio ledger de movimentos** e o saldo é
a soma dos nossos movimentos — os dois sistemas são apenas fontes de leitura.

Isso é decisão do usuário (20/08) e resolve um problema concreto: as estruturas dos dois são
inadequadas. O Automo modela estoque por **frigobar de apartamento** (61 no Ipiranga) e o
Omie tem locais com códigos duplicados entre unidades distintas.

## Por que o módulo existe

| Sistema | Tem | Não tem |
|---|---|---|
| **Omie** (1 conta por CNPJ) | entradas de compra, CMC | as vendas — acontecem no Automo |
| **Automo** (1 banco por unidade) | saídas de venda | as entradas — não são lançadas |
| **LHG Supplies** | catálogo, unidades, fornecedores | o estoque ← *este módulo* |

Nenhum dos dois fecha a conta sozinho, e nenhum dos dois conhece a relação RCC+CONCAVO.

## Achados do spike (20/08)

Medido nos bancos de produção do Automo (Ipiranga, Lapa, Altana; Andar de Cima fora do ar).

1. **`entradaestoque` do Automo está morta.** Em 12 meses: Ipiranga **1** entrada, Lapa
   **0** (última em jun/2025), Altana 83 e caindo. As 4.139 linhas do Ipiranga são histórico
   desde 2012. A tabela também **não tem `id_fornecedor`** — só `descricao`, `observacao`,
   `dataentrada`, `id_responsavel`. Confirma que o Omie é a única fonte de entradas.

2. **`estoque` do Automo é frigobar, não depósito.** Ipiranga: 1 `PRINCIPAL` + 3 `OUTROS`
   (Copa e Cozinha, Gerência) + **61 `APARTAMENTO`**. "AGUA SEM GAS" registra saída em 61
   locais porque sai do frigobar de cada quarto. Não serve como estrutura de almoxarifado.

3. **Não há perda registrada nas saídas.** `origemsaida` tem só dois valores — `SISTEMA`
   (30.009 itens/90d) e `MOBEE` (4.451) — e `motivo` é **sempre null**. Toda saída é venda,
   em dois canais. Consequência boa: a divergência do ciclo captura exatamente a perda
   **não lançada**, que é o número que o time quer.

4. **`tipoproduto.consumivel` não é filtro confiável.** `CAUCAO` está marcado
   `consumivel = true` (255 saídas) e `PACOTE DE PRODUTOS` está `false`. Caução não é produto.

5. **A conversão porção↔quilo é real.** Existe `12 - PRATOS PRINCIPAIS` (2.068 saídas/90d),
   `13 - ACOMPANHAMENTOS` e `09 - PETISCOS`. Picanha/Filet/Salmão/Camarão da planilha são
   pratos; o Omie compra por quilo.

6. **Os nomes casam entre os sistemas.** `CERVEJA HEINEKEN LONG NECK`, `RED BULL
   TRADICIONAL`, `COCA COLA` aparecem idênticos nos dois. O mapeamento inicial pode ser
   sugerido por nome e confirmado à mão.

7. **⚠️ Os bancos do Automo estão em IP público sem TLS.** A conexão só funciona com
   `ssl: false`. Credenciais e dados de venda trafegam em texto claro. Não bloqueia o
   módulo, mas é exposição real — levar para quem cuida da infra do Automo.

## Achados da API do Omie

**`POST /estoque/movestoque/` — call `ListarMovimentos`** é a fonte das entradas.

- Filtros: `data_inicial`, `data_final`, `codigo_local_estoque` (**opcional**), `pagina`,
  `registros_por_pagina`
- Retorna por produto e por dia: `dDataMovimento`, `nQtdeEntradas`, `nQtdeSaidas`,
  `nCodProd`, `cCodigo`, `cDescricao`

Três consequências:

- **É listagem paginada por período**, não uma chamada por produto. Elimina o problema de
  ~20 mil chamadas por unidade/ciclo que o `PosicaoEstoque` teria imposto.
- **`codigo_local_estoque` opcional** permite o agregado de todos os locais — alinhado com
  não amarrar na estrutura deles.
- **`nQtdeSaidas > 0` no Omie é sinal de ajuste de inventário** (as vendas são no Automo).
  O endpoint entrega de graça o alerta que estava listado como risco.

Correção de uma afirmação anterior: eu havia dito que a API do Omie não tinha listagem de
NF. Eu havia verificado apenas o **nosso cliente** (`consultarNFEntrada` por número e
`incluirNotaEntrada`), não a API. `ListarMovimentos` existe e é melhor que listar NFs,
porque entrega movimento consolidado em vez de exigir montagem nota a nota.

`consultarPosicaoEstoque` continua útil para **custo** (CMC), não para entradas.

## Decisões

### D1 — Estrutura plana: um estoque por local físico

`locais_estoque`: Lush Ipiranga, Lush Lapa, Andar de Cima, Altana. Sem depósitos, sem
sub-locais. Os ids do Automo e do Omie são apenas **parâmetros de leitura**, nunca estrutura.

### D2 — Unidades fiscais apontam para o local (N:1)

RCC → Lush Ipiranga, CONCAVO → Lush Ipiranga. As entradas dos dois CNPJs somam no mesmo
estoque e a venda baixa **uma vez**. Baixar nos dois duplicaria o consumo.

### D3 — Ledger próprio de movimentos

`estoque_movimentos` é a fonte da verdade do saldo. Cada linha tem origem (`omie` | `automo`
| `contagem` | `ajuste`), data, quantidade e sinal. O saldo nunca é copiado do saldo deles.

### D4 — Teórico e ideal são colunas diferentes

A planilha atual usa `ESTOQUE IDEAL` para duas coisas (na linha da Picanha ele coincide com
`100+60−50=110`; na do Filet mostra `10` contra teórico `85`). Separado em:

| Coluna | Cálculo | Responde |
|---|---|---|
| `teorico` | `contagem_anterior + entradas − saidas` | quanto **deveria** ter |
| `divergencia` | `contagem_atual − teorico` | **perda / quebra / erro** |
| `estoque_ideal` | configurado por item | quanto **quero** ter |
| `a_repor` | `estoque_ideal − contagem_atual` | o que **comprar** |

### D5 — Lista curada de itens controlados

Só entram itens cadastrados explicitamente (~15, como na planilha). Justificativa mudou:
não é mais o rate limit (resolvido por `ListarMovimentos`), é que **`consumivel` não é
confiável** (achado 4) e **ninguém conta 3.426 itens à mão**. A lista cresce sob demanda.

### D6 — Fator de conversão por item, default 1

1 venda no Automo = N unidades de compra no Omie. Default `1` cobre bebidas e bomboniere;
pratos recebem o fator (1 porção = 0,4 kg).

**Aberto:** se algum prato consome mais de um insumo, o fator único não basta e vira ficha
técnica — bloco separado, fora deste escopo. A ser confirmado ao cadastrar os primeiros itens.

## Modelo de dados

```
locais_estoque
  id, nome, slug, ativo
  automo_conn_key            -- qual DATABASE_URL_LOCAL_* usar

local_unidade                -- N unidades fiscais → 1 local físico
  local_id    FK locais_estoque
  unidade_id  FK unidades    -- lê o Omie com as credenciais desta unidade
  PK (local_id, unidade_id)

estoque_itens                -- a lista curada
  id, local_id
  produto_id        FK produtos     -- lado LHG/Omie
  automo_produto_id integer         -- produto.id no banco do Automo
  fator_conversao   numeric DEFAULT 1
  estoque_ideal     numeric DEFAULT 0
  ativo             boolean DEFAULT true
  UNIQUE (local_id, produto_id)

estoque_movimentos           -- o ledger; fonte da verdade do saldo
  id, estoque_item_id
  data          date
  quantidade    numeric      -- sempre positiva
  sinal         smallint     -- +1 entrada, -1 saída
  origem        text         -- 'omie' | 'automo' | 'contagem' | 'ajuste'
  origem_ref    text         -- unidade_id (Omie) ou origemsaida (Automo)
  importado_em  timestamptz
  UNIQUE (estoque_item_id, data, origem, origem_ref)   -- idempotência do import

estoque_ciclos               -- período de contagem
  id, local_id, inicio, fim
  status ('aberto' | 'fechado'), fechado_em, fechado_por

estoque_ciclo_itens          -- a planilha em tela
  ciclo_id, estoque_item_id
  contagem_anterior, entradas, saidas, contagem_atual
  -- teorico, divergencia, a_repor: calculados
```

`contagem_anterior` encadeia do `contagem_atual` do ciclo anterior do mesmo item, o que dá
rastreabilidade de quem contou o quê.

A `UNIQUE` em `estoque_movimentos` é o que torna o import **idempotente**: reimportar o mesmo
período não duplica movimento. Sem ela, um job repetido dobraria o estoque silenciosamente.

## Fluxo de dados

```
Omie /estoque/movestoque/ ListarMovimentos (por unidade fiscal, por período)
   └─> nQtdeEntradas por produto/dia ──┐
                                       ├─> estoque_movimentos (nosso ledger)
Automo saidaestoqueitem (árvore toda) ─┘         │
   └─> quantidade × fator_conversao              │
                                                 v
                                     saldo = Σ (quantidade × sinal)
                                                 │
Contagem física digitada no LHG ─────────────────┴─> divergência
```

## Decomposição

| # | Bloco | Entrega | Risco |
|---|---|---|---|
| **1** | Fundação | `locais_estoque`, `local_unidade`, `estoque_itens` + tela de cadastro com sugestão de mapeamento por nome | Baixo |
| **2** | Saídas (Automo) | leitor Postgres, agregação da árvore por período, aplicação do fator | **Alto** — conversão e qualidade do dado |
| **3** | Entradas (Omie) | `ListarMovimentos` paginado por unidade fiscal, somando os CNPJs do local | Médio |
| **4** | Ciclos e tela | abrir/fechar ciclo, digitar contagem, ver teórico/divergência/a repor, CSV | Baixo |

Ordem **1 → 2 → 3 → 4**: saídas antes de entradas porque a conversão é o maior risco.

## Riscos

- **Conversão de pratos compostos** (D6). Se aparecer, vira ficha técnica em bloco próprio.
- **Andar de Cima instável** — estava fora do ar no spike. O import precisa tolerar uma
  unidade indisponível sem derrubar o ciclo das outras.
- **Ajuste de inventário no Omie** apareceria como `nQtdeSaidas`. Tratar como movimento de
  ajuste explícito, não ignorar em silêncio.
- **Sem TLS no Automo** (achado 7).
- **`registros_por_pagina` do `ListarMovimentos`** e comportamento com catálogo grande ainda
  não medidos — validar na implementação do bloco 3.

## Fora de escopo

- Escrever no Automo ou no Omie. O módulo é somente-leitura nas duas pontas; a única
  escrita é a contagem física, no Supabase.
- Ficha técnica com múltiplos insumos por prato.
- Reativar o módulo de NF do LHG (rota `app/(app)/nf/` está vazia e `notas_fiscais` não
  existe). As entradas vêm de `ListarMovimentos`.
- Inventário rotativo, curva de giro, ponto de pedido automático.
- Estrutura por depósito/apartamento. Explicitamente descartada (D1).
