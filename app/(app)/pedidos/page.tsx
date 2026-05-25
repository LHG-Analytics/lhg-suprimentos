/**
 * app/(app)/pedidos/page.tsx — LHG-214/215
 * Página de Pedidos de Compra.
 * Layout 2-col: lista à esquerda, detalhe + timeline à direita.
 * Inclui aba "Pedidos Omie" com pedidos sincronizados do ERP (migration 0016).
 * Pedidos Omie filtrados pela unidade ativa (cookie lhg-unidade-slug).
 */
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { PedidosClient } from "./_components/pedidos-client";

export default async function PedidosPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
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

  // Query de omie_pedidos filtrada pela unidade ativa
  // ⚠️ Supabase builder é imutável — cada .eq() retorna nova instância; reatribuição obrigatória
  let omieQuery = supabase
    .from("omie_pedidos_compra")
    .select(`
      id, omie_codigo, numero, data_pedido, data_previsao,
      fornecedor_nome, valor_total, situacao, situacao_aprovacao,
      etapa, numero_pedido_forn, omie_sincronizado_em, unidade_id,
      unidades(nome, slug)
    `)
    .order("numero", { ascending: false });

  if (unidadeId) omieQuery = omieQuery.eq("unidade_id", unidadeId);

  const [{ data: pedidos }, { data: omie_pedidos }] = await Promise.all([
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

    omieQuery,
  ]);

  return (
    <PedidosClient
      pedidos={pedidos ?? []}
      omie_pedidos={omie_pedidos ?? []}
    />
  );
}
