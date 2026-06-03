/**
 * app/(app)/requisicoes/[id]/page.tsx — Fase 1
 */
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
         produtos(id, nome, unidade_med, preco_custo)
       )`,
    )
    .eq("id", id)
    .single();

  if (!req) notFound();

  const unidades = req.requisicao_unidades as Array<{
    unidade_id: string;
    unidades: { id: string; nome: string } | null;
  }>;

  return (
    <RequisicaoDetalhe
      req={req as never}
      unidadeId={unidades[0]?.unidade_id ?? ""}
    />
  );
}
