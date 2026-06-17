/**
 * app/(app)/dashboard/page.tsx — LHG-220
 * Dashboard do Comprador — Server Component.
 * Busca KPIs, dados de gráfico e ações reais do Supabase.
 *
 * Performance: OrcamentoSection (Google Sheets) é wrapped em <Suspense>
 * para não bloquear o render dos KPIs/gráfico (~300ms vs ~2s antes).
 */
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/utils";
import { KpiCard } from "./_components/kpi-card";
import { GastosChart, type ChartSerie } from "./_components/gastos-chart";
import { AcoesFeed, type AcaoItem } from "./_components/acoes-feed";
import { CotacoesTable, type CotacaoRow } from "./_components/cotacoes-table";
import { DashboardHeader } from "./_components/dashboard-header";
import { OrcamentoWidgetSkeleton } from "./_components/orcamento-widget";
import { OrcamentoSection } from "./_components/orcamento-section";
import { OmieSyncStatus } from "./_components/omie-sync-status";
import { OmieSyncStatusSkeleton } from "./_components/omie-sync-status-skeleton";
import { OmieResumoSection } from "./_components/omie-resumo-section";
import { OmieResumoWidgetSkeleton } from "./_components/omie-resumo-widget";
import { type OrcamentoSheet } from "@/lib/sheets/client";
import { FAMILIA_TO_CATEGORIA } from "@/lib/omie/familia-map";
// getUnidadeSheetConfig foi movido para OrcamentoSection (carregado via Suspense)
// ── Metadados ─────────────────────────────────────────────────────────────────
export const metadata = { title: "Dashboard" };

// ── Mapa de unidades canônicas (slug → {nome, cor}) ───────────────────────────
// Reflete UNIDADES em lib/unidade-context.tsx sem importar o módulo "use client"
const SLUG_META: Record<string, { nome: string; cor: string }> = {
  "lush-ipiranga":         { nome: "Lush Ipiranga (RCC)",    cor: "#10b981" },
  "lush-ipiranga-concavo": { nome: "Lush Ipiranga (CONCAVO)", cor: "#8b5cf6" },
  "lush-lapa":             { nome: "Lush Lapa",              cor: "#38bdf8" },
  "andar-de-cima":         { nome: "Andar de Cima",          cor: "#f59e0b" },
};
// Altana excluída enquanto estiver disabled (ativa=false no banco)
const SLUG_ORDER = ["lush-ipiranga", "lush-ipiranga-concavo", "lush-lapa", "andar-de-cima"];

// ── Labels de meses ───────────────────────────────────────────────────────────
const MONTH_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MONTH_LONG  = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/**
 * Gera os labels e keys do gráfico com base no período selecionado.
 * - Período <= 62 dias → agrega por dia (labels "DD/MM")
 * - Período > 62 dias  → agrega por mês (labels "Mmm")
 */
function buildChartRange(fromStr: string, toStr: string): {
  labels: string[];
  keys: string[];
  byDay: boolean;
  subtitulo: string;
} {
  const fromDate = new Date(fromStr + "T00:00:00");
  const toDate   = new Date(toStr   + "T00:00:00");
  const diffDays = Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;
  const byDay    = diffDays <= 62;

  const labels: string[] = [];
  const keys: string[]   = [];

  if (byDay) {
    const d = new Date(fromDate);
    while (d <= toDate) {
      labels.push(`${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`);
      keys.push(d.toISOString().split("T")[0]);
      d.setDate(d.getDate() + 1);
    }
    // Subtítulo: se for o mês inteiro ou parcial, mostrar o nome do mês
    const sameMonth = fromDate.getMonth() === toDate.getMonth() && fromDate.getFullYear() === toDate.getFullYear();
    const subtitulo = sameMonth
      ? `${MONTH_LONG[fromDate.getMonth()]} ${fromDate.getFullYear()} · pedidos enviados e recebidos`
      : `${fromDate.toLocaleDateString("pt-BR")} a ${toDate.toLocaleDateString("pt-BR")} · pedidos enviados e recebidos`;
    return { labels, keys, byDay, subtitulo };
  }

  // Por mês
  const d = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
  const end = new Date(toDate.getFullYear(), toDate.getMonth(), 1);
  while (d <= end) {
    labels.push(MONTH_SHORT[d.getMonth()]);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() + 1);
  }
  const meses = labels.length;
  const subtitulo = meses === 12
    ? "Último ano · pedidos enviados e recebidos"
    : `Últimos ${meses} meses · pedidos enviados e recebidos`;
  return { labels, keys, byDay, subtitulo };
}

