/**
 * app/(app)/requisicoes/[id]/page.tsx — Fase 1
 */
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { RequisicaoDetalhe } from "./_components/requisicao-detalhe";

interface Props { params: Promise<{ id: string }> }

export default async function RequisicaoPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: req } = await supabase
    .from("requisicoes")
    .select(
      `id, numero, titulo, urgencia, status, origem, justificativa,
       valor_estimado, created_at, omie_codigo,
       requisicao_unidades(unidade_id, unidades(id, nome)),
       requisicao_itens(
         id, quantidade, observacao, produto_novo,
         produto_nome_livre, produto_unidade_med,
         produtos(id, nome, unidade_med, preco_custo, categoria)
       )`,
    )
    .eq("id", id)
    .single();

  if (!req) notFound();

  const unidades = req.requisicao_unidades as Array<{
    unidade_id: string;
    unidades: { id: string; nome: string } | null;
  }>;
  const unidadeId = unidades[0]?.unidade_id ?? "";

  /*
   * Catálogo para o modal "Adicionar item", restrito à unidade da requisição —
   * o catálogo é por unidade (`omie_unidade_id`, migration 0014) e são 3.384
   * produtos no total. fetchAllRows porque o PostgREST corta em 1.000 linhas.
   */
  const produtos = unidadeId
    ? await fetchAllRows((from, to) =>
        supabase
          .from("produtos")
          .select("id, codigo, nome, unidade_med, categoria")
          .eq("ativo", true)
          .eq("omie_unidade_id", unidadeId)
          .order("nome")
          .order("id")
          .range(from, to),
      )
    : [];

  return (
    <RequisicaoDetalhe
      req={req as never}
      unidadeId={unidadeId}
      produtos={produtos ?? []}
    />
  );
}
