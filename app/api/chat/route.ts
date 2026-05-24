/**
 * app/api/chat/route.ts — LHG-218
 * Rota de streaming para o Assistente IA via OpenRouter.
 * Usa a API OpenAI-compatible do OpenRouter com stream: true.
 */
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { fetchOrcamento, formatBudgetContextoIA } from "@/lib/sheets/client";

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

  const { messages, contexto } = await req.json() as {
    messages: Message[];
    contexto?: string;
  };

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("[chat] OPENROUTER_API_KEY não configurada");
    return new Response("OPENROUTER_API_KEY não configurada", { status: 503 });
  }

  // Busca contexto de orçamento da planilha (com cache de 1h via Next.js Data Cache)
  const sheetId   = process.env.GOOGLE_SHEET_ID ?? "";
  const sheetName = process.env.GOOGLE_SHEET_NAME ?? "Custos";
  const orcamento = sheetId ? await fetchOrcamento(sheetId, sheetName).catch((e) => {
    console.warn("[chat] Falha ao carregar orçamento:", e);
    return null;
  }) : null;
  const budgetCtx = formatBudgetContextoIA(orcamento);

  // System prompt com contexto do LHG + orçamento dinâmico
  const systemPrompt = `Você é o Assistente IA de Compras do LHG Suprimentos — um sistema de gestão de compras para hotéis.
Você ajuda compradores e gestores a tomar decisões mais inteligentes sobre cotações, fornecedores, pedidos e custos.

Habilidades principais:
- Analisar cotações e sugerir o melhor mix de fornecedores
- Comparar preços e identificar economias potenciais
- Verificar inconsistências em pedidos e notas fiscais
- Sugerir substituição de produtos por alternativas de custo menor
- Interpretar dados de pontualidade e rating de fornecedores
- Calcular totais, médias e variações de custo
${budgetCtx}
Tom: profissional, direto e factual. Use dados quando disponíveis.
Formate respostas com bullet points e valores monetários em Real brasileiro (R$).
${contexto ? `\nContexto atual do usuário:\n${contexto}` : ""}`;

  const payload = {
    model:    process.env.OPENROUTER_MODEL ?? "anthropic/claude-haiku-4-5",
    stream:   true,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
    max_tokens: 1024,
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