// ── Formato de data pt-BR ──────────────────────────────────────────────────────
function datePtBr(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ── Período atual (mês corrente) ───────────────────────────────────────────────
function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start, end: now, startIso: start.toISOString(), endIso: now.toISOString() };
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// ── Filtro por unidade (M2M) ────────────────────────────────────────────────
// Resolve os IDs de cotações/pedidos da unidade ativa. Retorna null quando a
// unidade é "todas" (sem filtro) — mesmo padrão de requisicoes/page.tsx.
async function idsDaUnidade(
  supabase: SupabaseClient,
  unidadeId: string | null,
): Promise<{ cotIds: string[] | null; pedIds: string[] | null }> {
  if (!unidadeId) return { cotIds: null, pedIds: null };
  const [{ data: cu }, { data: pu }] = await Promise.all([
    supabase.from("cotacao_unidades").select("cotacao_id").eq("unidade_id", unidadeId),
    supabase.from("pedido_unidades").select("pedido_id").eq("unidade_id", unidadeId),
  ]);
  // Lista vazia (não null) força "nenhum resultado" quando a unidade não tem registros
  return {
    cotIds: (cu ?? []).map(r => r.cotacao_id),
    pedIds: (pu ?? []).map(r => r.pedido_id),
  };
}

// ── KPIs ──────────────────────────────────────────────────────────────────────
async function fetchKpis(supabase: SupabaseClient, cotIds: string[] | null, pedIds: string[] | null) {
  const { start, startIso } = currentMonthRange();
  const prevStart = new Date(start.getFullYear(), start.getMonth() - 1, 1);
  const prevEnd   = new Date(start.getFullYear(), start.getMonth(), 0);

  const OPEN_STATUS   = ["rascunho", "cotacao", "pendente"] as const;
  const IN_PROGRESS   = ["cotacao", "pendente"] as const;

  // Aplica o filtro de unidade (.in id) quando há lista; null = todas as unidades.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byCot = (q: any) => (cotIds ? q.in("id", cotIds) : q);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byPed = (q: any) => (pedIds ? q.in("id", pedIds) : q);

  const [
    { count: abertas },
    { count: abertasPrev },
    { data: valorRows },
    { data: valorPrevRows },
    { data: economiaRows },
    { count: pendAprov },
    { count: pendAprovPrev },
  ] = await Promise.all([
    byCot(supabase.from("cotacoes").select("*", { count: "exact", head: true }).in("status", OPEN_STATUS).is("deleted_at", null)),
    byCot(supabase.from("cotacoes").select("*", { count: "exact", head: true }).in("status", OPEN_STATUS).lt("created_at", startIso).is("deleted_at", null)),
    byCot(supabase.from("cotacoes").select("valor_estimado").in("status", IN_PROGRESS).is("deleted_at", null)),
    byCot(supabase.from("cotacoes").select("valor_estimado").in("status", IN_PROGRESS).lt("created_at", startIso).gte("created_at", prevStart.toISOString()).lte("created_at", prevEnd.toISOString()).is("deleted_at", null)),
    byCot(supabase.from("cotacoes").select("economia").in("status", ["aprovado"] as const).gte("created_at", startIso).is("deleted_at", null)),
    byPed(supabase.from("pedidos").select("*", { count: "exact", head: true }).eq("status", "aguardando_aprovacao")),
    byPed(supabase.from("pedidos").select("*", { count: "exact", head: true }).eq("status", "aguardando_aprovacao").lt("created_at", startIso)),
  ]);

  const valor     = ((valorRows     ?? []) as Array<{ valor_estimado: number | null }>).reduce((s, r) => s + (r.valor_estimado ?? 0), 0);
  const valorPrev = ((valorPrevRows ?? []) as Array<{ valor_estimado: number | null }>).reduce((s, r) => s + (r.valor_estimado ?? 0), 0);
  // Economias negativas (compra acima da média dos concorrentes) não subtraem
  // do total — a "Economia do mês" mostra apenas os ganhos reais.
  const economia  = ((economiaRows  ?? []) as Array<{ economia: number | null }>).reduce((s, r) => s + Math.max(0, r.economia ?? 0), 0);

  return {
    abertas:       abertas       ?? 0,
    abertasPrev:   abertasPrev   ?? 0,
    deltaAbertas:  abertasPrev   ? (((abertas ?? 0) - abertasPrev) / abertasPrev) * 100   : null,
    valor,
    valorPrev,
    deltaValor:    valorPrev     ? ((valor - valorPrev) / valorPrev) * 100                : null,
    economia,
    pendAprov:     pendAprov     ?? 0,
    pendAprovPrev: pendAprovPrev ?? 0,
    deltaPendAprov: pendAprovPrev ? (((pendAprov ?? 0) - pendAprovPrev) / pendAprovPrev) * 100 : null,
  };
}

