# LHG Suprimentos — Melhorias Pós-Auditoria

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar 9 melhorias identificadas na auditoria técnica: segurança, UX, soft delete, filtros, exportação CSV, status Omie, página de auditoria, refatoração e testes.

**Architecture:** Cada tarefa é independente e autocontida. Tarefas 1-3 não precisam de migration SQL. Tarefa 4 precisa de migration (SQL fornecido para execução manual). Tarefas seguem o padrão existente de Server Actions + Client Components. Testes com Vitest no final.

**Tech Stack:** Next.js 15, React 19, TypeScript, Supabase, Tailwind CSS 4, Sonner (toasts), lucide-react, Vitest + @testing-library/react, date-fns (já instalado)

---

## Mapa de Arquivos

| Arquivo | Criado/Modificado | Responsabilidade |
|---|---|---|
| `hooks/use-debounce.ts` | CRIAR | Hook genérico de debounce |
| `lib/csv.ts` | CRIAR | Utilitário de exportação CSV |
| `app/api/omie/sync-pedidos/route.ts` | MODIFICAR | Validar acesso à unidade |
| `app/(app)/pedidos/_components/pedidos-client.tsx` | MODIFICAR | Debounce + aria-labels + filtro data + export CSV |
| `app/(app)/pedidos/_components/modal-email.tsx` | CRIAR | Modal de e-mail extraído |
| `app/(app)/pedidos/_components/modal-rejeitar.tsx` | CRIAR | Modal de rejeitar extraído |
| `app/(app)/cotacoes/_components/cotacoes-client.tsx` | MODIFICAR | Debounce + aria-labels + filtro data + export CSV |
| `app/(app)/notas-fiscais/_components/nf-client.tsx` | MODIFICAR | Aria-labels + filtro data |
| `app/(app)/fornecedores/_components/fornecedores-client.tsx` | MODIFICAR | Debounce + aria-labels |
| `app/(app)/cotacoes/actions.ts` | MODIFICAR | Soft delete (deleted_at) |
| `app/(app)/cotacoes/page.tsx` | MODIFICAR | Filtrar deleted_at IS NULL |
| `app/(app)/dashboard/_components/omie-sync-status.tsx` | CRIAR | Card de status de sync Omie |
| `app/(app)/dashboard/page.tsx` | MODIFICAR | Incluir OmieSyncStatus |
| `app/(app)/auditoria/page.tsx` | CRIAR | Página de auditoria |
| `app/(app)/auditoria/actions.ts` | CRIAR | Buscar eventos de auditoria |
| `components/lhg/shell/nav-config.ts` | MODIFICAR | Adicionar /auditoria ao breadcrumb |
| `supabase/migrations/0018_soft_delete_cotacoes.sql` | CRIAR | Migration soft delete |
| `vitest.config.ts` | CRIAR | Config Vitest |
| `tests/setup.ts` | CRIAR | Setup global de testes |
| `tests/hooks/use-debounce.test.ts` | CRIAR | Testes do hook |
| `tests/lib/csv.test.ts` | CRIAR | Testes do utilitário CSV |
| `tests/actions/cotacoes.test.ts` | CRIAR | Testes das actions de cotações |

---

## Task 1: Segurança — Validar Acesso à Unidade na API Route

**Problema:** `POST /api/omie/sync-pedidos` aceita qualquer usuário autenticado e usa o slug do cookie `lhg-unidade-slug` sem verificar se o usuário tem acesso àquela unidade.

**Fix:** Após autenticar, verificar role do usuário. Se for `comprador` ou `admin`, permite todas as unidades. Caso contrário, verificar `user_unidades`.

**Files:**
- Modify: `app/api/omie/sync-pedidos/route.ts`

- [ ] **Step 1: Localizar a função `autenticar` no arquivo**

Abrir `app/api/omie/sync-pedidos/route.ts` e localizar a função `autenticar` (linhas 29-42) e a função `POST` (linhas 59-88).

- [ ] **Step 2: Criar função `validarAcessoUnidade`**

Adicionar logo após a função `autenticar` existente:

```typescript
/**
 * Valida que o usuário autenticado tem acesso ao slug de unidade solicitado.
 * Compradores e admins têm acesso a todas as unidades.
 * Outros papéis (aprovador, solicitante) precisam estar em user_unidades.
 * Retorna null se acesso permitido, ou mensagem de erro.
 */
async function validarAcessoUnidade(
  req: NextRequest,
  slug: string,
): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "Não autorizado.";

    // Busca role + unidades do usuário em paralelo
    const [{ data: profile }, { data: unidade }] = await Promise.all([
      supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .single(),
      supabase
        .from("unidades")
        .select("id")
        .eq("slug", slug)
        .eq("ativa", true)
        .single(),
    ]);

    // Unidade precisa existir e estar ativa
    if (!unidade) return `Unidade '${slug}' não encontrada ou inativa.`;

    // Comprador e admin têm acesso universal
    const role = profile?.role ?? "solicitante";
    if (role === "admin" || role === "comprador") return null;

    // Outros papéis: verificar pivot user_unidades
    const { data: acesso } = await supabase
      .from("user_unidades")
      .select("unidade_id")
      .eq("user_id", user.id)
      .eq("unidade_id", unidade.id)
      .maybeSingle();

    if (!acesso) {
      return `Acesso negado: usuário não pertence à unidade '${slug}'.`;
    }

    return null; // acesso permitido
  } catch {
    return "Erro ao validar acesso à unidade.";
  }
}
```

- [ ] **Step 3: Usar `validarAcessoUnidade` no handler POST**

Substituir o bloco POST (após o `autenticar`) para incluir a validação:

