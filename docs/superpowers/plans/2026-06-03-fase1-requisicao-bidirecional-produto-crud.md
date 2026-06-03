# Fase 1 — Requisição Bidirecional + CRUD Produtos Omie

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar Requisições de Compra bidirecionais com o Omie, suportar itens com produto livre (texto), e permitir que Keila crie/edite produtos no Omie via plataforma antes de aprovar requisições.

**Architecture:** DB recebe novos campos em `requisicoes` e `requisicao_itens` (produto_id nullable + produto_nome_livre) e uma tabela espelho `omie_requisicoes`. Novas funções Omie em `lib/omie/produtos.ts` e `lib/omie/requisicao.ts` (listAllRequisicoes). Sync job `syncRequisicoes` adicionado em `lib/omie/sync.ts`. Server Actions atualizadas em `actions.ts`. UI: listagem com badges de origem/status, modal de criação com produto livre, página de detalhe com aprovação e modal de cadastro de produto no Omie.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (PostgreSQL + RLS), Omie ERP REST API, Zod, Sonner toasts.

---

## Mapa de arquivos

| Arquivo | Ação |
|---------|------|
| `supabase/migrations/0019_fase1_requisicao_bidirecional.sql` | Criar |
| `lib/omie/produtos.ts` | Criar (novo) |
| `lib/omie/requisicao.ts` | Modificar (add listAllRequisicoes + tipos) |
| `lib/omie/sync.ts` | Modificar (add syncRequisicoes) |
| `lib/omie/client.ts` | Modificar (add OmieRequisicaoItem export) |
| `app/api/omie/sync/route.ts` | Modificar (add entidade "requisicoes") |
| `app/(app)/requisicoes/actions.ts` | Modificar (update criarRequisicao + 4 novas actions) |
| `app/(app)/requisicoes/page.tsx` | Modificar (filtros + badges) |
| `app/(app)/requisicoes/_components/nova-requisicao-modal.tsx` | Modificar (produto livre) |
| `app/(app)/requisicoes/[id]/page.tsx` | Criar (detalhe + aprovação) |
| `app/(app)/requisicoes/[id]/_components/produto-omie-modal.tsx` | Criar (modal cadastro produto) |
| `app/(app)/produtos/page.tsx` | Modificar (botão criar/editar produto Omie) |

---

## Task 1: SQL — Migrations do banco

**Mandar o SQL abaixo para o usuário rodar no Supabase SQL Editor.**

**Files:**
- Create: `supabase/migrations/0019_fase1_requisicao_bidirecional.sql`

- [ ] **Step 1: Criar o arquivo de migration**

```sql
-- supabase/migrations/0019_fase1_requisicao_bidirecional.sql
-- Fase 1: Requisições bidirecionais + produto livre

-- 1. Adicionar campos de sync Omie na tabela requisicoes
ALTER TABLE requisicoes
  ADD COLUMN IF NOT EXISTS omie_codigo         BIGINT,
  ADD COLUMN IF NOT EXISTS omie_unidade_id     UUID REFERENCES unidades(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS omie_sincronizado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS origem              TEXT NOT NULL DEFAULT 'plataforma';
  -- origem: 'plataforma' | 'omie'

-- 2. Adicionar status 'pendente_produto' e 'aguardando_cotacao' ao enum
-- (se usar TEXT simples, não precisa; se usar ENUM, rodar:)
-- ALTER TYPE requisicao_status ADD VALUE IF NOT EXISTS 'pendente_produto';
-- ALTER TYPE requisicao_status ADD VALUE IF NOT EXISTS 'aguardando_cotacao';
-- Se status é TEXT (verificar na tabela), ignorar as linhas de ALTER TYPE acima.

-- 3. Modificar requisicao_itens para suportar produto livre
ALTER TABLE requisicao_itens
  ALTER COLUMN produto_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS produto_nome_livre TEXT,
  ADD COLUMN IF NOT EXISTS produto_unidade_med TEXT,
  ADD COLUMN IF NOT EXISTS produto_novo BOOLEAN NOT NULL DEFAULT false;

-- Constraint: produto_id OU produto_nome_livre deve estar preenchido
ALTER TABLE requisicao_itens
  DROP CONSTRAINT IF EXISTS chk_produto_definido;
ALTER TABLE requisicao_itens
  ADD CONSTRAINT chk_produto_definido
  CHECK (produto_id IS NOT NULL OR produto_nome_livre IS NOT NULL);

-- 4. Criar tabela espelho omie_requisicoes
CREATE TABLE IF NOT EXISTS omie_requisicoes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id            UUID NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  omie_codigo           BIGINT NOT NULL,
  numero                TEXT,
  data_requisicao       DATE,
  data_necessidade      DATE,
  observacao            TEXT,
  situacao              TEXT,
  departamento          TEXT,
  solicitante_nome      TEXT,
  valor_total           NUMERIC(12,2),
  itens                 JSONB,
  requisicao_id         UUID REFERENCES requisicoes(id) ON DELETE SET NULL,
  omie_sincronizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(omie_codigo, unidade_id)
);

-- RLS: mesmas regras das outras tabelas de sync Omie
ALTER TABLE omie_requisicoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuarios_autenticados_podem_ler_omie_requisicoes"
ON omie_requisicoes FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "service_role_gerencia_omie_requisicoes"
ON omie_requisicoes FOR ALL
USING (auth.role() = 'service_role');

-- Índices
CREATE INDEX IF NOT EXISTS idx_omie_requisicoes_unidade ON omie_requisicoes(unidade_id);
CREATE INDEX IF NOT EXISTS idx_omie_requisicoes_data ON omie_requisicoes(data_requisicao DESC);
CREATE INDEX IF NOT EXISTS idx_omie_requisicoes_requisicao_id ON omie_requisicoes(requisicao_id);
```

- [ ] **Step 2: Verificar se `status` em `requisicoes` é TEXT ou ENUM**

No Supabase SQL Editor:
```sql
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'requisicoes' AND column_name = 'status';
```

- Se `data_type = 'text'` → o campo aceita qualquer string, os novos status já funcionam.
- Se `data_type = 'USER-DEFINED'` → rodar as linhas de `ALTER TYPE` comentadas na migration.

- [ ] **Step 3: Rodar a migration no Supabase SQL Editor e confirmar "Success"**

- [ ] **Step 4: Criar arquivo de migration local para histórico**

```bash
# Apenas salva o arquivo localmente (não executa)
git add supabase/migrations/0019_fase1_requisicao_bidirecional.sql
git commit -m "db: migration 0019 - fase1 requisicao bidirecional e produto livre"
```

---

## Task 2: `lib/omie/produtos.ts` — CRUD de produtos no Omie

