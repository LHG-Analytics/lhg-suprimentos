"use client";

/**
 * ai-chip.tsx — LHG-202
 * Botão flutuante bottom-right que expande para painel de chat com IA.
 * Sprint 0: UI + simulação de streaming (sem API real — conectar no LHG-210).
 */

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sparkles, X, ArrowUpRight, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { BREADCRUMB_MAP } from "./nav-config";

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Message {
  role: "user" | "ai";
  text: string;
  streaming?: boolean;
}

// ── Sugestões por contexto ─────────────────────────────────────────────────────
const SUGGESTIONS: Record<string, string[]> = {
  "/cotacoes": [
    "Por que essa cotação está mais cara que a anterior?",
    "Qual fornecedor tem melhor custo-benefício?",
    "Há oportunidade de consolidar pedidos?",
  ],
  "/dashboard": [
    "Qual fornecedor mais usado este mês?",
    "Onde posso economizar mais?",
    "Quais cotações vencem esta semana?",
  ],
  default: [
    "Por que essa cotação está mais cara que a anterior?",
    "Qual fornecedor mais usado em maio?",
    "Sugira economia para a unidade Lush Ipiranga",
  ],
};

// Resposta mock para demo Sprint 0
const MOCK_REPLIES: Record<string, string> = {
  "por que essa cotação está mais cara que a anterior?":
    "O ticket médio subiu **8,4%** vs. abril. Os maiores ofensores foram:\n\n1. **Toalha banhão felpa** — +12% (Texlar repassou aumento de algodão)\n2. **Sabonete refil 5L** — +6% (Higipack)\n\nSugiro renegociar com Texlar usando a cotação concorrente da Império Têxtil como benchmark.",
  "qual fornecedor mais usado em maio?":
    "**Higipack Distribuidora** liderou maio com **R$ 42.180** em 9 pedidos (28% do volume total). Em seguida vêm Texlar (R$ 31.420) e Bebidas RT (R$ 22.800).",
  "sugira economia para a unidade lush ipiranga":
    "Identifiquei **3 oportunidades** em Lush Ipiranga (~R$ 4.800/mês):\n\n- **Amenities**: trocar Higipack por Aurora em sabonete refil — economia de R$ 1.840/mês\n- **Frigobar**: consolidar pedido com Lush Vila Mariana — frete dividido, R$ 1.200/mês\n- **Lençóis**: padronizar 250 fios em vez de 300 fios — R$ 1.760/mês",
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
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "ai",
      text: "Olá! Sou o copiloto de compras. Posso comparar preços, sugerir o melhor mix de fornecedores ou explicar uma cotação. Em que posso ajudar?",
    },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  const suggestions = SUGGESTIONS[pathname] ?? SUGGESTIONS.default;
  const contextLabel =
    BREADCRUMB_MAP[pathname]?.[BREADCRUMB_MAP[pathname].length - 1] ?? "Dashboard";

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

    setMessages((m) => [...m, { role: "user", text: txt }]);
    setInput("");
    setStreaming(true);

    const reply =
      MOCK_REPLIES[txt.toLowerCase()] ??
      `Analisando dados de cotações e pedidos para responder sobre "${txt}"…\n\nCom base no contexto atual (${contextLabel}), recomendo priorizar o fornecedor com melhor combinação de preço, prazo e pontualidade. Quer que eu detalhe item por item?`;

    // Streaming token a token
    let acc = "";
    setMessages((m) => [...m, { role: "ai", text: "", streaming: true }]);
    const tokens = reply.split(/(\s+)/);
    for (let i = 0; i < tokens.length; i++) {
      await new Promise((r) => setTimeout(r, 18 + Math.random() * 35));
      acc += tokens[i];
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "ai", text: acc, streaming: i < tokens.length - 1 };
        return copy;
      });
    }
    setStreaming(false);
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
          <span className="text-sm font-medium text-foreground group-hover:text-foreground">
            Assistente IA
          </span>
          <span className="ml-1 flex items-center gap-0.5">
            <kbd className="inline-flex h-4 items-center rounded border border-border bg-muted px-1 font-mono text-[9px] text-muted-foreground">
              ⌘
            </kbd>
            <kbd className="inline-flex h-4 items-center rounded border border-border bg-muted px-1 font-mono text-[9px] text-muted-foreground">
              /
            </kbd>
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
              <div className="text-sm font-medium text-foreground leading-tight">
                Assistente IA
              </div>
              <div className="text-[10px] text-muted-foreground leading-tight flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-lhg-500 status-dot shrink-0" />
                <span className="truncate">
                  Contexto:{" "}
                  <span className="text-muted-foreground">{contextLabel}</span>
                </span>
              </div>
            </div>
            <button
              onClick={() => router.push("/chat")}
              className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              title="Abrir página completa"
              aria-label="Ir para página de chat"
            >
              <ArrowUpRight size={13} />
            </button>
            <button
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              aria-label="Fechar assistente"
            >
              <X size={13} />
            </button>
          </div>

          {/* Mensagens */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-3 space-y-3"
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn("flex gap-2", msg.role === "user" && "justify-end")}
              >
                {msg.role === "ai" && (
                  <div className="w-6 h-6 shrink-0 rounded-full bg-gradient-to-br from-lhg-400 to-lhg-600 flex items-center justify-center text-zinc-950 mt-0.5">
                    <Sparkles size={11} strokeWidth={2.5} />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words",
                    msg.role === "user"
                      ? "bg-muted text-foreground"
                      : "bg-muted/40 border border-border/80 text-foreground",
                  )}
                >
                  {renderMarkdown(msg.text)}
                  {msg.streaming && (
                    <span className="inline-block w-0.5 h-3.5 bg-lhg-400 animate-pulse ml-0.5 align-middle" />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Sugestões (apenas se poucas mensagens) */}
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
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
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
                aria-label="Enviar mensagem"
              >
                <Send size={13} />
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground/70 text-center">
              Powered by OpenRouter · GPT-4o — Sprint 0 demo
            </p>
          </div>
        </div>
      )}
    </>
  );
}
