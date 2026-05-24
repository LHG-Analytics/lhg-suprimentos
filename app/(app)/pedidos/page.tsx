/**
 * app/(app)/pedidos/page.tsx — LHG-214/215
 * Página de Pedidos de Compra.
 * Layout 2-col: lista à esquerda, detalhe + timeline à direita.
 */
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PedidosClient } from "./_components/pedidos-client";

export default async function PedidosPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: pedidos } = await supabase
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
    .order("created_at", { ascending: false });

  return <PedidosClient pedidos={pedidos ?? []} />;
}
