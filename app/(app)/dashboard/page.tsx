/**
 * app/(app)/dashboard/page.tsx — LHG-204
 * Dashboard do Comprador — Server Component.
 * Busca KPIs e cotações do Supabase; passa para componentes filhos.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { Download, Plus, Calendar } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/utils";
import { KpiCard } from "./_components/kpi-card";
import { GastosChart } from "./_components/gastos-chart";
import { AcoesFeed } from "./_components/acoes-feed";
import { CotacoesTable, type CotacaoRow } from "./_components/cotacoes-table";

// ── Metadados ─────────────────────────────────────────────────────────────────
export const metadata = { title: "Dashboard" };

// ── Saudação por horário ───────────────────────────────────────────────────────
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

// ── Formata data do Brasil ─────────────────────────────────────────────────────
function datePtBr(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ── Período atual (mês corrente) ───────────────────────────────────────────────
function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start, end: now, startIso: start.toISOString(), endIso: now.toISOString() };
}

// ── KPI: cotações abertas ──────────────────────────────────────────────────────
// "Abertas" = status em (rascunho, cotacao, pendente, aguardando-aprovacao)
async function fetchKpis(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { start, startIso } = currentMonthRange();
  const prevStart = new Date(start.getFullYear(), start.getMonth() - 1, 1);
  const prevEnd   = new Date(start.getFullYear(), start.getMonth(), 0);

  // cot_status: "rascunho" | "cotacao" | "pendente" | "aprovado" | "rejeitado" | "cancelado"
  const OPEN_STATUS = ["rascunho", "cotacao", "pendente"] as const;
  const IN_PROGRESS = ["cotacao", "pendente"] as const;

  // Paralelo para não waterfall
  const [
    { count: abertas },
    { count: abertasPrev },
    { data: valorRows },
    { data: valorPrevRows },
    { data: economiaRows },
    { count: pendAprov },
    { count: pendAprovPrev },
  ] = await Promise.all([
    supabase.from("cotacoes").select("*", { count: "exact", head: true }).in("status", OPEN_STATUS),
    supabase.from("cotacoes").select("*", { count: "exact", head: true }).in("status", OPEN_STATUS).lt("created_at", startIso),
    supabase.from("cotacoes").select("valor_estimado").in("status", IN_PROGRESS),
    supabase.from("cotacoes").select("valor_estimado").in("status", IN_PROGRESS).lt("created_at", startIso).gte("created_at", prevStart.toISOString()).lte("created_at", prevEnd.toISOString()),
    supabase.from("cotacoes").select("economia").in("status", ["aprovado"] as const).gte("created_at", startIso),
    supabase.from("pedidos").select("*", { count: "exact", head: true }).eq("status", "aguardando_aprovacao"),
    supabase.from("pedidos").select("*", { count: "exact", head: true }).eq("status", "aguardando_aprovacao").lt("created_at", startIso),
  ]);

  const valor     = (valorRows     ?? []).reduce((s, r) => s + (r.valor_estimado ?? 0), 0);
  const valorPrev = (valorPrevRows ?? []).reduce((s, r) => s + (r.valor_estimado ?? 0), 0);
  const economia  = (economiaRows  ?? []).reduce((s, r) => s + (r.economia ?? 0), 0);

  const deltaAbertas    = abertasPrev    ? ((( abertas      ?? 0) - abertasPrev)   / abertasPrev)    * 100 : null;
  const deltaValor      = valorPrev      ? ((valor           - valorPrev)          / valorPrev)       * 100 : null;
  const deltaPendAprov  = pendAprovPrev  ? ((( pendAprov     ?? 0) - pendAprovPrev) / pendAprovPrev)  * 100 : null;

  return {
    abertas:     abertas     ?? 0,
    abertasPrev: abertasPrev ?? 0,
    deltaAbertas,
    valor,
    valorPrev,
    deltaValor,
    economia,
    pendAprov:     pendAprov     ?? 0,
    pendAprovPrev: pendAprovPrev ?? 0,
    deltaPendAprov,
  };
}

// ── Cotações para a tabela ────────────────────────────────────────────────────
async function fetchCotacoes(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ rows: CotacaoRow[]; total: number }> {
  const { data, count } = await supabase
    .from("cotacoes")
    .select(
      `
      id, numero, titulo, status, valor_estimado, economia, prazo,
      urgente,
      cotacao_unidades ( unidades ( nome ) ),
      cotacao_itens ( id ),
      cotacao_fornecedores ( id )
      `,
      { count: "exact" },
    )
    .in("status", ["rascunho", "cotacao", "pendente"] as const)
    .order("updated_at", { ascending: false })
    .limit(8);

  const rows: CotacaoRow[] = (data ?? []).map((c: Record<string, unknown>) => ({
    id:            c.id as string,
    numero:        (c.numero as string | null) ?? (c.id as string),
    titulo:        (c.titulo as string | null) ?? "Sem título",
    unidades:      ((c.cotacao_unidades as Array<{ unidades?: { nome?: string } | null }> | null) ?? [])
      .map((cu) => cu?.unidades?.nome ?? "")
      .filter(Boolean),
    itens:         Array.isArray(c.cotacao_itens) ? (c.cotacao_itens as unknown[]).length : 0,
    fornecedores:  Array.isArray(c.cotacao_fornecedores) ? (c.cotacao_fornecedores as unknown[]).length : 0,
    valorEstimado: (c.valor_estimado as number | null) ?? 0,
    economia:      (c.economia as number | null) ?? null,
    prazo:         (c.prazo as string | null) ?? null,
    status:        c.status as string,
    urgente:       Boolean(c.urgente),
  }));

  return { rows, total: count ?? rows.length };
}

// ── Página ─────────────────────────────────────────────────────────────────────
export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Busca nome do usuário
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("nome")
    .eq("id", user.id)
    .single();

  const firstName = (profile?.nome ?? user.email ?? "").split(" ")[0];

  const [kpis, { rows: cotacoes, total: totalCots }] = await Promise.all([
    fetchKpis(supabase),
    fetchCotacoes(supabase),
  ]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  return (
    <div className="max-w-[1600px] mx-auto space-y-3 pb-8">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 py-2">
        <div className="min-w-0">
          <div className="text-xs text-zinc-500">{getGreeting()}, {firstName}</div>
          <h1 className="mt-1 text-[26px] leading-none font-semibold tracking-tight text-zinc-50">
            Dashboard
          </h1>
          <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
            <Calendar size={12} />
            <span>
              Este mês · {datePtBr(monthStart)} até {datePtBr(now)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 text-sm transition-colors">
            <Download size={14} />
            <span className="hidden sm:inline">Exportar</span>
          </button>
          <Link
            href="/cotacoes/nova"
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-lhg-500 hover:bg-lhg-400 text-zinc-950 font-medium text-sm transition-colors"
          >
            <Plus size={14} />
            Nova cotação
          </Link>
        </div>
      </div>

      {/* ── KPIs ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
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
          meta={formatBRL(180000)}
          metaLabel="ORÇAMENTO"
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
      </div>

      {/* ── Gráfico + Ações ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <GastosChart />
        </div>
        <AcoesFeed />
      </div>

      {/* ── Tabela cotações ───────────────────────────────────────────── */}
      <CotacoesTable rows={cotacoes} total={totalCots} />
    </div>
  );
}