**Files:**
- Create: `lib/omie/produtos.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
/**
 * lib/omie/produtos.ts
 * Operações Omie para CRUD de Produtos.
 * Fase 1: Create + Update apenas. Delete não é suportado (só inativação).
 *
 * Endpoint: /produtos/produto/
 */
import { omiePost, OmieCredentials, OmieError } from "./client";

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface OmieProdutoIncluir {
  cCodIntProduto: string;    // UUID do produto LHG — garante idempotência
  cDescricao:     string;    // nome do produto (obrigatório)
  cUnidade:       string;    // "UN", "KG", "CX", "LT", etc.
  cCodFamilia?:   string;    // código da família no Omie (opcional)
  nValorCusto?:   number;    // preço de custo (opcional)
  nValorVenda?:   number;    // preço de venda (opcional)
  cInativo:       "N";       // sempre ativo ao criar
}

export interface OmieProdutoAlterar {
  nCodProd:       number;    // código numérico Omie — obrigatório para alterar
  cCodIntProduto: string;    // UUID do produto LHG
  cDescricao?:    string;
  cUnidade?:      string;
  cCodFamilia?:   string;
  nValorCusto?:   number;
  cInativo?:      "S" | "N"; // "S" = inativar, "N" = ativar
}

interface IncluirProdutoResponse {
  nCodProd:        number;
  cCodIntProduto:  string;
  cDescricao:      string;
}

// ── incluirProduto ─────────────────────────────────────────────────────────────

/**
 * Cria um produto no Omie.
 * Retorna { nCodProd, cCodIntProduto } para salvar em produtos.omie_codigo.
 *
 * Lança OmieError se a criação falhar (ex: código de integração duplicado).
 */
export async function incluirProduto(
  creds: OmieCredentials,
  produto: OmieProdutoIncluir,
): Promise<{ nCodProd: number; cCodIntProduto: string }> {
  const res = await omiePost<
    { produto_servico_cadastro: OmieProdutoIncluir },
    IncluirProdutoResponse
  >(
    "/produtos/produto/",
    "IncluirProduto",
    creds,
    { produto_servico_cadastro: produto },
  );

  if (!res.nCodProd) {
    throw new OmieError("Omie não retornou nCodProd após incluir produto");
  }

  return { nCodProd: res.nCodProd, cCodIntProduto: res.cCodIntProduto };
}

// ── alterarProduto ─────────────────────────────────────────────────────────────

/**
 * Atualiza um produto existente no Omie.
 * Para inativar, passar { cInativo: "S" }.
 * Não há endpoint de exclusão — apenas inativação.
 */
export async function alterarProduto(
  creds: OmieCredentials,
  produto: OmieProdutoAlterar,
): Promise<void> {
  await omiePost<
    { produto_servico_cadastro: OmieProdutoAlterar },
    Record<string, unknown>
  >(
    "/produtos/produto/",
    "AlterarProduto",
    creds,
    { produto_servico_cadastro: produto },
  );
}
```

- [ ] **Step 2: Rodar typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add lib/omie/produtos.ts
git commit -m "feat(omie): lib/omie/produtos.ts - incluirProduto + alterarProduto"
```

---

## Task 3: `lib/omie/requisicao.ts` — Adicionar listAllRequisicoes

**Files:**
- Modify: `lib/omie/requisicao.ts`

- [ ] **Step 1: Adicionar tipos e função `listAllRequisicoes` ao final do arquivo existente**

Adicionar após `excluirReq`:

```typescript
// ── Tipos: Listagem de Requisições ─────────────────────────────────────────────

export interface OmieRequisicaoItemDetalhe {
  nItem:       number;
  nCodProd?:   number;   // pode estar vazio se produto não mapeado
  cDescricao:  string;
  nQtde:       number;
  cUnid?:      string;
  nValUnit?:   number;
  cObsItem?:   string;
}

export interface OmieRequisicaoItem {
  nCodReqCompra:      number;
  cNumReq?:           string;
  cCodIntReqCompra?:  string;   // UUID de integração (nosso ID se criamos por aqui)
  dDtRequisicao?:     string;   // "DD/MM/YYYY"
  dDtNecessidade?:    string;
  cSituacao?:         string;   // "Aberta", "Em Cotação", "Aprovada", "Cancelada"
  cDepartamento?:     string;
  cSolicitante?:      string;
  cObs?:              string;
  det?:               OmieRequisicaoItemDetalhe[];
}

interface ListarReqResponse {
  pagina:              number;
  total_de_paginas:    number;
  registros:           number;
  total_de_registros:  number;
  requisicaoCadastro?: OmieRequisicaoItem[];
}

interface ListarReqParam {
  pagina:                  number;
  registros_por_pagina:    number;
  filtrar_apenas_ativo?:   "S" | "N";
  filtrar_situacao?:       string;  // "Aberta" para apenas as abertas
}

// ── listAllRequisicoes ─────────────────────────────────────────────────────────

/**
 * Lista todas as Requisições de Compra do Omie de forma paginada.
 * Retorna apenas as abertas por padrão (filtrar_situacao = "Aberta").
 * Usado pelo syncRequisicoes para pull bidirecional.
 */
export async function listAllRequisicoes(
  creds: OmieCredentials,
  situacao = "Aberta",
): Promise<OmieRequisicaoItem[]> {
  const PER_PAGE = 50;
  const all: OmieRequisicaoItem[] = [];
  let page = 1;

  while (true) {
    const res = await omiePost<ListarReqParam, ListarReqResponse>(
      "/produtos/requisicaocompra/",
      "ListarReq",
      creds,
      {
        pagina:               page,
        registros_por_pagina: PER_PAGE,
        filtrar_situacao:     situacao,
      },
    );

    const items = res.requisicaoCadastro ?? [];
    all.push(...items);

    if (page >= res.total_de_paginas || items.length === 0) break;
    page++;
  }

  return all;
}
```

- [ ] **Step 2: Rodar typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add lib/omie/requisicao.ts
git commit -m "feat(omie): listAllRequisicoes - pull de requisicoes do Omie"
```

---

## Task 4: `lib/omie/sync.ts` — Adicionar syncRequisicoes

**Files:**
- Modify: `lib/omie/sync.ts` (adicionar ao final, após as imports existentes)

- [ ] **Step 1: Adicionar import de `listAllRequisicoes` e `OmieRequisicaoItem` no topo do arquivo**

Localizar a linha de imports de `./client` e adicionar:

```typescript
// Adicionar a esta linha já existente:
import {
  listAllFornecedores,
  listAllProdutos,
  listAllPedidosCompra,
  // ... outros já existentes ...
} from "./client";

// Adicionar import separado:
import {
  listAllRequisicoes,
  type OmieRequisicaoItem,
} from "./requisicao";
```

- [ ] **Step 2: Adicionar função `syncRequisicoes` ao final do arquivo**

