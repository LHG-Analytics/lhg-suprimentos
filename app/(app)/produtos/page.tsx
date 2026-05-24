/**
 * app/(app)/produtos/page.tsx — LHG-206
 * Catálogo de produtos sincronizados do Omie.
 * Server Component: busca dados + passa para o client.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProdutosClient } from "./_components/produtos-client";

export const metadata = { title: "Produtos & Catálogo" };

export default async function ProdutosPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: produtos }, { data: lastLog }] = await Promise.all([
    supabase
      .from("produtos")
      .select(
        "id, codigo, nome, unidade_med, categoria, familia_omie, ativo, preco_custo, omie_codigo, omie_sincronizado_em",
      )
      .order("categoria")
      .order("nome"),

    supabase
      .from("integracao_logs")
      .select("created_at, total, novos, status")
      .eq("entidade", "produtos")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <ProdutosClient
      produtos={produtos ?? []}
      lastLog={lastLog ?? null}
    />
  );
}