```typescript
export async function POST(req: NextRequest) {
  const tag = "[sync-pedidos POST]";
  if (!await autenticar(req)) {
    console.warn(`${tag} Requisição não autorizada`);
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  // Lê o filtro e flag contarApenas do body
  let filtro: OmiePedidoFiltro = "todos";
  let contarApenas = false;
  try {
    const body = await req.json().catch(() => ({}));
    const f = body?.filtro as string | undefined;
    if (f && FILTROS_VALIDOS.includes(f as OmiePedidoFiltro)) filtro = f as OmiePedidoFiltro;
    if (body?.contarApenas === true) contarApenas = true;
  } catch { /* body vazio ou não-JSON */ }

  // Respeita a unidade ativa na sidebar (cookie lhg-unidade-slug)
  const cookieStore = await cookies();
  const slug = cookieStore.get("lhg-unidade-slug")?.value ?? null;

  // ── NOVO: Valida acesso à unidade específica ──────────────────────────────────
  if (slug && slug !== "todas") {
    const erroAcesso = await validarAcessoUnidade(req, slug);
    if (erroAcesso) {
      console.warn(`${tag} Acesso negado à unidade slug="${slug}": ${erroAcesso}`);
      return NextResponse.json({ ok: false, error: erroAcesso }, { status: 403 });
    }
  }

  // Modo contarApenas: 1 chamada por unidade, sem sync no banco
  if (contarApenas) {
    return runCount(tag, slug && slug !== "todas" ? slug : null, filtro);
  }

  const filtroDesc = slug && slug !== "todas" ? `unidade="${slug}"` : "todas as unidades";
  console.log(`${tag} Sync manual iniciado — ${filtroDesc} filtro=${filtro}`);
  return runSync(tag, slug && slug !== "todas" ? slug : null, filtro);
}
```

- [ ] **Step 4: Verificar TypeScript**

```bash
cd lhg-suprimentos
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 5: Commit**

```bash
git add app/api/omie/sync-pedidos/route.ts
git commit -m "security: validar acesso à unidade no POST /api/omie/sync-pedidos

Adiciona validarAcessoUnidade() que verifica:
- Comprador/admin: acesso universal (comportamento anterior preservado)
- Outros papéis: verifica pivot user_unidades antes de sincronizar
- Retorna 403 se unidade inativa ou usuário sem acesso"
```

---

## Task 2: Hook useDebounce + Aplicar nas Buscas

**Files:**
- Create: `hooks/use-debounce.ts`
- Modify: `app/(app)/pedidos/_components/pedidos-client.tsx`
- Modify: `app/(app)/cotacoes/_components/cotacoes-client.tsx`
- Modify: `app/(app)/fornecedores/_components/fornecedores-client.tsx`
- Modify: `app/(app)/produtos/_components/produtos-client.tsx`

- [ ] **Step 1: Criar `hooks/use-debounce.ts`**

```typescript
"use client";

import { useState, useEffect } from "react";

