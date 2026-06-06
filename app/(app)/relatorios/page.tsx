/**
 * app/(app)/relatorios/page.tsx — LHG-221
 * Relatórios de compras: KPIs históricos, gastos por categoria/fornecedor,
 * últimas NFs lançadas e economias acumuladas.
 * Server Component — busca tudo no Supabase sem waterfall.
 */
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/utils";
import { RelatoriosClient } from "./_components/relatorios-client";

export const metadata = { title: "Relatórios" };

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRange(meses: number) {
  const end   = new Date();
  const start = new Date(end.getFullYear(), end.getMonth() - (meses - 1), 1);
  return { start, end, startIso: start.toISOString(), endIso: end.toISOString() };
}

// ── Dados ─────────────────────────────────────────────────────────────────────

async function fetchResumo(supabase: SupabaseClient, pedidoIds: string[] | null) {
  const { start: start3 } = getRange(3);
  const { startIso: start12 } = getRange(12);

  const [
    { data: pedidosAll },
    { data: cotacoesAll },
    { data: economiaRows },
  ] = await Promise.all([
    // Pedidos dos últimos 12 meses (finalizados + recebidos)
    (() => {
      let q = supabase
        .from("pedidos")
        .select("valor_total, created_at, fornecedor_id")
        .in("status", ["recebido", "finalizado"] as const)
        .gte("created_at", start12);
      if (pedidoIds !== null) {
        q = pedidoIds.length > 0
          ? q.in("id", pedidoIds)
          : q.in("id", ["00000000-0000-0000-0000-000000000000"]);
      }
      return q;
    })(),

    // Cotações aprovadas dos últimos 12 meses (sem deletadas)
    supabase
      .from("cotacoes")
      .select("economia, economia_pct, created_at")
      .eq("status", "aprovado")
      .is("deleted_at", null)
      .gte("created_at", start12),

    // Economia últimos 3 meses separada para comparação (sem deletadas)
    supabase
      .from("cotacoes")
      .select("economia")
      .eq("status", "aprovado")
      .is("deleted_at", null)
      .gte("created_at", start3.toISOString()),
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

async function fetchGastosPorFornecedor(supabase: SupabaseClient, pedidoIds: string[] | null) {
  const { startIso } = getRange(12);

  let q = supabase
    .from("pedidos")
    .select(`
      valor_total,
      fornecedores ( id, razao_social, nome_fantasia, rating, categoria )
    `)
    .in("status", ["recebido", "finalizado"] as const)
    .gte("created_at", startIso);
  if (pedidoIds !== null) {
    q = pedidoIds.length > 0
      ? q.in("id", pedidoIds)
      : q.in("id", ["00000000-0000-0000-0000-000000000000"]);
  }
  const { data } = await q;

  // Agrega por fornecedor
  const map = new Map<string, {
    id: string; nome: string; categoria: string | null;
    rating: number | null; total: number; pedidos: number;
  }>();

  for (const p of data ?? []) {
    const f = p.fornecedores as {
      id: string; razao_social: string; nome_fantasia: string | null;
      rating: number | null; categoria: string | null;
    } | null;
    if (!f) continue;
    const nome = f.nome_fantasia ?? f.razao_social;
    const entry = map.get(f.id) ?? { id: f.id, nome, categoria: f.categoria, rating: f.rating, total: 0, pedidos: 0 };
    entry.total   += p.valor_total;
    entry.pedidos += 1;
    map.set(f.id, entry);
  }

  return Array.from(map.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);
}

async function fetchGastosPorCategoria(supabase: SupabaseClient, pedidoIds: string[] | null) {
  const { startIso } = getRange(12);

  let q = supabase
    .from("pedido_itens")
    .select(`
      valor_total,
      produtos ( categoria ),
      pedidos!inner ( status, created_at )
    `)
    .in("pedidos.status", ["recebido", "finalizado"] as const)
    .gte("pedidos.created_at", startIso);
  if (pedidoIds !== null && pedidoIds.length > 0) {
    q = q.in("pedido_id", pedidoIds);
  } else if (pedidoIds !== null && pedidoIds.length === 0) {
    q = q.in("pedido_id", ["00000000-0000-0000-0000-000000000000"]);
  }
  const { data } = await q;

  const map = new Map<string, number>();
  for (const item of data ?? []) {
    const cat = (item.produtos as { categoria: string } | null)?.categoria ?? "Outros";
    map.set(cat, (map.get(cat) ?? 0) + (item.valor_total ?? 0));
  }

  return Array.from(map.entries())
    .map(([categoria, total]) => ({ categoria, total }))
    .sort((a, b) => b.total - a.total);
}

async function fetchEvolucaoMensal(supabase: SupabaseClient, pedidoIds: string[] | null) {
  const { startIso } = getRange(12);

  let qPedidos = supabase
    .from("pedidos")
    .select("valor_total, created_at")
    .in("status", ["recebido", "finalizado"] as const)
    .gte("created_at", startIso);
  if (pedidoIds !== null) {
    qPedidos = pedidoIds.length > 0
      ? qPedidos.in("id", pedidoIds)
      : qPedidos.in("id", ["00000000-0000-0000-0000-000000000000"]);
  }
  const { data: pedidos } = await qPedidos;

  const { data: cotacoes } = await supabase
    .from("cotacoes")
    .select("economia, created_at")
    .eq("status", "aprovado")
    .is("deleted_at", null)
    .gte("created_at", startIso);

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

  let pedidoIds: string[] | null = null;
  if (slug && slug !== "todas") {
    const { data: u } = await supabase.from("unidades").select("id").eq("slug", slug).single();
    if (u?.id) {
      const { data: pu } = await supabase
        .from("pedido_unidades")
        .select("pedido_id")
        .eq("unidade_id", u.id);
      pedidoIds = (pu ?? []).map(r => r.pedido_id);
    }
  }

  const [resumo, fornecedores, categorias, evolucao] = await Promise.all([
    fetchResumo(supabase, pedidoIds),
    fetchGastosPorFornecedor(supabase, pedidoIds),
    fetchGastosPorCategoria(supabase, pedidoIds),
    fetchEvolucaoMensal(supabase, pedidoIds),
  ]);

  return (
    <RelatoriosClient
      resumo={resumo}
      fornecedores={fornecedores}
      categorias={categorias}
      evolucao={evolucao}
    />
  );
}
