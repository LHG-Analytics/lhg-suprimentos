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
    { data: pedidosDaCotacao },
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
           id, quantidade, melhor_forn, selecionado_forn, produto_nome_livre, produto_unidade_med, produto_novo,
           produtos(id, codigo, nome, unidade_med, categoria, omie_codigo),
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

    // Pedidos já emitidos desta cotação — ela pode ser fechada em rodadas (um
    // fornecedor agora, o resto depois), então a UI precisa marcar o que já saiu.
    // `pedido_itens.cotacao_item_id` (migration 0025) é a fonte de verdade de
    // "este item já virou pedido": a seleção na matriz é mutável e não serve.
    supabase
      .from("pedidos")
      .select("id, numero, fornecedor_id, pedido_itens(cotacao_item_id)")
      .eq("cotacao_id", id),
  ]);

  if (!cotacao) notFound();

  const pedidos = pedidosDaCotacao ?? [];
  const itensJaPedidos = pedidos
    .flatMap(p => (p.pedido_itens ?? []) as { cotacao_item_id: string | null }[])
    .map(pi => pi.cotacao_item_id)
    .filter((v): v is string => !!v);

  return (
    <CotacaoDetalheClient
      cotacao={cotacao as any}
      todosFornecedores={fornecedores}
      pedidosGerados={pedidos.map(({ id: pid, numero, fornecedor_id }) => ({ id: pid, numero, fornecedor_id }))}
      itensJaPedidos={itensJaPedidos}
    />
  );
}