/**
 * useDebounce — atrasa a atualização de um valor por `delay` ms.
 * Evita cálculos/re-renders desnecessários durante digitação.
 *
 * @example
 *   const buscaDebounced = useDebounce(busca, 300);
 *   const filtrado = useMemo(() => items.filter(...buscaDebounced...), [buscaDebounced]);
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
```

- [ ] **Step 2: Aplicar em `pedidos-client.tsx`**

Adicionar import no topo do arquivo (após os imports existentes):
```typescript
import { useDebounce } from "@/hooks/use-debounce";
```

Localizar onde `busca` é declarada (procure por `useState("")` relacionado à busca) e adicionar a linha de debounce logo abaixo:
```typescript
const [busca, setBusca] = useState("");
const buscaDebounced = useDebounce(busca, 300);
```

No `useMemo` que filtra pedidos, substituir `busca` por `buscaDebounced` nas comparações:
```typescript
const pedidosFiltrados = useMemo(() => {
  let lista = pedidos;
  if (buscaDebounced.trim()) {
    const q = buscaDebounced.toLowerCase();
    lista = lista.filter(p =>
      p.numero?.toLowerCase().includes(q) ||
      (p.fornecedores && getFornNome(p.fornecedores).toLowerCase().includes(q)) ||
      p.cotacoes?.numero?.toLowerCase().includes(q) ||
      p.cotacoes?.titulo?.toLowerCase().includes(q)
    );
  }
  return lista;
}, [pedidos, buscaDebounced]);
```

- [ ] **Step 3: Aplicar em `cotacoes-client.tsx`**

Mesmo padrão: adicionar import, criar `buscaDebounced`, substituir `busca` no `useMemo` de filtragem.

```typescript
import { useDebounce } from "@/hooks/use-debounce";
// ...
const [busca, setBusca] = useState("");
const buscaDebounced = useDebounce(busca, 300);
```

No useMemo de filtragem de cotações, usar `buscaDebounced` no lugar de `busca`.

- [ ] **Step 4: Aplicar em `fornecedores-client.tsx` e `produtos-client.tsx`**

Mesmos passos: import + `buscaDebounced` + substituir no useMemo. Padrão idêntico aos anteriores.

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 6: Commit**

```bash
git add hooks/use-debounce.ts "app/(app)/pedidos/_components/pedidos-client.tsx" "app/(app)/cotacoes/_components/cotacoes-client.tsx" "app/(app)/fornecedores/_components/fornecedores-client.tsx" "app/(app)/produtos/_components/produtos-client.tsx"
git commit -m "feat: useDebounce hook + aplicar em 4 buscas

Cria hooks/use-debounce.ts e aplica debounce de 300ms nas buscas
de pedidos, cotações, fornecedores e produtos para evitar
recálculo do useMemo a cada tecla digitada"
```

---

## Task 3: Aria-labels em Botões de Ícone

**Files:**
- Modify: `app/(app)/pedidos/_components/pedidos-client.tsx`
- Modify: `app/(app)/cotacoes/_components/cotacoes-client.tsx`
- Modify: `app/(app)/notas-fiscais/_components/nf-client.tsx`
- Modify: `app/(app)/fornecedores/_components/fornecedores-client.tsx`

- [ ] **Step 1: Adicionar aria-labels em `pedidos-client.tsx`**

Buscar todos os `<button` que contém apenas um ícone Lucide sem texto visível.

Padrão a aplicar:
```tsx
// ANTES — ícone sem label
<button onClick={onClose} className="p-1.5 rounded ...">
  <X size={14} />
</button>

// DEPOIS — com aria-label
<button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded ...">
  <X size={14} />
</button>
```

Labels a adicionar:
- `<X />` em modais/painéis → `aria-label="Fechar"`
- `<Trash2 />` → `aria-label="Excluir"`
- `<Pencil />` → `aria-label="Editar"`
- `<Mail />` → `aria-label="Enviar e-mail"`
- `<RefreshCw />` → `aria-label="Sincronizar com Omie"`
- `<ChevronLeft />` paginação → `aria-label="Página anterior"`
- `<ChevronRight />` paginação → `aria-label="Próxima página"`
- `<CheckCircle2 />` aprovar → `aria-label="Aprovar pedido"`

- [ ] **Step 2: Aplicar em `cotacoes-client.tsx`**

Mesmo padrão: `<X />` → `aria-label="Fechar"`, `<Trash2 />` → `aria-label="Excluir cotação"`, `<Pencil />` → `aria-label="Editar cotação"`, navegação de paginação.

- [ ] **Step 3: Aplicar em `nf-client.tsx` e `fornecedores-client.tsx`**

Mesmo padrão para botões de fechar modais, excluir, editar.

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/pedidos/_components/pedidos-client.tsx" "app/(app)/cotacoes/_components/cotacoes-client.tsx" "app/(app)/notas-fiscais/_components/nf-client.tsx" "app/(app)/fornecedores/_components/fornecedores-client.tsx"
git commit -m "a11y: adicionar aria-labels em botões de ícone

Cobre botões Fechar, Excluir, Editar, Enviar e-mail, Sincronizar
e paginação em pedidos, cotações, NF e fornecedores"
```

---

## Task 4: Soft Delete em Cotações

**Nota:** Esta task precisa de uma migration SQL que o usuário deve rodar manualmente no Supabase SQL Editor.

**Files:**
- Create: `supabase/migrations/0018_soft_delete_cotacoes.sql`
- Modify: `app/(app)/cotacoes/actions.ts`
- Modify: `app/(app)/cotacoes/page.tsx`
- Modify: `app/(app)/dashboard/page.tsx` (função `fetchCotacoes` e `fetchKpis`)

- [ ] **Step 1: Criar migration 0018**

```sql
-- supabase/migrations/0018_soft_delete_cotacoes.sql
-- Adiciona soft delete à tabela cotacoes.
-- Linhas com deleted_at preenchido são consideradas excluídas.
-- Rodar no Supabase SQL Editor manualmente.

ALTER TABLE cotacoes
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Índice parcial para acelerar queries que filtram apenas registros ativos
CREATE INDEX IF NOT EXISTS idx_cotacoes_not_deleted
  ON cotacoes(created_at DESC)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN cotacoes.deleted_at IS
  'Timestamp de exclusão lógica. NULL = ativo. Preenchido = excluído (soft delete).';
```

- [ ] **Step 2: Mostrar SQL ao usuário para execução manual**

⚠️ **Ação necessária:** Rodar o seguinte SQL no Supabase SQL Editor antes de continuar:

```sql
ALTER TABLE cotacoes
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_cotacoes_not_deleted
  ON cotacoes(created_at DESC)
  WHERE deleted_at IS NULL;
```

- [ ] **Step 3: Modificar `deletarCotacao` em `app/(app)/cotacoes/actions.ts`**

Localizar o trecho que faz hard delete (procure por `.delete()` na tabela cotacoes) e substituir por soft delete:

```typescript
// ANTES (linhas ~119-122):
await supabase.from("cotacoes").delete().eq("id", id);

// DEPOIS — soft delete:
const { error: deleteErr } = await supabase
  .from("cotacoes")
  .update({ deleted_at: new Date().toISOString() })
  .eq("id", id);

if (deleteErr) throw new Error(`Erro ao excluir cotação: ${deleteErr.message}`);
```

> **Nota:** Manter o código que deleta `cotacao_itens`, `cotacao_fornecedores`, `cotacao_unidades` e `cotacao_matriz` — esses são hard-delete de filhos, o que é correto.

- [ ] **Step 4: Filtrar cotações excluídas em `app/(app)/cotacoes/page.tsx`**

Localizar a query principal que busca cotações e adicionar `.is("deleted_at", null)`:

```typescript
// Encontrar a query de cotacoes (será algo como):
const { data: cotacoes } = await supabase
  .from("cotacoes")
  .select(`...`)
  // ADICIONAR:
  .is("deleted_at", null)
  .order("created_at", { ascending: false });
```

- [ ] **Step 5: Filtrar cotações excluídas em `app/(app)/dashboard/page.tsx`**

Na função `fetchKpis`, adicionar `.is("deleted_at", null)` em todas as queries sobre `cotacoes` (há 5 ocorrências):

```typescript
// Exemplo de uma das queries a corrigir:
supabase.from("cotacoes").select("*", { count: "exact", head: true })
  .in("status", OPEN_STATUS)
  .is("deleted_at", null),  // ← adicionar esta linha
```

Na função `fetchCotacoes`, adicionar `.is("deleted_at", null)`:
```typescript
const { data, count } = await supabase
  .from("cotacoes")
  .select(`...`, { count: "exact" })
  .in("status", ["rascunho", "cotacao", "pendente"] as const)
  .is("deleted_at", null)  // ← adicionar
  .order("created_at", { ascending: false })
  .limit(8);
```

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0018_soft_delete_cotacoes.sql "app/(app)/cotacoes/actions.ts" "app/(app)/cotacoes/page.tsx" "app/(app)/dashboard/page.tsx"
git commit -m "feat: soft delete em cotações (deleted_at)

- Migration 0018: coluna deleted_at + índice parcial
- deletarCotacao: UPDATE deleted_at ao invés de DELETE
- Queries de cotacoes: filtrar .is('deleted_at', null)
- Mantém histórico completo; cotações excluídas ficam no banco"
```

---

## Task 5: Filtro por Data Range

**Files:**
- Modify: `app/(app)/pedidos/_components/pedidos-client.tsx`
- Modify: `app/(app)/cotacoes/_components/cotacoes-client.tsx`
- Modify: `app/(app)/notas-fiscais/_components/nf-client.tsx`

O padrão é client-side (filtragem em memória), consistente com o restante do código.

- [ ] **Step 1: Adicionar estado de filtro de data em `pedidos-client.tsx`**

Localizar a declaração de estados no início do componente principal e adicionar:

```typescript
const [dataInicio, setDataInicio] = useState<string>("");
const [dataFim,    setDataFim]    = useState<string>("");
```

- [ ] **Step 2: Adicionar lógica de filtro por data no `useMemo` de pedidos**

No `useMemo` que filtra pedidos, após o filtro de texto, adicionar:

```typescript
// Filtro por data
if (dataInicio) {
  const inicio = new Date(dataInicio + "T00:00:00");
  lista = lista.filter(p => new Date(p.created_at) >= inicio);
}
if (dataFim) {
  const fim = new Date(dataFim + "T23:59:59");
  lista = lista.filter(p => new Date(p.created_at) <= fim);
}
```

- [ ] **Step 3: Adicionar inputs de data no JSX de pedidos**

Na área de filtros/busca do componente (próximo ao `<input type="text">` de busca), adicionar:

```tsx
{/* Filtro por data */}
<div className="flex items-center gap-1.5">
  <Calendar size={13} className="text-muted-foreground shrink-0" />
  <input
    type="date"
    aria-label="Data inicial"
    value={dataInicio}
    onChange={e => setDataInicio(e.target.value)}
    className="h-8 rounded-md border border-border bg-muted/40 px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-lhg-500"
  />
  <span className="text-xs text-muted-foreground">até</span>
  <input
    type="date"
    aria-label="Data final"
    value={dataFim}
    onChange={e => setDataFim(e.target.value)}
    className="h-8 rounded-md border border-border bg-muted/40 px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-lhg-500"
  />
  {(dataInicio || dataFim) && (
    <button
      aria-label="Limpar filtro de data"
      onClick={() => { setDataInicio(""); setDataFim(""); }}
      className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    >
      <X size={13} />
    </button>
  )}
