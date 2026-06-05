/**
 * app/(app)/requisicoes/page.tsx — LHG-209
 * Lista de requisições com filtros por status e wizard de criação.
 * Server Component: busca dados no Supabase e passa ao client.
 *
 * LHG-228: produtos filtrados pela unidade ativa (cookie).
 * "Todas as unidades" retorna catálogo completo.
 * Ao criar requisição, somente produtos da unidade selecionada estão disponíveis.
 */
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { RequisicoesClient } from "./_components/requisicoes-client";

export const metadata = { title: "Requisições" };

export default async function RequisicoesPage() {
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

  // Pré-filtra IDs de requisições pertencentes à unidade ativa
  let reqIdsParaUnidade: string[] | null = null;
  if (unidadeId) {
    const { data: reqUnidades } = await supabase
      .from("requisicao_unidades")
      .select("requisicao_id")
      .eq("unidade_id", unidadeId);
    reqIdsParaUnidade = (reqUnidades ?? []).map((r) => r.requisicao_id);
  }

  const [
    { data: requisicoes },
    { data: unidades },
    { data: produtos },
  ] = await Promise.all([
    (() => {
      let q = supabase
        .from("requisicoes")
        .select(
          `id, numero, titulo, urgencia, status, origem, valor_estimado, created_at,
           solicitante:user_profiles!solicitante_id(nome, avatar_url),
           requisicao_unidades(unidade_id, unidades(nome, slug)),
           requisicao_itens(id, produto_novo)`,
        )
        .order("created_at", { ascending: false });
      // Aplica filtro por unidade quando selecionada
      if (reqIdsParaUnidade !== null) {
        q = reqIdsParaUnidade.length > 0
          ? q.in("id", reqIdsParaUnidade)
          : q.in("id", ["00000000-0000-0000-0000-000000000000"]); // nenhum resultado
      }
      return q;
    })(),

    // Quando unidade específica ativa: retorna só ela. Quando "todas": retorna todas.
    unidadeId
      ? supabase
          .from("unidades")
          .select("id, nome, slug, cor_hex")
          .eq("id", unidadeId)
      : supabase
          .from("unidades")
          .select("id, nome, slug, cor_hex")
          .eq("ativa", true)
          .order("nome"),

    // Produtos filtrados pela unidade ativa (para o wizard de Nova Requisição)
    unidadeId
      ? supabase
          .from("produtos")
          .select("id, codigo, nome, unidade_med, categoria, familia_omie, preco_custo")
          .eq("ativo", true)
          .eq("omie_unidade_id", unidadeId)
          .order("nome")
      : supabase
          .from("produtos")
          .select("id, codigo, nome, unidade_med, categoria, familia_omie, preco_custo")
          .eq("ativo", true)
          .order("nome"),
  ]);

  return (
    <RequisicoesClient
      requisicoes={requisicoes ?? []}
      unidades={unidades ?? []}
      produtos={produtos ?? []}
      activeUnidadeId={unidadeId}
    />
  );
}
