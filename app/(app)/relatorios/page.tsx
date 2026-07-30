/**
 * app/(app)/relatorios/page.tsx — LHG-221 / LHG-250
 * Relatórios de compras: KPIs históricos, evolução mensal, rating de fornecedores,
 * curva ABC de produtos e ranking de categorias.
 * Server Component — busca tudo no Supabase sem waterfall.
 *
 * Tudo respeita a unidade ativa (cookie `lhg-unidade-slug`). O vínculo com unidade
 * é indireto: `pedidos` e `cotacoes` não têm `unidade_id`, ele vive nas pivots
 * `pedido_unidades` / `cotacao_unidades` — cada query precisa resolver a pivot.
 */
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  computeTopProdutos, computeTopCategorias, categoriaPorFornecedor,
  type ItemPedido,
} from "@/lib/relatorios";
import { RelatoriosClient } from "./_components/relatorios-client";

export const metadata = { title: "Relatórios" };

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRange(meses: number) {
  const end   = new Date();
  const start = new Date(end.getFullYear(), end.getMonth() - (meses - 1), 1);
  return { start, end, startIso: start.toISOString(), endIso: end.toISOString() };
}

/** UUID que nunca casa — usado para forçar resultado vazio quando a unidade não tem registros. */
const NO_MATCH = "00000000-0000-0000-0000-000000000000";

/**
 * Restringe a query aos ids da unidade ativa.
 * `ids === null` significa "todas as unidades" (sem filtro).
 */
function restrictTo<T extends { in: (col: string, v: string[]) => T }>(
  q: T, coluna: string, ids: string[] | null,
): T {
  if (ids === null) return q;
  return q.in(coluna, ids.length > 0 ? ids : [NO_MATCH]);
}

/**
 * Percorre todas as páginas de uma query.
 * O PostgREST corta em 1.000 linhas por padrão e falha em silêncio — com ~950
 * itens de pedido em 12 meses estamos perto do teto, então paginar é obrigatório.
 */
const PAGE_SIZE = 1000;
async function fetchAllPages<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const todas: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data } = await buildPage(from, from + PAGE_SIZE - 1);
    if (!data?.length) break;
    todas.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return todas;
}

// ── Resumo / KPIs ─────────────────────────────────────────────────────────────

async function fetchResumo(
  supabase: SupabaseClient,
  pedidoIds: string[] | null,
  cotacaoIds: string[] | null,
) {
  const { start: start3 } = getRange(3);
  const { startIso: start12 } = getRange(12);

  const [
    { data: pedidosAll },
    { data: cotacoesAll },
    { data: economiaRows },
  ] = await Promise.all([
    // Pedidos dos últimos 12 meses (finalizados + recebidos)
    restrictTo(
      supabase
        .from("pedidos")
        .select("valor_total, created_at, fornecedor_id")
        .in("status", ["recebido", "finalizado"] as const)
        .gte("created_at", start12),
      "id", pedidoIds,
    ),

    // Cotações aprovadas dos últimos 12 meses (sem deletadas)
    restrictTo(
      supabase
        .from("cotacoes")
        .select("economia, economia_pct, created_at")
        .eq("status", "aprovado")
        .is("deleted_at", null)
        .gte("created_at", start12),
      "id", cotacaoIds,
    ),

    // Economia últimos 3 meses separada para comparação (sem deletadas)
    restrictTo(
      supabase
        .from("cotacoes")
        .select("economia")
        .eq("status", "aprovado")
        .is("deleted_at", null)
        .gte("created_at", start3.toISOString()),
      "id", cotacaoIds,
    ),
  ]);

  const totalGasto12m  = (pedidosAll  ?? []).reduce((s, p) => s + p.valor_total, 0);
  const economia12m    = (cotacoesAll ?? []).reduce((s, c) => s + (c.economia ?? 0), 0);
  const economia3m     = (economiaRows ?? []).reduce((s, c) => s + (c.economia ?? 0), 0);
  const mediaMensal    = totalGasto12m / 12;
  const ticketMedio    = (pedidosAll ?? []).length > 0 ? totalGasto12m / (pedidosAll ?? []).length : 0;

  return {
    totalGasto12m,
    economia12m,
    economia3m,
    mediaMensal,
    ticketMedio,
    totalPedidos: (pedidosAll ?? []).length,
  };
}

