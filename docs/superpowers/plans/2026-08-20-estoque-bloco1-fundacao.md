# Estoque — Bloco 1 (Fundação) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a fundação do módulo de estoque do LHG Supplies — os locais de estoque próprios, o vínculo N:1 das unidades fiscais com cada local, e a lista curada de itens controlados com mapeamento Automo↔Omie — junto da tela de cadastro que sugere o mapeamento por semelhança de nome.

**Architecture:** O estoque é do LHG: estrutura plana (um `local_estoque` por local físico), sem depósitos e sem espelhar os ids do Omie/Automo como estrutura. `local_unidade` liga N unidades fiscais a 1 local, o que resolve RCC+CONCAVO somando no mesmo estoque. `estoque_itens` é a lista curada, com `automo_produto_id`, `fator_conversao` e `estoque_ideal`. A sugestão de mapeamento é uma função pura testável, separada do acesso a dados.

**Tech Stack:** Next.js 16 (App Router, Server Components/Actions), Supabase Postgres + RLS, `pg` para leitura do Automo, Zod na borda, Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-08-20-modulo-estoque-design.md`

**Branch:** `feat/estoque`

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/0026_estoque_fundacao.sql` | 3 tabelas + RLS + seed dos 4 locais e vínculos |
| `lib/estoque/mapeamento.ts` | Funções puras: normalizar nome, pontuar semelhança, sugerir par |
| `lib/automo/client.ts` | Conexão `pg` por local + `listarProdutosAutomo()` |
| `app/(app)/estoque/page.tsx` | Server Component: carrega locais, itens, catálogos |
| `app/(app)/estoque/actions.ts` | Server Actions: CRUD de `estoque_itens` |
| `app/(app)/estoque/_components/tipos.ts` | Tipos compartilhados entre tela e modal |
| `app/(app)/estoque/_components/estoque-client.tsx` | Tela: lista de itens + botão adicionar |
| `app/(app)/estoque/_components/mapear-item-modal.tsx` | Modal de cadastro com sugestão |
| `tests/lib/estoque-mapeamento.test.ts` | Testes das funções puras |
| `components/lhg/shell/nav-config.ts` | Entrada "Estoque" no menu |

`lib/estoque/mapeamento.ts` é puro de propósito: é a única lógica com regra de negócio real neste bloco, e sem acoplamento a Supabase/`pg`/React ela fica testável sem mock.

---

## Task 1: Migration da fundação

**Files:**
- Create: `supabase/migrations/0026_estoque_fundacao.sql`

- [ ] **Step 1: Escrever a migration**

```sql
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
  -- produto.id no banco do Automo (integer lá; guardamos como int)
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

CREATE POLICY "authenticated read locais_estoque" ON locais_estoque
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "comprador admin write locais_estoque" ON locais_estoque
  FOR ALL USING (current_user_role() IN ('comprador', 'admin'));

CREATE POLICY "authenticated read local_unidade" ON local_unidade
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "comprador admin write local_unidade" ON local_unidade
  FOR ALL USING (current_user_role() IN ('comprador', 'admin'));

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
  'Unidades fiscais (CNPJs) que abastecem cada local. RCC e CONCAVO → Lush Ipiranga.';
```

- [ ] **Step 2: Aplicar a migration**

```powershell
. .\scripts\supabase-lhg.ps1
Apply-LhgMigration -Path "supabase/migrations/0026_estoque_fundacao.sql"
```

Esperado: `OK - Migracao '0026_estoque_fundacao' aplicada.`

⚠️ Usar `-Path` (lê UTF-8). Nunca `-Query (Get-Content -Raw)` — corrompe acentos no PS 5.1.

- [ ] **Step 3: Verificar o seed**

```powershell
. .\scripts\supabase-lhg.ps1
Invoke-LhgSql -Query "select l.nome local, count(lu.unidade_id)::text unidades, coalesce(string_agg(u.nome, ' + ' ORDER BY u.nome),'-') fiscais from locais_estoque l left join local_unidade lu on lu.local_id = l.id left join unidades u on u.id = lu.unidade_id group by 1 order by 1" | ConvertTo-Json -Compress
```

Esperado: 4 locais. `Lush Ipiranga` com **2** unidades (`Lush Ipiranga (CONCAVO) + Lush Ipiranga (RCC)`); os outros 3 com 1 cada.

- [ ] **Step 4: Regenerar os tipos**

```powershell
. .\scripts\supabase-lhg.ps1
$types = Get-LhgTypes
$types | Out-File lib/supabase/types.ts -Encoding utf8
pnpm typecheck
```

Esperado: `tsc --noEmit` sem erro, e `locais_estoque` presente em `lib/supabase/types.ts`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0026_estoque_fundacao.sql lib/supabase/types.ts
git commit -m "feat(estoque): migration da fundação — locais, vínculo fiscal e itens controlados"
```

---

## Task 2: Normalização de nome (função pura)

A sugestão de mapeamento compara nomes entre dois catálogos que escrevem diferente
(`CERVEJA HEINEKEN LONG NECK` vs `Cerveja Heineken Long-Neck 330ml`). A normalização é o
primeiro passo e tem regra própria, então nasce testada e isolada.

**Files:**
- Create: `lib/estoque/mapeamento.ts`
- Test: `tests/lib/estoque-mapeamento.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// tests/lib/estoque-mapeamento.test.ts
import { describe, it, expect } from "vitest";
import { normalizarNome } from "@/lib/estoque/mapeamento";