```typescript
// ── syncRequisicoes ─────────────────────────────────────────────────────────────

/**
 * Pull bidirecional: busca Requisições de Compra abertas no Omie
 * e upserta em omie_requisicoes. Para cada requisição do Omie sem
 * correspondente local, cria um registro em requisicoes com origem='omie'.
 *
 * Requer service client (bypass de RLS).
 */
export async function syncRequisicoes(
  supabase: SupabaseClient,
  creds: OmieCredentials,
  unidadeId: string,
): Promise<SyncResult> {
  const start = Date.now();
  let total = 0, novos = 0, erros = 0;

  try {
    const itens = await listAllRequisicoes(creds);
    total = itens.length;

    for (const item of itens) {
      try {
        // 1. Upsert na tabela espelho
        const { data: espelho, error: espErr } = await supabase
          .from("omie_requisicoes")
          .upsert(
            {
              unidade_id:           unidadeId,
              omie_codigo:          item.nCodReqCompra,
              numero:               item.cNumReq ?? null,
              data_requisicao:      item.dDtRequisicao
                ? parseDateBR(item.dDtRequisicao)
                : null,
              data_necessidade:     item.dDtNecessidade
                ? parseDateBR(item.dDtNecessidade)
                : null,
              observacao:           item.cObs ?? null,
              situacao:             item.cSituacao ?? null,
              departamento:         item.cDepartamento ?? null,
              solicitante_nome:     item.cSolicitante ?? null,
              itens:                item.det ?? null,
              omie_sincronizado_em: new Date().toISOString(),
            },
            { onConflict: "omie_codigo,unidade_id", ignoreDuplicates: false },
          )
          .select("id, requisicao_id")
          .single();

        if (espErr) {
          console.error("[sync/req] upsert espelho:", espErr.message);
          erros++;
          continue;
        }

        // 2. Se ainda não tem requisicao_id local, criar requisição interna
        if (!espelho?.requisicao_id) {
          // Verificar se cCodIntReqCompra aponta para uma requisição nossa
          let reqId: string | null = null;

          if (item.cCodIntReqCompra) {
            const { data: existing } = await supabase
              .from("requisicoes")
              .select("id")
              .eq("id", item.cCodIntReqCompra)
              .maybeSingle();
            reqId = existing?.id ?? null;
          }

          if (!reqId) {
            // Criar requisição interna originada do Omie
            const year = new Date().getFullYear();
            const { data: last } = await supabase
              .from("requisicoes")
              .select("numero")
              .like("numero", `REQ-${year}-%`)
              .order("numero", { ascending: false })
              .limit(1)
              .maybeSingle();

            const lastNum = last
              ? parseInt(last.numero.split("-")[2] ?? "0", 10)
              : 0;
            const numero = `REQ-${year}-${String(lastNum + 1).padStart(4, "0")}`;

            const { data: req, error: reqErr } = await supabase
              .from("requisicoes")
              .insert({
                numero,
                titulo:         item.cObs ?? `Requisição Omie ${item.cNumReq ?? item.nCodReqCompra}`,
                urgencia:       "normal",
                status:         "aguardando_cotacao",
                origem:         "omie",
                omie_codigo:    item.nCodReqCompra,
                omie_unidade_id: unidadeId,
                omie_sincronizado_em: new Date().toISOString(),
              })
              .select("id")
              .single();

            if (reqErr || !req) {
              console.error("[sync/req] criar req local:", reqErr?.message);
              erros++;
              continue;
            }

            reqId = req.id;

            // Criar itens da requisição
            if (item.det?.length) {
              const itensMapped = await Promise.all(
                item.det.map(async (d) => {
                  // Tentar vincular ao produto local pelo omie_codigo
                  let produtoId: string | null = null;
                  if (d.nCodProd) {
                    const { data: prod } = await supabase
                      .from("produtos")
                      .select("id")
                      .eq("omie_codigo", String(d.nCodProd))
                      .eq("omie_unidade_id", unidadeId)
                      .maybeSingle();
                    produtoId = prod?.id ?? null;
                  }

                  return {
                    requisicao_id:      reqId,
                    produto_id:         produtoId,
                    produto_nome_livre: produtoId ? null : d.cDescricao,
                    produto_unidade_med: d.cUnid ?? null,
                    produto_novo:       !produtoId,
                    quantidade:         d.nQtde,
                    observacao:         d.cObsItem ?? null,
                  };
                }),
              );

              await supabase.from("requisicao_itens").insert(itensMapped);

              // Se há produto_novo, ajustar status para pendente_produto
              const temProdutoNovo = itensMapped.some((i) => i.produto_novo);
              if (temProdutoNovo) {
                await supabase
                  .from("requisicoes")
                  .update({ status: "pendente_produto" })
                  .eq("id", reqId);
              }
            }

            novos++;
          }

          // Vincular espelho à requisição
          await supabase
            .from("omie_requisicoes")
            .update({ requisicao_id: reqId })
            .eq("id", espelho!.id);
        }
      } catch (err) {
        console.error("[sync/req] item:", (err as Error).message);
        erros++;
      }
    }
  } catch (err) {
    const msg = (err as Error).message;
    const result: SyncResult = {
      entidade: "requisicoes",
      status: "erro",
      total: 0,
      novos: 0,
      erros: 1,
      duracaoMs: Date.now() - start,
      detalhe: { erro: msg },
    };
    await registrarLog(supabase, unidadeId, { ...result, operacao: "sync" });
    return result;
  }

  const result: SyncResult = {
    entidade: "requisicoes",
    status: erros > 0 && novos === 0 ? "erro" : erros > 0 ? "parcial" : "ok",
    total,
    novos,
    erros,
    duracaoMs: Date.now() - start,
  };

  await registrarLog(supabase, unidadeId, { ...result, operacao: "sync" });
  return result;
}

// ── Helper: parsear data BR (DD/MM/YYYY → ISO) ────────────────────────────────

function parseDateBR(dateBR: string): string {
  const [d, m, y] = dateBR.split("/");
  return `${y}-${m}-${d}`;
}
```

- [ ] **Step 3: Adicionar `syncRequisicoes` à função `syncTodasUnidades` (se existir)**

Localizar `syncTodasUnidades` em `sync.ts` e adicionar:

```typescript
// Dentro do loop for (const unidade of unidades):
const reqResult = await syncRequisicoes(supabase, creds, unidade.id);
results.push(reqResult);
```

