/**
 * app/(app)/requisicoes/page.tsx — LHG-209
 * Lista de requisições com filtros por status e wizard de criação.
 * Server Component: busca dados no Supabase e passa ao client.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RequisicoesClient } from "./_components/requisicoes-client";

export const metadata = { title: "Requisições" };

export default async function RequisicoesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: requisicoes },
    { data: unidades },
    { data: produtos },
  ] = await Promise.all([
    supabase
      .from("requisicoes")
      .select(
        `id, numero, titulo, urgencia, status, valor_estimado, created_at,
         solicitante:user_profiles!solicitante_id(nome, avatar_url),
         requisicao_unidades(unidade_id, unidades(nome, slug)),
         requisicao_itens(id)`,
      )
      .order("created_at", { ascending: false }),

    supabase
      .from("unidades")
      .select("id, nome, slug, cor_hex")
      .eq("ativa", true)
      .order("nome"),

    supabase
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
    />
  );
}
