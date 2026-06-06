"use client";

/**
 * ai-chip.tsx — LHG-202
 * Botão flutuante que expande para painel de chat com IA.
 * Conectado na API real /api/chat (OpenRouter, streaming SSE).
 */

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sparkles, X, ArrowUpRight, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { BREADCRUMB_MAP } from "./nav-config";

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

// ── Sugestões por contexto ─────────────────────────────────────────────────────
const SUGGESTIONS: Record<string, string[]> = {
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

// ── Componente principal ───────────────────────────────────────────────────────
export function AiChip() {
  const [open, setOpen]       = useState(false);
  const [input, setInput]     = useState("");
  const [streaming, setStreaming] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Olá! Sou o copiloto de compras da LHG. Posso analisar cotações, fornecedores e pedidos usando os dados reais do sistema. Em que posso ajudar?",
    },
  ]);
  const scrollRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);
  const abortRef   = useRef<AbortController | null>(null);
  const pathname   = usePathname();
  const router     = useRouter();

  const suggestions  = SUGGESTIONS[pathname] ?? SUGGESTIONS.default;
  const contextLabel = BREADCRUMB_MAP[pathname]?.[BREADCRUMB_MAP[pathname].length - 1] ?? "Dashboard";

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
          contexto: `Contexto atual da tela: ${contextLabel}`,
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
              title="Abrir página completa"
            >
              <ArrowUpRight size={13} />
            </button>
            <button
              onClick={() => { abortRef.current?.abort(); setOpen(false); }}
              className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <X size={13} />
            </button>
          </div>

          {/* Mensagens */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
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
          {messages.length <= 1 && (
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
