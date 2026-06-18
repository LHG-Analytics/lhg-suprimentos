/**
 * lib/sheets/get-unidade-sheet.ts
 * Helper server-side: lê o cookie "lhg-unidade-slug" e retorna o
 * google_sheet_id + google_sheet_name da unidade ativa no banco.
 *
 * Usado em Server Components e Route Handlers (não em Client Components).
 */

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export interface UnidadeSheetConfig {
  unidadeSlug: string;
  sheetId:     string;
  sheetName:   string;
}

/**
 * Retorna a configuração do Google Sheets da unidade ativa.
 * - Lê o cookie "lhg-unidade-slug" para saber qual unidade está ativa.
 * - Fallback: primeira unidade ativa com google_sheet_id configurado.
 * - Retorna null se nenhuma unidade tiver sheet configurado.
 */
export async function getUnidadeSheetConfig(): Promise<UnidadeSheetConfig | null> {
  const cookieStore = await cookies();
  const slugCookie  = cookieStore.get("lhg-unidade-slug")?.value ?? "";

  const supabase = await createClient();

  // Unidade específica selecionada: usa SOMENTE a planilha dela. Se não tiver
  // planilha configurada, retorna null (o widget mostra "não configurada") —
  // NUNCA cai no fallback de outra unidade, que fazia todas exibirem os mesmos
  // dados (o da Lush Ipiranga, única com planilha).
  if (slugCookie && slugCookie !== "todas") {
    const { data } = await supabase
      .from("unidades")
      .select("slug, google_sheet_id, google_sheet_name")
      .eq("slug", slugCookie)
      .maybeSingle();

    if (data?.google_sheet_id) {
      return {
        unidadeSlug: data.slug,
        sheetId:     data.google_sheet_id,
        sheetName:   data.google_sheet_name ?? "Custos",
      };
    }
    return null; // unidade sem planilha → sem orçamento (não usar de outra)
  }

  // Só "Todas as unidades" usa o fallback (referência da rede): primeira com sheet.
  const { data: fallback } = await supabase
    .from("unidades")
    .select("slug, google_sheet_id, google_sheet_name")
    .not("google_sheet_id", "is", null)
    .order("nome")
    .limit(1)
    .single();

  if (!fallback?.google_sheet_id) return null;

  return {
    unidadeSlug: fallback.slug,
    sheetId:     fallback.google_sheet_id,
    sheetName:   fallback.google_sheet_name ?? "Custos",
  };
}