- [ ] **Step 4: Rodar typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add lib/omie/sync.ts
git commit -m "feat(omie): syncRequisicoes - pull bidirecional de requisicoes do Omie"
```

---

## Task 5: `/api/omie/sync/route.ts` — Adicionar entidade "requisicoes"

**Files:**
- Modify: `app/api/omie/sync/route.ts`

- [ ] **Step 1: Adicionar import de `syncRequisicoes`**

Localizar a linha de imports de `@/lib/omie/sync` e adicionar `syncRequisicoes`:

```typescript
import {
  syncTodasUnidades,
  syncFornecedores,
  syncProdutos,
  syncCMCProdutos,
  syncPedidosCompra,
  syncRequisicoes,     // ← adicionar
  type SyncResult,
} from "@/lib/omie/sync";
```

- [ ] **Step 2: Atualizar o tipo de `entidade` e o case switch**

Localizar:
```typescript
let entidade: "fornecedores" | "produtos" | "cmc" | "pedidos" | "todos" = "todos";
```

Substituir por:
```typescript
let entidade: "fornecedores" | "produtos" | "cmc" | "pedidos" | "requisicoes" | "todos" = "todos";
```

Localizar o bloco de validação do body:
```typescript
body?.entidade === "fornecedores" ||
body?.entidade === "produtos" ||
body?.entidade === "cmc" ||
body?.entidade === "pedidos" ||
body?.entidade === "todos"
```

Substituir por:
```typescript
body?.entidade === "fornecedores" ||
body?.entidade === "produtos" ||
body?.entidade === "cmc" ||
body?.entidade === "pedidos" ||
body?.entidade === "requisicoes" ||
body?.entidade === "todos"
```

- [ ] **Step 3: Adicionar o case para "requisicoes" no loop de unidades**

Localizar o bloco `if (entidade === "fornecedores")` e adicionar após o case "pedidos":

```typescript
} else if (entidade === "requisicoes") {
  const r = await syncRequisicoes(supabase, creds, unidade.id);
  results.push(r);
}
```

- [ ] **Step 4: Rodar typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 5: Testar sync manual no browser (após deploy ou dev local)**

```bash
curl -X POST http://localhost:3000/api/omie/sync \
  -H "Content-Type: application/json" \
  -d '{"entidade":"requisicoes"}'
```

Expected: `{"ok":true,"results":[{"entidade":"requisicoes","status":"ok",...}]}`

- [ ] **Step 6: Commit**

```bash
git add app/api/omie/sync/route.ts
git commit -m "feat(api): /api/omie/sync suporta entidade=requisicoes"
```

---

## Task 6: `actions.ts` — Atualizar e adicionar Server Actions

**Files:**
- Modify: `app/(app)/requisicoes/actions.ts`

- [ ] **Step 1: Atualizar o arquivo completo**

```typescript
"use server";

/**
 * actions.ts — Fase 1
 * Server Actions para o módulo de Requisições.
 * Fase 1: suporte a produto_nome_livre + aprovarRequisicao + CRUD produto Omie.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { incluirProduto, alterarProduto } from "@/lib/omie/produtos";
import { upsertReq } from "@/lib/omie/requisicao";
import type { OmieCredentials } from "@/lib/omie/client";

// ── Schemas ───────────────────────────────────────────────────────────────────

// Item com produto do catálogo OU texto livre (nunca ambos)
const ItemSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo:       z.literal("catalogo"),
    produto_id: z.string().uuid(),
    quantidade: z.number().positive(),
    observacao: z.string().optional(),
  }),
  z.object({
    tipo:              z.literal("livre"),
    produto_nome_livre: z.string().min(2, "Descreva o produto (mínimo 2 caracteres)"),
    produto_unidade_med: z.string().min(1, "Informe a unidade (ex: UN, KG)"),
    quantidade:        z.number().positive(),
    observacao:        z.string().optional(),
  }),
]);

const NovaRequisicaoSchema = z.object({
  titulo:        z.string().min(3, "Título obrigatório (mínimo 3 caracteres)"),
  urgencia:      z.enum(["normal", "urgente"]),
  justificativa: z.string().optional(),
  unidade_ids:   z.array(z.string().uuid()).min(1, "Selecione ao menos uma unidade"),
  itens:         z.array(ItemSchema).min(1, "Adicione ao menos um item"),
});

export type NovaRequisicaoInput = z.infer<typeof NovaRequisicaoSchema>;
export type ItemInput = z.infer<typeof ItemSchema>;

const ProdutoOmieSchema = z.object({
  nome:       z.string().min(2, "Nome obrigatório"),
  unidade:    z.string().min(1, "Unidade obrigatória (ex: UN, KG)"),
  familia:    z.string().optional(),
  valorCusto: z.number().optional(),
});

export type ProdutoOmieInput = z.infer<typeof ProdutoOmieSchema>;

// ── Helper: buscar credenciais Omie da unidade ────────────────────────────────

async function getCredsUnidade(unidadeId: string): Promise<OmieCredentials | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("unidades")
    .select("omie_app_key, omie_app_secret")
    .eq("id", unidadeId)
    .eq("ativa", true)
    .not("omie_app_key", "is", null)
    .not("omie_app_secret", "is", null)
    .maybeSingle();

  if (!data) return null;
  return {
    appKey:    (data.omie_app_key as string).replace(/^﻿/, ""),
    appSecret: (data.omie_app_secret as string).replace(/^﻿/, ""),
  };
}

// ── criarRequisicao ───────────────────────────────────────────────────────────

export async function criarRequisicao(input: NovaRequisicaoInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = NovaRequisicaoSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos");
  }

  const { titulo, urgencia, justificativa, unidade_ids, itens } = parsed.data;
  const temProdutoNovo = itens.some((i) => i.tipo === "livre");

  // ── Número sequencial ──────────────────────────────────────────────────────
  const year = new Date().getFullYear();
  const { data: lastReq } = await supabase
    .from("requisicoes")
    .select("numero")
    .like("numero", `REQ-${year}-%`)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastNum = lastReq
    ? parseInt(lastReq.numero.split("-")[2] ?? "0", 10)
    : 0;
  const numero = `REQ-${year}-${String(lastNum + 1).padStart(4, "0")}`;

  const status = temProdutoNovo ? "pendente_produto" : "aguardando_cotacao";

  // ── Inserir requisição ──────────────────────────────────────────────────────
  const { data: req, error: reqErr } = await supabase
    .from("requisicoes")
    .insert({
      numero,
      titulo,
      urgencia,
      justificativa: justificativa || null,
      solicitante_id: user.id,
      status,
      origem: "plataforma",
    })
    .select()
    .single();

  if (reqErr || !req) {
    throw new Error(reqErr?.message ?? "Erro ao criar requisição");
  }

  // ── Inserir unidades ────────────────────────────────────────────────────────
  await supabase
    .from("requisicao_unidades")
    .insert(unidade_ids.map((uid) => ({ requisicao_id: req.id, unidade_id: uid })));

  // ── Inserir itens ───────────────────────────────────────────────────────────
  await supabase.from("requisicao_itens").insert(
    itens.map((item) =>
      item.tipo === "catalogo"
        ? {
            requisicao_id: req.id,
            produto_id:    item.produto_id,
            produto_novo:  false,
            quantidade:    item.quantidade,
            observacao:    item.observacao || null,
          }
        : {
            requisicao_id:       req.id,
            produto_id:          null,
            produto_nome_livre:  item.produto_nome_livre,
            produto_unidade_med: item.produto_unidade_med,
            produto_novo:        true,
            quantidade:          item.quantidade,
            observacao:          item.observacao || null,
          },
    ),
  );

  // ── Enviar ao Omie (só se não há produto novo — todos os produtos existem) ──
  // Se há produto novo, enviamos ao Omie depois que Keila aprovar (aprovarRequisicao).
  if (!temProdutoNovo) {
    try {
      const creds = await getCredsUnidade(unidade_ids[0]);
      if (creds) {
        const { data: itensReq } = await supabase
          .from("requisicao_itens")
          .select("id, produto_id, quantidade, produtos(omie_codigo)")
          .eq("requisicao_id", req.id);

        const omieItens = (itensReq ?? []).map((i) => {
          const prod = i.produtos as { omie_codigo: string | null } | null;
          return {
            codIntItem: i.id,
            codProd:    prod?.omie_codigo ? Number(prod.omie_codigo) : undefined,
            qtde:       i.quantidade,
            precoUnit:  0,
          };
        });

        const omieCode = await upsertReq(creds, {
          codIntReqCompra: req.id,
          obsReqCompra:    titulo,
          ItensReqCompra:  omieItens,
        });

        await supabase
          .from("requisicoes")
          .update({ omie_codigo: omieCode, omie_sincronizado_em: new Date().toISOString() })
          .eq("id", req.id);
      }
    } catch (err) {
      // Falha no Omie não bloqueia criação local
      console.error("[criarRequisicao] Omie sync:", (err as Error).message);
    }
  }

  revalidatePath("/requisicoes");
  return { id: req.id, numero: req.numero as string };
}

// ── aprovarRequisicao ─────────────────────────────────────────────────────────

/**
 * Aprova uma requisição (status → 'aguardando_cotacao').
 * Só funciona se todos os itens estão vinculados (nenhum produto_novo: true).
 * Envia ao Omie se ainda não foi sincronizado.
 */
