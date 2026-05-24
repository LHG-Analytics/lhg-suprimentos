/**
 * app/(app)/notas-fiscais/page.tsx — LHG-216/217 v2
 * Entrada de NF via consulta Omie + classificação por família de produto.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NFClient } from "./_components/nf-client";

export default async function NotasFiscaisPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: notas }, { data: unidades }] = await Promise.all([
    // NFs já registradas (novo formato + legado)
    supabase
      .from("notas_fiscais")
      .select(`
        id, numero, omie_num_nf, serie, emissao, valor_total,
        status, lancada_no_omie, lancada_em, created_at,
        fornecedores!notas_fiscais_fornecedor_id_fkey(razao_social, nome_fantasia),
        pedidos(numero),
        nf_itens(id, descricao_omie, familia_omie, qtd_nf, preco_nf)
      `)
      .order("created_at", { ascending: false }),

    // Unidades com credenciais Omie configuradas
    supabase
      .from("unidades")
      .select("id, nome, slug")
      .eq("ativa", true)
      .not("omie_app_key", "is", null)
      .order("nome"),
  ]);

  return (
    <NFClient
      notas={notas ?? []}
      unidades={unidades ?? []}
    />
  );
}
