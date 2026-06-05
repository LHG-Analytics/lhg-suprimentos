/**
 * app/(app)/cotacoes/page.tsx — LHG-210
 * Lista de cotações com mini-KPIs e tabela filtrada por status.
 * Server Component: busca dados no Supabase e passa ao client.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CotacoesClient } from "./_components/cotacoes-client";

export const metadata = { title: "Cotações" };

export default async function CotacoesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: cotacoes },
    { data: requisicoes },
  ] = await Promise.all([
    supabase
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
      .order("created_at", { ascending: false }),

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