// ── Dados do gráfico: gastos por unidade no período selecionado ──────────────
async function fetchChartData(
  supabase: SupabaseClient,
  fromStr: string,
  toStr: string,
  pedIds: string[] | null,
): Promise<{
  series: ChartSerie[];
  labels: string[];
  subtitulo: string;
}> {
  const { labels, keys, byDay, subtitulo } = buildChartRange(fromStr, toStr);

  const fromIso = new Date(fromStr + "T00:00:00").toISOString();
  const toIso   = new Date(toStr   + "T23:59:59").toISOString();

  let pedidosQuery = supabase
    .from("pedidos")
    .select(`
      valor_total,
      created_at,
      pedido_unidades ( unidades ( id, slug, nome, cor_hex ) )
    `)
    .in("status", ["enviado", "em_transito", "recebido", "finalizado"] as const)
    .gte("created_at", fromIso)
    .lte("created_at", toIso);

  if (pedIds) pedidosQuery = pedidosQuery.in("id", pedIds);
  const { data: pedidos } = await pedidosQuery;

  const grouped: Record<string, Record<string, number>> = {};
  const slugCorOverride: Record<string, string> = {};

  for (const p of pedidos ?? []) {
    const pus = p.pedido_unidades as Array<{
      unidades: { id: string; slug: string; nome: string; cor_hex: string | null } | null;
    }> | null;
    const u = pus?.[0]?.unidades;
    if (!u?.slug) continue;

    // Agrega por dia (YYYY-MM-DD) ou mês (YYYY-MM) conforme o período
    const key = byDay ? p.created_at.slice(0, 10) : p.created_at.slice(0, 7);
    grouped[u.slug] = grouped[u.slug] ?? {};
    grouped[u.slug][key] = (grouped[u.slug][key] ?? 0) + p.valor_total;

    if (u.cor_hex) slugCorOverride[u.slug] = u.cor_hex;
  }

  SLUG_ORDER.forEach((slug) => {
    if (!grouped[slug]) grouped[slug] = {};
  });

  const series: ChartSerie[] = SLUG_ORDER.map((slug) => {
    const meta = SLUG_META[slug];
    return {
      id:   slug,
      name: meta.nome,
      cor:  slugCorOverride[slug] ?? meta.cor,
      data: keys.map((k) => grouped[slug]?.[k] ?? 0),
    };
  });

  return { series, labels, subtitulo };
}

