/**
 * app/api/chat/route.ts — LHG-218 / LHG-230
 * Rota de streaming para o Assistente IA via OpenRouter.
 * Usa a API OpenAI-compatible do OpenRouter com stream: true.
 */
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchOrcamento, formatBudgetContextoIA } from "@/lib/sheets/client";
import { getUnidadeSheetConfig } from "@/lib/sheets/get-unidade-sheet";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // Busca nome do usuário para personalização
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("nome")
    .eq("id", user.id)
    .single();
  const userName = profile?.nome ?? user.email?.split("@")[0] ?? "usuário";

  const { messages, contexto } = await req.json() as {
    messages: Message[];
    contexto?: string;
  };

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("[chat] OPENROUTER_API_KEY não configurada");
    return new Response("OPENROUTER_API_KEY não configurada", { status: 503 });
  }

  // Busca config do Google Sheets da unidade ativa (cookie → banco)
  const sheetConfig = await getUnidadeSheetConfig().catch(() => null);
  const orcamento   = sheetConfig
    ? await fetchOrcamento(sheetConfig.sheetId, sheetConfig.sheetName).catch((e) => {
        console.warn("[chat] Falha ao carregar orçamento:", e);
        return null;
      })
    : null;
  const budgetCtx = formatBudgetContextoIA(orcamento);

  // ── System prompt especializado ───────────────────────────────────────────
  const systemPrompt = `Você é a LHG IA — assistente especialista sênior em compras e suprimentos para hotéis da rede LHG (Lush Hotels Group).

Sua especialidade abrange:
- **Gestão de compras hoteleiras**: amenities, enxovais, produtos de limpeza, frigobar, manutenção predial e importados
- **Análise de cotações**: identificar o melhor mix de fornecedores balanceando preço, qualidade, prazo e confiabilidade
- **Controle de custos**: monitorar variações de preço, identificar desvios orçamentários, sugerir reduções sem perda de qualidade
- **Gestão de fornecedores**: avaliar rating, pontualidade, histórico de entregas e risco de dependência
- **Inteligência de mercado**: comparar preços de mercado, identificar sazonalidades e negociar melhores condições
- **Conformidade e auditoria**: verificar notas fiscais, detectar inconsistências, validar pedidos antes da aprovação
- **Planejamento**: sugerir pedidos antecipados baseados em histórico de consumo e lead time dos fornecedores

Características da sua resposta:
- Seja **direta, objetiva e factual** — use números e dados sempre que disponíveis
- **Personalize** pelo nome quando adequado (o usuário atual se chama **${userName}**)
- Use **bullet points** para listas de recomendações ou análises comparativas
- Formate valores monetários em **R$** com duas casas decimais
- Quando identificar um problema, sempre ofereça pelo menos **uma ação concreta** que o usuário pode tomar
- Se não tiver dados suficientes para uma recomendação segura, diga explicitamente e sugira o que verificar
- Use um tom **profissional mas acessível** — como um consultor experiente que conhece bem o negócio
${budgetCtx}
${contexto ? `\n## Contexto atual do sistema\n${contexto}` : ""}`;

  const payload = {
    model:    process.env.OPENROUTER_MODEL ?? "openai/gpt-4.1-mini",
    stream:   true,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
    max_tokens: 2048,
  };

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method:  "POST",
    headers: {
      "Authorization":        `Bearer ${apiKey}`,
      "Content-Type":         "application/json",
      "HTTP-Referer":         process.env.NEXT_PUBLIC_SITE_URL ?? "https://lhg-suprimentos.vercel.app",
      "X-Title":              "LHG Suprimentos",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`[chat] OpenRouter erro HTTP ${response.status}:`, err);
    return new Response(`Erro OpenRouter: ${err}`, { status: response.status });
  }

  // Repassar o stream SSE diretamente
  return new Response(response.body, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    },
  });
}