describe("normalizarNome", () => {
  it("passa para minúsculas e remove acentos", () => {
    expect(normalizarNome("ÁGUA SEM GÁS")).toBe("agua sem gas");
  });

  it("troca pontuação e hífen por espaço", () => {
    expect(normalizarNome("Long-Neck, 330ml.")).toBe("long neck 330ml");
  });

  it("colapsa espaços repetidos e apara as pontas", () => {
    expect(normalizarNome("  COCA   COLA  ")).toBe("coca cola");
  });

  it("não quebra com string vazia", () => {
    expect(normalizarNome("")).toBe("");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm vitest run tests/lib/estoque-mapeamento.test.ts`
Esperado: FAIL — `Failed to resolve import "@/lib/estoque/mapeamento"`.

- [ ] **Step 3: Implementação mínima**

```typescript
// lib/estoque/mapeamento.ts
/**
 * lib/estoque/mapeamento.ts
 * Sugestão de mapeamento entre o catálogo do Automo e o do LHG/Omie.
 *
 * Funções puras, sem Supabase, sem `pg` e sem React: a regra de semelhança é a
 * única lógica de negócio deste bloco e fica testável sem mock.
 *
 * Os dois catálogos escrevem o mesmo produto de formas diferentes
 * ("CERVEJA HEINEKEN LONG NECK" vs "Cerveja Heineken Long-Neck 330ml"), então
 * comparar string crua não serve.
 */

/** Minúsculas, sem acento, pontuação virando espaço, espaços colapsados. */
export function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // remove diacríticos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm vitest run tests/lib/estoque-mapeamento.test.ts`
Esperado: PASS — 4 testes.

- [ ] **Step 5: Commit**

```bash
git add lib/estoque/mapeamento.ts tests/lib/estoque-mapeamento.test.ts
git commit -m "feat(estoque): normalização de nome para sugestão de mapeamento"
```

---

## Task 3: Pontuação de semelhança

**Files:**
- Modify: `lib/estoque/mapeamento.ts`
- Modify: `tests/lib/estoque-mapeamento.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar ao arquivo de teste:

```typescript
import { normalizarNome, pontuarSemelhanca } from "@/lib/estoque/mapeamento";

describe("pontuarSemelhanca", () => {
  it("dá 1 para nomes iguais depois de normalizar", () => {
    expect(pontuarSemelhanca("COCA COLA", "Coca-Cola")).toBe(1);
  });

  it("dá 0 quando não há palavra em comum", () => {
    expect(pontuarSemelhanca("PICANHA", "Coca-Cola")).toBe(0);
  });

  it("pontua pela fração de palavras em comum", () => {
    // "cerveja heineken" ∩ "cerveja heineken long neck" = 2 palavras
    // união = 4 → 0,5
    expect(pontuarSemelhanca("CERVEJA HEINEKEN", "Cerveja Heineken Long Neck")).toBeCloseTo(0.5, 5);
  });

  it("ignora ordem das palavras", () => {
    expect(pontuarSemelhanca("HEINEKEN CERVEJA", "Cerveja Heineken")).toBe(1);
  });

  it("não conta palavra repetida duas vezes", () => {
    expect(pontuarSemelhanca("AGUA AGUA", "Agua")).toBe(1);
  });

  it("dá 0 quando um dos lados é vazio", () => {
    expect(pontuarSemelhanca("", "Coca-Cola")).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run tests/lib/estoque-mapeamento.test.ts`
Esperado: FAIL — `pontuarSemelhanca is not a function`.

- [ ] **Step 3: Implementação mínima**

Acrescentar a `lib/estoque/mapeamento.ts`:

```typescript
/**
 * Semelhança entre dois nomes: índice de Jaccard sobre o conjunto de palavras.
 *
 * Conjunto, não sequência, de propósito — os catálogos divergem na ordem e em
 * complementos ("330ml", "UN", "CX"), e Jaccard tolera isso sem penalizar por
 * posição. Retorna 0..1.
 */
export function pontuarSemelhanca(a: string, b: string): number {
  const pa = new Set(normalizarNome(a).split(" ").filter(Boolean));
  const pb = new Set(normalizarNome(b).split(" ").filter(Boolean));
  if (pa.size === 0 || pb.size === 0) return 0;

  let comuns = 0;
  for (const p of pa) if (pb.has(p)) comuns++;

  const uniao = pa.size + pb.size - comuns;
  return uniao === 0 ? 0 : comuns / uniao;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm vitest run tests/lib/estoque-mapeamento.test.ts`
Esperado: PASS — 10 testes.

- [ ] **Step 5: Commit**

```bash
git add lib/estoque/mapeamento.ts tests/lib/estoque-mapeamento.test.ts
git commit -m "feat(estoque): pontuação de semelhança por Jaccard de palavras"
```

---

## Task 4: Sugerir os melhores pares

**Files:**
- Modify: `lib/estoque/mapeamento.ts`
- Modify: `tests/lib/estoque-mapeamento.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar ao arquivo de teste:

```typescript
import {
  normalizarNome, pontuarSemelhanca, sugerirCandidatos,
  type CandidatoNome,
} from "@/lib/estoque/mapeamento";

describe("sugerirCandidatos", () => {
  const catalogo: CandidatoNome[] = [
    { id: "p1", nome: "CERVEJA HEINEKEN LONG NECK" },
    { id: "p2", nome: "COCA COLA" },
    { id: "p3", nome: "RED BULL TRADICIONAL" },
    { id: "p4", nome: "PICANHA PECA KG" },
  ];

  it("retorna o melhor par primeiro", () => {
    const r = sugerirCandidatos("Coca-Cola", catalogo);
    expect(r[0].id).toBe("p2");
    expect(r[0].score).toBe(1);
  });

  it("respeita o limite de resultados", () => {
    // scoreMinimo: 0 isola o parâmetro sob teste. Com o mínimo padrão os quatro
    // produtos do catálogo não compartilham palavra com "cerveja" exceto p1, e o
    // filtro comeria a amostra antes de `limite` ter chance de agir.
    expect(sugerirCandidatos("cerveja", catalogo, { limite: 2, scoreMinimo: 0 })).toHaveLength(2);
  });

  it("descarta score abaixo do mínimo", () => {
    const r = sugerirCandidatos("Notebook Dell", catalogo, { scoreMinimo: 0.2 });
    expect(r).toEqual([]);
  });

  it("ordena por score decrescente", () => {
    const r = sugerirCandidatos("Heineken Long Neck", catalogo);
    const scores = r.map(c => c.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("empate desempata pelo nome, para a ordem ser estável", () => {
    const dois: CandidatoNome[] = [
      { id: "b", nome: "AGUA COM GAS" },
      { id: "a", nome: "AGUA SEM GAS" },
    ];
    const r = sugerirCandidatos("AGUA", dois);
    expect(r.map(c => c.id)).toEqual(["b", "a"]); // "com" antes de "sem"
  });

  it("catálogo vazio devolve lista vazia", () => {
    expect(sugerirCandidatos("Coca", [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run tests/lib/estoque-mapeamento.test.ts`
Esperado: FAIL — `sugerirCandidatos is not a function`.

- [ ] **Step 3: Implementação mínima**

Acrescentar a `lib/estoque/mapeamento.ts`:

```typescript
export interface CandidatoNome {
  id:   string;
  nome: string;
}

export interface Sugestao extends CandidatoNome {
  score: number;
}

interface OpcoesSugestao {
  limite?:      number;
  scoreMinimo?: number;
}

/**
 * Ordena o catálogo pela semelhança com `alvo`.
 *
 * O desempate por nome existe para a ordem ser estável: sem ele, dois candidatos
 * de mesmo score sairiam em ordem imprevisível e a sugestão mudaria entre
 * carregamentos da tela.
 */
export function sugerirCandidatos(
  alvo: string,
  catalogo: CandidatoNome[],
  { limite = 5, scoreMinimo = 0.1 }: OpcoesSugestao = {},
): Sugestao[] {
  return catalogo
    .map(c => ({ ...c, score: pontuarSemelhanca(alvo, c.nome) }))
    .filter(c => c.score >= scoreMinimo)
    .sort((a, b) => (b.score - a.score) || a.nome.localeCompare(b.nome, "pt-BR"))
    .slice(0, limite);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm vitest run tests/lib/estoque-mapeamento.test.ts`
Esperado: PASS — 16 testes.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `pnpm test`
Esperado: 49 testes passando (33 existentes + 16 novos).

- [ ] **Step 6: Commit**

```bash
git add lib/estoque/mapeamento.ts tests/lib/estoque-mapeamento.test.ts
git commit -m "feat(estoque): sugestão de candidatos de mapeamento por semelhança"
```

---

## Task 5: Leitor do catálogo do Automo

**Files:**
- Create: `lib/automo/client.ts`

Sem teste automatizado: é I/O contra banco externo de produção. A verificação é o script
manual do Step 3.

- [ ] **Step 1: Implementar o cliente**

```typescript
// lib/automo/client.ts
/**
 * lib/automo/client.ts
 * Leitura dos bancos do Automo (um Postgres por unidade física).
 *
 * SOMENTE LEITURA. O LHG nunca escreve no Automo.
 *
 * ⚠️ Os bancos estão em IP público SEM TLS — `ssl: false` é obrigatório, senão a
 * conexão falha com "The server does not support SSL connections". Isso significa
 * que credenciais e dados trafegam em texto claro; risco registrado no spec.
 */
import { Client } from "pg";

/** Chaves de conexão aceitas — espelham `locais_estoque.automo_conn_key`. */
export type AutomoConnKey =
  | "DATABASE_URL_LOCAL_IPIRANGA"
  | "DATABASE_URL_LOCAL_LAPA"
  | "DATABASE_URL_LOCAL_ANDAR_DE_CIMA"
  | "DATABASE_URL_LOCAL_ALTANA";

export interface ProdutoAutomo {
  id:        number;
  codigo:    string | null;
  descricao: string;
  tipo:      string | null;
}

/** Erro de conexão/consulta com o Automo, para o chamador distinguir do resto. */
export class AutomoIndisponivelError extends Error {
  constructor(readonly connKey: string, causa: unknown) {
    super(`Automo indisponível (${connKey}): ${causa instanceof Error ? causa.message : String(causa)}`);
    this.name = "AutomoIndisponivelError";
  }
}

async function comCliente<T>(connKey: string, fn: (c: Client) => Promise<T>): Promise<T> {
  // Strip BOM: env var copiada de editor Windows pode vir com U+FEFF (ver CLAUDE.md §8)
  const conn = process.env[connKey]?.replace(/^﻿/, "");
  if (!conn) throw new AutomoIndisponivelError(connKey, "variável de ambiente ausente");

  const client = new Client({
    connectionString: conn,
    ssl: false,
    statement_timeout: 20_000,
    connectionTimeoutMillis: 10_000,
  });

  try {
    await client.connect();
  } catch (err) {
    throw new AutomoIndisponivelError(connKey, err);
  }

  try {
    return await fn(client);
  } catch (err) {
    throw new AutomoIndisponivelError(connKey, err);
  } finally {
    await client.end().catch(() => { /* já caiu; nada a fazer */ });
  }
}

/**
 * Catálogo de produtos de uma unidade do Automo.
 *
 * Filtra `dataexclusao IS NULL` (produto excluído não deve aparecer no
 * mapeamento) e traz o tipo para a tela poder mostrar o contexto — `CAUCAO` e
 * `SERVICOS` estão marcados como consumíveis no Automo, então a decisão de
 * incluir ou não é humana, na tela, e não automática por flag.
 */
export async function listarProdutosAutomo(connKey: string): Promise<ProdutoAutomo[]> {
  return comCliente(connKey, async (client) => {
    const { rows } = await client.query<{
      id: number; codigo: string | null; descricao: string; tipo: string | null;
    }>(`
      SELECT p.id, p.codigo, p.descricao, tp.descricao AS tipo
      FROM produto p
      LEFT JOIN tipoproduto tp ON tp.id = p.id_tipoproduto
      WHERE p.dataexclusao IS NULL
      ORDER BY p.descricao
    `);
    return rows.map(r => ({ ...r, id: Number(r.id) }));
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Esperado: sem erro.

- [ ] **Step 3: Verificar contra o banco real**

Criar `verificar-automo.mjs` na raiz:

```javascript
import { readFileSync } from "node:fs";
import pg from "pg";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter(l => l.includes("=") && !l.trimStart().startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
);

for (const k of ["DATABASE_URL_LOCAL_IPIRANGA", "DATABASE_URL_LOCAL_LAPA", "DATABASE_URL_LOCAL_ALTANA"]) {
  const c = new pg.Client({ connectionString: env[k], ssl: false, connectionTimeoutMillis: 10000 });
  try {
    await c.connect();
    const { rows } = await c.query(
      "SELECT count(*)::int n FROM produto WHERE dataexclusao IS NULL",
    );
    console.log(`${k}: ${rows[0].n} produtos ativos`);
    await c.end();
  } catch (e) {
    console.log(`${k}: FALHOU — ${e.message}`);
  }
}
```

Run: `node verificar-automo.mjs`
Esperado: contagem > 0 para Ipiranga, Lapa e Altana. `ANDAR_DE_CIMA` pode dar timeout —
o banco daquela unidade cai com frequência, e é justamente por isso que
`AutomoIndisponivelError` existe.

Apagar o script: `rm verificar-automo.mjs`

- [ ] **Step 4: Commit**

```bash
git add lib/automo/client.ts
git commit -m "feat(estoque): leitor somente-leitura do catálogo do Automo"
```

---

## Task 6: Server Actions do CRUD de itens

**Files:**
- Create: `app/(app)/estoque/actions.ts`

- [ ] **Step 1: Implementar as actions**

```typescript
// app/(app)/estoque/actions.ts
"use server";

/**
 * actions.ts — módulo de Estoque (bloco 1)
 * CRUD da lista curada de itens controlados.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const ItemSchema = z.object({
  local_id:          z.string().uuid(),
  produto_id:        z.string().uuid(),
  automo_produto_id: z.number().int().positive().nullable(),
  fator_conversao:   z.number().positive("Fator deve ser maior que zero"),
  estoque_ideal:     z.number().min(0, "Estoque ideal não pode ser negativo"),
});

export async function adicionarItemEstoque(
  input: z.infer<typeof ItemSchema>,
): Promise<{ ok: true } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: "Não autenticado" };

  const parsed = ItemSchema.safeParse(input);
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const { error } = await supabase.from("estoque_itens").insert(parsed.data);
  // 23505 = unique_violation: o par (local, produto) já está na lista
  if (error) {
    return {
      erro: error.code === "23505"
        ? "Este produto já está na lista de itens controlados deste local."
        : error.message,
    };
  }

  revalidatePath("/estoque");
  return { ok: true };
}

const AtualizarSchema = z.object({
  automo_produto_id: z.number().int().positive().nullable().optional(),
  fator_conversao:   z.number().positive().optional(),
  estoque_ideal:     z.number().min(0).optional(),
  ativo:             z.boolean().optional(),
});

export async function atualizarItemEstoque(
  id: string,
  input: z.infer<typeof AtualizarSchema>,
): Promise<{ ok: true } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: "Não autenticado" };

  const parsed = AtualizarSchema.safeParse(input);
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  if (Object.keys(parsed.data).length === 0) return { erro: "Nada para atualizar" };

  const { error } = await supabase.from("estoque_itens").update(parsed.data).eq("id", id);
  if (error) return { erro: error.message };

  revalidatePath("/estoque");
  return { ok: true };
}

export async function removerItemEstoque(
  id: string,
): Promise<{ ok: true } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: "Não autenticado" };

  // Delete de verdade: no bloco 1 não há movimento gravado ainda. Quando o ledger
  // existir (bloco 3), isto vira `ativo = false` para não perder histórico.
  const { error } = await supabase.from("estoque_itens").delete().eq("id", id);
  if (error) return { erro: error.message };

  revalidatePath("/estoque");
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Esperado: sem erro.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/estoque/actions.ts"
git commit -m "feat(estoque): server actions do CRUD de itens controlados"
```

---

## Task 7: Página (Server Component)

**Files:**
- Create: `app/(app)/estoque/page.tsx`

- [ ] **Step 1: Implementar a página**

```typescript
// app/(app)/estoque/page.tsx
/**
 * app/(app)/estoque/page.tsx — módulo de Estoque (bloco 1)
 * Cadastro dos itens controlados por local.
 *
 * O local ativo vem do cookie de unidade da sidebar: a unidade fiscal escolhida
 * resolve para o local físico via `local_unidade`. Assim RCC e CONCAVO caem no
 * mesmo local, que é a razão de a tabela existir.
 */
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { listarProdutosAutomo, AutomoIndisponivelError } from "@/lib/automo/client";
import { EstoqueClient } from "./_components/estoque-client";

export const metadata = { title: "Estoque" };

export default async function EstoquePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const slug = (await cookies()).get("lhg-unidade-slug")?.value ?? "todas";

  const { data: locais } = await supabase
    .from("locais_estoque")
    .select("id, nome, slug, automo_conn_key, local_unidade(unidade_id, unidades(slug, nome))")
    .eq("ativo", true)
    .order("nome");

  type LocalRow = NonNullable<typeof locais>[number];
  const todos = (locais ?? []) as LocalRow[];

  // Resolve o local pela unidade fiscal do cookie; "todas" cai no primeiro.
  const local = slug === "todas"
    ? todos[0]
    : todos.find(l =>
        (l.local_unidade as Array<{ unidades: { slug: string } | null }>)
          .some(lu => lu.unidades?.slug === slug),
      ) ?? todos[0];

  if (!local) {
    return (
      <div className="max-w-3xl mx-auto py-10 px-4">
        <p className="text-sm text-muted-foreground">
          Nenhum local de estoque cadastrado. Rode a migration 0026.
        </p>
      </div>
    );
  }

  const [itens, produtos] = await Promise.all([
    supabase
      .from("estoque_itens")
      .select("id, produto_id, automo_produto_id, fator_conversao, estoque_ideal, ativo, produtos(nome, codigo, unidade_med, categoria)")
      .eq("local_id", local.id)
      .order("id"),

    // Catálogo LHG/Omie da unidade fiscal do local (a primeira vinculada).
    fetchAllRows<{ id: string; codigo: string; nome: string; unidade_med: string; categoria: string }>((from, to) =>
      supabase
        .from("produtos")
        .select("id, codigo, nome, unidade_med, categoria")
        .eq("ativo", true)
        .order("nome")
        .order("id")
        .range(from, to),
    ),
  ]);

  // O Automo cai com frequência (Andar de Cima estava fora no spike). Falha aqui
  // não pode derrubar a tela — ela degrada para cadastro sem sugestão.
  let produtosAutomo: Awaited<ReturnType<typeof listarProdutosAutomo>> = [];
  let automoErro: string | null = null;
  if (local.automo_conn_key) {
    try {
      produtosAutomo = await listarProdutosAutomo(local.automo_conn_key);
    } catch (err) {
      automoErro = err instanceof AutomoIndisponivelError
        ? "Banco do Automo indisponível — o cadastro funciona, mas sem sugestão de mapeamento."
        : "Erro inesperado ao ler o Automo.";
      console.error("[estoque] Automo:", err);
    }
  }

  return (
    <EstoqueClient
      local={{ id: local.id, nome: local.nome }}
      unidadesFiscais={(local.local_unidade as Array<{ unidades: { nome: string } | null }>)
        .map(lu => lu.unidades?.nome ?? "—")}
      itens={(itens.data ?? []) as never}
      produtos={produtos}
      produtosAutomo={produtosAutomo}
      automoErro={automoErro}
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Esperado: erro apenas de `./_components/estoque-client` não existir — é a Task 8.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/estoque/page.tsx"
git commit -m "feat(estoque): página de cadastro resolvendo local pela unidade do cookie"
```

---

## Task 8: Tela (Client Component)

**Files:**
- Create: `app/(app)/estoque/_components/tipos.ts`
- Create: `app/(app)/estoque/_components/estoque-client.tsx`

- [ ] **Step 1: Criar os tipos compartilhados**

A tela importa o modal e o modal precisa do tipo do produto. Definir o tipo em qualquer um
dos dois criaria import circular entre irmãos, então os dois leem daqui.

```typescript
// app/(app)/estoque/_components/tipos.ts
/** Tipos compartilhados entre a tela de estoque e o modal de cadastro. */

export interface ProdutoLhg {
  id:          string;
  codigo:      string;
  nome:        string;
  unidade_med: string;
  categoria:   string;
}

export interface ItemEstoque {
  id:                string;
  produto_id:        string;
  automo_produto_id: number | null;
  fator_conversao:   number;
  estoque_ideal:     number;
  ativo:             boolean;
  produtos: { nome: string; codigo: string; unidade_med: string; categoria: string } | null;
}
```

- [ ] **Step 2: Implementar a tela**

```typescript
// app/(app)/estoque/_components/estoque-client.tsx
"use client";

/**
 * estoque-client.tsx — módulo de Estoque (bloco 1)
 * Lista os itens controlados do local e abre o modal de cadastro.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, AlertTriangle, Boxes, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { removerItemEstoque } from "../actions";
import { MapearItemModal } from "./mapear-item-modal";
import type { ProdutoAutomo } from "@/lib/automo/client";
import type { ProdutoLhg, ItemEstoque } from "./tipos";

interface Props {
  local:           { id: string; nome: string };
  unidadesFiscais: string[];
  itens:           ItemEstoque[];
  produtos:        ProdutoLhg[];
  produtosAutomo:  ProdutoAutomo[];
  automoErro:      string | null;
}

const TH = "text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium pb-3 pr-4";

export function EstoqueClient({
  local, unidadesFiscais, itens, produtos, produtosAutomo, automoErro,
}: Props) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);

  const semMapeamento = itens.filter(i => i.automo_produto_id == null).length;

  async function remover(id: string, nome: string) {
    if (!confirm(`Remover "${nome}" da lista de itens controlados?`)) return;
    setRemovendo(id);
    try {
      const res = await removerItemEstoque(id);
      if ("erro" in res) { toast.error(res.erro); return; }
      toast.success("Item removido do controle");
      router.refresh();
    } finally {
      setRemovendo(null);
    }
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-5 pb-10">

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Estoque · {local.nome}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Itens controlados · abastecido por {unidadesFiscais.join(" + ")}
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-emerald-700/60 bg-emerald-500/10 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors"
        >
          <Plus size={14} />
          Adicionar item
        </button>
      </div>

      {automoErro && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.08] px-4 py-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300/90">{automoErro}</p>
        </div>
      )}

      {semMapeamento > 0 && (
        <div className="rounded-lg border border-sky-500/25 bg-sky-500/[0.06] px-4 py-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-sky-400 shrink-0 mt-0.5" />
          <p className="text-xs text-sky-300/90">
            {semMapeamento} {semMapeamento === 1 ? "item sem" : "itens sem"} vínculo com o
            Automo. Sem isso as vendas desse item não serão importadas.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-border/80 bg-muted/40 overflow-hidden">
        {itens.length === 0 ? (
          <div className="py-16 text-center">
            <Boxes size={28} className="mx-auto text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground mt-3">Nenhum item controlado ainda</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Comece pelos itens da planilha: bebidas, bomboniere e os pratos porcionados.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto p-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className={TH}>Produto (LHG/Omie)</th>
                  <th className={TH}>Categoria</th>
                  <th className={TH}>Vínculo Automo</th>
                  <th className={cn(TH, "text-right")}>Fator</th>
                  <th className={cn(TH, "text-right")}>Estoque ideal</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody>
                {itens.map(item => {
                  const nome = item.produtos?.nome ?? "—";
                  const noAutomo = produtosAutomo.find(p => p.id === item.automo_produto_id);
                  return (
                    <tr key={item.id} className="border-b border-border/40 hover:bg-muted/50 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="text-foreground font-medium">{nome}</div>
                        <div className="text-[11px] text-muted-foreground/60 font-mono">
                          {item.produtos?.codigo} · {item.produtos?.unidade_med}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground text-xs">
                        {item.produtos?.categoria ?? "—"}
                      </td>
                      <td className="py-3 pr-4 text-xs">
                        {item.automo_produto_id == null ? (
                          <span className="inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
                            sem vínculo
                          </span>
                        ) : (
                          <span className="text-muted-foreground" title={`Automo id ${item.automo_produto_id}`}>
                            {noAutomo?.descricao ?? `#${item.automo_produto_id}`}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 font-mono text-muted-foreground text-right">
                        {Number(item.fator_conversao).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}
                      </td>
                      <td className="py-3 pr-4 font-mono text-muted-foreground text-right">
                        {Number(item.estoque_ideal).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => remover(item.id, nome)}
                          disabled={removendo === item.id}
                          title="Remover do controle"
                          className="p-1 rounded text-muted-foreground/40 hover:text-destructive transition-colors disabled:opacity-50"
                        >
                          {removendo === item.id
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Trash2 size={13} />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <MapearItemModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        localId={local.id}
        produtos={produtos}
        produtosAutomo={produtosAutomo}
        jaControlados={itens.map(i => i.produto_id)}
      />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Esperado: erro apenas de `./mapear-item-modal` não existir — é a Task 9.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/estoque/_components/estoque-client.tsx"
git commit -m "feat(estoque): tela de itens controlados por local"
```

---

## Task 9: Modal de cadastro com sugestão

**Files:**
- Create: `app/(app)/estoque/_components/mapear-item-modal.tsx`

- [ ] **Step 1: Implementar o modal**

```typescript
// app/(app)/estoque/_components/mapear-item-modal.tsx
"use client";

/**
 * mapear-item-modal.tsx — módulo de Estoque (bloco 1)
 *
 * Escolhe o produto do catálogo LHG/Omie e sugere o par no Automo por semelhança
 * de nome. Os dois catálogos escrevem diferente, então a sugestão é um atalho e
 * a confirmação é humana — nunca vínculo automático.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Search, Loader2, Check, Link2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { sugerirCandidatos } from "@/lib/estoque/mapeamento";
import { adicionarItemEstoque } from "../actions";
import type { ProdutoAutomo } from "@/lib/automo/client";
import type { ProdutoLhg } from "./tipos";

interface Props {
  open:            boolean;
  onClose:         () => void;
  localId:         string;
  produtos:        ProdutoLhg[];
  produtosAutomo:  ProdutoAutomo[];
  jaControlados:   string[];
}

const MAX_LISTA = 40;

export function MapearItemModal({
  open, onClose, localId, produtos, produtosAutomo, jaControlados,
}: Props) {
  const router = useRouter();
  const [busca, setBusca]         = useState("");
  const [produto, setProduto]     = useState<ProdutoLhg | null>(null);
  const [automoId, setAutomoId]   = useState<number | null>(null);
  const [fator, setFator]         = useState("1");
  const [ideal, setIdeal]         = useState("0");
  const [erro, setErro]           = useState<string | null>(null);
  const [salvando, setSalvando]   = useState(false);

  const controlados = useMemo(() => new Set(jaControlados), [jaControlados]);

  const resultados = useMemo(() => {
    const q = busca.toLowerCase().trim();
    const base = produtos.filter(p => !controlados.has(p.id));
    if (!q) return base.slice(0, MAX_LISTA);
    return base
      .filter(p => p.nome.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q))
      .slice(0, MAX_LISTA);
  }, [produtos, busca, controlados]);

  // Candidatos do Automo para o produto escolhido, por semelhança de nome.
  const sugestoes = useMemo(() => {
    if (!produto || produtosAutomo.length === 0) return [];
    return sugerirCandidatos(
      produto.nome,
      produtosAutomo.map(p => ({ id: String(p.id), nome: p.descricao })),
      { limite: 5, scoreMinimo: 0.15 },
    );
  }, [produto, produtosAutomo]);

  if (!open) return null;

  function fechar() {
    setBusca(""); setProduto(null); setAutomoId(null);
    setFator("1"); setIdeal("0"); setErro(null);
    onClose();
  }

  async function salvar() {
    setErro(null);
    if (!produto) { setErro("Escolha o produto do catálogo."); return; }

    const f = parseFloat(fator.replace(",", "."));
    if (!Number.isFinite(f) || f <= 0) { setErro("Fator deve ser maior que zero."); return; }

    const i = parseFloat(ideal.replace(",", "."));
    if (!Number.isFinite(i) || i < 0) { setErro("Estoque ideal não pode ser negativo."); return; }

    setSalvando(true);
    try {
      const res = await adicionarItemEstoque({
        local_id:          localId,
        produto_id:        produto.id,
        automo_produto_id: automoId,
        fator_conversao:   f,
        estoque_ideal:     i,
      });
      if ("erro" in res) { setErro(res.erro); return; }
      toast.success("Item adicionado ao controle");
      fechar();
      router.refresh();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[8vh] px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={fechar} />
      <div className="relative w-full max-w-[620px] rounded-xl border border-border bg-background shadow-2xl overflow-hidden">

        <div className="flex items-center justify-between px-5 py-4 border-b border-border/80">
          <h2 className="text-base font-semibold text-foreground">Adicionar item ao controle</h2>
          <button onClick={fechar} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[65vh] overflow-y-auto">

          {/* 1. Produto do catálogo LHG/Omie */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 block mb-1">
              1. Produto no catálogo LHG/Omie
            </label>
            {produto ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/[0.07] px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm text-foreground truncate">{produto.nome}</div>
                  <div className="text-[11px] text-muted-foreground/60 font-mono">
                    {produto.codigo} · {produto.unidade_med}
                  </div>
                </div>
                <button
                  onClick={() => { setProduto(null); setAutomoId(null); }}
                  className="text-[11px] text-muted-foreground hover:text-foreground shrink-0"
                >
                  trocar
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                  <input
                    autoFocus
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                    placeholder="Buscar por nome ou código…"
                    className="w-full h-9 rounded-lg border border-border bg-muted/30 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div className="mt-2 max-h-[200px] overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/40">
                  {resultados.length === 0 ? (
                    <p className="text-xs text-muted-foreground/60 px-3 py-6 text-center">
                      Nenhum produto disponível
                    </p>
                  ) : resultados.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setProduto(p)}
                      className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                    >
                      <div className="text-sm text-foreground truncate">{p.nome}</div>
                      <div className="text-[11px] text-muted-foreground/60 font-mono">
                        {p.codigo} · {p.unidade_med} · {p.categoria}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* 2. Vínculo no Automo */}
          {produto && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 block mb-1">
                2. Produto correspondente no Automo
              </label>
              {produtosAutomo.length === 0 ? (
                <p className="text-xs text-amber-400/80 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2">
                  Catálogo do Automo indisponível. Você pode salvar sem vínculo e completar
                  depois — sem ele as vendas deste item não serão importadas.
                </p>
              ) : sugestoes.length === 0 ? (
                <p className="text-xs text-muted-foreground/60 rounded-lg border border-border/60 px-3 py-2">
                  Nenhum nome parecido no Automo. Salve sem vínculo e ajuste depois.
                </p>
              ) : (
                <div className="space-y-1">
                  {sugestoes.map(s => {
                    const id = Number(s.id);
                    const item = produtosAutomo.find(p => p.id === id);
                    const escolhido = automoId === id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setAutomoId(escolhido ? null : id)}
                        className={cn(
                          "w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                          escolhido
                            ? "border-emerald-500/50 bg-emerald-500/10"
                            : "border-border/60 hover:bg-muted/50",
                        )}
                      >
                        <div className="min-w-0">
                          <div className="text-sm text-foreground truncate flex items-center gap-1.5">
                            {escolhido && <Check size={12} className="text-emerald-400 shrink-0" />}
                            {item?.descricao ?? s.nome}
                          </div>
                          <div className="text-[11px] text-muted-foreground/60">
                            {item?.tipo ?? "sem tipo"} · Automo #{id}
                          </div>
                        </div>
                        <span
                          title="Semelhança entre os nomes"
                          className="text-[10px] font-mono text-muted-foreground/60 shrink-0"
                        >
                          {(s.score * 100).toFixed(0)}%
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 3. Fator e ideal */}
          {produto && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 block mb-1">
                  Fator de conversão
                </label>
                <input
                  inputMode="decimal"
                  value={fator}
                  onChange={e => setFator(e.target.value)}
                  className="w-full h-9 rounded-lg border border-border bg-muted/30 px-3 text-sm font-mono text-foreground focus:outline-none focus:border-emerald-500/50"
                />
                <p className="text-[10px] text-muted-foreground/60 mt-1">
                  1 venda no Automo = N {produto.unidade_med} no Omie. Bebida = 1; porção de
                  picanha ≈ 0,4.
                </p>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 block mb-1">
                  Estoque ideal
                </label>
                <input
                  inputMode="decimal"
                  value={ideal}
                  onChange={e => setIdeal(e.target.value)}
                  className="w-full h-9 rounded-lg border border-border bg-muted/30 px-3 text-sm font-mono text-foreground focus:outline-none focus:border-emerald-500/50"
                />
                <p className="text-[10px] text-muted-foreground/60 mt-1">
                  Quanto você quer ter em estoque. Alimenta a coluna &ldquo;a repor&rdquo;.
                </p>
              </div>
            </div>
          )}

          {erro && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/25 rounded-md px-3 py-2">{erro}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border/60">
          <button onClick={fechar} className="text-sm text-muted-foreground hover:text-foreground/80 px-3 py-2 transition-colors">
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando || !produto}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-700/60 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
          >
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
            {salvando ? "Salvando…" : "Adicionar ao controle"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck e build**

Run: `pnpm typecheck`
Esperado: sem erro.

Run: `pnpm build`
Esperado: build completo, com `/estoque` na lista de rotas como `ƒ (Dynamic)`.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/estoque/_components/mapear-item-modal.tsx"
git commit -m "feat(estoque): modal de cadastro com sugestão de mapeamento por nome"
```

---

## Task 10: Editar fator e estoque ideal na linha

O fator de conversão é calibrado com o uso (uma porção de picanha muda de gramagem), então
ele precisa ser editável sem remover e recadastrar o item. Esta é a tarefa que consome
`atualizarItemEstoque` da Task 6.

**Files:**
- Modify: `app/(app)/estoque/_components/estoque-client.tsx`

- [ ] **Step 1: Acrescentar o estado de edição**

Trocar o import das actions e acrescentar estado, no topo do componente:

```typescript
import { removerItemEstoque, atualizarItemEstoque } from "../actions";
```

Depois de `const [removendo, setRemovendo] = useState<string | null>(null);`:

```typescript
  // Célula em edição: guarda qual item e qual campo, para um input por vez.
  const [editando, setEditando] = useState<{ id: string; campo: "fator" | "ideal" } | null>(null);
  const [draft, setDraft]       = useState("");
```

- [ ] **Step 2: Acrescentar o handler de salvar**

Antes do `return`:

```typescript
  async function salvarCampo(id: string, campo: "fator" | "ideal") {
    const v = parseFloat(draft.replace(",", "."));
    if (!Number.isFinite(v) || v < 0 || (campo === "fator" && v <= 0)) {
      toast.error(campo === "fator" ? "Fator deve ser maior que zero" : "Estoque ideal não pode ser negativo");
      return;
    }
    const res = await atualizarItemEstoque(
      id,
      campo === "fator" ? { fator_conversao: v } : { estoque_ideal: v },
    );
    if ("erro" in res) { toast.error(res.erro); return; }
    setEditando(null);
    router.refresh();
  }

  /**
   * Célula numérica clicável que vira input.
   *
   * Definida dentro do componente para fechar sobre `editando`/`draft`/`salvarCampo`
   * sem passar 5 props. Se o lint reclamar de `react/no-unstable-nested-components`,
   * mover para fora do componente e receber
   * `{ item, campo, editando, draft, setEditando, setDraft, onSalvar }` como props.
   */
  function CelulaNumero({ item, campo }: { item: ItemEstoque; campo: "fator" | "ideal" }) {
    const emEdicao = editando?.id === item.id && editando.campo === campo;
    const valor = campo === "fator" ? item.fator_conversao : item.estoque_ideal;
    const casas = campo === "fator" ? 4 : 3;

    if (emEdicao) {
      return (
        <span className="inline-flex items-center gap-1 justify-end">
          <input
            autoFocus
            inputMode="decimal"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter")  salvarCampo(item.id, campo);
              if (e.key === "Escape") setEditando(null);
            }}
            className="w-20 h-6 rounded border border-emerald-500/50 bg-background px-1.5 text-xs font-mono text-right text-foreground focus:outline-none"
          />
          <button onClick={() => salvarCampo(item.id, campo)} title="Salvar"
            className="p-0.5 text-emerald-400 hover:text-emerald-300">
            <Check size={12} />
          </button>
        </span>
      );
    }

    return (
      <button
        onClick={() => { setEditando({ id: item.id, campo }); setDraft(String(valor)); }}
        title="Clique para editar"
        className="font-mono rounded px-1 -mx-1 hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors"
      >
        {Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: casas })}
      </button>
    );
  }
```

Incluir `Check` no import de `lucide-react` deste arquivo:

```typescript
import { Plus, Trash2, AlertTriangle, Boxes, Loader2, Check } from "lucide-react";
```

- [ ] **Step 3: Usar as células na tabela**

Substituir as duas células de fator e ideal:

```typescript
                      <td className="py-3 pr-4 text-right">
                        <CelulaNumero item={item} campo="fator" />
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <CelulaNumero item={item} campo="ideal" />
                      </td>
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Esperado: sem erro.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/estoque/_components/estoque-client.tsx"
git commit -m "feat(estoque): editar fator e estoque ideal direto na linha"
```

---

## Task 11: Entrada no menu

**Files:**
- Modify: `components/lhg/shell/nav-config.ts`

- [ ] **Step 1: Acrescentar `Boxes` ao import**

O import de ícones começa na linha 5. Acrescentar `Boxes` à lista de nomes importados de
`lucide-react` (a ordem dentro do bloco não importa):

```typescript
import {
  // …ícones já existentes…
  Boxes,
} from "lucide-react";
```

- [ ] **Step 2: Acrescentar o item de menu**

Em `NAV_ITEMS`, imediatamente depois da linha do item `produtos` (linha 44):

```typescript
  { id: "estoque",      label: "Estoque",              href: "/estoque",      icon: Boxes,           section: "Cadastros" },
```

- [ ] **Step 3: Acrescentar o breadcrumb**

Em `BREADCRUMB_MAP`, acrescentar:

```typescript
  "/estoque": ["Cadastros", "Estoque"],
```

- [ ] **Step 4: Typecheck e lint**

Run: `pnpm typecheck`
Esperado: sem erro.

Run: `pnpm lint`
Esperado: nenhum problema novo nos arquivos de `app/(app)/estoque/`, `lib/estoque/`,
`lib/automo/` ou `nav-config.ts`. Os ~312 problemas pré-existentes (maioria em
`prototype/`) continuam.

- [ ] **Step 5: Commit**

```bash
git add components/lhg/shell/nav-config.ts
git commit -m "feat(estoque): entrada Estoque no menu lateral"
```

---

## Task 12: Verificação de ponta a ponta

**Files:** nenhum (verificação)

- [ ] **Step 1: Suíte completa**

Run: `pnpm test`
Esperado: 49 testes passando.

Run: `pnpm typecheck`
Esperado: sem erro.

Run: `pnpm build`
Esperado: build completo com a rota `/estoque`.

- [ ] **Step 2: Conferir o estado no banco**

```powershell
. .\scripts\supabase-lhg.ps1
Invoke-LhgSql -Query "select l.nome, count(distinct lu.unidade_id)::text unidades_fiscais, count(distinct ei.id)::text itens_controlados from locais_estoque l left join local_unidade lu on lu.local_id=l.id left join estoque_itens ei on ei.local_id=l.id group by 1 order by 1" | ConvertTo-Json -Compress
```

Esperado: 4 locais; `Lush Ipiranga` com `unidades_fiscais = 2`; `itens_controlados = 0`
antes de qualquer cadastro pela tela.

- [ ] **Step 3: Teste manual na tela**

1. `pnpm dev` e abrir `http://localhost:3001/estoque`
2. Confirmar que o título mostra o local certo e "abastecido por Lush Ipiranga (CONCAVO) + Lush Ipiranga (RCC)" quando a unidade ativa é uma das duas do Ipiranga
3. Clicar "Adicionar item", buscar `COCA COLA`, escolher, e confirmar que aparece sugestão do Automo com percentual
4. Salvar com fator `1` e ideal `24`; confirmar que a linha aparece na tabela
5. Tentar adicionar o **mesmo** produto de novo; esperado: erro "Este produto já está na lista de itens controlados deste local."
6. Trocar a unidade na sidebar para Lush Lapa e confirmar que a lista muda de local
7. Remover o item e confirmar o `confirm` e o desaparecimento da linha

- [ ] **Step 4: Atualizar o CLAUDE.md**

Acrescentar na seção "Status das Tarefas", antes do bloco M17:

```markdown
### 🔄 M18 — Módulo de Estoque (bloco 1: fundação)
- ✅ Migration 0026: `locais_estoque`, `local_unidade` (N unidades fiscais → 1 local), `estoque_itens` + RLS `comprador`/`admin` e seed dos 4 locais
- ✅ RCC + CONCAVO vinculados ao **mesmo** local físico (Lush Ipiranga) — entradas dos dois CNPJs somam, venda baixa uma vez
- ✅ `lib/estoque/mapeamento.ts`: normalização de nome + Jaccard de palavras + sugestão de candidatos. Puras, 16 testes
- ✅ `lib/automo/client.ts`: leitor somente-leitura dos 4 Postgres do Automo. `ssl: false` obrigatório (bancos sem TLS) e `AutomoIndisponivelError` porque Andar de Cima cai com frequência
- ✅ Tela `/estoque`: lista de itens controlados por local + modal com sugestão de mapeamento
- ⚠️ Estrutura própria de propósito: **não** espelha depósito do Automo (é frigobar por apartamento, 61 no Ipiranga) nem local do Omie
- Spec: `docs/superpowers/specs/2026-08-20-modulo-estoque-design.md`
- Plano: `docs/superpowers/plans/2026-08-20-estoque-bloco1-fundacao.md`
```

Atualizar também a linha da última migration na §8 para **0026**.

- [ ] **Step 5: Commit final**

```bash
git add CLAUDE.md
git commit -m "docs: registra bloco 1 do módulo de estoque no CLAUDE.md"
git push -u origin feat/estoque
```

---

## Fora deste bloco

- Import de saídas do Automo → bloco 2
- Import de entradas do Omie (`ListarMovimentos`) → bloco 3
- `estoque_movimentos` (o ledger) e `estoque_ciclos` → blocos 3 e 4
- Tela de contagem com teórico/divergência/a repor → bloco 4
- Ficha técnica para pratos com mais de um insumo → só se aparecer