// ── Ações pendentes reais ─────────────────────────────────────────────────────
async function fetchAcoes(supabase: SupabaseClient, cotIds: string[] | null, pedIds: string[] | null): Promise<AcaoItem[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byCot = (q: any) => (cotIds ? q.in("id", cotIds) : q);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byPed = (q: any) => (pedIds ? q.in("id", pedIds) : q);

  const [
    { data: cotsPendentes },
    { data: pedsPendentes },
    { data: pedErroOmie },
  ] = await Promise.all([
    // Cotações aguardando cotação de preços
    byCot(supabase
      .from("cotacoes")
      .select("id, numero, titulo, valor_estimado, created_at")
      .eq("status", "cotacao")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(4)),

    // Pedidos aguardando aprovação
    byPed(supabase
      .from("pedidos")
      .select("id, numero, valor_total, created_at, fornecedores(nome_fantasia, razao_social)")
      .eq("status", "aguardando_aprovacao")
      .order("created_at", { ascending: true })
      .limit(4)),

    // Pedidos com erro de sincronização Omie
    byPed(supabase
      .from("pedidos")
      .select("id, numero, valor_total, created_at, omie_erro")
      .eq("omie_status", "erro")
      .order("created_at", { ascending: true })
      .limit(2)),
  ]);

  const acoes: AcaoItem[] = [];

  for (const c of cotsPendentes ?? []) {
    acoes.push({
      id:        `cot-${c.id}`,
      tipo:      "cotacao",
      descricao: "aguarda cotação de preços em",
      alvo:      c.numero ?? c.id,
      alvoHref:  `/cotacoes/${c.id}`,
      valor:     c.valor_estimado,
      tempo:     c.created_at,
      cta:       "Cotar",
    });
  }

  for (const p of pedsPendentes ?? []) {
    const forn = p.fornecedores as { nome_fantasia: string | null; razao_social: string } | null;
    const fornNome = forn?.nome_fantasia ?? forn?.razao_social ?? "fornecedor";
    acoes.push({
      id:        `ped-${p.id}`,
      tipo:      "aprovar",
      descricao: `${fornNome} · aguarda aprovação em`,
      alvo:      p.numero,
      alvoHref:  "/pedidos",
      valor:     p.valor_total,
      tempo:     p.created_at,
      cta:       "Aprovar",
    });
  }

  for (const p of pedErroOmie ?? []) {
    acoes.push({
      id:        `omie-${p.id}`,
      tipo:      "omie",
      descricao: "erro de sincronização Omie em",
      alvo:      p.numero,
      alvoHref:  "/pedidos",
      valor:     p.valor_total,
      tempo:     p.created_at,
      cta:       "Resolver",
    });
  }

  // Ordena por data (mais antigo primeiro = mais urgente)
  return acoes.sort(
    (a, b) => new Date(a.tempo).getTime() - new Date(b.tempo).getTime(),
  );
}

// ── Cotações para a tabela ────────────────────────────────────────────────────
async function fetchCotacoes(supabase: SupabaseClient, cotIds: string[] | null): Promise<{ rows: CotacaoRow[]; total: number }> {
  let q = supabase
    .from("cotacoes")
    .select(
      `id, numero, titulo, status, valor_estimado, economia, prazo, urgente,
       cotacao_unidades ( unidades ( nome ) ),
       cotacao_itens ( id ),
       cotacao_fornecedores ( id )`,
      { count: "exact" },
    )
    .in("status", ["rascunho", "cotacao", "pendente"] as const)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(8);

  if (cotIds) q = q.in("id", cotIds);
  const { data, count } = await q;

  const rows: CotacaoRow[] = (data ?? []).map((c: Record<string, unknown>) => ({
    id:           c.id as string,
    numero:       (c.numero as string | null) ?? (c.id as string),
    titulo:       (c.titulo as string | null) ?? "Sem título",
    unidades:     ((c.cotacao_unidades as Array<{ unidades?: { nome?: string } | null }> | null) ?? [])
      .map((cu) => cu?.unidades?.nome ?? "").filter(Boolean),
    itens:        Array.isArray(c.cotacao_itens) ? (c.cotacao_itens as unknown[]).length : 0,
    fornecedores: Array.isArray(c.cotacao_fornecedores) ? (c.cotacao_fornecedores as unknown[]).length : 0,
    valorEstimado: (c.valor_estimado as number | null) ?? 0,
    economia:     (c.economia as number | null) ?? null,
    prazo:        (c.prazo as string | null) ?? null,
    status:       c.status as string,
    urgente:      Boolean(c.urgente),
  }));

  return { rows, total: count ?? rows.length };
}

