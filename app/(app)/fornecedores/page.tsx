/**
 * app/(app)/fornecedores/page.tsx — LHG-207
 * Lista de fornecedores sincronizados do Omie.
 * Server Component: busca dados filtrados pela unidade ativa (cookie) + passa para o client.
 *
 * LHG-227: filtra por omie_unidade_id quando uma unidade específica está selecionada.
 * "Todas as unidades" retorna o cadastro completo.
 */
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { FornecedoresClient } from "./_components/fornecedores-client";

export const metadata = { title: "Fornecedores" };

export default async function FornecedoresPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Lê a unidade ativa do cookie definido pelo UnidadeContext client-side
  const cookieStore = await cookies();
  const slug = cookieStore.get("lhg-unidade-slug")?.value ?? "todas";

  // Resolve UUID da unidade quando não é "todas"
  let unidadeId: string | null = null;
  if (slug && slug !== "todas") {
    const { data: unidade } = await supabase
      .from("unidades")
      .select("id")
      .eq("slug", slug)
      .single();
    unidadeId = unidade?.id ?? null;
  }

  const selectFields =
    "id, razao_social, nome_fantasia, cnpj, email, telefone, contato, endereco, cep, cidade, uf, ativo, omie_codigo, omie_sincronizado_em";

  const { data: unidades } = await supabase
    .from("unidades")
    .select("id, nome")
    .not("omie_app_key", "is", null)
    .order("nome");

  // fetchAllRows: PostgREST trava em 1000 linhas (max-rows) — garante a lista completa
  const [fornecedores, { data: lastLog }] = await Promise.all([
    fetchAllRows((from, to) =>
      unidadeId
        ? supabase
            .from("fornecedores")
            .select(selectFields)
            .eq("omie_unidade_id", unidadeId)
            .order("razao_social")
            .order("id")
            .range(from, to)
        : supabase
            .from("fornecedores")
            .select(selectFields)
            .order("razao_social")
            .order("id")
            .range(from, to),
    ),

    (() => {
      let q = supabase
        .from("integracao_logs")
        .select("created_at, total, novos, status")
        .eq("entidade", "fornecedores")
        .order("created_at", { ascending: false })
        .limit(1);
      if (unidadeId) q = q.eq("unidade_id", unidadeId);
      return q.maybeSingle();
    })(),
  ]);

  return (
    <FornecedoresClient
      fornecedores={fornecedores}
      lastLog={lastLog ?? null}
      unidades={unidades ?? []}
    />
  );
}
