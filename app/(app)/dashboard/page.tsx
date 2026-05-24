/**
 * app/(app)/dashboard/page.tsx — LHG-220
 * Dashboard do Comprador — Server Component.
 * Busca KPIs, dados de gráfico e ações reais do Supabase.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/utils";
import { KpiCard } from "./_components/kpi-card";
import { GastosChart, type ChartSerie } from "./_components/gastos-chart";
import { AcoesFeed, type AcaoItem } from "./_components/acoes-feed";
import { CotacoesTable, type CotacaoRow } from "./_components/cotacoes-table";
import { DashboardHeader } from "./_components/dashboard-header";
import { OrcamentoWidget } from "./_components/orcamento-widget";
import { fetchOrcamento, type OrcamentoSheet } from "@/lib/sheets/client";
import { getUnidadeSheetConfig } from "@/lib/sheets/get-unidade-sheet";
import { FAMILIA_TO_CATEGORIA } from "@/lib/omie/familia-map";
// ── Metadados ─────────────────────────────────────────────────────────────────
export const metadata = { title: "Dashboard" };

// ── Mapa de unidades canônicas (slug → {nome, cor}) ───────────────────────────
// Reflete UNIDADES em lib/unidade-context.tsx sem importar o módulo "use client"
const SLUG_META: Record<string, { nome: string; cor: string }> = {
  "lush-ipiranga": { nome: "Lush Ipiranga", cor: "#10b981" },
  "lush-lapa":     { nome: "Lush Lapa",     cor: "#38bdf8" },
  "andar-de-cima": { nome: "Andar de Cima", cor: "#f59e0b" },
};
// Altana excluída enquanto estiver disabled (ativa=false no banco)
const SLUG_ORDER = ["lush-ipiranga", "lush-lapa", "andar-de-cima"];

// ── Labels dos últimos 6 meses ────────────────────────────────────────────────
const MONTH_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function getLast6Months(): { labels: string[]; keys: string[] } {
  const labels: string[] = [];
  const keys: string[]   = []; // "YYYY-MM"
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(MONTH_SHORT[d.getMonth()]);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return { labels, keys };
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

// ── KPIs ──────────────────────────────────────────────────────────────────────
async function fetchKpis(supabase: SupabaseClient) {
  const { start, startIso } = currentMonthRange();
  const prevStart = new Date(start.getFullYear(), start.getMonth() - 1, 1);
  const prevEnd   = new Date(start.getFullYear(), start.getMonth(), 0);

  const OPEN_STATUS   = ["rascunho", "cotacao", "pendente"] as const;
  const IN_PROGRESS   = ["cotacao", "pendente"] as const;

  const [
    { count: abertas },
    { count: abertasPrev },
    { data: valorRows },
    { data: valorPrevRows },
    { data: economiaRows },
    { count: pendAprov },
    { count: pendAprovPrev },
    { count: nfsPendentes },
  ] = await Promise.all([
    supabase.from("cotacoes").select("*", { count: "exact", head: true }).in("status", OPEN_STATUS),
    supabase.from("cotacoes").select("*", { count: "exact", head: true }).in("status", OPEN_STATUS).lt("created_at", startIso),
    supabase.from("cotacoes").select("valor_estimado").in("status", IN_PROGRESS),
    supabase.from("cotacoes").select("valor_estimado").in("status", IN_PROGRESS).lt("created_at", startIso).gte("created_at", prevStart.toISOString()).lte("created_at", prevEnd.toISOString()),
    supabase.from("cotacoes").select("economia").in("status", ["aprovado"] as const).gte("created_at", startIso),
    supabase.from("pedidos").select("*", { count: "exact", head: true }).eq("status", "aguardando_aprovacao"),
    supabase.from("pedidos").select("*", { count: "exact", head: true }).eq("status", "aguardando_aprovacao").lt("created_at", startIso),
    supabase.from("notas_fiscais").select("*", { count: "exact", head: true }).eq("status", "conferencia"),
  ]);

  const valor     = (valorRows     ?? []).reduce((s, r) => s + (r.valor_estimado ?? 0), 0);
  const valorPrev = (valorPrevRows ?? []).reduce((s, r) => s + (r.valor_estimado ?? 0), 0);
  const economia  = (economiaRows  ?? []).reduce((s, r) => s + (r.economia ?? 0), 0);

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
    nfsPendentes:  nfsPendentes  ?? 0,
  };
}

// ── Dados do gráfico: gastos por unidade nos últimos 6 meses ─────────────────
async function fetchChartData(supabase: SupabaseClient): Promise<{
  series: ChartSerie[];
  labels: string[];
}> {
  const { labels, keys } = getLast6Months();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const { data: pedidos } = await supabase
    .from("pedidos")
    .select(`
      valor_total,
      created_at,
      pedido_unidades ( unidades ( id, slug, nome, cor_hex ) )
    `)
    .in("status", ["enviado", "em_transito", "recebido", "finalizado"] as const)
    .gte("created_at", sixMonthsAgo.toISOString());

  // Agrega: grouped[slug][YYYY-MM] = total
  const grouped: Record<string, Record<string, number>> = {};
  // Sobrescreve cor com cor_hex do DB se disponível
  const slugCorOverride: Record<string, string> = {};

  for (const p of pedidos ?? []) {
    // Pega a primeira unidade do pedido (pedidos geralmente têm 1 unidade)
    const pus = p.pedido_unidades as Array<{
      unidades: { id: string; slug: string; nome: string; cor_hex: string | null } | null;
    }> | null;
    const u = pus?.[0]?.unidades;
    if (!u?.slug) continue;

    const monthKey = p.created_at.slice(0, 7); // "YYYY-MM"
    grouped[u.slug] = grouped[u.slug] ?? {};
    grouped[u.slug][monthKey] = (grouped[u.slug][monthKey] ?? 0) + p.valor_total;

    if (u.cor_hex) slugCorOverride[u.slug] = u.cor_hex;
  }

  // Garante que todas as unidades canônicas aparecem mesmo sem pedidos
  SLUG_ORDER.forEach((slug) => {
    if (!grouped[slug]) grouped[slug] = {};
  });

  // Monta series na ordem canônica
  const series: ChartSerie[] = SLUG_ORDER.map((slug) => {
    const meta = SLUG_META[slug];
    return {
      id:   slug,
      name: meta.nome,
      cor:  slugCorOverride[slug] ?? meta.cor,
      data: keys.map((k) => grouped[slug]?.[k] ?? 0),
    };
  });

  return { series, labels };
}

// ── Ações pendentes reais ─────────────────────────────────────────────────────
async function fetchAcoes(supabase: SupabaseClient): Promise<AcaoItem[]> {
  const [
    { data: cotsPendentes },
    { data: pedsPendentes },
    { data: nfsConferencia },
    { data: pedErroOmie },
  ] = await Promise.all([
    // Cotações aguardando cotação de preços
    supabase
      .from("cotacoes")
      .select("id, numero, titulo, valor_estimado, created_at")
      .eq("status", "cotacao")
      .order("created_at", { ascending: true })
      .limit(4),

    // Pedidos aguardando aprovação
    supabase
      .from("pedidos")
      .select("id, numero, valor_total, created_at, fornecedores(nome_fantasia, razao_social)")
      .eq("status", "aguardando_aprovacao")
      .order("created_at", { ascending: true })
      .limit(4),

    // NFs em conferência (divergências pendentes)
    supabase
      .from("notas_fiscais")
      .select("id, numero, valor_total, created_at, pedidos(numero)")
      .eq("status", "conferencia")
      .order("created_at", { ascending: true })
      .limit(3),

    // Pedidos com erro de sincronização Omie
    supabase
      .from("pedidos")
      .select("id, numero, valor_total, created_at, omie_erro")
      .eq("omie_status", "erro")
      .order("created_at", { ascending: true })
      .limit(2),
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

  for (const n of nfsConferencia ?? []) {
    const pedNro = (n.pedidos as { numero: string } | null)?.numero;
    acoes.push({
      id:        `nf-${n.id}`,
      tipo:      "nf",
      descricao: "NF com divergência aguardando conferência em",
      alvo:      n.numero ?? pedNro ?? "NF",
      alvoHref:  "/notas-fiscais",
      valor:     n.valor_total,
      tempo:     n.created_at,
      cta:       "Conferir",
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
async function fetchCotacoes(supabase: SupabaseClient): Promise<{ rows: CotacaoRow[]; total: number }> {
  const { data, count } = await supabase
    .from("cotacoes")
    .select(
      `id, numero, titulo, status, valor_estimado, economia, prazo, urgente,
       cotacao_unidades ( unidades ( nome ) ),
       cotacao_itens ( id ),
       cotacao_fornecedores ( id )`,
      { count: "exact" },
    )
    .in("status", ["rascunho", "cotacao", "pendente"] as const)
    .order("created_at", { ascending: false })
    .limit(8);

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
  endIso?:   string,
): Promise<Record<string, number>> {
  const baseQuery = supabase
    .from("pedido_itens")
    .select(`
      valor_total,
      produtos ( categoria, familia_omie ),
      pedidos!inner ( status, created_at )
    `)
    .in("pedidos.status", ["enviado", "em_transito", "recebido", "finalizado"] as const)
    .gte("pedidos.created_at", startIso);

  const { data } = endIso
    ? await baseQuery.lte("pedidos.created_at", endIso)
    : await baseQuery;

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
export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Busca config do Google Sheets da unidade ativa (via cookie)
  const sheetConfig = await getUnidadeSheetConfig();

  // Período: mês corrente e mês anterior (para delta CMV)
  const now        = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevStart  = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevEnd    = new Date(now.getFullYear(), now.getMonth(), 0);    // último dia do mês ant.

  // Busca tudo em paralelo (incluindo orçamento da planilha e gastos do mês anterior)
  const [kpis, chart, acoes, { rows: cotacoes, total: totalCots }, orcamento, gastosCat, gastosCatPrev] =
    await Promise.all([
      fetchKpis(supabase),
      fetchChartData(supabase),
      fetchAcoes(supabase),
      fetchCotacoes(supabase),
      sheetConfig
        ? fetchOrcamento(sheetConfig.sheetId, sheetConfig.sheetName)
        : Promise.resolve(null),
      fetchGastosPorPeriodo(supabase, monthStart.toISOString()),
      fetchGastosPorPeriodo(supabase, prevStart.toISOString(), prevEnd.toISOString()),
    ]);

  // CMV — Custo das Mercadorias Vendidas (calculado a partir do orçamento Google Sheets)
  const cmv = computeCmvMetrics(gastosCat, gastosCatPrev, orcamento);

  const periodoLabel = `${datePtBr(monthStart)} – ${datePtBr(now)}`;

  return (
    <div className="max-w-[1600px] mx-auto space-y-3 pb-8">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <DashboardHeader periodoLabel={periodoLabel} />

      {/* ── KPIs ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-3">
        <KpiCard
          label="COTAÇÕES ABERTAS"
          value={kpis.abertas.toString()}
          delta={kpis.deltaAbertas ?? undefined}
          prev={kpis.abertasPrev.toString()}
          meta="10"
          metaLabel="META"
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
        <KpiCard
          label="NFs AGUARDANDO CONF."
          value={kpis.nfsPendentes.toString()}
          accent={kpis.nfsPendentes > 0 ? "negative" : "neutral"}
          meta="0"
          metaLabel="META"
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

      {/* ── Gráfico + Ações + Orçamento ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 min-h-[420px]">
        <div className="lg:col-span-2 h-full">
          <GastosChart series={chart.series} labels={chart.labels} />
        </div>
        <div className="h-full">
          <AcoesFeed acoes={acoes} />
        </div>
      </div>

      {/* ── Orçamento vs Realizado ────────────────────────────────────── */}
      <OrcamentoWidget
        orcamento={orcamento}
        gastosPorCategoria={gastosCat}
      />

      {/* ── Tabela cotações ───────────────────────────────────────────── */}
      <CotacoesTable rows={cotacoes} total={totalCots} />
    </div>
  );
}