// ── Métricas de fornecedor (view fornecedor_metricas) ─────────────────────────

export interface MetricaFornecedor {
  rating:              number | null;
  confianca:           string | null;
  pontualidadePct:     number | null;
  competitividadePct:  number | null;
  gapMedioPct:         number | null;
  cotacaoCelulas:      number;
  entregas:            number;
  entregasNoPrazo:     number;
}

/**
 * Lê a view `fornecedor_metricas` para a unidade ativa.
 * `unidadeId === null` busca a linha consolidada (`unidade_id IS NULL`), que
 * re-agrega as células cruas de todas as unidades — não é média de médias.
 */
async function fetchMetricasFornecedor(supabase: SupabaseClient, unidadeId: string | null) {
  const base = supabase
    .from("fornecedor_metricas")
    .select("fornecedor_id, rating, confianca, pontualidade_pct, competitividade_pct, gap_medio_pct, cotacao_celulas, entregas, entregas_no_prazo");

  const { data } = unidadeId
    ? await base.eq("unidade_id", unidadeId)
    : await base.is("unidade_id", null);

  const map = new Map<string, MetricaFornecedor>();
  for (const m of data ?? []) {
    if (!m.fornecedor_id) continue;
    map.set(m.fornecedor_id, {
      rating:             m.rating,
      confianca:          m.confianca,
      pontualidadePct:    m.pontualidade_pct,
      competitividadePct: m.competitividade_pct,
      gapMedioPct:        m.gap_medio_pct,
      cotacaoCelulas:     m.cotacao_celulas ?? 0,
      entregas:           m.entregas ?? 0,
      entregasNoPrazo:    m.entregas_no_prazo ?? 0,
    });
  }
  return map;
}

// ── Itens de pedido: base comum de produtos / categorias / fornecedores ───────

/**
 * Uma única leitura de `pedido_itens` alimenta três agregações (curva ABC,
 * ranking de categorias e categoria predominante de cada fornecedor) —
 * todas em `lib/relatorios.ts`.
 */
async function fetchItens(supabase: SupabaseClient, pedidoIds: string[] | null) {
  const { startIso } = getRange(12);

  const rows = await fetchAllPages<ItemPedido>((from, to) =>
    restrictTo(
      supabase
        .from("pedido_itens")
        .select(`
          pedido_id,
          quantidade,
          preco_unitario,
          valor_total,
          produtos ( nome, categoria, unidade_med ),
          pedidos!inner ( fornecedor_id, status, created_at )
        `)
        .in("pedidos.status", ["recebido", "finalizado"] as const)
        .gte("pedidos.created_at", startIso),
      "pedido_id", pedidoIds,
    ).range(from, to) as unknown as PromiseLike<{ data: ItemPedido[] | null }>,
  );

  return rows;
}


// ── Gastos por fornecedor ─────────────────────────────────────────────────────

async function fetchGastosPorFornecedor(supabase: SupabaseClient, pedidoIds: string[] | null) {
  const { startIso } = getRange(12);

  const { data } = await restrictTo(
    supabase
      .from("pedidos")
      .select(`
        valor_total,
        fornecedores ( id, razao_social, nome_fantasia )
      `)
      .in("status", ["recebido", "finalizado"] as const)
      .gte("created_at", startIso),
    "id", pedidoIds,
  );

  const map = new Map<string, { id: string; nome: string; total: number; pedidos: number }>();

  for (const p of data ?? []) {
    const f = p.fornecedores as {
      id: string; razao_social: string; nome_fantasia: string | null;
    } | null;
    if (!f) continue;
    const nome  = f.nome_fantasia ?? f.razao_social;
    const entry = map.get(f.id) ?? { id: f.id, nome, total: 0, pedidos: 0 };
    entry.total   += p.valor_total;
    entry.pedidos += 1;
    map.set(f.id, entry);
  }

  return map;
}

// ── Evolução mensal ───────────────────────────────────────────────────────────

