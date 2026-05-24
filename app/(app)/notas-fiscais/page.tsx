/**
 * app/(app)/notas-fiscais/page.tsx — LHG-216/217
 * Entrada de Notas Fiscais: upload XML + conferência + lançamento Omie.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NFClient } from "./_components/nf-client";

export default async function NotasFiscaisPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: notas }, { data: pedidosPendentes }] = await Promise.all([
    // NFs já registradas
    supabase
      .from("notas_fiscais")
      .select(`
        id, chave_acesso, numero, serie, emissao, valor_total,
        status, lancada_no_omie, lancada_em, xml_url, created_at,
        pedidos(id, numero, fornecedores(razao_social, nome_fantasia)),
        nf_itens(
          id, divergencia, decisao,
          qtd_nf, qtd_pedido, preco_nf, preco_pedido,
          produtos(id, nome, codigo, unidade_med)
        )
      `)
      .order("created_at", { ascending: false }),

    // Pedidos aguardando NF (enviado, em_transito, recebido sem NF)
    supabase
      .from("pedidos")
      .select(`
        id, numero, valor_total, status, created_at,
        fornecedores(razao_social, nome_fantasia),
        pedido_itens(
          id, quantidade, preco_unitario,
          produtos(id, nome, codigo, unidade_med)
        )
      `)
      .in("status", ["enviado", "em_transito", "recebido"])
      .order("created_at", { ascending: false }),
  ]);

  return (
    <NFClient
      notas={notas ?? []}
      pedidosPendentes={pedidosPendentes ?? []}
    />
  );
}