</div>
```

Adicionar `Calendar` ao import de lucide-react se ainda não existir.

- [ ] **Step 4: Repetir para `cotacoes-client.tsx`**

Mesmo padrão: estado `dataInicio`/`dataFim`, filtro no useMemo (usando `created_at`), inputs de data no JSX. `Calendar` já está importado em cotações.

- [ ] **Step 5: Repetir para `nf-client.tsx`**

Para NF, o campo de data é `created_at` ou `emissao` (preferir `created_at` para consistência). Mesmo padrão de estado + filtro + JSX.

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/pedidos/_components/pedidos-client.tsx" "app/(app)/cotacoes/_components/cotacoes-client.tsx" "app/(app)/notas-fiscais/_components/nf-client.tsx"
git commit -m "feat: filtro por data range em pedidos, cotações e NF

Adiciona inputs de data de início/fim com botão 'limpar'.
Filtragem client-side no useMemo existente.
Inputs acessíveis com aria-label."
```

---

## Task 6: Exportação CSV

**Files:**
- Create: `lib/csv.ts`
- Modify: `app/(app)/pedidos/_components/pedidos-client.tsx`
- Modify: `app/(app)/cotacoes/_components/cotacoes-client.tsx`

> NF já tem exportação CSV em `relatorios-client.tsx`. Para a lista de NFs do módulo principal, adicionar botão similar.

- [ ] **Step 1: Criar `lib/csv.ts`**

```typescript
/**
 * lib/csv.ts
 * Utilitário client-side para gerar e baixar arquivos CSV.
 * Não requer server action — gera o arquivo diretamente no browser.
 */

/** Escapa um valor de célula CSV: envolve em aspas se contiver vírgula, aspas ou newline */
function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Uma linha CSV com os valores separados por vírgula */
function toCsvLine(cells: Array<string | number | null | undefined>): string {
  return cells.map(escapeCsvCell).join(",");
}

/**
 * Baixa um CSV no browser.
 * @param filename  Nome do arquivo (sem extensão)
 * @param headers   Array com nomes das colunas
 * @param rows      Array de arrays de valores (uma entrada por linha)
 */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
): void {
  const lines = [
    toCsvLine(headers),
    ...rows.map(toCsvLine),
  ];
  const bom  = "﻿"; // BOM UTF-8 para Excel abrir corretamente
  const blob = new Blob([bom + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Criar função `exportarPedidosCSV` em `pedidos-client.tsx`**

Adicionar import no topo:
```typescript
import { downloadCsv } from "@/lib/csv";
```

Criar função dentro do componente principal (após os estados):
```typescript
function exportarPedidosCSV() {
  const headers = [
    "Número", "Fornecedor", "Valor Total (R$)", "Status",
    "Cond. Pagamento", "Previsão Entrega", "Cotação",
    "Status Omie", "Criado em",
  ];
  const rows = pedidosFiltrados.map(p => [
    p.numero,
    p.fornecedores ? getFornNome(p.fornecedores) : "",
    p.valor_total?.toFixed(2).replace(".", ",") ?? "0,00",
    STATUS_CONFIG[p.status]?.label ?? p.status,
    p.condicao_pgto ?? "",
    p.entrega_prev ? formatDate(p.entrega_prev) : "",
    p.cotacoes?.numero ?? "",
    p.omie_status,
    formatDate(p.created_at),
  ]);
  downloadCsv("pedidos", headers, rows);
}
```

- [ ] **Step 3: Adicionar botão de exportação no JSX de pedidos**

Na área do header da tabela (próximo ao contador de resultados), adicionar:

```tsx
<button
  onClick={exportarPedidosCSV}
  aria-label="Exportar pedidos como CSV"
  title="Exportar CSV"
  className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors text-xs"
>
  <Download size={13} />
  <span className="hidden sm:inline">CSV</span>
</button>
```

Adicionar `Download` ao import de lucide-react.

- [ ] **Step 4: Criar função `exportarCotacoesCSV` em `cotacoes-client.tsx`**

```typescript
import { downloadCsv } from "@/lib/csv";

// Dentro do componente:
function exportarCotacoesCSV() {
  const headers = [
    "Número", "Título", "Status", "Urgente",
    "Valor Estimado (R$)", "Economia (R$)", "Prazo",
    "Fornecedores", "Itens", "Criado em",
  ];
  const rows = cotacoesFiltradas.map(c => [
    c.numero,
    c.titulo,
    STATUS_STYLES[c.status]?.label ?? c.status,
    c.urgente ? "Sim" : "Não",
    c.valor_estimado?.toFixed(2).replace(".", ",") ?? "0,00",
    c.economia?.toFixed(2).replace(".", ",") ?? "0,00",
    c.prazo ? formatDate(c.prazo) : "",
    c.cotacao_fornecedores?.length ?? 0,
    c.cotacao_itens?.length ?? 0,
    formatDate(c.created_at),
  ]);
  downloadCsv("cotacoes", headers, rows);
}
```

Adicionar botão de exportação igual ao de pedidos na área do header da tabela. Adicionar `Download` ao import de lucide-react.

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add lib/csv.ts "app/(app)/pedidos/_components/pedidos-client.tsx" "app/(app)/cotacoes/_components/cotacoes-client.tsx"
git commit -m "feat: exportação CSV em pedidos e cotações

- lib/csv.ts: utilitário downloadCsv() com BOM UTF-8 (Excel)
- pedidos-client: botão 'CSV' exporta lista filtrada atual
- cotacoes-client: botão 'CSV' exporta lista filtrada atual
- Escapamento correto de vírgulas e aspas nas células"
```