export async function aprovarRequisicao(requisicaoId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verificar que não há itens com produto_novo
  const { count } = await supabase
    .from("requisicao_itens")
    .select("*", { count: "exact", head: true })
    .eq("requisicao_id", requisicaoId)
    .eq("produto_novo", true);

  if ((count ?? 0) > 0) {
    throw new Error("Há produtos não cadastrados nesta requisição. Cadastre todos antes de aprovar.");
  }

  const { data: req } = await supabase
    .from("requisicoes")
    .select("id, titulo, omie_codigo, requisicao_unidades(unidade_id)")
    .eq("id", requisicaoId)
    .single();

  if (!req) throw new Error("Requisição não encontrada");

  // Enviar ao Omie se ainda não foi
  if (!req.omie_codigo) {
    try {
      const unidades = req.requisicao_unidades as Array<{ unidade_id: string }>;
      const creds = await getCredsUnidade(unidades[0]?.unidade_id ?? "");
      if (creds) {
        const { data: itensReq } = await supabase
          .from("requisicao_itens")
          .select("id, produto_id, quantidade, produtos(omie_codigo)")
          .eq("requisicao_id", requisicaoId);

        const omieItens = (itensReq ?? []).map((i) => {
          const prod = i.produtos as { omie_codigo: string | null } | null;
          return {
            codIntItem: i.id,
            codProd:    prod?.omie_codigo ? Number(prod.omie_codigo) : undefined,
            qtde:       i.quantidade,
            precoUnit:  0,
          };
        });

        await upsertReq(creds, {
          codIntReqCompra: requisicaoId,
          obsReqCompra:    req.titulo as string,
          ItensReqCompra:  omieItens,
        });
      }
    } catch (err) {
      console.error("[aprovarRequisicao] Omie:", (err as Error).message);
    }
  }

  await supabase
    .from("requisicoes")
    .update({ status: "aguardando_cotacao" })
    .eq("id", requisicaoId);

  revalidatePath("/requisicoes");
  revalidatePath(`/requisicoes/${requisicaoId}`);
}

// ── vincularProdutoItem ───────────────────────────────────────────────────────

/**
 * Vincula um produto recém-criado a um item de texto livre.
 * Após vincular, verifica se todos os itens da requisição estão vinculados
 * e atualiza o status se necessário.
 */
export async function vincularProdutoItem(
  requisicaoItemId: string,
  produtoId: string,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: item } = await supabase
    .from("requisicao_itens")
    .select("id, requisicao_id")
    .eq("id", requisicaoItemId)
    .single();

  if (!item) throw new Error("Item não encontrado");

  await supabase
    .from("requisicao_itens")
    .update({ produto_id: produtoId, produto_novo: false, produto_nome_livre: null })
    .eq("id", requisicaoItemId);

  // Checar se ainda há itens pendentes
  const { count: pendentes } = await supabase
    .from("requisicao_itens")
    .select("*", { count: "exact", head: true })
    .eq("requisicao_id", item.requisicao_id)
    .eq("produto_novo", true);

  if ((pendentes ?? 0) === 0) {
    // Todos vinculados — sai de pendente_produto
    await supabase
      .from("requisicoes")
      .update({ status: "aguardando_cotacao" })
      .eq("id", item.requisicao_id)
      .eq("status", "pendente_produto");
  }

  revalidatePath(`/requisicoes/${item.requisicao_id}`);
}

// ── criarProdutoOmie ──────────────────────────────────────────────────────────

/**
 * Cria um produto no Omie via plataforma e salva localmente.
 * Retorna o ID local do produto criado para uso em vincularProdutoItem.
 */
export async function criarProdutoOmie(
  unidadeId: string,
  data: ProdutoOmieInput,
): Promise<{ produtoId: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = ProdutoOmieSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos");
  }

  const creds = await getCredsUnidade(unidadeId);
  if (!creds) throw new Error("Unidade sem credenciais Omie configuradas");

  // Gerar UUID local para usar como codIntProduto (idempotência)
  const produtoLocalId = crypto.randomUUID();

  // Criar no Omie
  const { nCodProd } = await incluirProduto(creds, {
    cCodIntProduto: produtoLocalId,
    cDescricao:     parsed.data.nome,
    cUnidade:       parsed.data.unidade,
    cCodFamilia:    parsed.data.familia,
    nValorCusto:    parsed.data.valorCusto,
    cInativo:       "N",
  });

  // Salvar localmente em produtos
  const serviceClient = createServiceClient();
  const { data: prod, error } = await serviceClient
    .from("produtos")
    .insert({
      id:             produtoLocalId,
      nome:           parsed.data.nome,
      unidade_med:    parsed.data.unidade,
      omie_codigo:    String(nCodProd),
      omie_unidade_id: unidadeId,
      ativo:          true,
      preco_custo:    parsed.data.valorCusto ?? null,
    })
    .select("id")
    .single();

  if (error || !prod) {
    throw new Error(error?.message ?? "Erro ao salvar produto localmente");
  }

  revalidatePath("/produtos");
  return { produtoId: prod.id };
}

// ── atualizarProdutoOmie ──────────────────────────────────────────────────────