// ── Gastos reais por período (genérico) ──────────────────────────────────────
// Usa "categoria" do produto como chave primária.
// Fallback: se categoria não está no mapa de orçamento, tenta mapear familia_omie.
// endIso opcional — se omitido, busca até agora.
async function fetchGastosPorPeriodo(
  supabase:  SupabaseClient,
  startIso:  string,
  endIso:    string | undefined,
  pedIds:    string[] | null,
): Promise<Record<string, number>> {
  let baseQuery = supabase
    .from("pedido_itens")
    .select(`
      valor_total,
      produtos ( categoria, familia_omie ),
      pedidos!inner ( status, created_at )
    `)
    .in("pedidos.status", ["enviado", "em_transito", "recebido", "finalizado"] as const)
    .gte("pedidos.created_at", startIso);

  if (endIso)  baseQuery = baseQuery.lte("pedidos.created_at", endIso);
  if (pedIds)  baseQuery = baseQuery.in("pedidos.id", pedIds);
  const { data } = await baseQuery;

  const map: Record<string, number> = {};
  for (const item of data ?? []) {
    const prod    = item.produtos as { categoria: string | null; familia_omie: string | null } | null;
    const cat     = prod?.categoria    ?? null;
    const familia = prod?.familia_omie ?? null;
    // 1. usa `categoria` diretamente; 2. fallback familia_omie → categoria
    const catOrc  = cat ?? (familia ? (FAMILIA_TO_CATEGORIA[familia.toUpperCase()] ?? "Outros") : "Outros");
    map[catOrc] = (map[catOrc] ?? 0) + (item.valor_total ?? 0);
  }
  return map;
}

// ── CMV: métricas calculadas ──────────────────────────────────────────────────
// Separa gastos em "CMV" (secao = "produtos") vs "Serviços" (secao = "servicos")
// usando a classificação que já vem do Google Sheets (OrcamentoSheet.categorias[].secao).
const MES_KEYS = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"] as const;

interface CmvMetrics {
  /** Custo de Produtos Vendidos real (Alimentos, Bebidas, Amenities…) */
  cmvReal:        number;
  /** Orçamento de Produtos do mês (Google Sheets, secao = "produtos") */
  cmvOrcado:      number;
  /** cmvReal / cmvOrcado × 100; 0 se não houver orçamento */
  cmvPct:         number;
  /** Custo de Serviços (Manutenção, Limpeza…) */
  servicosReal:   number;
  servicosOrcado: number;
  /** CMV + Serviços */
  totalReal:      number;
  totalOrcado:    number;
  /** CMV mês anterior (para cálculo do delta) */
  cmvPrevReal:    number;
  /** % variação CMV vs mês anterior; null se não houver dado anterior */
  deltaCmv:       number | null;
  /** Indica se a planilha de orçamento está configurada */
  temOrcamento:   boolean;
}

