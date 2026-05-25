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
import { OrcamentoWidget } from "./orcamento-widget";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Gastos reais por período (duplicado do page.tsx para uso neste SC) ─────────
async function fetchGastosPorPeriodo(
  supabase: SupabaseClient,
  startIso: string,
): Promise<Record<string, number>> {
  const { data } = await supabase
    .from("pedido_itens")
    .select(`
      valor_total,
      produtos ( categoria, familia_omie ),
      pedidos!inner ( status, created_at )
    `)
    .in("pedidos.status", ["enviado", "em_transito", "recebido", "finalizado"] as const)
    .gte("pedidos.created_at", startIso);

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
  const supabase  = await createClient();
  const sheetConfig = await getUnidadeSheetConfig();

  const now        = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [orcamento, gastosCat] = await Promise.all([
    sheetConfig
      ? fetchOrcamento(sheetConfig.sheetId, sheetConfig.sheetName)
      : Promise.resolve(null),
    fetchGastosPorPeriodo(supabase, monthStart.toISOString()),
  ]);

  return (
    <OrcamentoWidget
      orcamento={orcamento}
      gastosPorCategoria={gastosCat}
    />
  );
}
