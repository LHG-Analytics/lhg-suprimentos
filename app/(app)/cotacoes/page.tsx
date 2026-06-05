/**
 * app/(app)/cotacoes/page.tsx — LHG-210
 * Lista de cotações com mini-KPIs e tabela filtrada por status.
 * Server Component: busca dados no Supabase e passa ao client.
 */
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { CotacoesClient } from "./_components/cotacoes-client";

export const metadata = { title: "Cotações" };

export default async function CotacoesPage() {
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

  // Pré-filtra IDs de cotações pertencentes à unidade ativa
  let cotIdsParaUnidade: string[] | null = null;
  if (unidadeId) {
    const { data: cotUnidades } = await supabase
      .from("cotacao_unidades")
      .select("cotacao_id")
      .eq("unidade_id", unidadeId);
    cotIdsParaUnidade = (cotUnidades ?? []).map((c) => c.cotacao_id);
  }

  const [
    { data: cotacoes },
    { data: requisicoes },
  ] = await Promise.all([
    (() => {
      let q = supabase
        .from("cotacoes")
        .select(
          `id, numero, titulo, status, urgente, valor_estimado, economia, economia_pct,
           prazo, created_at, ai_resumo, ai_analisada_em,
           comprador:user_profiles!comprador_id(nome, avatar_url),
           cotacao_unidades(unidade_id, unidades(nome, slug)),
           cotacao_itens(id),
           cotacao_fornecedores(fornecedor_id)`,
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      // Aplica filtro por unidade quando selecionada
      if (cotIdsParaUnidade !== null) {
        q = cotIdsParaUnidade.length > 0
          ? q.in("id", cotIdsParaUnidade)
          : q.in("id", ["00000000-0000-0000-0000-000000000000"]); // nenhum resultado
      }
      return q;
    })(),

    supabase
      .from("requisicoes")
      .select("id, numero, titulo, status")
      .in("status", ["rascunho", "aguardando_cotacao", "cotacao"])
      .order("created_at", { ascending: false }),
  ]);

  return (
    <CotacoesClient
      cotacoes={cotacoes ?? []}
      requisicoes={requisicoes ?? []}
    />
  );
}