function computeCmvMetrics(
  gastosMes:  Record<string, number>,
  gastosPrev: Record<string, number>,
  orcamento:  OrcamentoSheet | null,
): CmvMetrics {
  const mes = MES_KEYS[new Date().getMonth()];

  // Identifica categorias de cada seção a partir do orçamento
  const catsProdutos = new Set<string>();
  const catsServicos = new Set<string>();
  let cmvOrcado      = 0;
  let servicosOrcado = 0;

  if (orcamento) {
    for (const cat of orcamento.categorias) {
      if (cat.secao === "produtos") {
        catsProdutos.add(cat.categoria);
        cmvOrcado += cat.mensal[mes] ?? 0;
      } else {
        catsServicos.add(cat.categoria);
        servicosOrcado += cat.mensal[mes] ?? 0;
      }
    }
  }

  // Classifica gastos por seção
  let cmvReal      = 0;
  let servicosReal = 0;
  for (const [cat, val] of Object.entries(gastosMes)) {
    if      (catsProdutos.has(cat)) cmvReal      += val;
    else if (catsServicos.has(cat)) servicosReal += val;
    else                            servicosReal += val; // não classificado → serviço/overhead
  }

  // CMV mês anterior para delta
  let cmvPrevReal = 0;
  for (const [cat, val] of Object.entries(gastosPrev)) {
    if (catsProdutos.has(cat)) cmvPrevReal += val;
  }

  const cmvPct   = cmvOrcado > 0 ? (cmvReal / cmvOrcado) * 100 : 0;
  const deltaCmv = cmvPrevReal > 0 ? ((cmvReal - cmvPrevReal) / cmvPrevReal) * 100 : null;

  return {
    cmvReal, cmvOrcado, cmvPct,
    servicosReal, servicosOrcado,
    totalReal:    cmvReal + servicosReal,
    totalOrcado:  cmvOrcado + servicosOrcado,
    cmvPrevReal,  deltaCmv,
    temOrcamento: !!orcamento,
  };
}

