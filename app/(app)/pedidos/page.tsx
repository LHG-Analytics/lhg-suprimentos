/**
 * app/(app)/pedidos/page.tsx — LHG-214/215
 * Página de Pedidos de Compra.
 * Layout 2-col: lista à esquerda, detalhe + timeline à direita.
 * Inclui aba "Pedidos Omie" com pedidos sincronizados do ERP (migration 0016).
 */
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PedidosClient } from "./_components/pedidos-client";

export default async function PedidosPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: pedidos }, { data: omie_pedidos }, { data: unidades }] = await Promise.all([
    supabase
      .from("pedidos")
      .select(`
        id, numero, status, valor_total, condicao_pgto, entrega_prev,
        created_at, email_enviado_em, omie_status, omie_codigo,
        comprador:user_profiles!comprador_id(nome, avatar_url),
        aprovador:user_profiles!aprovador_id(nome),
        fornecedores(id, razao_social, nome_fantasia, email, rating, pontualidade_pct),
        cotacoes(id, numero, titulo),
        pedido_itens(
          id, quantidade, preco_unitario, valor_total,
          produtos(id, nome, codigo, unidade_med, categoria)
        ),
        pedido_eventos(
          id, tipo, texto, created_at, autor_nome,
          autor:user_profiles!autor_id(nome, avatar_url)
        )
      `)
      .order("created_at", { ascending: false }),

    // Pedidos sincronizados do Omie ERP (tabela espelho)
    supabase
      .from("omie_pedidos_compra")
      .select(`
        id, omie_codigo, numero, data_pedido, data_previsao,
        fornecedor_nome, valor_total, situacao, situacao_aprovacao,
        etapa, numero_pedido_forn, omie_sincronizado_em, unidade_id,
        unidades(nome, slug)
      `)
      .order("numero", { ascending: false }),

    // Unidades para exibir o filtro na aba Omie
    supabase
      .from("unidades")
      .select("id, nome, slug")
      .eq("ativa", true)
      .order("nome"),
  ]);

  return (
    <PedidosClient
      pedidos={pedidos ?? []}
      omie_pedidos={omie_pedidos ?? []}
      unidades={unidades ?? []}
    />
  );
}
