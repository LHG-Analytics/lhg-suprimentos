"use client";

/**
 * ai-chip.tsx — LHG-202
 * Botão flutuante que expande para painel de chat com IA.
 * Conectado na API real /api/chat (OpenRouter, streaming SSE).
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sparkles, X, ArrowUpRight, Send, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BREADCRUMB_MAP } from "./nav-config";
import { createClient } from "@/lib/supabase/client";

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

// ── Sugestões por contexto ─────────────────────────────────────────────────────
const SUGGESTIONS: Record<string, string[]> = {
  cotacao_detalhe: [
    "Qual fornecedor leva essa cotação considerando preço e prazo?",
    "Há discrepâncias grandes de preço entre fornecedores?",
    "Qual condição de pagamento é mais vantajosa?",
  ],
  "/cotacoes": [
    "Qual fornecedor tem melhor custo-benefício nas cotações abertas?",
    "Há oportunidade de consolidar pedidos?",
  ],
  "/dashboard": [
    "Qual fornecedor mais usado este mês?",
    "Onde posso economizar mais?",
  ],
  "/pedidos": [
    "Quais pedidos estão aguardando aprovação?",
    "Analise os pedidos recentes.",
  ],
  "/requisicoes": [
    "Quais requisições estão em aberto?",
    "Priorize as requisições urgentes.",
  ],
  default: [
    "Resuma o status atual das compras.",
    "Quais fornecedores têm melhor pontualidade?",
  ],
};

// ── Render markdown simples (bold + listas) ────────────────────────────────────
function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let listBuf: string[] = [];

  function flushList() {
    if (!listBuf.length) return;
    out.push(
      <ul key={`ul-${out.length}`} className="list-disc list-inside space-y-0.5 my-1">
        {listBuf.map((l, i) => <li key={i}>{renderInline(l)}</li>)}
      </ul>,
    );
    listBuf = [];
  }

  lines.forEach((line, idx) => {
    const li = line.match(/^\s*[-•]\s+(.+)$/) || line.match(/^\s*\d+\.\s+(.+)$/);
    if (li) {
      listBuf.push(li[1]);
    } else {
      flushList();
      if (line.trim() === "") out.push(<div key={idx} className="h-1.5" />);
      else out.push(<div key={idx}>{renderInline(line)}</div>);
    }
  });
  flushList();
  return out;
}

function renderInline(s: string) {
  const parts = s.split(/(\*\*[^*]+\*\*)/);
  return parts.map((p, i) =>
    p.startsWith("**") ? (
      <strong key={i} className="text-foreground font-semibold">
        {p.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

// ── Helper: monta contexto rico da matriz de cotação + histórico de preços ────
async function fetchCotacaoContext(cotacaoId: string): Promise<string> {
  const supabase = createClient();

  // Busca cotação completa + ai_resumo
  const { data } = await supabase
    .from("cotacoes")
    .select(`
      numero, titulo, status, urgente, valor_estimado, economia, prazo, ai_resumo,
      cotacao_fornecedores(fornecedores(id, razao_social, nome_fantasia, rating, pontualidade_pct)),
      cotacao_itens(
        id, quantidade,
        produto_id,
        produtos(nome, unidade_med, categoria),
        cotacao_matriz(fornecedor_id, preco_unitario, prazo_entrega_dias, condicao_pagamento, observacao)
      )
    `)
    .eq("id", cotacaoId)
    .single();

  if (!data) return "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = data as any;
  const fornMap = new Map<string, string>(
    (c.cotacao_fornecedores ?? []).map((cf: any) => [
      cf.fornecedores?.id,
      cf.fornecedores?.nome_fantasia ?? cf.fornecedores?.razao_social ?? "?",
    ])
  );

  // Extrai IDs de produtos desta cotação para buscar histórico
  const produtoIds: string[] = (c.cotacao_itens ?? [])
    .map((i: any) => i.produto_id)
    .filter(Boolean);

  // Busca histórico de preços dos últimos 6 meses para estes produtos
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let historicoMap = new Map<string, { precos: number[]; fornecedores: string[] }>();
  if (produtoIds.length > 0) {
    const seisM = new Date();
    seisM.setMonth(seisM.getMonth() - 6);

    const { data: histData } = await supabase
      .from("cotacao_itens")
      .select(`
        produto_id,
        produtos(nome),
        cotacao_id,
        cotacoes!inner(created_at, status),
        cotacao_matriz(preco_unitario, fornecedor_id, fornecedores(nome_fantasia, razao_social))
      `)
      .in("produto_id", produtoIds)
      .neq("cotacao_id", cotacaoId)
      .eq("cotacoes.status", "aprovado")
      .gte("cotacoes.created_at", seisM.toISOString())
      .order("cotacoes.created_at", { ascending: false })
      .limit(200);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (histData ?? []) as any[]) {
      const prodNome = row.produtos?.nome ?? row.produto_id;
      if (!historicoMap.has(prodNome)) {
        historicoMap.set(prodNome, { precos: [], fornecedores: [] });
      }
      const entry = historicoMap.get(prodNome)!;
      for (const m of (row.cotacao_matriz ?? [])) {
        if (m.preco_unitario) {
          entry.precos.push(Number(m.preco_unitario));
          const fornNome = m.fornecedores?.nome_fantasia ?? m.fornecedores?.razao_social ?? "";
          if (fornNome && !entry.fornecedores.includes(fornNome)) {
            entry.fornecedores.push(fornNome);
          }
        }
      }
    }
  }

  // Monta o contexto
  const linhas: string[] = [
    `## Cotação ${c.numero}: ${c.titulo}`,
    `Status: ${c.status}${c.urgente ? " · URGENTE" : ""}`,
    c.prazo ? `Prazo: ${c.prazo}` : "",
    c.valor_estimado ? `Valor estimado: R$ ${Number(c.valor_estimado).toFixed(2)}` : "",
    c.economia ? `Economia IA calculada: R$ ${Number(c.economia).toFixed(2)}` : "",
  ].filter(Boolean);

  // Inclui resumo IA já calculado, se disponível
  if (c.ai_resumo) {
    linhas.push("", "### Análise IA anterior:", c.ai_resumo);
  }

  linhas.push("", "### Matriz de preços por item e fornecedor:");

  for (const item of (c.cotacao_itens ?? [])) {
    const prod = item.produtos as any;
    if (!prod) continue;

    // Preço histórico deste produto
    const hist = historicoMap.get(prod.nome);
    let histInfo = "";
    if (hist && hist.precos.length > 0) {
      const min  = Math.min(...hist.precos);
      const max  = Math.max(...hist.precos);
      const avg  = hist.precos.reduce((a: number, b: number) => a + b, 0) / hist.precos.length;
      histInfo   = ` [Histórico 6m: mín R$${min.toFixed(2)} · méd R$${avg.toFixed(2)} · máx R$${max.toFixed(2)}]`;
    }

    linhas.push(`\n**${prod.nome}** (${(item as any).quantidade} ${prod.unidade_med}) — ${prod.categoria}${histInfo}`);

    for (const m of ((item as any).cotacao_matriz ?? [])) {
      const fornNome  = fornMap.get(m.fornecedor_id) ?? m.fornecedor_id;
      const preco     = m.preco_unitario ? `R$ ${Number(m.preco_unitario).toFixed(2)}/un` : "sem preço";
      const prazo     = m.prazo_entrega_dias ? `${m.prazo_entrega_dias}d` : "";
      const pgto      = m.condicao_pagamento ?? "";
      const obs       = m.observacao ? ` (${m.observacao})` : "";

      // Indicador vs histórico
      let vsHist = "";
      if (hist && hist.precos.length > 0 && m.preco_unitario) {
        const avg    = hist.precos.reduce((a: number, b: number) => a + b, 0) / hist.precos.length;
        const diff   = ((Number(m.preco_unitario) - avg) / avg) * 100;
        if (Math.abs(diff) >= 5) {
          vsHist = diff > 0 ? ` ↑${diff.toFixed(0)}% vs histórico` : ` ↓${Math.abs(diff).toFixed(0)}% vs histórico`;
        }
      }

      linhas.push(`  - ${fornNome}: ${preco}${prazo ? ` · ${prazo}` : ""}${pgto ? ` · ${pgto}` : ""}${vsHist}${obs}`);
    }
  }

  return linhas.join("\n");
}

// ── Persistência de histórico do chip (localStorage) ─────────────────────────
const CHIP_STORAGE_KEY = "lhg-chip-history-v1";
const CHIP_TTL_MS      = 24 * 60 * 60 * 1000; // 24h

function loadChipHistory(): Message[] {
  try {
    const raw = localStorage.getItem(CHIP_STORAGE_KEY);
    if (!raw) return [];
    const { messages, ts } = JSON.parse(raw) as { messages: Message[]; ts: number };
    if (Date.now() - ts > CHIP_TTL_MS) { localStorage.removeItem(CHIP_STORAGE_KEY); return []; }
    return messages.slice(-30); // máx 30 mensagens
  } catch { return []; }
}

function saveChipHistory(messages: Message[]) {
  try {
    localStorage.setItem(CHIP_STORAGE_KEY, JSON.stringify({ messages: messages.slice(-30), ts: Date.now() }));
  } catch { /* storage cheio — ignora */ }
}