export async function atualizarProdutoOmie(
  produtoId: string,
  data: Partial<ProdutoOmieInput> & { inativo?: boolean },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: prod } = await supabase
    .from("produtos")
    .select("omie_codigo, omie_unidade_id")
    .eq("id", produtoId)
    .single();

  if (!prod?.omie_codigo || !prod?.omie_unidade_id) {
    throw new Error("Produto sem código Omie — não pode ser atualizado no Omie");
  }

  const creds = await getCredsUnidade(prod.omie_unidade_id as string);
  if (!creds) throw new Error("Unidade sem credenciais Omie");

  await alterarProduto(creds, {
    nCodProd:       Number(prod.omie_codigo),
    cCodIntProduto: produtoId,
    cDescricao:     data.nome,
    cUnidade:       data.unidade,
    nValorCusto:    data.valorCusto,
    cInativo:       data.inativo ? "S" : undefined,
  });

  // Atualizar localmente
  const serviceClient = createServiceClient();
  await serviceClient
    .from("produtos")
    .update({
      nome:        data.nome ?? undefined,
      unidade_med: data.unidade ?? undefined,
      preco_custo: data.valorCusto ?? undefined,
      ativo:       data.inativo === true ? false : undefined,
    })
    .eq("id", produtoId);

  revalidatePath("/produtos");
}

// ── deletarRequisicao (mantida sem mudanças) ───────────────────────────────────

export async function deletarRequisicao(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: req } = await supabase
    .from("requisicoes")
    .select("id, status, numero")
    .eq("id", id)
    .single();

  if (!req) throw new Error("Requisição não encontrada");
  if (req.status === "aprovado" || req.status === "aguardando_cotacao") {
    throw new Error("Não é possível excluir uma requisição já aprovada.");
  }

  await supabase.from("requisicao_itens").delete().eq("requisicao_id", id);
  await supabase.from("requisicao_unidades").delete().eq("requisicao_id", id);
  const { error } = await supabase.from("requisicoes").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/requisicoes");
  return { numero: req.numero };
}
```

- [ ] **Step 2: Rodar typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add app/(app)/requisicoes/actions.ts
git commit -m "feat(requisicoes): actions - produto livre, aprovar, vincular, CRUD produto Omie"
```

---

## Task 7: `app/(app)/requisicoes/page.tsx` — Filtros + badges de origem e status

**Files:**
- Modify: `app/(app)/requisicoes/page.tsx`

- [ ] **Step 1: Atualizar o arquivo**

```typescript
/**
 * app/(app)/requisicoes/page.tsx — Fase 1
 * Lista de requisições com filtros por status, origem e produto pendente.
 */
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { RequisicoesClient } from "./_components/requisicoes-client";

export const metadata = { title: "Requisições" };

export default async function RequisicoesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const cookieStore = await cookies();
  const slug = cookieStore.get("lhg-unidade-slug")?.value ?? "todas";

  let unidadeId: string | null = null;
  if (slug && slug !== "todas") {
    const { data: un } = await supabase
      .from("unidades").select("id").eq("slug", slug).single();
    unidadeId = un?.id ?? null;
  }

  const [
    { data: requisicoes },
    { data: unidades },
    { data: produtos },
  ] = await Promise.all([
    supabase
      .from("requisicoes")
      .select(
        `id, numero, titulo, urgencia, status, origem, valor_estimado, created_at,
         solicitante:user_profiles!solicitante_id(nome, avatar_url),
         requisicao_unidades(unidade_id, unidades(nome, slug)),
         requisicao_itens(id, produto_novo)`,
      )
      .order("created_at", { ascending: false }),

    supabase
      .from("unidades")
      .select("id, nome, slug, cor_hex")
      .eq("ativa", true)
      .order("nome"),

    unidadeId
      ? supabase
          .from("produtos")
          .select("id, codigo, nome, unidade_med, categoria, familia_omie, preco_custo, omie_codigo")
          .eq("ativo", true)
          .eq("omie_unidade_id", unidadeId)
          .order("nome")
      : supabase
          .from("produtos")
          .select("id, codigo, nome, unidade_med, categoria, familia_omie, preco_custo, omie_codigo")
          .eq("ativo", true)
          .order("nome"),
  ]);

  return (
    <RequisicoesClient
      requisicoes={requisicoes ?? []}
      unidades={unidades ?? []}
      produtos={produtos ?? []}
    />
  );
}
```

- [ ] **Step 2: Atualizar `RequisicoesClient` para exibir badge de origem e badge ⚠ produto novo**

Em `app/(app)/requisicoes/_components/requisicoes-client.tsx`, localizar onde as requisições são listadas e adicionar:

- Badge `origem === 'omie'` → mostrar `Omie` em amarelo
- Badge `status === 'pendente_produto'` → mostrar `⚠ produto pendente` em vermelho
- Filtro adicional no topo: `"Pendentes de produto"` que filtra `status === 'pendente_produto'`

O código exato depende da implementação atual do componente. Seguir o padrão visual já existente para outros badges de status.

- [ ] **Step 3: Rodar typecheck**

```bash
pnpm exec tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/requisicoes/page.tsx" "app/(app)/requisicoes/_components/requisicoes-client.tsx"
git commit -m "feat(requisicoes): filtros por origem e status pendente_produto"
```

---

## Task 8: `nova-requisicao-modal.tsx` — Suporte a produto livre

**Files:**
- Modify: `app/(app)/requisicoes/_components/nova-requisicao-modal.tsx`

- [ ] **Step 1: Atualizar `ItemRow` para suportar produto livre**

Localizar o tipo `ItemRow` e substituir por:

```typescript
interface ItemRow {
  _key:               string;
  tipo:               "catalogo" | "livre";
  // catalogo
  produto_id?:        string;
  produto?:           Produto | null;
  // livre
  produto_nome_livre?: string;
  produto_unidade_med?: string;
  // comum
  quantidade:         number;
  observacao:         string;
}

function emptyItemCatalogo(): ItemRow {
  return { _key: nanoId(), tipo: "catalogo", produto_id: "", produto: null, quantidade: 1, observacao: "" };
}

function emptyItemLivre(): ItemRow {
  return { _key: nanoId(), tipo: "livre", produto_nome_livre: "", produto_unidade_med: "UN", quantidade: 1, observacao: "" };
}
```

- [ ] **Step 2: Atualizar a linha de cada item no wizard para mostrar toggle "Catálogo / Texto livre"**

No Passo 2 do wizard (Itens), para cada `ItemRow`, adicionar:

```tsx
{/* Toggle tipo */}
<div className="flex gap-1 mb-2">
  <button
    type="button"
    onClick={() => updateItem(item._key, { tipo: "catalogo", produto_nome_livre: undefined })}
    className={cn(
      "px-2 py-1 rounded text-xs font-medium transition-colors",
      item.tipo === "catalogo"
        ? "bg-lhg-500 text-white"
        : "bg-muted text-muted-foreground hover:text-foreground",
    )}
  >
    Catálogo
  </button>
  <button
    type="button"
    onClick={() => updateItem(item._key, { tipo: "livre", produto_id: undefined, produto: null })}
    className={cn(
      "px-2 py-1 rounded text-xs font-medium transition-colors",
      item.tipo === "livre"
        ? "bg-amber-500 text-white"
        : "bg-muted text-muted-foreground hover:text-foreground",
    )}
  >
    Texto livre
  </button>
</div>

{item.tipo === "catalogo" ? (
  <ProdutoCombobox ... /> // existente
) : (
  <div className="flex gap-2">
    <input
      type="text"
      placeholder="Descreva o produto não encontrado..."
      value={item.produto_nome_livre ?? ""}
      onChange={(e) => updateItem(item._key, { produto_nome_livre: e.target.value })}
      className="flex-1 h-9 px-3 rounded-lg bg-background border border-amber-500/40 text-foreground text-sm focus:outline-none focus:border-amber-500"
    />
    <select
      value={item.produto_unidade_med ?? "UN"}
      onChange={(e) => updateItem(item._key, { produto_unidade_med: e.target.value })}
      className="w-20 h-9 px-2 rounded-lg bg-background border border-amber-500/40 text-foreground text-sm focus:outline-none"
    >
      {["UN", "KG", "LT", "CX", "PC", "MT", "GL"].map((u) => (
        <option key={u} value={u}>{u}</option>
      ))}
    </select>
  </div>
)}
```

