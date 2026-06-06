/**
 * app/(app)/chat/page.tsx — LHG-218 / LHG-230
 * Assistente IA de Compras com streaming via OpenRouter e histórico de sessões.
 */
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ChatClient } from "./_components/chat-client";

export default async function ChatPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Unidade ativa (cookie)
  const cookieStore = await cookies();
  const slug = cookieStore.get("lhg-unidade-slug")?.value ?? "todas";

  let unidadeId: string | null = null;
  let unidadeNome: string | null = null;
  if (slug && slug !== "todas") {
    const { data: u } = await supabase
      .from("unidades")
      .select("id, nome")
      .eq("slug", slug)
      .single();
    unidadeId = u?.id ?? null;
    unidadeNome = u?.nome ?? null;
  }

  // Pré-busca IDs de pedidos da unidade ativa (via pedido_unidades)
  let pedidoIdsUnidade: string[] | null = null;
  if (unidadeId) {
    const { data: pu } = await supabase
      .from("pedido_unidades")
      .select("pedido_id")
      .eq("unidade_id", unidadeId);
    pedidoIdsUnidade = (pu ?? []).map(r => r.pedido_id);
  }

  // Pré-busca IDs de requisições da unidade ativa
  let reqIdsUnidade: string[] | null = null;
  if (unidadeId) {
    const { data: ru } = await supabase
      .from("requisicao_unidades")
      .select("requisicao_id")
      .eq("unidade_id", unidadeId);
    reqIdsUnidade = (ru ?? []).map(r => r.requisicao_id);
  }

  // Busca dados para o contexto da IA em paralelo
  const [
    { data: cotacoesAtivas },
    { data: pedidosPendentes },
    { data: pedidosRecentes },
    { data: topFornecedores },
    { data: requisicoes },
    { data: sessoes },
    { data: profile },
  ] = await Promise.all([
    // Cotações em andamento (sem deletadas)
    (() => {
      let q = supabase
        .from("cotacoes")
        .select("numero, titulo, status, valor_estimado, economia, created_at")
        .in("status", ["cotacao", "pendente"])
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(20);
      return q;
    })(),

    // Pedidos aguardando aprovação — filtrado por unidade
    (() => {
      let q = supabase
        .from("pedidos")
        .select("numero, valor_total, status, created_at, fornecedores(nome_fantasia, razao_social)")
        .eq("status", "aguardando_aprovacao")
        .order("created_at", { ascending: false })
        .limit(20);
      if (pedidoIdsUnidade !== null) {
        q = pedidoIdsUnidade.length > 0
          ? q.in("id", pedidoIdsUnidade)
          : q.in("id", ["00000000-0000-0000-0000-000000000000"]);
      }
      return q;
    })(),

    // Pedidos recentes (recebido/finalizado) — filtrado por unidade
    (() => {
      let q = supabase
        .from("pedidos")
        .select("numero, valor_total, status, created_at, fornecedores(nome_fantasia, razao_social)")
        .in("status", ["recebido", "finalizado"])
        .order("created_at", { ascending: false })
        .limit(10);
      if (pedidoIdsUnidade !== null) {
        q = pedidoIdsUnidade.length > 0
          ? q.in("id", pedidoIdsUnidade)
          : q.in("id", ["00000000-0000-0000-0000-000000000000"]);
      }
      return q;
    })(),

    // Top fornecedores — filtrado por unidade via fornecedor_unidade se ativo
    supabase
      .from("fornecedores")
      .select("razao_social, nome_fantasia, rating, pontualidade_pct, categoria")
      .eq("ativo", true)
      .order("rating", { ascending: false })
      .limit(20),

    // Requisições abertas — filtrado por unidade
    (() => {
      let q = supabase
        .from("requisicoes")
        .select("numero, titulo, status, valor_estimado, created_at")
        .in("status", ["rascunho", "cotacao", "pendente", "aguardando_cotacao"])
        .order("created_at", { ascending: false })
        .limit(15);
      if (reqIdsUnidade !== null) {
        q = reqIdsUnidade.length > 0
          ? q.in("id", reqIdsUnidade)
          : q.in("id", ["00000000-0000-0000-0000-000000000000"]);
      }
      return q;
    })(),

    supabase
      .from("ai_chat_sessions")
      .select("id, title, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(30),

    supabase
      .from("user_profiles")
      .select("nome")
      .eq("id", user.id)
      .single(),
  ]);

  // Montar contexto textual para injetar no system prompt
  const contextoLinhas: string[] = [];

  if (unidadeNome) {
    contextoLinhas.push(`## Unidade ativa: ${unidadeNome}`);
  } else {
    contextoLinhas.push("## Visão: Todas as unidades da rede LHG");
  }

  if (requisicoes?.length) {
    contextoLinhas.push("\n## Requisições em aberto:");
    requisicoes.forEach(r => {
      contextoLinhas.push(`- ${r.numero}: ${r.titulo} (status: ${r.status}, estimado: R$ ${(r.valor_estimado ?? 0).toFixed(2)})`);
    });
  }

  if (cotacoesAtivas?.length) {
    contextoLinhas.push("\n## Cotações em andamento:");
    cotacoesAtivas.forEach(c => {
      contextoLinhas.push(`- ${c.numero}: ${c.titulo} (status: ${c.status}, estimado: R$ ${(c.valor_estimado ?? 0).toFixed(2)}, economia: R$ ${(c.economia ?? 0).toFixed(2)})`);
    });
  }

  if (pedidosPendentes?.length) {
    contextoLinhas.push("\n## Pedidos aguardando aprovação:");
    pedidosPendentes.forEach(p => {
      const forn = (p.fornecedores as { razao_social: string; nome_fantasia: string | null } | null);
      contextoLinhas.push(`- ${p.numero}: R$ ${p.valor_total.toFixed(2)} — ${forn?.nome_fantasia ?? forn?.razao_social ?? "fornecedor"}`);
    });
  }

  if (pedidosRecentes?.length) {
    contextoLinhas.push("\n## Pedidos recentes (recebidos/finalizados):");
    pedidosRecentes.forEach(p => {
      const forn = (p.fornecedores as { razao_social: string; nome_fantasia: string | null } | null);
      contextoLinhas.push(`- ${p.numero}: R$ ${p.valor_total.toFixed(2)} — ${forn?.nome_fantasia ?? forn?.razao_social ?? "fornecedor"} (${p.status})`);
    });
  }

  if (topFornecedores?.length) {
    contextoLinhas.push("\n## Principais fornecedores:");
    topFornecedores.forEach(f => {
      contextoLinhas.push(`- ${f.nome_fantasia ?? f.razao_social} (rating: ${f.rating?.toFixed(1) ?? "—"}, pontualidade: ${f.pontualidade_pct ?? "—"}%, categoria: ${f.categoria ?? "—"})`);
    });
  }

  return (
    <ChatClient
      userId={user.id}
      userName={profile?.nome ?? ""}
      contexto={contextoLinhas.join("\n")}
      sessoesIniciais={sessoes ?? []}
    />
  );
}