---

## Task 7: Dashboard — Card de Status de Sync Omie

**Files:**
- Create: `app/(app)/dashboard/_components/omie-sync-status.tsx`
- Modify: `app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Criar `omie-sync-status.tsx`**

```tsx
/**
 * omie-sync-status.tsx
 * Card que mostra quando foi a última sincronização do Omie
 * para cada entidade (pedidos, fornecedores, produtos).
 * Server Component — busca dados diretamente no Supabase.
 */
import { createClient } from "@/lib/supabase/server";
import { RefreshCw, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface SyncInfo {
  label:        string;
  ultimaSync:   Date | null;
  totalSinc:    number;
  totalPendente: number;
}

function minutosAtras(date: Date): string {
  const diff  = Date.now() - date.getTime();
  const mins  = Math.floor(diff / 60_000);
  const horas = Math.floor(diff / 3_600_000);
  const dias  = Math.floor(diff / 86_400_000);
  if (mins  < 1)   return "agora mesmo";
  if (mins  < 60)  return `${mins}min atrás`;
  if (horas < 24)  return `${horas}h atrás`;
  return `${dias}d atrás`;
}

async function fetchSyncStatus() {
  const supabase = await createClient();

  const [
    { data: ultimoPedidoOmie },
    { count: totalPedidos },
    { count: pedidosSync },
    { count: pedidosPendentes },
    { data: ultimoFornecedor },
    { count: totalFornecedores },
    { count: fornecedoresSinc },
  ] = await Promise.all([
    // Último pedido sincronizado do Omie
    supabase
      .from("omie_pedidos_compra")
      .select("omie_sincronizado_em")
      .order("omie_sincronizado_em", { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Total de pedidos LHG
    supabase
      .from("pedidos")
      .select("*", { count: "exact", head: true }),

    // Pedidos com omie_status = sincronizado
    supabase
      .from("pedidos")
      .select("*", { count: "exact", head: true })
      .eq("omie_status", "sincronizado"),

    // Pedidos com omie_status = pendente ou erro
    supabase
      .from("pedidos")
      .select("*", { count: "exact", head: true })
      .in("omie_status", ["pendente", "erro"] as const),

    // Último fornecedor com omie_codigo (sincronizado)
    supabase
      .from("fornecedores")
      .select("created_at")
      .not("omie_codigo", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Total de fornecedores ativos
    supabase
      .from("fornecedores")
      .select("*", { count: "exact", head: true })
      .eq("ativo", true),

    // Fornecedores com omie_codigo
    supabase
      .from("fornecedores")
      .select("*", { count: "exact", head: true })
      .eq("ativo", true)
      .not("omie_codigo", "is", null),
  ]);

  const syncs: SyncInfo[] = [
    {
      label:         "Pedidos Omie",
      ultimaSync:    ultimoPedidoOmie?.omie_sincronizado_em
                       ? new Date(ultimoPedidoOmie.omie_sincronizado_em)
                       : null,
      totalSinc:     pedidosSync    ?? 0,
      totalPendente: pedidosPendentes ?? 0,
    },
    {
      label:         "Fornecedores",
      ultimaSync:    ultimoFornecedor?.created_at
                       ? new Date(ultimoFornecedor.created_at)
                       : null,
      totalSinc:     fornecedoresSinc  ?? 0,
      totalPendente: Math.max(0, (totalFornecedores ?? 0) - (fornecedoresSinc ?? 0)),
    },
  ];

  return { syncs, totalPedidos: totalPedidos ?? 0, pedidosSync: pedidosSync ?? 0 };
}

export async function OmieSyncStatus() {
  const { syncs } = await fetchSyncStatus();

  return (
    <div className="rounded-xl border border-border/80 bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <RefreshCw size={13} className="text-muted-foreground" />
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
          Status Omie
        </span>
      </div>

      <div className="space-y-2.5">
        {syncs.map((s) => {
          const temProblema = s.totalPendente > 0;
          const semSync     = !s.ultimaSync;

          return (
            <div key={s.label} className="flex items-start gap-2.5">
              {/* Ícone de status */}
              <div className="mt-0.5 shrink-0">
                {semSync ? (
                  <Clock size={13} className="text-muted-foreground" />
                ) : temProblema ? (
                  <AlertCircle size={13} className="text-amber-400" />
                ) : (
                  <CheckCircle2 size={13} className="text-emerald-400" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-medium text-foreground">{s.label}</span>
                  <span className={cn(
                    "text-[10px] font-mono",
                    temProblema ? "text-amber-400" : "text-muted-foreground",
                  )}>
                    {s.totalSinc} sinc.
                    {s.totalPendente > 0 && ` · ${s.totalPendente} pend.`}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {s.ultimaSync
                    ? `Última sync: ${minutosAtras(s.ultimaSync)}`
                    : "Nenhuma sincronização registrada"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Adicionar `OmieSyncStatus` no `dashboard/page.tsx`**

Adicionar import:
```typescript
import { OmieSyncStatus } from "./_components/omie-sync-status";
```

No JSX da página, após o `<AcoesFeed>` (dentro do grid de 3 colunas), adicionar o componente. O layout atual tem `lg:col-span-2` + `h-full` para o gráfico e `h-full` para acoes-feed. Modificar para incluir o status:

```tsx
{/* ── Gráfico + Ações + Status Omie ──────────────────────────── */}
<div className="grid grid-cols-1 lg:grid-cols-3 gap-3 min-h-[420px]">
  <div className="lg:col-span-2 h-full">
    <GastosChart series={chart.series} labels={chart.labels} />
  </div>
  <div className="flex flex-col gap-3 h-full">
    <AcoesFeed acoes={acoes} />
    <OmieSyncStatus />
  </div>
</div>
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/dashboard/_components/omie-sync-status.tsx" "app/(app)/dashboard/page.tsx"
git commit -m "feat: card de status de sincronização Omie no dashboard

Mostra último timestamp de sync, total sincronizado vs pendente
para Pedidos Omie e Fornecedores. Server Component."
```

---

## Task 8: Página de Auditoria

**Files:**
- Create: `app/(app)/auditoria/page.tsx`
- Create: `app/(app)/auditoria/actions.ts`
- Modify: `components/lhg/shell/nav-config.ts` (ou onde o BREADCRUMB_MAP está definido)

- [ ] **Step 1: Localizar `nav-config.ts`**

```bash
grep -r "BREADCRUMB_MAP" /c/Users/danil/Desktop/LHG-SUPRIMENTOS/lhg-suprimentos/components --include="*.ts" --include="*.tsx" -l
```

Abrir o arquivo encontrado para ver a estrutura do mapa.

- [ ] **Step 2: Criar `app/(app)/auditoria/actions.ts`**

```typescript
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface EventoAuditoria {
  id:         string;
  entidade:   "pedido" | "cotacao" | "nf";
  numero:     string;
  tipo:       string;
  texto:      string;
  autor_nome: string | null;
  created_at: string;
  href:       string;
}

export async function buscarEventosAuditoria(limite = 100): Promise<EventoAuditoria[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Busca pedido_eventos com join nos pedidos para pegar o número
  const { data, error } = await supabase
    .from("pedido_eventos")
    .select(`
      id, tipo, texto, created_at, autor_nome,
      pedidos ( id, numero )
    `)
    .order("created_at", { ascending: false })
    .limit(limite);

  if (error) {
    console.error("[buscarEventosAuditoria]", error.message);
    return [];
  }

  return (data ?? []).map((e) => {
    const pedido = e.pedidos as { id: string; numero: string } | null;
    return {
      id:         e.id,
      entidade:   "pedido" as const,
      numero:     pedido?.numero ?? "—",
      tipo:       e.tipo,
      texto:      e.texto,
      autor_nome: e.autor_nome,
      created_at: e.created_at,
      href:       "/pedidos",
    };
  });
}
```

- [ ] **Step 3: Criar `app/(app)/auditoria/page.tsx`**

```tsx
/**
 * app/(app)/auditoria/page.tsx
 * Linha do tempo de auditoria: eventos recentes de pedidos.
 * Server Component que carrega os últimos 100 eventos.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buscarEventosAuditoria } from "./actions";
import {
  CheckCircle2, XCircle, Mail, Truck,
  Package, Sparkles, Clock, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

export const metadata = { title: "Auditoria" };

const TIPO_CONFIG: Record<string, { label: string; cor: string; Icon: React.ElementType }> = {
  criacao:       { label: "Criado",          cor: "text-muted-foreground",  Icon: Package },
  aprovacao:     { label: "Aprovado",         cor: "text-emerald-400",       Icon: CheckCircle2 },
  rejeicao:      { label: "Rejeitado",        cor: "text-red-400",           Icon: XCircle },
  email_enviado: { label: "E-mail enviado",   cor: "text-sky-400",           Icon: Mail },
  recebimento:   { label: "Recebido",         cor: "text-violet-400",        Icon: Truck },
  omie:          { label: "Sync Omie",        cor: "text-amber-400",         Icon: Sparkles },
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "short", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export default async function AuditoriaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eventos = await buscarEventosAuditoria(100);

  return (
    <div className="max-w-[900px] mx-auto space-y-4 pb-10">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-foreground">Auditoria</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Últimos {eventos.length} eventos · pedidos de compra
        </p>
      </div>

      {/* Linha do tempo */}
      {eventos.length === 0 ? (
        <div className="rounded-xl border border-border bg-card flex flex-col items-center py-16 gap-2 text-muted-foreground/50">
          <Clock size={28} strokeWidth={1.5} />
          <span className="text-sm">Nenhum evento registrado ainda</span>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border/50">
          {eventos.map((ev) => {
            const config = TIPO_CONFIG[ev.tipo] ?? {
              label: ev.tipo, cor: "text-muted-foreground", Icon: Clock,
            };
            const { Icon } = config;

            return (
              <div key={ev.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                {/* Ícone */}
                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <Icon size={13} className={config.cor} />
                </div>

                {/* Conteúdo */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={cn("text-xs font-semibold", config.cor)}>
                      {config.label}
                    </span>
                    <span className="text-xs text-muted-foreground">em</span>
                    <Link
                      href={ev.href}
                      className="text-xs font-mono text-foreground hover:text-lhg-500 transition-colors"
                    >
                      {ev.numero}
                    </Link>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                    {ev.texto}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-muted-foreground/60">
                      {formatDateTime(ev.created_at)}
                    </span>
                    {ev.autor_nome && (
                      <>
                        <ChevronRight size={9} className="text-muted-foreground/40" />
                        <span className="text-[10px] text-muted-foreground/60">
                          {ev.autor_nome}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Adicionar `/auditoria` ao `BREADCRUMB_MAP`**

Abrir o arquivo onde `BREADCRUMB_MAP` está definido (provavelmente `components/lhg/shell/nav-config.ts` ou similar) e adicionar:

```typescript
"/auditoria": ["Auditoria"],
```

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/auditoria/page.tsx" "app/(app)/auditoria/actions.ts"
git commit -m "feat: página de auditoria com linha do tempo de eventos

Mostra últimos 100 eventos de pedido_eventos:
criação, aprovação, rejeição, e-mail, recebimento, sync Omie.
Ícones e cores por tipo de evento."
```

---

## Task 9: Refatorar `pedidos-client.tsx` — Extrair Modais

**Files:**
- Create: `app/(app)/pedidos/_components/modal-email.tsx`
- Create: `app/(app)/pedidos/_components/modal-rejeitar.tsx`
- Modify: `app/(app)/pedidos/_components/pedidos-client.tsx`

- [ ] **Step 1: Criar `modal-email.tsx`**

Extrair o componente `ModalEmail` existente (linhas ~170-230 de pedidos-client.tsx) para arquivo próprio:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Mail, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { enviarEmailFornecedor } from "../actions";

interface Fornecedor {
  razao_social: string;
  nome_fantasia: string | null;
  email: string | null;
}

interface ModalEmailProps {
  pedidoId:     string;
  pedidoNumero: string;
  fornecedor:   Fornecedor | null;
  onClose:      () => void;
  onEnviado:    () => void;
}

export function ModalEmail({ pedidoId, pedidoNumero, fornecedor, onClose, onEnviado }: ModalEmailProps) {
  const [pending, start] = useTransition();
  const [msg, setMsg]    = useState("");

  function handleEnviar() {
    start(async () => {
      try {
        await enviarEmailFornecedor(pedidoId, msg);
        toast.success("E-mail registrado com sucesso");
        onEnviado();
        onClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao enviar e-mail");
      }
    });
  }

  const fornNome = fornecedor?.nome_fantasia ?? fornecedor?.razao_social ?? "Fornecedor";

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[520px] rounded-xl border border-border bg-background shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/80">
          <div className="flex items-center gap-2">
            <Mail size={14} className="text-sky-400" />
            <h2 className="text-sm font-semibold text-foreground">
              Enviar pedido ao fornecedor
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="rounded-lg bg-muted/50 px-3 py-2">
            <p className="text-xs text-muted-foreground">Para:</p>
            <p className="text-sm font-medium text-foreground">{fornNome}</p>
            {fornecedor?.email && (
              <p className="text-xs text-muted-foreground">{fornecedor.email}</p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              Mensagem adicional (opcional)
            </label>
            <textarea
              value={msg}
              onChange={e => setMsg(e.target.value)}
              placeholder={`Ex: Pedido ${pedidoNumero} — favor confirmar recebimento e prazo.`}
              rows={3}
              className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-lhg-500 resize-none"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border/80">
          <button
            onClick={onClose}
            disabled={pending}
            className="h-8 px-4 rounded-lg border border-border text-muted-foreground hover:text-foreground text-xs font-medium transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleEnviar}
            disabled={pending || !fornecedor?.email}
            className={cn(
              "flex items-center gap-1.5 h-8 px-4 rounded-lg text-white text-xs font-semibold transition-colors",
              pending || !fornecedor?.email
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-sky-500 hover:bg-sky-600",
            )}
          >
            {pending && <Loader2 size={12} className="animate-spin" />}
            {pending ? "Enviando…" : "Enviar pedido"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Criar `modal-rejeitar.tsx`**

Extrair o componente `ModalRejeitar` de pedidos-client.tsx (procurar por rejeitar/motivo no arquivo):

```tsx
"use client";

import { useState, useTransition } from "react";
import { XCircle, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { rejeitarPedido } from "../actions";

interface ModalRejeitarProps {
  pedidoId:     string;
  pedidoNumero: string;
  onClose:      () => void;
  onRejeitado:  () => void;
}

export function ModalRejeitar({ pedidoId, pedidoNumero, onClose, onRejeitado }: ModalRejeitarProps) {
  const [pending, start] = useTransition();
  const [motivo, setMotivo] = useState("");

  function handleRejeitar() {
    if (!motivo.trim()) {
      toast.error("Informe o motivo da rejeição");
      return;
    }
    start(async () => {
      try {
        await rejeitarPedido(pedidoId, motivo);
        toast.success(`Pedido ${pedidoNumero} rejeitado`);
        onRejeitado();
        onClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao rejeitar pedido");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[480px] rounded-xl border border-border bg-background shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/80">
          <div className="flex items-center gap-2">
            <XCircle size={14} className="text-red-400" />
            <h2 className="text-sm font-semibold text-foreground">
              Rejeitar pedido {pedidoNumero}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        <div className="px-5 py-4">
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">
            Motivo da rejeição <span className="text-red-400">*</span>
          </label>
          <textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder="Ex: Preço acima do orçado. Solicitar nova cotação."
            rows={3}
            className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-red-500 resize-none"
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border/80">
          <button
            onClick={onClose}
            disabled={pending}
            className="h-8 px-4 rounded-lg border border-border text-muted-foreground hover:text-foreground text-xs font-medium transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleRejeitar}
            disabled={pending || !motivo.trim()}
            className={cn(
              "flex items-center gap-1.5 h-8 px-4 rounded-lg text-white text-xs font-semibold transition-colors",
              pending || !motivo.trim()
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-red-500 hover:bg-red-600",
            )}
          >
            {pending && <Loader2 size={12} className="animate-spin" />}
            {pending ? "Rejeitando…" : "Rejeitar pedido"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Atualizar `pedidos-client.tsx` para usar os novos componentes**

1. Remover as definições inline de `ModalEmail` e `ModalRejeitar` do arquivo
2. Adicionar imports:
```typescript
import { ModalEmail } from "./modal-email";
import { ModalRejeitar } from "./modal-rejeitar";
```
3. Atualizar os usos: onde antes era `<ModalEmail pedido={pedidoSel} ...>`, agora passar props individuais:
```tsx
{modalEmail && pedidoSel && (
  <ModalEmail
    pedidoId={pedidoSel.id}
    pedidoNumero={pedidoSel.numero}
    fornecedor={pedidoSel.fornecedores}
    onClose={() => setModalEmail(false)}
    onEnviado={() => router.refresh()}
  />
)}
{modalRejeitar && pedidoSel && (
  <ModalRejeitar
    pedidoId={pedidoSel.id}
    pedidoNumero={pedidoSel.numero}
    onClose={() => setModalRejeitar(false)}
    onRejeitado={() => { router.refresh(); setPedidoSel(null); }}
  />
)}
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/pedidos/_components/modal-email.tsx" "app/(app)/pedidos/_components/modal-rejeitar.tsx" "app/(app)/pedidos/_components/pedidos-client.tsx"
git commit -m "refactor: extrair ModalEmail e ModalRejeitar de pedidos-client.tsx

Reduz pedidos-client.tsx de ~1044 para ~850 linhas.
Modais agora têm arquivo próprio e props tipadas."
```

---

## Task 10: Vitest — Setup + Testes Críticos

**Files:**
- Modify: `package.json` (scripts + devDependencies)
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `tests/hooks/use-debounce.test.ts`
- Create: `tests/lib/csv.test.ts`
- Create: `tests/actions/cotacoes.test.ts`

- [ ] **Step 1: Instalar dependências**

```bash
cd lhg-suprimentos
npm install -D vitest @testing-library/react @testing-library/user-event @vitejs/plugin-react vite-tsconfig-paths jsdom
```

Esperado: instalação sem conflito (React 19 é compatível com @testing-library/react@14+).

- [ ] **Step 2: Criar `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    setupFiles:  ["./tests/setup.ts"],
    globals:     true,
  },
});
```

- [ ] **Step 3: Criar `tests/setup.ts`**

```typescript
import "@testing-library/jest-dom";

// Silenciar avisos do React 19 em ambiente de teste
global.IS_REACT_ACT_ENVIRONMENT = true;
```

- [ ] **Step 4: Adicionar script `test` no `package.json`**

No objeto `"scripts"`, adicionar:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Criar `tests/hooks/use-debounce.test.ts`**

```typescript
import { renderHook, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { useDebounce } from "@/hooks/use-debounce";

describe("useDebounce", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(()  => { vi.useRealTimers(); });

  it("retorna valor inicial imediatamente", () => {
    const { result } = renderHook(() => useDebounce("inicial", 300));
    expect(result.current).toBe("inicial");
  });

  it("não atualiza antes do delay", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "b" });
    vi.advanceTimersByTime(200);
    expect(result.current).toBe("a"); // ainda não atualizou
  });

  it("atualiza após o delay", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "b" });
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).toBe("b");
  });

  it("cancela atualizações intermediárias (only last wins)", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "b" });
    vi.advanceTimersByTime(100);
    rerender({ value: "c" });
    vi.advanceTimersByTime(100);
    rerender({ value: "d" });
    act(() => { vi.advanceTimersByTime(300); });

    expect(result.current).toBe("d"); // apenas o último valor
  });
});
```

- [ ] **Step 6: Criar `tests/lib/csv.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { downloadCsv } from "@/lib/csv";

describe("downloadCsv", () => {
  beforeEach(() => {
    // Mock do DOM
    global.URL.createObjectURL = vi.fn(() => "blob:test");
    global.URL.revokeObjectURL = vi.fn();

    const mockAnchor = {
      href:     "",
      download: "",
      click:    vi.fn(),
      setAttribute: vi.fn(),
    };
    vi.spyOn(document, "createElement").mockReturnValue(mockAnchor as unknown as HTMLElement);
    vi.spyOn(document.body, "appendChild").mockImplementation(node => node);
    vi.spyOn(document.body, "removeChild").mockImplementation(node => node);
  });

  it("chama click no elemento âncora", () => {
    downloadCsv("test", ["A", "B"], [["1", "2"]]);
    const anchor = document.createElement("a") as unknown as { click: ReturnType<typeof vi.fn> };
    expect(anchor.click).toHaveBeenCalled();
  });

  it("escapa valores com vírgula em aspas", () => {
    // Testar escapamento via Blob
    let blobContent = "";
    const MockBlob = vi.fn().mockImplementation((parts: string[]) => {
      blobContent = parts.join("");
    });
    global.Blob = MockBlob as unknown as typeof Blob;

    downloadCsv("test", ["Nome"], [["Empresa, Ltda"]]);
    expect(blobContent).toContain('"Empresa, Ltda"');
  });

  it("inclui BOM UTF-8 para compatibilidade com Excel", () => {
    let blobContent = "";
    const MockBlob = vi.fn().mockImplementation((parts: string[]) => {
      blobContent = parts.join("");
    });
    global.Blob = MockBlob as unknown as typeof Blob;

    downloadCsv("test", ["A"], [["1"]]);
    expect(blobContent.startsWith("﻿")).toBe(true);
  });
});
```

- [ ] **Step 7: Criar `tests/actions/cotacoes.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dos módulos do Next.js e Supabase antes de importar actions
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/omie/requisicao", () => ({
  excluirReq: vi.fn().mockResolvedValue(undefined),
  upsertReq:  vi.fn().mockResolvedValue({ codReqCompra: 123 }),
  incluirReq: vi.fn().mockResolvedValue({ codReqCompra: 456 }),
}));

// Mock do Supabase — fábrica de mock encadeável
function makeMockSupabase(overrides?: Partial<Record<string, unknown>>) {
  const baseChain = {
    select: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    in:     vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    is:     vi.fn().mockReturnThis(),
    ...overrides,
  };
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-123" } },
      }),
    },
    from: vi.fn().mockReturnValue(baseChain),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