- [ ] **Step 3: Atualizar o submit para usar o schema de item discriminado**

Localizar onde o form é submetido para `criarRequisicao` e atualizar:

```typescript
await criarRequisicao({
  titulo:        form.titulo,
  urgencia:      form.urgencia,
  justificativa: form.justificativa,
  unidade_ids:   form.unidade_ids,
  itens:         form.itens.map((item) =>
    item.tipo === "catalogo"
      ? { tipo: "catalogo" as const, produto_id: item.produto_id!, quantidade: item.quantidade, observacao: item.observacao }
      : { tipo: "livre" as const, produto_nome_livre: item.produto_nome_livre!, produto_unidade_med: item.produto_unidade_med!, quantidade: item.quantidade, observacao: item.observacao }
  ),
});
```

- [ ] **Step 4: Rodar typecheck**

```bash
pnpm exec tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/requisicoes/_components/nova-requisicao-modal.tsx"
git commit -m "feat(requisicoes): modal suporta item com produto livre (texto)"
```

---

## Task 9: `app/(app)/requisicoes/[id]/` — Página de detalhe + modal de produto

**Files:**
- Create: `app/(app)/requisicoes/[id]/page.tsx`
- Create: `app/(app)/requisicoes/[id]/_components/produto-omie-modal.tsx`

- [ ] **Step 1: Criar `produto-omie-modal.tsx`**

```typescript
"use client";

/**
 * produto-omie-modal.tsx
 * Modal para Keila cadastrar um produto no Omie a partir de um item de texto livre.
 * Após criar, chama vincularProdutoItem para linkar ao item da requisição.
 */
import { useState, useTransition } from "react";
import { X, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { criarProdutoOmie, vincularProdutoItem } from "../actions";

interface Props {
  open:            boolean;
  onClose:         () => void;
  requisicaoItemId: string;
  unidadeId:       string;
  nomeSugerido:    string;  // produto_nome_livre do item
}

const UNIDADES = ["UN", "KG", "LT", "CX", "PC", "MT", "GL", "SC", "FR", "PR"];

export function ProdutoOmieModal({ open, onClose, requisicaoItemId, unidadeId, nomeSugerido }: Props) {
  const [nome, setNome]       = useState(nomeSugerido);
  const [unidade, setUnidade] = useState("UN");
  const [familia, setFamilia] = useState("");
  const [custo, setCusto]     = useState("");
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const { produtoId } = await criarProdutoOmie(unidadeId, {
          nome,
          unidade,
          familia:    familia || undefined,
          valorCusto: custo ? Number(custo.replace(",", ".")) : undefined,
        });

        await vincularProdutoItem(requisicaoItemId, produtoId);

        toast.success(`Produto "${nome}" criado no Omie e vinculado`);
        onClose();
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-foreground">
            Cadastrar produto no Omie
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Nome do produto *
            </label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              className="w-full h-9 px-3 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:border-ring"
              placeholder="Ex: Sabonete líquido 5L"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Unidade *
              </label>
              <select
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:border-ring"
              >
                {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Preço de custo
              </label>
              <input
                value={custo}
                onChange={(e) => setCusto(e.target.value)}
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                className="w-full h-9 px-3 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:border-ring"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Família Omie (opcional)
            </label>
            <input
              value={familia}
              onChange={(e) => setFamilia(e.target.value)}
              className="w-full h-9 px-3 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:border-ring"
              placeholder="Ex: AMENITIES"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-9 rounded-lg border border-border text-muted-foreground hover:text-foreground text-sm transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending || !nome || !unidade}
              className="flex-1 h-9 rounded-lg bg-lhg-500 hover:bg-lhg-600 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Criar no Omie
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Criar `app/(app)/requisicoes/[id]/page.tsx`**

```typescript
/**
 * app/(app)/requisicoes/[id]/page.tsx — Fase 1
 * Detalhe de uma requisição: lista de itens, aprovação e cadastro de produto no Omie.
 */
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RequisicaoDetalhe } from "./_components/requisicao-detalhe";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RequisicaoDetalhe_Page({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: req } = await supabase
    .from("requisicoes")
    .select(
      `id, numero, titulo, urgencia, status, origem, justificativa,
       valor_estimado, created_at, omie_codigo,
       solicitante:user_profiles!solicitante_id(nome, avatar_url),
       requisicao_unidades(unidade_id, unidades(id, nome, slug, cor_hex)),
       requisicao_itens(
         id, quantidade, observacao, produto_novo,
         produto_nome_livre, produto_unidade_med,
         produtos(id, codigo, nome, unidade_med, preco_custo, omie_codigo)
       )`,
    )
    .eq("id", id)
    .single();

  if (!req) notFound();

  // Primeira unidade para usar como contexto de credenciais Omie
  const unidades = req.requisicao_unidades as Array<{
    unidade_id: string;
    unidades: { id: string; nome: string; slug: string; cor_hex: string | null };
  }>;

  return (
    <RequisicaoDetalhe
      req={req as never}
      unidadeId={unidades[0]?.unidade_id ?? ""}
    />
  );
}
```

- [ ] **Step 3: Criar `app/(app)/requisicoes/[id]/_components/requisicao-detalhe.tsx`**

```typescript
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, Clock, AlertTriangle, ArrowLeft, PackagePlus,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { aprovarRequisicao } from "../actions";
import { ProdutoOmieModal } from "./produto-omie-modal";

interface Item {
  id:                  string;
  quantidade:          number;
  observacao:          string | null;
  produto_novo:        boolean;
  produto_nome_livre:  string | null;
  produto_unidade_med: string | null;
  produtos: {
    id: string; codigo: string; nome: string;
    unidade_med: string; preco_custo: number | null; omie_codigo: string | null;
  } | null;
}

interface Req {
  id: string; numero: string; titulo: string; urgencia: string;
  status: string; origem: string; justificativa: string | null;
  omie_codigo: number | null; created_at: string;
  requisicao_itens: Item[];
  requisicao_unidades: Array<{
    unidade_id: string;
    unidades: { id: string; nome: string; slug: string; cor_hex: string | null };
  }>;
}

interface Props { req: Req; unidadeId: string; }