// ── Página ─────────────────────────────────────────────────────────────────────
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Unidade ativa (cookie) — dashboard segue o seletor, como as demais telas.
  // "todas" → unidadeId null → KPIs/gastos da rede inteira.
  const cookieStore = await cookies();
  const slug = cookieStore.get("lhg-unidade-slug")?.value ?? "todas";
  let unidadeId: string | null = null;
  if (slug && slug !== "todas") {
    const { data: u } = await supabase.from("unidades").select("id").eq("slug", slug).single();
    unidadeId = u?.id ?? null;
  }
  const { cotIds, pedIds } = await idsDaUnidade(supabase, unidadeId);

  // Período: mês corrente e mês anterior (para delta CMV)
  const now        = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevStart  = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevEnd    = new Date(now.getFullYear(), now.getMonth(), 0);

  // ── Filtro de período (para OmieResumoSection + DashboardHeader) ────────────
  // Padrão: mês corrente se nenhum parâmetro for fornecido.
  const { from: rawFrom, to: rawTo } = await searchParams;
  const defaultFrom = monthStart.toISOString().split("T")[0]; // YYYY-MM-DD
  const defaultTo   = now.toISOString().split("T")[0];        // YYYY-MM-DD
  const periodoFrom = rawFrom ?? defaultFrom;
  const periodoTo   = rawTo   ?? defaultTo;

  // Busca dados do Supabase em paralelo (rápido ~300ms).
  // Promise.allSettled garante que uma falha isolada não derruba o dashboard inteiro.
  const results = await Promise.allSettled([
    fetchKpis(supabase, cotIds, pedIds),
    fetchChartData(supabase, periodoFrom, periodoTo, pedIds),
    fetchAcoes(supabase, cotIds, pedIds),
    fetchCotacoes(supabase, cotIds),
    fetchGastosPorPeriodo(supabase, monthStart.toISOString(), undefined, pedIds),
    fetchGastosPorPeriodo(supabase, prevStart.toISOString(), prevEnd.toISOString(), pedIds),
  ]);

  // Valores de fallback para cada seção
  const kpisDefault = { abertas: 0, abertasPrev: 0, deltaAbertas: null, valor: 0, valorPrev: 0, deltaValor: null, economia: 0, pendAprov: 0, pendAprovPrev: 0, deltaPendAprov: null };
  const kpis          = results[0].status === "fulfilled" ? results[0].value : kpisDefault;
  const chart         = results[1].status === "fulfilled" ? results[1].value : { series: [], labels: [], subtitulo: "pedidos enviados e recebidos" };
  const acoes         = results[2].status === "fulfilled" ? results[2].value : [];
  const cotacoesRes   = results[3].status === "fulfilled" ? results[3].value : { rows: [], total: 0 };
  const gastosCat     = results[4].status === "fulfilled" ? results[4].value : {};
  const gastosCatPrev = results[5].status === "fulfilled" ? results[5].value : {};
  const { rows: cotacoes, total: totalCots } = cotacoesRes;

  // CMV sem orçamento (sheets carrega via Suspense separadamente)
  const cmv = computeCmvMetrics(gastosCat, gastosCatPrev, null);

  return (
    <div className="max-w-[1600px] mx-auto space-y-3 pb-8">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <DashboardHeader from={periodoFrom} to={periodoTo} />

      {/* ── KPIs ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-3">
        <KpiCard
          label="COTAÇÕES ABERTAS"
          value={kpis.abertas.toString()}
          delta={kpis.deltaAbertas ?? undefined}
          prev={kpis.abertasPrev.toString()}
          mono
        />
        <KpiCard
          label="VALOR EM COTAÇÃO"
          value={formatBRL(kpis.valor)}
          delta={kpis.deltaValor ?? undefined}
          prev={formatBRL(kpis.valorPrev)}
          meta={cmv.temOrcamento ? formatBRL(cmv.cmvOrcado) : undefined}
          metaLabel="ORÇADO MÊS"
          mono
        />
        <KpiCard
          label="ECONOMIA DO MÊS"
          value={formatBRL(kpis.economia)}
          meta={kpis.valor > 0 ? `${((kpis.economia / kpis.valor) * 100).toFixed(1)}%` : "—"}
          metaLabel="% S/ VALOR"
          accent="positive"
          mono
        />
        <KpiCard
          label="PEDIDOS PEND. APROVAÇÃO"
          value={kpis.pendAprov.toString()}
          delta={kpis.deltaPendAprov ?? undefined}
          deltaKind="inverse"
          prev={kpis.pendAprovPrev.toString()}
          meta="< 24h"
          metaLabel="SLA MÉDIO"
          mono
        />
        {/* Total Insumos — gasto real vs orçamento de produtos da planilha */}
        <KpiCard
          label="TOTAL INSUMOS MÊS"
          value={formatBRL(cmv.totalReal)}
          meta={cmv.temOrcamento ? formatBRL(cmv.cmvOrcado) : undefined}
          metaLabel="ORÇADO"
          accent={cmv.temOrcamento && cmv.totalReal > cmv.cmvOrcado ? "negative" : "neutral"}
          mono
        />
      </div>

      {/* OmieResumoSection removida do dashboard — consome CPU excessivo no plano Hobby */}
      {/* Reativar quando migrar para Vercel Pro */}

      {/* ── Gráfico + Ações + Status Omie ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 min-h-[420px]">
        <div className="lg:col-span-2 h-full">
          <GastosChart series={chart.series} labels={chart.labels} subtitulo={chart.subtitulo} />
        </div>
        <div className="flex flex-col gap-3 h-full">
          <AcoesFeed acoes={acoes} />
          <Suspense fallback={<OmieSyncStatusSkeleton />}>
            <OmieSyncStatus />
          </Suspense>
        </div>
      </div>

      {/* ── Orçamento vs Realizado — carrega via Suspense (Google Sheets) ── */}
      <Suspense fallback={<OrcamentoWidgetSkeleton />}>
        <OrcamentoSection />
      </Suspense>

      {/* ── Tabela cotações ───────────────────────────────────────────── */}
      <CotacoesTable rows={cotacoes} total={totalCots} />
    </div>
  );
}