// ── Componente principal ───────────────────────────────────────────────────────
export function AiChip() {
  const [open, setOpen]             = useState(false);
  const [input, setInput]           = useState("");
  const [streaming, setStreaming]   = useState(false);
  const [cotacaoCtx, setCotacaoCtx] = useState<string>("");
  const [messages, setMessages]     = useState<Message[]>([]);
  const [histLoaded, setHistLoaded] = useState(false);
  const scrollRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);
  const abortRef   = useRef<AbortController | null>(null);
  const pathname   = usePathname();
  const router     = useRouter();

  // Carrega histórico do localStorage uma única vez na montagem
  useEffect(() => {
    if (!histLoaded) {
      const hist = loadChipHistory();
      if (hist.length > 0) setMessages(hist);
      setHistLoaded(true);
    }
  }, [histLoaded]);

  // Detecta se está na página de detalhe de cotação e busca o contexto da matriz
  const cotacaoMatch = pathname.match(/^\/cotacoes\/([a-f0-9-]{36})$/);

  const suggestions  = cotacaoMatch
    ? SUGGESTIONS.cotacao_detalhe
    : SUGGESTIONS[pathname] ?? SUGGESTIONS.default;
  const contextLabel = BREADCRUMB_MAP[pathname]?.[BREADCRUMB_MAP[pathname].length - 1] ?? "Dashboard";
  const boasVindas   = cotacaoCtx
    ? "Matriz desta cotação carregada. Posso comparar preços entre fornecedores, analisar condições de pagamento e recomendar a melhor escolha. O que quer saber?"
    : "Olá! Sou o copiloto de compras da LHG. Posso analisar cotações, fornecedores e pedidos usando os dados reais do sistema. Em que posso ajudar?";
  const fetchCotacaoCtx = useCallback(async (id: string) => {
    const ctx = await fetchCotacaoContext(id);
    setCotacaoCtx(ctx);
  }, []);

  useEffect(() => {
    if (cotacaoMatch?.[1]) {
      fetchCotacaoCtx(cotacaoMatch[1]);
      // Em cotação: inicia conversa limpa (contexto específico da cotação)
      setMessages([]);
    } else {
      setCotacaoCtx("");
      // Em outras páginas: restaura histórico persistido
      const hist = loadChipHistory();
      if (hist.length > 0) setMessages(hist);
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Salva histórico no localStorage sempre que mensagens mudam (exceto em cotação)
  useEffect(() => {
    if (!cotacaoMatch && histLoaded && messages.length > 0) {
      saveChipHistory(messages);
    }
  }, [messages, cotacaoMatch, histLoaded]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-focus ao abrir
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // ⌘/ para abrir/fechar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  async function send(raw?: string) {
    const txt = (raw ?? input).trim();
    if (!txt || streaming) return;

    const userMsg: Message = { role: "user", content: txt };
    const history = [...messages, userMsg].filter(m => !m.streaming);

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setStreaming(true);

    // Placeholder de streaming
    setMessages(prev => [...prev, { role: "assistant", content: "", streaming: true }]);

    try {
      abortRef.current = new AbortController();

      const res = await fetch("/api/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          messages: history.map(m => ({ role: m.role, content: m.content })),
          contexto: cotacaoCtx
            ? `Contexto atual: ${contextLabel}\n\n${cotacaoCtx}`
            : `Contexto atual da tela: ${contextLabel}`,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Erro ${res.status}`);
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;

          try {
            const json  = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content ?? "";
            if (delta) {
              acc += delta;
              setMessages(prev => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: acc, streaming: true };
                return copy;
              });
            }
          } catch {
            // linha SSE inválida — ignorar
          }
        }
      }

      // Finaliza stream
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: acc, streaming: false };
        return copy;
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role:    "assistant",
          content: "Erro ao conectar com a IA. Tente novamente.",
          streaming: false,
        };
        return copy;
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  return (
    <>
      {/* ── Botão flutuante ─────────────────────────────────────────── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={cn(
            "fixed bottom-5 right-5 z-40 group",
            "flex items-center gap-2 h-11 pl-3 pr-3.5 rounded-full",
            "bg-card border border-border/70",
            "hover:border-lhg-500/50",
            "shadow-[0_8px_30px_rgba(0,0,0,.5),inset_0_1px_0_rgba(255,255,255,.04)]",
            "transition-colors",
          )}
          aria-label="Abrir assistente IA"
        >
          <span className="w-6 h-6 rounded-full bg-gradient-to-br from-lhg-400 to-lhg-600 flex items-center justify-center text-zinc-950">
            <Sparkles size={13} strokeWidth={2.25} />
          </span>
          <span className="text-sm font-medium text-foreground">Assistente IA</span>
          <span className="ml-1 flex items-center gap-0.5">
            <kbd className="inline-flex h-4 items-center rounded border border-border bg-muted px-1.5 font-mono text-[9px] text-muted-foreground">Ctrl</kbd>
            <kbd className="inline-flex h-4 items-center rounded border border-border bg-muted px-1 font-mono text-[9px] text-muted-foreground">/</kbd>
          </span>
        </button>
      )}

      {/* ── Painel de chat ──────────────────────────────────────────── */}
      {open && (
        <div
          className={cn(
            "fixed bottom-5 right-5 z-40",
            "w-[420px] h-[560px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)]",
            "rounded-xl border border-border bg-background shadow-2xl",
            "flex flex-col overflow-hidden",
            "animate-in fade-in slide-in-from-bottom-2 duration-200",
          )}
        >
          {/* Header */}
          <div className="h-12 px-3 border-b border-border/80 flex items-center gap-2.5 shrink-0">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-lhg-400 to-lhg-600 flex items-center justify-center text-zinc-950 shrink-0">
              <Sparkles size={13} strokeWidth={2.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground leading-tight">Assistente IA</div>
              <div className="text-[10px] text-muted-foreground leading-tight flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-lhg-500 shrink-0" />
                <span className="truncate">Contexto: <span className="text-muted-foreground">{contextLabel}</span></span>
              </div>
            </div>
            <button
              onClick={() => router.push("/chat")}
              className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              title="Abrir chat completo"
            >
              <ArrowUpRight size={13} />
            </button>
            {messages.length > 0 && (
              <button
                onClick={() => { setMessages([]); localStorage.removeItem(CHIP_STORAGE_KEY); }}
                className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Limpar conversa"
              >
                <Trash2 size={13} />
              </button>
            )}
            <button
              onClick={() => { abortRef.current?.abort(); setOpen(false); }}
              className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <X size={13} />
            </button>
          </div>

          {/* Mensagens */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {/* Mensagem de boas-vindas sempre visível no topo */}
            <div className="flex gap-2">
              <div className="w-6 h-6 shrink-0 rounded-full bg-gradient-to-br from-lhg-400 to-lhg-600 flex items-center justify-center text-zinc-950 mt-0.5">
                <Sparkles size={11} strokeWidth={2.5} />
              </div>
              <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed break-words bg-muted/40 border border-border/80 text-foreground">
                {renderMarkdown(boasVindas)}
              </div>
            </div>
            {messages.map((msg, i) => (
              <div key={i} className={cn("flex gap-2", msg.role === "user" && "justify-end")}>
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 shrink-0 rounded-full bg-gradient-to-br from-lhg-400 to-lhg-600 flex items-center justify-center text-zinc-950 mt-0.5">
                    <Sparkles size={11} strokeWidth={2.5} />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed break-words",
                    msg.role === "user"
                      ? "bg-muted text-foreground"
                      : "bg-muted/40 border border-border/80 text-foreground",
                  )}
                >
                  {renderMarkdown(msg.content)}
                  {msg.streaming && (
                    <span className="inline-block w-0.5 h-3.5 bg-lhg-400 animate-pulse ml-0.5 align-middle" />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Sugestões */}
          {messages.length === 0 && (
            <div className="px-3 pb-2 space-y-1.5 shrink-0">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => send(s)}
                  className="w-full text-left text-xs px-2.5 py-1.5 rounded-md border border-border/80 bg-muted/40 hover:bg-muted/60 text-foreground/80 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-2.5 border-t border-border/80 shrink-0">
            <div className="flex items-center gap-1.5 rounded-lg bg-muted/60 border border-border/80 px-2 focus-within:border-lhg-500/40 focus-within:ring-1 focus-within:ring-lhg-500/20 transition-all">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                placeholder="Pergunte ao copiloto…"
                className="flex-1 bg-transparent h-9 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || streaming}
                className={cn(
                  "w-7 h-7 rounded-md flex items-center justify-center transition-colors",
                  input.trim() && !streaming
                    ? "bg-lhg-500 text-zinc-950 hover:bg-lhg-400"
                    : "text-muted-foreground/70 cursor-not-allowed",
                )}
              >
                <Send size={13} />
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground/70 text-center">
              Powered by OpenRouter · GPT-4.1 mini
            </p>
          </div>
        </div>
      )}
    </>
  );
}
