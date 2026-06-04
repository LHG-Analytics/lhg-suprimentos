# Fase 2 — Cotação Interna + Pedido de Compra Automático no Omie

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ao aprovar uma cotação, gerar automaticamente pedidos de compra no Omie (um por fornecedor vencedor), enviar por email e remover completamente o módulo de Nota Fiscal.

**Architecture:** Nova action `aprovarCotacao` agrupa itens por `selecionado_forn`, cria um `pedido` por fornecedor, chama `pushPedidoOmie` para cada um, e envia email. A UI da cotação ganha painel de seleção de fornecedor vencedor com checkbox por item + seleção em massa. Remoção cirúrgica do sync cotação→Omie e de todo o módulo NF.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase, Omie ERP API, Resend (email), Sonner (toasts).

---

## Mapa de Arquivos

| Arquivo | Ação |
|---------|------|
| `app/(app)/cotacoes/actions.ts` | Modificar: remover sync Omie + adicionar `atribuirFornecedorVencedor` + `aprovarCotacao` |
| `app/(app)/cotacoes/[id]/_components/aprovar-compra-panel.tsx` | Criar: painel UI de seleção de vencedor + botão aprovar |
| `app/(app)/cotacoes/[id]/_components/cotacao-detalhe-client.tsx` | Modificar: integrar o novo painel |
| `app/(app)/cotacoes/[id]/page.tsx` | Modificar: buscar campo `omie_codigo` do fornecedor nos itens |
| `components/lhg/shell/nav-config.ts` | Modificar: remover link notas-fiscais |
| `app/(app)/notas-fiscais/` | Deletar: diretório inteiro |
| `lib/omie/recebimento.ts` | Deletar: funções de recebimento |
| `app/(app)/dashboard/page.tsx` | Modificar: remover referências a NF |

---

## Task 1: SQL — Drop tabelas de NF + confirmar `selecionado_forn`

**Este task requer rodar SQL manualmente no Supabase SQL Editor.**

- [ ] **Step 1: Verificar tipo do campo `selecionado_forn`**

```sql
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'cotacao_itens'
  AND column_name IN ('selecionado_forn', 'melhor_forn');
```

Expected: ambos são `uuid` ou `text`. Anote o tipo — será usado nas actions TypeScript.

- [ ] **Step 2: Dropar tabelas de Nota Fiscal (dados apagados permanentemente)**

```sql
DROP TABLE IF EXISTS nf_itens CASCADE;
DROP TABLE IF EXISTS notas_fiscais CASCADE;
```

Expected: `DROP TABLE` sem erro.

- [ ] **Step 3: Confirmar remoção**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('notas_fiscais', 'nf_itens');
```

Expected: 0 linhas retornadas.

---

## Task 2: `atribuirFornecedorVencedor` — nova action

**Files:**
- Modify: `app/(app)/cotacoes/actions.ts`

- [ ] **Step 1: Adicionar a action ao final do arquivo `cotacoes/actions.ts`**

```typescript
// ── atribuirFornecedorVencedor ─────────────────────────────────────────────────

/**
 * Marca o fornecedor vencedor para uma lista de itens da cotação.
 * Usado pelo painel de seleção em massa.
 */
export async function atribuirFornecedorVencedor(
  itemIds: string[],
  fornecedorId: string | null,
): Promise<{ ok: true } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (itemIds.length === 0) return { erro: "Nenhum item selecionado" };

  const { error } = await supabase
    .from("cotacao_itens")
    .update({ selecionado_forn: fornecedorId })
    .in("id", itemIds);

  if (error) return { erro: error.message };

  // Busca o cotacao_id de qualquer item para revalidar a rota
  const { data: item } = await supabase
    .from("cotacao_itens")
    .select("cotacao_id")
    .eq("id", itemIds[0])
    .single();

  if (item?.cotacao_id) revalidatePath(`/cotacoes/${item.cotacao_id}`);

  return { ok: true };
}
```

- [ ] **Step 2: Rodar typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/cotacoes/actions.ts"
git commit -m "feat(cotacoes): atribuirFornecedorVencedor - marcar fornecedor vencedor por item"
```

---

## Task 3: `aprovarCotacao` — nova action principal

**Files:**
- Modify: `app/(app)/cotacoes/actions.ts`