async function fetchEvolucaoMensal(
  supabase: SupabaseClient,
  pedidoIds: string[] | null,
  cotacaoIds: string[] | null,
) {
  const { startIso } = getRange(12);

  const [{ data: pedidos }, { data: cotacoes }] = await Promise.all([
    restrictTo(
      supabase
        .from("pedidos")
        .select("valor_total, created_at")
        .in("status", ["recebido", "finalizado"] as const)
        .gte("created_at", startIso),
      "id", pedidoIds,
    ),
    restrictTo(
      supabase
        .from("cotacoes")
        .select("economia, created_at")
        .eq("status", "aprovado")
        .is("deleted_at", null)
        .gte("created_at", startIso),
      "id", cotacaoIds,
    ),
  ]);

  // Agrupa por mês
  const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const gastos:   Record<string, number> = {};
  const economias: Record<string, number> = {};

  for (const p of pedidos ?? []) {
    const k = p.created_at.slice(0, 7);
    gastos[k] = (gastos[k] ?? 0) + p.valor_total;
  }
  for (const c of cotacoes ?? []) {
    const k = c.created_at.slice(0, 7);
    economias[k] = (economias[k] ?? 0) + (c.economia ?? 0);
  }

  // Últimos 12 meses
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return {
      mes:      MONTHS[d.getMonth()],
      key:      k,
      gasto:    gastos[k]   ?? 0,
      economia: economias[k] ?? 0,
    };
  });
}

// ── Página ─────────────────────────────────────────────────────────────────────

export default async function RelatoriosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Unidade ativa (cookie) — filtra dados da unidade selecionada na sidebar
  const cookieStore = await cookies();
  const slug = cookieStore.get("lhg-unidade-slug")?.value ?? "todas";

  // `null` = consolidado (todas as unidades); array = ids da unidade ativa
  let unidadeId:  string | null   = null;
  let pedidoIds:  string[] | null = null;
  let cotacaoIds: string[] | null = null;
  if (slug && slug !== "todas") {
    const { data: u } = await supabase.from("unidades").select("id").eq("slug", slug).single();
    if (u?.id) {
      unidadeId = u.id;
      const [{ data: pu }, { data: cu }] = await Promise.all([
        supabase.from("pedido_unidades").select("pedido_id").eq("unidade_id", u.id),
        supabase.from("cotacao_unidades").select("cotacao_id").eq("unidade_id", u.id),
      ]);
      pedidoIds  = (pu ?? []).map(r => r.pedido_id);
      cotacaoIds = (cu ?? []).map(r => r.cotacao_id);
    } else {
      // Slug inválido — não vaza dados de outras unidades
      pedidoIds  = [];
      cotacaoIds = [];
    }
  }

  const [resumo, gastoForn, metricas, itens, evolucao] = await Promise.all([
    fetchResumo(supabase, pedidoIds, cotacaoIds),
    fetchGastosPorFornecedor(supabase, pedidoIds),
    fetchMetricasFornecedor(supabase, unidadeId),
    fetchItens(supabase, pedidoIds),
    fetchEvolucaoMensal(supabase, pedidoIds, cotacaoIds),
  ]);

  const catPorForn     = categoriaPorFornecedor(itens);
  const nomePorForn    = new Map(Array.from(gastoForn.values()).map(f => [f.id, f.nome]));
  const topProdutos    = computeTopProdutos(itens);
  const topCategorias  = computeTopCategorias(itens, nomePorForn);

  const fornecedores = Array.from(gastoForn.values())
    .map((f) => {
      const m = metricas.get(f.id);
      return {
        ...f,
        categoria:          catPorForn.get(f.id) ?? null,
        rating:             m?.rating             ?? null,
        confianca:          m?.confianca          ?? null,
        pontualidadePct:    m?.pontualidadePct    ?? null,
        competitividadePct: m?.competitividadePct ?? null,
        gapMedioPct:        m?.gapMedioPct        ?? null,
        cotacaoCelulas:     m?.cotacaoCelulas     ?? 0,
        entregas:           m?.entregas           ?? 0,
        entregasNoPrazo:    m?.entregasNoPrazo    ?? 0,
      };
    })
    .sort((a, b) => b.total - a.total);

  // A pizza continua usando o mesmo agregado por categoria
  const categorias = topCategorias.map(c => ({ categoria: c.categoria, total: c.total }));

  return (
    <RelatoriosClient
      resumo={resumo}
      fornecedores={fornecedores}
      categorias={categorias}
      topProdutos={topProdutos}
      topCategorias={topCategorias}
      evolucao={evolucao}
    />
  );
}