describe("deletarCotacao", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redireciona para /login se não autenticado", async () => {
    const mockSupa = makeMockSupabase();
    mockSupa.auth.getUser = vi.fn().mockResolvedValue({
      data: { user: null },
    });
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(mockSupa);

    const { deletarCotacao } = await import("@/app/(app)/cotacoes/actions");
    await deletarCotacao("cot-123");

    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("lança erro ao tentar deletar cotação aprovada", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: "cot-123",
          status: "aprovado",      // ← cotação aprovada
          numero: "COT-2026-0001",
          omie_codigo: null,
          cotacao_unidades: [],
        },
        error: null,
      }),
      update: vi.fn().mockReturnThis(),
    };
    const mockSupa = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) }, from: vi.fn().mockReturnValue(chain) };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(mockSupa);

    const { deletarCotacao } = await import("@/app/(app)/cotacoes/actions");

    await expect(deletarCotacao("cot-123")).rejects.toThrow(
      "Não é possível excluir uma cotação já aprovada"
    );
  });
});
```

- [ ] **Step 8: Rodar os testes**

```bash
npm test
```

Esperado: output semelhante a:
```
✓ tests/hooks/use-debounce.test.ts (4 tests)
✓ tests/lib/csv.test.ts (3 tests)
✓ tests/actions/cotacoes.test.ts (2 tests)

Test Files  3 passed (3)
Tests       9 passed (9)
```

- [ ] **Step 9: Commit**

```bash
git add vitest.config.ts tests/ package.json package-lock.json
git commit -m "test: setup Vitest + testes críticos

- vitest.config.ts + tests/setup.ts com jsdom
- use-debounce: 4 testes (inicial, antes delay, após delay, last-wins)
- csv.test: 3 testes (click, escape vírgula, BOM UTF-8)
- cotacoes.test: 2 testes (auth redirect, erro cotação aprovada)"
```

---

## Finalização

Após todos os tasks:

- [ ] **Verificação final TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Rodar todos os testes**

```bash
npm test
```

- [ ] **Build de produção**

```bash
npm run build
```

- [ ] **Push para main**

```bash
git push origin main
```

---

## SQL para Executar Manualmente no Supabase

⚠️ **Executar este SQL no Supabase SQL Editor antes ou durante a Task 4:**

```sql
-- Migration 0018: Soft Delete em Cotações
ALTER TABLE cotacoes
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_cotacoes_not_deleted
  ON cotacoes(created_at DESC)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN cotacoes.deleted_at IS
  'NULL = ativo. Preenchido = excluído (soft delete). Mantém histórico completo.';
```