- [ ] **Step 1: Adicionar imports necessários ao topo do arquivo**

Localizar os imports existentes e adicionar `incluirPedCompra` de pedidos:

```typescript
import { incluirPedCompra } from "@/lib/omie/pedidos";
```

- [ ] **Step 2: Adicionar a action `aprovarCotacao` ao final do arquivo**

```typescript
// ── aprovarCotacao ─────────────────────────────────────────────────────────────

export interface PedidoCriado {
  id:          string;
  numero:      string;
  fornecedor:  string;
  omieOk:      boolean;
  omieErro?:   string;
}

/**
 * Aprova uma cotação:
 * 1. Valida que todos os itens têm fornecedor vencedor
 * 2. Agrupa itens por fornecedor
 * 3. Para cada grupo: cria pedido + tenta enviar ao Omie
 * 4. Muda status da cotação para "aprovado"
 */
export async function aprovarCotacao(
  cotacaoId: string,
): Promise<{ pedidos: PedidoCriado[] } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 1. Buscar dados completos da cotação
  const { data: cotacao, error: cotErr } = await supabase
    .from("cotacoes")
    .select(`
      id, numero, titulo, prazo,
      cotacao_unidades(unidade_id, unidades(omie_app_key, omie_app_secret)),
      cotacao_itens(
        id, quantidade, selecionado_forn,
        produtos(id, nome, omie_codigo, unidade_med),
        cotacao_matriz(fornecedor_id, preco_unitario, condicao_pagamento, prazo_entrega_dias)
      )
    `)
    .eq("id", cotacaoId)
    .single();

  if (cotErr || !cotacao) return { erro: "Cotação não encontrada" };

  // 2. Validar que todos os itens têm fornecedor selecionado
  type ItemRaw = {
    id: string;
    quantidade: number;
    selecionado_forn: string | null;
    produtos: { id: string; nome: string; omie_codigo: string | null; unidade_med: string } | null;
    cotacao_matriz: Array<{ fornecedor_id: string; preco_unitario: number; condicao_pagamento: string | null; prazo_entrega_dias: number | null }>;
  };

  const itens = cotacao.cotacao_itens as ItemRaw[];
  const semVencedor = itens.filter(i => !i.selecionado_forn);
  if (semVencedor.length > 0) {
    return { erro: `${semVencedor.length} item(ns) sem fornecedor vencedor atribuído` };
  }

  // 3. Agrupar itens por fornecedor vencedor
  const grupos = new Map<string, ItemRaw[]>();
  for (const item of itens) {
    const fId = item.selecionado_forn!;
    if (!grupos.has(fId)) grupos.set(fId, []);
    grupos.get(fId)!.push(item);
  }

  // 4. Buscar dados dos fornecedores vencedores
  const fornIds = Array.from(grupos.keys());
  const { data: fornecedores } = await supabase
    .from("fornecedores")
    .select("id, razao_social, nome_fantasia, omie_codigo, email")
    .in("id", fornIds);

  const fornMap = new Map((fornecedores ?? []).map(f => [f.id, f]));

  // 5. Buscar unidade para credenciais Omie
  type UnidadeRaw = { unidade_id: string; unidades: { omie_app_key: string | null; omie_app_secret: string | null } | null };
  const unidades = cotacao.cotacao_unidades as UnidadeRaw[];
  const unidade = unidades[0]?.unidades;

  // 6. Gerar número sequencial de pedido
  const year = new Date().getFullYear();
  const { data: lastPed } = await supabase
    .from("pedidos")
    .select("numero")
    .like("numero", `PED-${year}-%`)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextNum = lastPed ? parseInt(lastPed.numero.split("-")[2] ?? "0", 10) + 1 : 1;

  // 7. Criar pedidos
  const pedidosCriados: PedidoCriado[] = [];

  for (const [fornId, itensForn] of grupos) {
    const forn = fornMap.get(fornId);
    if (!forn) continue;

    const numero = `PED-${year}-${String(nextNum++).padStart(4, "0")}`;

    // Calcular valor total usando preço da matriz para este fornecedor
    const valorTotal = itensForn.reduce((acc, item) => {
      const entrada = item.cotacao_matriz.find(m => m.fornecedor_id === fornId);
      return acc + item.quantidade * (entrada?.preco_unitario ?? 0);
    }, 0);

    // Condição de pagamento e prazo (pega do primeiro item)
    const primeiraEntrada = itensForn[0].cotacao_matriz.find(m => m.fornecedor_id === fornId);
    const condicaoPgto = primeiraEntrada?.condicao_pagamento ?? null;

    // Data de previsão
    const dtPrevisao = cotacao.prazo
      ? new Date(cotacao.prazo + "T12:00:00").toLocaleDateString("pt-BR")
      : new Date(Date.now() + 7 * 86_400_000).toLocaleDateString("pt-BR");

    // Inserir pedido
    const { data: pedido, error: pedErr } = await supabase
      .from("pedidos")
      .insert({
        numero,
        cotacao_id:    cotacaoId,
        fornecedor_id: fornId,
        comprador_id:  user.id,
        status:        "enviado",
        omie_status:   "pendente",
        valor_total:   valorTotal,
        condicao_pgto: condicaoPgto,
        entrega_prev:  cotacao.prazo ?? null,
      })
      .select("id")
      .single();

    if (pedErr || !pedido) continue;

    const pedidoId = pedido.id;

    // Inserir itens do pedido
    await supabase.from("pedido_itens").insert(
      itensForn.map(item => {
        const entrada = item.cotacao_matriz.find(m => m.fornecedor_id === fornId);
        return {
          pedido_id:      pedidoId,
          produto_id:     item.produtos?.id ?? null,
          quantidade:     item.quantidade,
          preco_unitario: entrada?.preco_unitario ?? 0,
        };
      })
    );

    // Inserir unidades do pedido
    if (unidades.length > 0) {
      await supabase.from("pedido_unidades").insert(
        unidades.map(u => ({ pedido_id: pedidoId, unidade_id: u.unidade_id }))
      );
    }

    // Tentar enviar ao Omie
    let omieOk = false;
    let omieErro: string | undefined;

    if (unidade?.omie_app_key && unidade?.omie_app_secret && forn.omie_codigo) {
      try {
        const creds = { appKey: unidade.omie_app_key, appSecret: unidade.omie_app_secret };
        const produtosOmie = itensForn
          .filter(i => i.produtos?.omie_codigo)
          .map((item, idx) => {
            const entrada = item.cotacao_matriz.find(m => m.fornecedor_id === fornId);
            return {
              cCodIntItem: `${pedidoId.slice(0, 8)}-${idx + 1}`,
              nCodProd:    Number(item.produtos!.omie_codigo!),
              nQtde:       item.quantidade,
              nValUnit:    entrada?.preco_unitario ?? 0,
            };
          });

        if (produtosOmie.length > 0) {
          const nCodPed = await incluirPedCompra(creds, {
            cabecalho_incluir: {
              cCodIntPed:  pedidoId,
              nCodFor:     Number(forn.omie_codigo),
              dDtPrevisao: dtPrevisao,
              cObs:        `Pedido ${numero} gerado pelo LHG Suprimentos`,
            },
            produtos_incluir: produtosOmie,
          });

          await supabase.from("pedidos").update({
            omie_status: "sincronizado",
            omie_codigo: String(nCodPed),
            omie_erro:   null,
          }).eq("id", pedidoId);

          omieOk = true;
        }
      } catch (err) {
        omieErro = err instanceof Error ? err.message : "Erro ao enviar ao Omie";
        await supabase.from("pedidos").update({
          omie_status: "pendente",
          omie_erro:   omieErro,
        }).eq("id", pedidoId);
      }
    }

    // Registrar evento
    await supabase.from("pedido_eventos").insert({
      pedido_id: pedidoId,
      tipo:      omieOk ? "omie" : "criacao",
      texto:     omieOk
        ? `Pedido enviado ao Omie — cotação ${cotacao.numero}`
        : `Pedido criado localmente (Omie pendente) — cotação ${cotacao.numero}`,
      autor_id:  user.id,
    });

    // Tentar enviar email ao fornecedor (silencioso se falhar)
    if (forn.email) {
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY!);
        await resend.emails.send({
          from: "LHG Suprimentos <suprimentos@lhgmoteis.com.br>",
          to:   forn.email,
          subject: `Pedido de Compra ${numero} — LHG Suprimentos`,
          html: `
            <h2>Pedido de Compra ${numero}</h2>
            <p>Prezado(a) ${forn.nome_fantasia ?? forn.razao_social},</p>
            <p>Seu fornecimento foi aprovado. Segue o pedido de compra referente à cotação <strong>${cotacao.titulo}</strong>.</p>
            <p><strong>Valor total:</strong> R$ ${valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
            <p><strong>Previsão de entrega:</strong> ${dtPrevisao}</p>
            ${condicaoPgto ? `<p><strong>Condição de pagamento:</strong> ${condicaoPgto}</p>` : ""}
            <p>Atenciosamente,<br/>LHG Suprimentos</p>
          `,
        });
      } catch { /* silencioso */ }
    }

    pedidosCriados.push({
      id:         pedidoId,
      numero,
      fornecedor: forn.nome_fantasia ?? forn.razao_social,
      omieOk,
      omieErro,
    });
  }

  // 8. Atualizar status da cotação
  await supabase.from("cotacoes").update({ status: "aprovado" }).eq("id", cotacaoId);

  revalidatePath(`/cotacoes/${cotacaoId}`);
  revalidatePath("/cotacoes");
  revalidatePath("/pedidos");

  return { pedidos: pedidosCriados };
}
```

- [ ] **Step 3: Rodar typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/cotacoes/actions.ts"
git commit -m "feat(cotacoes): aprovarCotacao - gera pedidos por fornecedor vencedor + Omie + email"
```

---

## Task 4: UI — `AprovarCompraPanel` (novo componente)

**Files:**
- Create: `app/(app)/cotacoes/[id]/_components/aprovar-compra-panel.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
"use client";

/**
 * aprovar-compra-panel.tsx
 * Painel de seleção de fornecedor vencedor por item + botão "Aprovar compra".
 * - Checkbox por item (seleção individual)
 * - Checkbox "Selecionar todos"
 * - Popover "Atribuir a fornecedor" com lista dos fornecedores da cotação
 * - Badge por item com fornecedor vencedor atual
 * - Botão "Aprovar compra" habilitado só quando 100% dos itens têm vencedor
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, Loader2, ShoppingCart, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { atribuirFornecedorVencedor, aprovarCotacao } from "../../actions";

interface Fornecedor {
  id:           string;
  razao_social: string;
  nome_fantasia: string | null;
}

interface Item {
  id:               string;
  quantidade:       number;
  selecionado_forn: string | null;
  produtos:         { nome: string } | null;
}

interface Props {
  cotacaoId:    string;
  cotacaoStatus: string;
  itens:        Item[];
  fornecedores: Fornecedor[];  // fornecedores da cotação (cotacao_fornecedores)
}

function fornNome(f: Fornecedor) {
  return f.nome_fantasia || f.razao_social;
}

const CORES = ["#6366f1","#10b981","#f59e0b","#ef4444","#8b5cf6","#38bdf8"];

export function AprovarCompraPanel({ cotacaoId, cotacaoStatus, itens, fornecedores }: Props) {
  const router  = useRouter();
  const [selecionados, setSelecionados]   = useState<Set<string>>(new Set());
  const [popoverOpen,  setPopoverOpen]    = useState(false);
  const [pendingAtrib, startAtrib]        = useTransition();
  const [pendingAprov, startAprov]        = useTransition();

  const aprovado = cotacaoStatus === "aprovado";
  const todosSelecionados = selecionados.size === itens.length && itens.length > 0;
  const todosTemVencedor  = itens.every(i => i.selecionado_forn);

  const fornById = new Map(fornecedores.map(f => [f.id, f]));
  const corForn  = new Map(fornecedores.map((f, idx) => [f.id, CORES[idx % CORES.length]]));

  function toggleItem(id: string) {
    setSelecionados(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelecionados(
      todosSelecionados ? new Set() : new Set(itens.map(i => i.id))
    );
  }

  function atribuir(fornId: string) {
    setPopoverOpen(false);
    startAtrib(async () => {
      const res = await atribuirFornecedorVencedor(Array.from(selecionados), fornId);
      if ("erro" in res) toast.error(res.erro);
      else { toast.success("Fornecedor vencedor atribuído"); setSelecionados(new Set()); }
    });
  }

  function handleAprovar() {
    startAprov(async () => {
      const res = await aprovarCotacao(cotacaoId);
      if ("erro" in res) {
        toast.error(res.erro);
        return;
      }
      const { pedidos } = res;
      const totalOk = pedidos.filter(p => p.omieOk).length;
      const totalPend = pedidos.filter(p => !p.omieOk).length;
      toast.success(
        `${pedidos.length} pedido(s) gerado(s)`,
        {
          description: totalPend > 0
            ? `${totalOk} enviado(s) ao Omie · ${totalPend} pendente(s) — clique em "Tentar novamente" nos pedidos`
            : "Todos enviados ao Omie e ao(s) fornecedor(es)",
          duration: 8000,
        }
      );
      router.push("/pedidos");
    });
  }

  if (aprovado) return null; // cotação já aprovada — painel oculto

  return (
    <div className="rounded-xl border border-border/80 bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Selecionar fornecedor vencedor
        </span>
        {selecionados.size > 0 && (
          <div className="relative">
            <button
              onClick={() => setPopoverOpen(v => !v)}
              disabled={pendingAtrib}
              className="flex items-center gap-1.5 h-7 px-3 rounded-md bg-lhg-500 hover:bg-lhg-600 text-white text-xs font-medium transition-colors"
            >
              {pendingAtrib ? <Loader2 size={11} className="animate-spin" /> : null}
              Atribuir a fornecedor ({selecionados.size})
              <ChevronDown size={11} />
            </button>
            {popoverOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-border bg-card shadow-xl overflow-hidden">
                {fornecedores.map(f => (
                  <button
                    key={f.id}
                    onClick={() => atribuir(f.id)}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors flex items-center gap-2"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: corForn.get(f.id) }}
                    />
                    {fornNome(f)}
                  </button>
                ))}
                {/* Opção limpar */}
                <button
                  onClick={() => atribuir("")}
                  className="w-full text-left px-3 py-2.5 text-xs text-muted-foreground hover:bg-muted/40 border-t border-border/60"
                >
                  <X size={11} className="inline mr-1" /> Remover seleção
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabela de itens */}
      <div className="rounded-lg border border-border/60 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[32px_1fr_140px] gap-2 px-3 py-2 bg-muted/30 border-b border-border/60">
          <input
            type="checkbox"
            checked={todosSelecionados}
            onChange={toggleAll}
            className="w-4 h-4 accent-lhg-500 cursor-pointer"
          />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Produto</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Vencedor</span>
        </div>

        {/* Linhas */}
        {itens.map(item => {
          const forn = item.selecionado_forn ? fornById.get(item.selecionado_forn) : null;
          const cor  = item.selecionado_forn ? corForn.get(item.selecionado_forn) : undefined;
          return (
            <div
              key={item.id}
              className={cn(
                "grid grid-cols-[32px_1fr_140px] gap-2 px-3 py-2 border-b border-border/40 last:border-0 items-center",
                selecionados.has(item.id) && "bg-lhg-500/05",
              )}
            >
              <input
                type="checkbox"
                checked={selecionados.has(item.id)}
                onChange={() => toggleItem(item.id)}
                className="w-4 h-4 accent-lhg-500 cursor-pointer"
              />
              <span className="text-sm text-foreground truncate">
                {item.produtos?.nome ?? "—"}
                <span className="ml-2 text-xs text-muted-foreground">×{item.quantidade}</span>
              </span>
              {forn ? (
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full truncate"
                  style={{ background: `${cor}20`, color: cor, border: `1px solid ${cor}40` }}
                >
                  {fornNome(forn)}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground/50 italic">não atribuído</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Botão Aprovar */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-muted-foreground">
          {itens.filter(i => i.selecionado_forn).length}/{itens.length} itens com vencedor
        </span>
        <button
          onClick={handleAprovar}
          disabled={!todosTemVencedor || pendingAprov}
          title={!todosTemVencedor ? "Todos os itens precisam ter fornecedor vencedor" : undefined}
          className={cn(
            "flex items-center gap-2 h-9 px-5 rounded-lg font-medium text-sm transition-colors",
            todosTemVencedor && !pendingAprov
              ? "bg-emerald-500 hover:bg-emerald-600 text-white"
              : "bg-muted text-muted-foreground cursor-not-allowed",
          )}
        >
          {pendingAprov
            ? <Loader2 size={14} className="animate-spin" />
            : <ShoppingCart size={14} />
          }
          {pendingAprov ? "Gerando pedidos…" : "Aprovar compra"}
        </button>
      </div>
    </div>
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
git add "app/(app)/cotacoes/[id]/_components/aprovar-compra-panel.tsx"
git commit -m "feat(cotacoes): AprovarCompraPanel - selecao de fornecedor vencedor + botao aprovar compra"
```

---

## Task 5: Integrar `AprovarCompraPanel` na tela de cotação

**Files:**
- Modify: `app/(app)/cotacoes/[id]/_components/cotacao-detalhe-client.tsx`
- Modify: `app/(app)/cotacoes/[id]/page.tsx` (adicionar `omie_codigo` do fornecedor na query)

- [ ] **Step 1: Atualizar a query no `page.tsx` para incluir `omie_codigo` do fornecedor**

Localizar a query de `cotacao_fornecedores` e adicionar `omie_codigo` e `email`:

```typescript
// Linha ~32 no page.tsx, dentro do select:
cotacao_fornecedores(fornecedor_id, fornecedores(id, razao_social, nome_fantasia, rating, pontualidade_pct, omie_codigo, email)),
```

- [ ] **Step 2: Importar e adicionar o `AprovarCompraPanel` no `cotacao-detalhe-client.tsx`**

Localizar onde o componente renderiza a UI principal e adicionar o painel. No topo do arquivo:

```typescript
import { AprovarCompraPanel } from "./aprovar-compra-panel";
```

Localizar onde o status e os itens são usados no JSX e adicionar o painel (antes ou após a matriz de cotação):

```typescript
{/* Painel de aprovação — aparece apenas quando a cotação está em status que permite aprovação */}
{(cotacao.status === "cotacao" || cotacao.status === "pendente") && (
  <AprovarCompraPanel
    cotacaoId={cotacao.id}
    cotacaoStatus={cotacao.status}
    itens={(cotacao.cotacao_itens as any[]).map(item => ({
      id:               item.id,
      quantidade:       item.quantidade,
      selecionado_forn: item.selecionado_forn ?? null,
      produtos:         item.produtos ? { nome: item.produtos.nome } : null,
    }))}
    fornecedores={(cotacao.cotacao_fornecedores as any[]).map(cf => cf.fornecedores).filter(Boolean)}
  />
)}
```

- [ ] **Step 3: Rodar typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/cotacoes/[id]/page.tsx" "app/(app)/cotacoes/[id]/_components/cotacao-detalhe-client.tsx"
git commit -m "feat(cotacoes): integrar AprovarCompraPanel na tela de detalhe da cotacao"
```

---

## Task 6: Remover sync cotação → Omie de `cotacoes/actions.ts`

**Files:**
- Modify: `app/(app)/cotacoes/actions.ts`

- [ ] **Step 1: Remover imports de Omie relacionados a cotação**

Localizar linha 13 aproximadamente:
```typescript
import { incluirReq, upsertReq, excluirReq, type OmieReqParam } from "@/lib/omie/requisicao";
```

Remover completamente esta linha de import (mantendo outros imports se houver).

- [ ] **Step 2: Remover `buildReqOmieParam` e suas chamadas**

Remover:
- A interface `CotacaoParaReqOmie` (linhas ~18-30)
- A função `buildReqOmieParam` (linhas ~32-70)

Nos blocos de `criarCotacao` (linhas ~221-269) e `editarCotacao` (linhas ~496-524), localizar e remover:
```typescript
// Bloco em criarCotacao — REMOVER tudo isso:
const param = buildReqOmieParam({...});
const nCodReq = await incluirReq(...);
await supabase.from("cotacoes").update({ omie_codigo: nCodReq, ... });
```

```typescript
// Bloco em editarCotacao — REMOVER tudo isso:
const param = buildReqOmieParam({...});
await upsertReq(...);
await supabase.from("cotacoes").update({ omie_codigo: ..., omie_sincronizado_em: ... });
```

Em `deletarCotacao` (linha ~98), localizar e remover:
```typescript
// REMOVER — try/catch que chama excluirReq
try {
  await excluirReq(...);
} catch { ... }
```

- [ ] **Step 3: Rodar typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/cotacoes/actions.ts"
git commit -m "feat(cotacoes): remover sync cotacao->Omie - cotacao 100% interna"
```

---

## Task 7: Remover módulo de Nota Fiscal

**Files:**
- Delete: `app/(app)/notas-fiscais/` (diretório inteiro)
- Delete: `lib/omie/recebimento.ts`
- Modify: `components/lhg/shell/nav-config.ts`

- [ ] **Step 1: Deletar diretório de notas-fiscais**

```bash
Remove-Item -Recurse -Force "app/(app)/notas-fiscais"
```

- [ ] **Step 2: Deletar recebimento.ts**

```bash
Remove-Item "lib/omie/recebimento.ts"
```

- [ ] **Step 3: Remover link de navegação em `nav-config.ts`**

Localizar as linhas (em torno de 43 e 57):
```typescript
{ id: "nf", label: "Entrada de NF", href: "/notas-fiscais", icon: FileText, section: "Operação" },
```
e
```typescript
"/notas-fiscais": ["Operação", "Entrada de NF"],
```

Remover ambas as linhas. Se `FileText` não for usado em mais nenhum lugar, remover do import também.

- [ ] **Step 4: Verificar referências a notas-fiscais**

```bash
grep -r "notas-fiscais\|notas_fiscais\|recebimento" app/ lib/ components/ --include="*.ts" --include="*.tsx" -l
```

Para cada arquivo encontrado, remover a referência ou o import. Arquivos comuns a verificar:
- `app/(app)/dashboard/page.tsx` — remover KPI de NFs se houver
- `app/(app)/pedidos/` — remover referência a `recebimento.ts` se houver

- [ ] **Step 5: Rodar typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(fase2): remover modulo Nota Fiscal - diretorio, recebimento.ts e navegacao"
```

---

## Task 8: Botão "Tentar novamente" nos pedidos com Omie pendente

**Files:**
- Modify: `app/(app)/pedidos/_components/pedidos-client.tsx` (ou componente de detalhe do pedido)

- [ ] **Step 1: Localizar onde o `omie_status` é exibido nos pedidos**

```bash
grep -n "omie_status\|pendente\|Tentar novamente" "app/(app)/pedidos/_components/pedidos-client.tsx"
```

- [ ] **Step 2: Adicionar botão "Tentar novamente" para pedidos com `omie_status = pendente`**

Localizar onde o status Omie é renderizado e adicionar:

```typescript
{pedido.omie_status === "pendente" && (
  <button
    onClick={() => handleReenviarOmie(pedido.id)}
    className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors"
  >
    <RefreshCw size={11} />
    Tentar novamente
  </button>
)}
```

E a função handler (chamar `pushPedidoOmie` já existente):

```typescript
async function handleReenviarOmie(pedidoId: string) {
  const res = await pushPedidoOmie(pedidoId);
  if (res.erro) {
    toast.error(res.erro);
  } else {
    toast.success("Pedido enviado ao Omie com sucesso");
    router.refresh();
  }
}
```

- [ ] **Step 3: Rodar typecheck**

```bash
pnpm exec tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/pedidos/_components/"
git commit -m "feat(pedidos): botao Tentar novamente para pedidos com omie_status=pendente"
```

---

## Validação Final

Após todas as tasks:

- [ ] Acesse `/cotacoes` → abra uma cotação com status `cotacao` ou `pendente`
- [ ] Verifique que o `AprovarCompraPanel` aparece com os itens listados
- [ ] Selecione alguns itens com o checkbox, clique "Atribuir a fornecedor", escolha um fornecedor
- [ ] Verifique o badge do fornecedor aparece nos itens
- [ ] Use "Selecionar todos" para atribuir em massa
- [ ] Com todos os itens atribuídos, botão "Aprovar compra" deve habilitar
- [ ] Clique "Aprovar compra" → deve criar pedidos e redirecionar para `/pedidos`
- [ ] Em `/pedidos`, verificar que os pedidos foram criados com status correto
- [ ] Tentar acessar `/notas-fiscais` → deve retornar 404
- [ ] Verificar que o link "Entrada de NF" sumiu da navegação
- [ ] Rodar `pnpm run build` → sem erros de compilação
