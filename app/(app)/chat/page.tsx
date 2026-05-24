/**
 * app/(app)/chat/page.tsx — LHG-218
 * Assistente IA de Compras com streaming via OpenRouter.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatClient } from "./_components/chat-client";

export default async function ChatPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Contexto enriquecido para o sistema IA
  const [{ data: cotacoesAtivas }, { data: pedidosPendentes }, { data: topFornecedores }] = await Promise.all([
    supabase
      .from("cotacoes")
      .select("numero, titulo, status, valor_estimado, economia")
      .in("status", ["cotacao", "pendente"])
      .order("created_at", { ascending: false })
      .limit(5),

    supabase
      .from("pedidos")
      .select("numero, valor_total, status, fornecedores(nome_fantasia, razao_social)")
      .eq("status", "aguardando_aprovacao")
      .limit(5),

    supabase
      .from("fornecedores")
      .select("razao_social, nome_fantasia, rating, pontualidade_pct, categoria")
      .eq("ativo", true)
      .order("rating", { ascending: false })
      .limit(10),
  ]);

  // Montar contexto textual para injetar no system prompt
  const contextoLinhas: string[] = [];

  if (cotacoesAtivas?.length) {
    contextoLinhas.push("## Cotações em andamento:");
    cotacoesAtivas.forEach(c => {
      contextoLinhas.push(`- ${c.numero}: ${c.titulo} (status: ${c.status}, estimado: R$ ${(c.valor_estimado ?? 0).toFixed(2)}, economia IA: R$ ${(c.economia ?? 0).toFixed(2)})`);
    });
  }

  if (pedidosPendentes?.length) {
    contextoLinhas.push("\n## Pedidos aguardando aprovação:");
    pedidosPendentes.forEach(p => {
      const forn = (p.fornecedores as { razao_social: string; nome_fantasia: string | null } | null);
      contextoLinhas.push(`- ${p.numero}: R$ ${p.valor_total.toFixed(2)} — ${forn?.nome_fantasia ?? forn?.razao_social ?? "fornecedor"}`);
    });
  }

  if (topFornecedores?.length) {
    contextoLinhas.push("\n## Melhores fornecedores cadastrados:");
    topFornecedores.forEach(f => {
      contextoLinhas.push(`- ${f.nome_fantasia ?? f.razao_social} (rating: ${f.rating?.toFixed(1) ?? "—"}, pontualidade: ${f.pontualidade_pct ?? "—"}%, categoria: ${f.categoria ?? "—"})`);
    });
  }

  return (
    <ChatClient contexto={contextoLinhas.join("\n")} />
  );
}
