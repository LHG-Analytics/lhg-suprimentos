/**
 * app/(app)/produtos/page.tsx — LHG-206
 * Catálogo de produtos sincronizados do Omie.
 * Server Component: busca dados filtrados pela unidade ativa (cookie) + passa para o client.
 *
 * LHG-228: filtra por omie_unidade_id quando uma unidade específica está selecionada.
 * "Todas as unidades" retorna o catálogo completo (consolidado).
 */
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { ProdutosClient } from "./_components/produtos-client";

export const metadata = { title: "Produtos & Catálogo" };

export default async function ProdutosPage() {
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
    "id, codigo, nome, unidade_med, categoria, familia_omie, ativo, preco_custo, omie_codigo, omie_sincronizado_em";

  const { data: unidades } = await supabase
    .from("unidades")
    .select("id, nome")
    .not("omie_app_key", "is", null)
    .order("nome");

  // fetchAllRows: o PostgREST trava a resposta em 1000 linhas (max-rows),
  // mesmo com .range() maior — com 1240+ produtos, o final da lista
  // (ordenada por categoria) sumia da tela e da busca. Paginamos em blocos.
  const [produtos, { data: lastLog }] = await Promise.all([
    fetchAllRows((from, to) =>
      unidadeId
        ? supabase
            .from("produtos")
            .select(selectFields)
            .eq("omie_unidade_id", unidadeId)
            .order("categoria")
            .order("nome")
            .order("id")
            .range(from, to)
        : supabase
            .from("produtos")
            .select(selectFields)
            .order("categoria")
            .order("nome")
            .order("id")
            .range(from, to),
    ),

    (() => {
      let q = supabase
        .from("integracao_logs")
        .select("created_at, total, novos, status")
        .eq("entidade", "produtos")
        .order("created_at", { ascending: false })
        .limit(1);
      if (unidadeId) q = q.eq("unidade_id", unidadeId);
      return q.maybeSingle();
    })(),
  ]);

  return (
    <ProdutosClient
      produtos={produtos ?? []}
      lastLog={lastLog ?? null}
      unidades={unidades ?? []}
    />
  );
}
