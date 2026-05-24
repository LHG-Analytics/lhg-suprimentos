"use client";

/**
 * chat-client.tsx — LHG-218
 * Interface de chat com streaming SSE via /api/chat (OpenRouter).
 * Suporta histórico de conversa, sugestões contextuais e markdown simples.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Sparkles, Send, Loader2, RotateCcw, User, Copy, Check,
  TrendingDown, BarChart2, Package, ShoppingCart, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Message {
  id:      string;
  role:    "user" | "assistant";
  content: string;
  loading?: boolean;
}

interface Props {
  contexto: string;
}

// ── Sugestões iniciais ────────────────────────────────────────────────────────

const SUGESTOES = [
  { icon: TrendingDown, label: "Resumir economias desta semana",      prompt: "Quais foram as maiores economias identificadas pela IA nas cotações desta semana? Liste os fornecedores selecionados e os valores." },
  { icon: BarChart2,    label: "Analisar pedidos aguardando aprovação", prompt: "Analise os pedidos atualmente aguardando aprovação e recomende quais aprovar primeiro baseado em urgência e valor." },
  { icon: Package,      label: "Fornecedores com melhor custo-benefício", prompt: "Considerando rating e pontualidade, quais são os 3 melhores fornecedores para cada categoria?" },
  { icon: ShoppingCart, label: "Alertas de preço nas últimas cotações",  prompt: "Existem divergências significativas de preço entre os fornecedores nas cotações em andamento? Mostre onde há maior variação." },
];

// ── Parser de markdown simples ────────────────────────────────────────────────

function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (listItems.length === 0) return;
    elements.push(
      <ul key={`ul-${elements.length}`} className="space-y-1 my-2">
        {listItems.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-zinc-300">
            <span className="mt-1.5 w-1 h-1 rounded-full bg-zinc-600 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>,
    );
    listItems = [];
  }

  lines.forEach((line, i) => {
    // Heading 2
    if (line.startsWith("## ")) {
      flushList();
      elements.push(
        <h3 key={i} className="text-sm font-semibold text-zinc-100 mt-3 mb-1">
          {line.slice(3)}
        </h3>,
      );
      return;
    }
    // Heading 3
    if (line.startsWith("### ")) {
      flushList();
      elements.push(
        <h4 key={i} className="text-sm font-medium text-zinc-200 mt-2 mb-0.5">
          {line.slice(4)}
        </h4>,
      );
      return;
    }
    // Bullet
    if (line.startsWith("- ") || line.startsWith("* ")) {
      listItems.push(line.slice(2));
      return;
    }
    // Blank line
    if (!line.trim()) {
      flushList();
      return;
    }
    // Normal paragraph
    flushList();
    // Bold inline
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    elements.push(
      <p key={i} className="text-zinc-300 leading-relaxed">
        {parts.map((part, j) =>
          part.startsWith("**") && part.endsWith("**")
            ? <strong key={j} className="text-zinc-100 font-semibold">{part.slice(2, -2)}</strong>
            : part,
        )}
      </p>,
    );
  });

  flushList();
  return elements;
}

// ── Mensagem individual ───────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const [copied, setCopied] = useState(false);
  const isUser = msg.role === "user";

  function handleCopy() {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={cn("flex gap-3 group", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      <div className={cn(
        "w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5",
        isUser
          ? "bg-zinc-800 ring-1 ring-zinc-700"
          : "bg-gradient-to-br from-emerald-500 to-sky-500",
      )}>
        {isUser
          ? <User size={13} className="text-zinc-400" />
          : <Sparkles size={12} className="text-white" />
        }
      </div>

      {/* Conteúdo */}
      <div className={cn(
        "flex-1 max-w-[85%] space-y-0.5",
        isUser ? "items-end flex flex-col" : "",
      )}>
        <div className={cn(
          "rounded-2xl px-4 py-3 text-sm relative",
          isUser
            ? "bg-zinc-800 text-zinc-100 rounded-tr-sm"
            : "bg-zinc-900/60 border border-zinc-800/60 rounded-tl-sm",
        )}>
          {msg.loading ? (
            <div className="flex items-center gap-1.5 text-zinc-500">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          ) : isUser ? (
            <span className="whitespace-pre-wrap">{msg.content}</span>
          ) : (
            <div className="space-y-1">{renderMarkdown(msg.content)}</div>
          )}
        </div>

        {/* Botão copiar (assistente apenas) */}
        {!isUser && !msg.loading && msg.content && (
          <button
            onClick={handleCopy}
            className="ml-1 flex items-center gap-1 text-[10px] text-zinc-600 hover:text-zinc-400 opacity-0 group-hover:opacity-100 transition-all"
          >
            {copied ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
            {copied ? "Copiado!" : "Copiar"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function ChatClient({ contexto }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);

  const mostraBoasVindas = messages.length === 0;

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: Message = {
      id:      crypto.randomUUID(),
      role:    "user",
      content: text.trim(),
    };

    const loadingMsg: Message = {
      id:      crypto.randomUUID(),
      role:    "assistant",
      content: "",
      loading: true,
    };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const historyForAPI = messages
        .filter(m => !m.loading)
        .map(m => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...historyForAPI, { role: "user", content: text.trim() }],
          contexto,
        }),
      });

      if (!res.ok) {
        throw new Error(`Erro ${res.status}: ${await res.text()}`);
      }

      // Processar stream SSE
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      const assistantId = loadingMsg.id;

      if (reader) {
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
              const json = JSON.parse(data);
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) {
                assistantText += delta;
                setMessages(prev => prev.map(m =>
                  m.id === assistantId
                    ? { ...m, content: assistantText, loading: false }
                    : m,
                ));
              }
            } catch {
              // chunk incompleto, ignorar
            }
          }
        }
      }

      // Garantir que loading é removido
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, loading: false } : m,
      ));
    } catch (err) {
      const errorText = err instanceof Error ? err.message : "Erro desconhecido";
      setMessages(prev => prev.map(m =>
        m.loading
          ? { ...m, content: `⚠ ${errorText}`, loading: false }
          : m,
      ));
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [messages, isLoading, contexto]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function handleLimpar() {
    setMessages([]);
    setInput("");
    inputRef.current?.focus();
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] max-w-[840px] mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/60 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-sky-500 flex items-center justify-center">
            <Sparkles size={15} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-zinc-100">Assistente IA de Compras</h1>
            <p className="text-[11px] text-zinc-500">Powered by Claude · Contexto das cotações atualizado</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleLimpar}
            className="flex items-center gap-1.5 text-[12px] text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            <RotateCcw size={12} />
            Nova conversa
          </button>
        )}
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {mostraBoasVindas ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 max-w-[520px] mx-auto text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-sky-500/20 border border-emerald-500/20 flex items-center justify-center">
              <Sparkles size={28} className="text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-100 mb-2">Olá! Como posso ajudar?</h2>
              <p className="text-[13px] text-zinc-500 leading-relaxed">
                Sou seu assistente especializado em compras do LHG. Tenho acesso ao contexto das cotações, pedidos e fornecedores ativos.
              </p>
            </div>

            {/* Sugestões */}
            <div className="w-full grid grid-cols-2 gap-2">
              {SUGESTOES.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(s.prompt)}
                  disabled={isLoading}
                  className={cn(
                    "flex items-start gap-2.5 text-left rounded-xl border border-zinc-800",
                    "bg-zinc-900/40 px-3.5 py-3 transition-colors",
                    "hover:bg-zinc-800/60 hover:border-zinc-700",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  <s.icon size={14} className="text-zinc-500 shrink-0 mt-0.5" />
                  <span className="text-[12px] text-zinc-400 leading-snug">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5 max-w-[760px] mx-auto">
            {messages.map(msg => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-zinc-800/60 shrink-0">
        <div className={cn(
          "flex items-end gap-2 rounded-xl border bg-zinc-900/60",
          "focus-within:ring-1 focus-within:ring-zinc-600 focus-within:border-zinc-600",
          "transition-all border-zinc-800",
        )}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pergunte sobre cotações, fornecedores, pedidos…"
            rows={1}
            disabled={isLoading}
            className={cn(
              "flex-1 resize-none bg-transparent px-4 py-3.5",
              "text-sm text-zinc-200 placeholder-zinc-600",
              "focus:outline-none max-h-[120px] overflow-y-auto",
              "disabled:opacity-50",
            )}
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className={cn(
              "mr-2 mb-2 p-2 rounded-lg transition-all",
              input.trim() && !isLoading
                ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                : "text-zinc-700 cursor-not-allowed",
            )}
          >
            {isLoading
              ? <Loader2 size={16} className="animate-spin" />
              : <Send size={16} />
            }
          </button>
        </div>
        <p className="text-[10px] text-zinc-700 text-center mt-2">
          Enter para enviar · Shift+Enter para quebrar linha
        </p>
      </div>
    </div>
  );
}
