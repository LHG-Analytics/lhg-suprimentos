/**
 * app/(app)/fornecedores/page.tsx — LHG-207
 * Lista de fornecedores sincronizados do Omie.
 * Server Component: busca dados + passa para o client.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FornecedoresClient } from "./_components/fornecedores-client";

export const metadata = { title: "Fornecedores" };

export default async function FornecedoresPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: fornecedores }, { data: lastLog }] = await Promise.all([
    supabase
      .from("fornecedores")
      .select(
        "id, razao_social, nome_fantasia, cnpj, email, telefone, contato, cidade, uf, ativo, omie_codigo, omie_sincronizado_em",
      )
      .order("razao_social"),

    supabase
      .from("integracao_logs")
      .select("created_at, total, novos, status")
      .eq("entidade", "fornecedores")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <FornecedoresClient
      fornecedores={fornecedores ?? []}
      lastLog={lastLog ?? null}
    />
  );
}
