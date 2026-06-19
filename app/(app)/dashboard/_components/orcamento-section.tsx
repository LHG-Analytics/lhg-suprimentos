/**
 * orcamento-section.tsx
 * Async Server Component que encapsula o fetch do Google Sheets
 * e renderiza o OrcamentoWidget.
 *
 * Separado do page.tsx para ser envolto em <Suspense> — assim o
 * dashboard carrega os KPIs/gráfico imediatamente (~300ms) enquanto
 * o fetch do Google Sheets acontece em paralelo no servidor.
 */
import { createClient } from "@/lib/supabase/server";
import { fetchOrcamento } from "@/lib/sheets/client";
import { getUnidadeSheetConfig } from "@/lib/sheets/get-unidade-sheet";
import { FAMILIA_TO_CATEGORIA } from "@/lib/omie/familia-map";
import { gastosOmiePorCategoria, mesclarGastos } from "@/lib/omie/gastos-realizado";
import { OrcamentoWidget } from "./orcamento-widget";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Gastos reais por período (duplicado do page.tsx para uso neste SC) ─────────
// pedIds: filtra pela unidade do orçamento (null = todas).
async function fetchGastosPorPeriodo(
  supabase: SupabaseClient,
  startIso: string,
  pedIds:   string[] | null,
): Promise<Record<string, number>> {
  let q = supabase
    .from("pedido_itens")
    .select(`
      valor_total,
      produtos ( categoria, familia_omie ),
      pedidos!inner ( status, created_at )
    `)
    .in("pedidos.status", ["enviado", "em_transito", "recebido", "finalizado"] as const)
    .gte("pedidos.created_at", startIso);

  if (pedIds) q = q.in("pedidos.id", pedIds);
  const { data } = await q;

  const map: Record<string, number> = {};
  for (const item of data ?? []) {
    const prod    = item.produtos as unknown as { categoria: string | null; familia_omie: string | null } | null;
    const cat     = prod?.categoria    ?? null;
    const familia = prod?.familia_omie ?? null;
    const catOrc  = cat ?? (familia ? (FAMILIA_TO_CATEGORIA[familia.toUpperCase()] ?? "Outros") : "Outros");
    map[catOrc] = (map[catOrc] ?? 0) + (item.valor_total ?? 0);
  }
  return map;
}

// ── Componente async ───────────────────────────────────────────────────────────
export async function OrcamentoSection() {
  try {
    const supabase    = await createClient();
    const sheetConfig = await getUnidadeSheetConfig();

    const now        = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Filtra o realizado pela MESMA unidade do orçamento (sheetConfig.unidadeSlug),
    // para orçado e realizado ficarem no mesmo escopo.
    let pedIds: string[] | null = null;
    let unidadeId: string | null = null;
    if (sheetConfig && sheetConfig.unidadeSlug && sheetConfig.unidadeSlug !== "todas") {
      const { data: u } = await supabase.from("unidades").select("id").eq("slug", sheetConfig.unidadeSlug).single();
      if (u?.id) {
        unidadeId = u.id;
        const { data: pu } = await supabase.from("pedido_unidades").select("pedido_id").eq("unidade_id", u.id);
        pedIds = (pu ?? []).map(r => r.pedido_id);
      }
    }

    const [orcamento, gastosNosso, gastosOmie] = await Promise.all([
      sheetConfig
        ? fetchOrcamento(sheetConfig.sheetId, sheetConfig.sheetName)
        : Promise.resolve(null),
      fetchGastosPorPeriodo(supabase, monthStart.toISOString(), pedIds),
      gastosOmiePorCategoria(supabase, monthStart.toISOString(), undefined, unidadeId),
    ]);

    return (
      <OrcamentoWidget
        orcamento={orcamento}
        gastosPorCategoria={mesclarGastos(gastosNosso, gastosOmie)}
      />
    );
  } catch (err) {
    console.error("[OrcamentoSection] erro:", err);
    return null; // falha silenciosa — não quebra o dashboard
  }
}