const STATUS_LABEL: Record<string, string> = {
  rascunho:           "Rascunho",
  pendente_produto:   "Produto pendente",
  aguardando_cotacao: "Aguardando cotação",
  cotacao:            "Em cotação",
  aprovado:           "Aprovado",
  cancelado:          "Cancelado",
};

export function RequisicaoDetalhe({ req, unidadeId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [modalItem, setModalItem] = useState<Item | null>(null);

  const itensPendentes = req.requisicao_itens.filter((i) => i.produto_novo);
  const podAprovar     = itensPendentes.length === 0 && req.status !== "aguardando_cotacao" && req.status !== "aprovado";

  function handleAprovar() {
    startTransition(async () => {
      try {
        await aprovarRequisicao(req.id);
        toast.success("Requisição aprovada e enviada ao Omie");
        router.refresh();
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  }

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/requisicoes" className="mt-1 text-muted-foreground hover:text-foreground">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-semibold text-foreground">{req.titulo}</h1>
            <span className="text-xs font-mono text-muted-foreground">{req.numero}</span>
            {req.origem === "omie" && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25">
                Omie
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn(
              "text-xs font-medium px-2 py-0.5 rounded",
              req.status === "pendente_produto"
                ? "bg-red-500/12 text-red-400 border border-red-500/25"
                : req.status === "aguardando_cotacao"
                  ? "bg-emerald-500/12 text-emerald-400 border border-emerald-500/25"
                  : "bg-muted text-muted-foreground",
            )}>
              {STATUS_LABEL[req.status] ?? req.status}
            </span>
            {req.urgencia === "urgente" && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-orange-500/15 text-orange-400">
                URGENTE
              </span>
            )}
          </div>
        </div>

        {/* Botão aprovar */}
        {podAprovar && (
          <button
            onClick={handleAprovar}
            disabled={pending}
            className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium text-sm transition-colors disabled:opacity-50"
          >
            <CheckCircle2 size={14} />
            Aprovar requisição
          </button>
        )}
      </div>

      {/* Alerta: produtos pendentes */}
      {itensPendentes.length > 0 && (
        <div className="rounded-lg bg-amber-500/08 border border-amber-500/25 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={15} className="text-amber-400" />
            <span className="text-sm font-semibold text-amber-300">
              {itensPendentes.length} produto{itensPendentes.length > 1 ? "s" : ""} não cadastrado{itensPendentes.length > 1 ? "s" : ""} no Omie
            </span>
          </div>
          <p className="text-xs text-amber-300/70">
            Cadastre os produtos abaixo antes de aprovar a requisição.
          </p>
        </div>
      )}

      {/* Lista de itens */}
      <div className="rounded-xl border border-border/80 bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border/60">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Itens ({req.requisicao_itens.length})
          </span>
        </div>

        <div className="divide-y divide-border/50">
          {req.requisicao_itens.map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3">
              {/* Status icon */}
              <div className="shrink-0">
                {item.produto_novo ? (
                  <AlertTriangle size={14} className="text-amber-400" />
                ) : (
                  <CheckCircle2 size={14} className="text-emerald-400" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground">
                  {item.produto_novo
                    ? item.produto_nome_livre
                    : (item.produtos?.nome ?? "—")}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {item.quantidade}×{" "}
                  {item.produto_novo
                    ? item.produto_unidade_med
                    : (item.produtos?.unidade_med ?? "")}
                  {item.produto_novo && (
                    <span className="ml-2 text-amber-400/80">produto não cadastrado no Omie</span>
                  )}
                </div>
              </div>

              {/* Botão cadastrar produto */}
              {item.produto_novo && (
                <button
                  onClick={() => setModalItem(item)}
                  className="flex items-center gap-1.5 h-7 px-3 rounded-md bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-medium transition-colors"
                >
                  <PackagePlus size={12} />
                  Cadastrar no Omie
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Modal cadastro produto */}
      {modalItem && (
        <ProdutoOmieModal
          open={true}
          onClose={() => setModalItem(null)}
          requisicaoItemId={modalItem.id}
          unidadeId={unidadeId}
          nomeSugerido={modalItem.produto_nome_livre ?? ""}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rodar typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/requisicoes/[id]/"
git commit -m "feat(requisicoes): pagina de detalhe com aprovacao e modal de produto Omie"
```

---

## Task 10: `/produtos` — Botão Create/Update produto no Omie

**Files:**
- Modify: `app/(app)/produtos/page.tsx` (adicionar botão de criação)
- Note: O Update de produto pode ser feito inline na tabela de produtos.

- [ ] **Step 1: Verificar a estrutura atual da página de produtos**

```bash
# Ler os primeiros 60 linhas para entender a estrutura
```

- [ ] **Step 2: Adicionar botão "Novo produto no Omie" ao header da página**

Na página de produtos, adicionar ao lado do botão "Sincronizar":

```tsx
<button
  onClick={() => setModalNovoProduto(true)}
  className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-lhg-500 hover:bg-lhg-600 text-white font-medium text-sm transition-colors"
>
  <Plus size={13} />
  Novo produto no Omie
</button>
```

Com o modal `ProdutoOmieModal` reutilizado (importar de `../requisicoes/[id]/_components/produto-omie-modal`), mas sem `requisicaoItemId` (modo standalone para criação sem vincular a item).

- [ ] **Step 3: Adaptar `ProdutoOmieModal` para modo standalone**

Adicionar prop opcional `requisicaoItemId?: string` e quando não fornecida, não chamar `vincularProdutoItem`:

```typescript
// Em produto-omie-modal.tsx, no handleSubmit:
const { produtoId } = await criarProdutoOmie(unidadeId, { nome, unidade, familia, valorCusto });

if (requisicaoItemId) {
  await vincularProdutoItem(requisicaoItemId, produtoId);
  toast.success(`Produto "${nome}" criado e vinculado`);
} else {
  toast.success(`Produto "${nome}" criado no Omie`);
}

onClose();
```

- [ ] **Step 4: Rodar typecheck e build**

```bash
pnpm exec tsc --noEmit
pnpm run build
```

Expected: sem erros.

- [ ] **Step 5: Commit final**

```bash
git add "app/(app)/produtos/"
git commit -m "feat(produtos): botao criar produto no Omie via plataforma"
git push
```

---

## Validação final

Após todas as tasks:

- [ ] Acesse `/requisicoes/nova` e crie uma requisição com um item de catálogo → deve sincronizar ao Omie e status ficar `aguardando_cotacao`
- [ ] Crie outra requisição com item de texto livre → status deve ficar `pendente_produto`
- [ ] Acesse `/requisicoes/[id]` da segunda requisição → botão "Cadastrar no Omie" deve aparecer no item
- [ ] Clique em "Cadastrar no Omie" → preencha → produto criado → item vinculado → status muda para `aguardando_cotacao`
- [ ] Clique "Aprovar requisição" → deve enviar ao Omie e mudar status
- [ ] Execute `POST /api/omie/sync` com `{"entidade":"requisicoes"}` → deve trazer requisições criadas no Omie pelos estoquistas
