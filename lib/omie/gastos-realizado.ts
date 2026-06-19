/**
 * lib/omie/gastos-realizado.ts
 * Soma os gastos das compras feitas DIRETO no Omie (omie_pedido_itens),
 * por categoria, para compor o "Realizado" do dashboard junto com os pedidos
 * do nosso sistema.
 *
 * Deduplicação: pedidos do nosso sistema que foram enviados ao Omie voltam no
 * sync (mesmo omie_codigo). Esses já são contados via pedido_itens — então aqui
 * excluímos os omie_pedido_itens cujo omie_codigo bate com pedidos.omie_codigo.
 */
import { fetchAllRows } from "@/lib/supabase/fetch-all";

interface OmiePedItemRow {
  valor_total: number | null;
  categoria:   string | null;
  omie_codigo: number | null;
}

export async function gastosOmiePorCategoria(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase:  any,
  startIso:  string,
  endIso:    string | undefined,
  unidadeId: string | null,
): Promise<Record<string, number>> {
  // Códigos Omie dos nossos pedidos (para não duplicar)
  const { data: nossos } = await supabase.from("pedidos").select("omie_codigo").not("omie_codigo", "is", null);
  const codigosNossos = new Set<string>(((nossos ?? []) as { omie_codigo: string | null }[]).map(r => String(r.omie_codigo)));

  const startDate = startIso.slice(0, 10);
  const endDate   = endIso?.slice(0, 10);

  const itens = await fetchAllRows<OmiePedItemRow>((from, to) => {
    let q = supabase
      .from("omie_pedido_itens")
      .select("valor_total, categoria, omie_codigo")
      .gte("data_pedido", startDate)
      .order("id")
      .range(from, to);
    if (endDate)   q = q.lte("data_pedido", endDate);
    if (unidadeId) q = q.eq("unidade_id", unidadeId);
    return q;
  });

  const map: Record<string, number> = {};
  for (const it of itens) {
    if (it.omie_codigo != null && codigosNossos.has(String(it.omie_codigo))) continue; // dedup
    const cat = it.categoria ?? "Outros";
    map[cat] = (map[cat] ?? 0) + Number(it.valor_total ?? 0);
  }
  return map;
}

/** Mescla dois mapas de gastos por categoria (soma os valores). */
export function mesclarGastos(...mapas: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of mapas) for (const [cat, v] of Object.entries(m)) out[cat] = (out[cat] ?? 0) + v;
  return out;
}
