/**
 * app/(app)/fornecedores/page.tsx — LHG-207
 * Lista de fornecedores sincronizados do Omie.
 * Server Component: busca dados + passa para o client.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { FornecedoresClient } from "./_components/fornecedores-client";

export const metadata = { title: "Fornecedores" };

export default async function FornecedoresPage() {
  // Valida autenticação com sessão do usuário
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) redirect("/login");

  // Lê dados com service role (bypass de RLS) — seguro pois é Server Component
  const supabase = createServiceClient();

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
