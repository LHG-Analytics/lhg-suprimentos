/**
 * app/(app)/cotacoes/[id]/page.tsx — LHG-211
 * Detalhe da cotação: header + banner IA + matriz comparativa.
 * Server Component: busca todos os dados necessários e passa ao client.
 */
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { CotacaoDetalheClient } from "./_components/cotacao-detalhe-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CotacaoDetalhePage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: cotacao },
    fornecedores,
  ] = await Promise.all([
    supabase
      .from("cotacoes")
      .select(
        `id, numero, titulo, status, urgente, valor_estimado, economia, economia_pct,
         prazo, created_at, ai_resumo, ai_analisada_em,
         comprador:user_profiles!comprador_id(nome, avatar_url),
         cotacao_unidades(unidade_id, unidades(nome, slug)),
         cotacao_fornecedores(fornecedor_id, fornecedores(id, razao_social, nome_fantasia, rating, pontualidade_pct, omie_codigo, email, telefone, contato)),
         cotacao_itens(
           id, quantidade, melhor_forn, selecionado_forn,
           produtos(id, codigo, nome, unidade_med, categoria),
           cotacao_matriz(cotacao_item_id, fornecedor_id, preco_unitario, prazo_entrega_dias, condicao_pagamento, observacao, frete, garantia)
         )`,
      )
      .eq("id", id)
      .single(),

    // fetchAllRows: PostgREST trava em 1000 linhas (max-rows) — garante a lista completa
    fetchAllRows((from, to) =>
      supabase
        .from("fornecedores")
        .select("id, razao_social, nome_fantasia, rating, pontualidade_pct, categoria")
        .eq("ativo", true)
        .order("razao_social")
        .order("id")
        .range(from, to),
    ),
  ]);

  if (!cotacao) notFound();

  return (
    <CotacaoDetalheClient
      cotacao={cotacao as any}
      todosFornecedores={fornecedores}
    />
  );
}
