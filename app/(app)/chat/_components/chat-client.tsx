"use client";

/**
 * chat-client.tsx — LHG-218 / LHG-230
 * Interface de chat com streaming SSE via /api/chat (OpenRouter).
 * Histórico de sessões persistido no Supabase via browser client.
 * Layout: sidebar de sessões (esquerda) + área de chat (direita).
 */
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Sparkles, Send, Loader2, Plus, User, Copy, Check,
  TrendingDown, BarChart2, Package, ShoppingCart, MessageSquare,
  Trash2, ChevronRight, PanelLeftClose, PanelLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Message {
  id:       string;
  role:     "user" | "assistant";
  content:  string;
  loading?: boolean;
}

interface Sessao {
  id:         string;
  title:      string;
  updated_at: string | null;
}

interface Props {
  userId:          string;
  userName:        string;
  contexto:        string;
  sessoesIniciais: Sessao[];
}

// ── Sugestões iniciais ────────────────────────────────────────────────────────

const SUGESTOES = [
  { icon: TrendingDown, label: "Resumir economias desta semana",         prompt: "Quais foram as maiores economias identificadas pela IA nas cotações desta semana? Liste os fornecedores selecionados e os valores." },
  { icon: BarChart2,    label: "Analisar pedidos aguardando aprovação",  prompt: "Analise os pedidos atualmente aguardando aprovação e recomende quais aprovar primeiro baseado em urgência e valor." },
  { icon: Package,      label: "Fornecedores com melhor custo-benefício", prompt: "Considerando rating e pontualidade, quais são os 3 melhores fornecedores para cada categoria?" },
  { icon: ShoppingCart, label: "Alertas de preço nas últimas cotações",   prompt: "Existem divergências significativas de preço entre os fornecedores nas cotações em andamento? Mostre onde há maior variação." },
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
          <li key={i} className="flex items-start gap-2 text-foreground/80">
            <span className="mt-1.5 w-1 h-1 rounded-full bg-muted-foreground/60 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>,
    );
    listItems = [];
  }

  lines.forEach((line, i) => {
    if (line.startsWith("## ")) {
      flushList();
      elements.push(<h3 key={i} className="text-sm font-semibold text-foreground mt-3 mb-1">{line.slice(3)}</h3>);
      return;
    }
    if (line.startsWith("### ")) {
      flushList();
      elements.push(<h4 key={i} className="text-sm font-medium text-foreground/80 mt-2 mb-0.5">{line.slice(4)}</h4>);
      return;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      listItems.push(line.slice(2));
      return;
    }
    if (!line.trim()) { flushList(); return; }
    flushList();
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    elements.push(
      <p key={i} className="text-foreground/80 leading-relaxed">
        {parts.map((part, j) =>
          part.startsWith("**") && part.endsWith("**")
            ? <strong key={j} className="text-foreground font-semibold">{part.slice(2, -2)}</strong>
            : part,
        )}
      </p>,
    );
  });

  flushList();
  return elements;
}

// ── Mensagem individual ───────────────────────────────────────────────────────

function MessageBubble({ msg, userName }: { msg: Message; userName: string }) {
  const [copied, setCopied] = useState(false);
  const isUser = msg.role === "user";

  function handleCopy() {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const initials = userName
    .split(" ").slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? "")
    .join("") || "U";

  return (
    <div className={cn("flex gap-3 group", isUser ? "flex-row-reverse" : "flex-row")}>
      <div className={cn(
        "w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[11px] font-mono font-semibold",
        isUser
          ? "bg-muted ring-1 ring-border text-muted-foreground"
          : "bg-gradient-to-br from-emerald-500 to-sky-500 text-white",
      )}>
        {isUser ? (initials || <User size={12} />) : <Sparkles size={12} />}
      </div>

      <div className={cn("flex-1 max-w-[85%] space-y-0.5", isUser ? "items-end flex flex-col" : "")}>
        <div className={cn(
          "rounded-2xl px-4 py-3 text-sm relative",
          isUser
            ? "bg-muted text-foreground rounded-tr-sm"
            : "bg-muted/40 border border-border/60 rounded-tl-sm",
        )}>
          {msg.loading ? (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          ) : isUser ? (
            <span className="whitespace-pre-wrap">{msg.content}</span>
          ) : (
            <div className="space-y-1">{renderMarkdown(msg.content)}</div>
          )}
        </div>

        {!isUser && !msg.loading && msg.content && (
          <button
            onClick={handleCopy}
            className="ml-1 flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-all"
          >
            {copied ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
            {copied ? "Copiado!" : "Copiar"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Item de sessão na sidebar ─────────────────────────────────────────────────

function SessaoItem({
  sessao,
  active,
  onClick,
  onDelete,
}: {
  sessao: Sessao;
  active: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const diff  = Date.now() - new Date(sessao.updated_at ?? new Date().toISOString()).getTime();
  const days  = Math.floor(diff / 86_400_000);
  const hours = Math.floor(diff / 3_600_000);
  const label = days > 0 ? `${days}d` : hours > 0 ? `${hours}h` : "agora";

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-2.5 rounded-lg flex items-start gap-2 group transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-foreground"
          : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60",
      )}
    >
      <MessageSquare size={13} className="shrink-0 mt-0.5 opacity-60" />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium truncate leading-tight">{sessao.title}</div>
        <div className="text-[10px] text-sidebar-foreground/40 mt-0.5">{label}</div>
      </div>
      <button
        onClick={onDelete}
        className={cn(
          "shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity",
          "text-sidebar-foreground/40 hover:text-red-400",
        )}
      >
        <Trash2 size={11} />
      </button>
    </button>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function ChatClient({ userId, userName, contexto, sessoesIniciais }: Props) {
  const [sessoes,       setSessoes]       = useState<Sessao[]>(sessoesIniciais);
  const [sessionId,     setSessionId]     = useState<string | null>(null);
  const [messages,      setMessages]      = useState<Message[]>([]);
  const [input,         setInput]         = useState("");
  const [isLoading,     setIsLoading]     = useState(false);
  const [loadingSessao, setLoadingSessao] = useState(false);
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  const supabase = createClient();

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Selecionar sessão existente ─────────────────────────────────────────

  const selectSessao = useCallback(async (id: string) => {
    if (id === sessionId || loadingSessao) return;
    setLoadingSessao(true);
    setMessages([]);

    const { data } = await supabase
      .from("ai_chat_messages")
      .select("id, role, content")
      .eq("session_id", id)
      .order("created_at", { ascending: true });

    setSessionId(id);
    setMessages(
      (data ?? []).map(m => ({
        id:      m.id,
        role:    m.role as "user" | "assistant",
        content: m.content,
      })),
    );
    setLoadingSessao(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [sessionId, loadingSessao, supabase]);

  // ── Nova conversa ───────────────────────────────────────────────────────

  function novaSessao() {
    setSessionId(null);
    setMessages([]);
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  // ── Deletar sessão ──────────────────────────────────────────────────────

  async function deletarSessao(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    await supabase.from("ai_chat_sessions").delete().eq("id", id);
    setSessoes(prev => prev.filter(s => s.id !== id));
    if (sessionId === id) novaSessao();
  }

  // ── Enviar mensagem ─────────────────────────────────────────────────────

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

    let currentSessionId = sessionId;

    // Criar sessão no primeiro envio
    if (!currentSessionId) {
      const title = text.trim().slice(0, 60) + (text.trim().length > 60 ? "…" : "");
      const { data: newSessao } = await supabase
        .from("ai_chat_sessions")
        .insert({ user_id: userId, title })
        .select("id, title, updated_at")
        .single();

      if (newSessao) {
        currentSessionId = newSessao.id;
        setSessionId(newSessao.id);
        setSessoes(prev => [newSessao, ...prev]);
      }
    }

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

      if (!res.ok) throw new Error(`Erro ${res.status}: ${await res.text()}`);

      // Processar stream SSE
      const reader      = res.body?.getReader();
      const decoder     = new TextDecoder();
      let assistantText = "";
      const assistantId = loadingMsg.id;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") break;

            try {
              const json  = JSON.parse(data);
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) {
                assistantText += delta;
                setMessages(prev => prev.map(m =>
                  m.id === assistantId
                    ? { ...m, content: assistantText, loading: false }
                    : m,
                ));
              }
            } catch { /* chunk incompleto */ }
          }
        }
      }

      // Garantir loading removido
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, loading: false } : m,
      ));

      // Persistir as duas mensagens no Supabase
      if (currentSessionId) {
        await supabase.from("ai_chat_messages").insert([
          { session_id: currentSessionId, user_id: userId, role: "user",      content: text.trim() },
          { session_id: currentSessionId, user_id: userId, role: "assistant", content: assistantText },
        ]);

        // Atualizar updated_at da sessão
        await supabase
          .from("ai_chat_sessions")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", currentSessionId);

        // Atualizar lista de sessões localmente
        setSessoes(prev => prev.map(s =>
          s.id === currentSessionId
            ? { ...s, updated_at: new Date().toISOString() }
            : s,
        ).sort((a, b) => new Date(b.updated_at ?? "").getTime() - new Date(a.updated_at ?? "").getTime()));
      }
    } catch (err) {
      const errorText = err instanceof Error ? err.message : "Erro desconhecido";
      setMessages(prev => prev.map(m =>
        m.loading ? { ...m, content: `⚠ ${errorText}`, loading: false } : m,
      ));
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [messages, isLoading, contexto, sessionId, userId, supabase]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const mostraBoasVindas = messages.length === 0 && !loadingSessao;

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">

      {/* ── Overlay mobile ─────────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-20 bg-black/50"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar de sessões ─────────────────────────────────────────────── */}
      <aside className={cn(
        "shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden",
        "transition-[width] duration-200",
        // Mobile: drawer absoluto; Desktop: sempre visível
        "fixed md:relative top-0 left-0 h-full z-30 md:z-auto",
        sidebarOpen ? "w-[220px]" : "w-0 md:w-[220px]",
      )}>
        <div className="p-2 border-b border-sidebar-border">
          <button
            onClick={novaSessao}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm",
              "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60",
            )}
          >
            <Plus size={14} />
            Nova conversa
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {sessoes.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-[11px] text-sidebar-foreground/40">
                Sem conversas ainda
              </p>
            </div>
          ) : (
            sessoes.map(s => (
              <SessaoItem
                key={s.id}
                sessao={s}
                active={s.id === sessionId}
                onClick={() => selectSessao(s.id)}
                onDelete={e => deletarSessao(e, s.id)}
              />
            ))
          )}
        </div>
      </aside>

      {/* ── Área de chat ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-3">
            {/* Toggle sidebar — visível só em mobile */}
            <button
              onClick={() => setSidebarOpen(v => !v)}
              className="md:hidden w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              aria-label="Alternar histórico"
            >
              {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
            </button>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-sky-500 flex items-center justify-center">
              <Sparkles size={15} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground">LHG IA — Assistente de Compras</h1>
              <p className="text-[11px] text-muted-foreground">
                {sessionId
                  ? sessoes.find(s => s.id === sessionId)?.title ?? "Conversa"
                  : "Nova conversa · Contexto das cotações atualizado"}
              </p>
            </div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={novaSessao}
              className="flex items-center gap-1.5 text-[12px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              <Plus size={12} />
              Nova
            </button>
          )}
        </div>

        {/* Mensagens */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loadingSessao ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={20} className="text-muted-foreground animate-spin" />
            </div>
          ) : mostraBoasVindas ? (
            <div className="flex flex-col items-center justify-center h-full gap-6 max-w-[520px] mx-auto text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-sky-500/20 border border-emerald-500/20 flex items-center justify-center">
                <Sparkles size={28} className="text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-2">
                  Olá{userName ? `, ${userName.split(" ")[0]}` : ""}! Como posso ajudar?
                </h2>
                <p className="text-[13px] text-muted-foreground leading-relaxed">
                  Sou especialista em compras e suprimentos hoteleiros. Tenho acesso às cotações, pedidos e fornecedores ativos.
                </p>
              </div>

              <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SUGESTOES.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(s.prompt)}
                    disabled={isLoading}
                    className={cn(
                      "flex items-start gap-2.5 text-left rounded-xl border border-border",
                      "bg-muted/40 px-3.5 py-3 transition-colors",
                      "hover:bg-muted/60 hover:border-border/80",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                    )}
                  >
                    <s.icon size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                    <span className="text-[12px] text-muted-foreground leading-snug">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5 max-w-[760px] mx-auto">
              {messages.map(msg => (
                <MessageBubble key={msg.id} msg={msg} userName={userName} />
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t border-border/60 shrink-0">
          <div className={cn(
            "flex items-end gap-2 rounded-xl border bg-muted/40",
            "focus-within:ring-1 focus-within:ring-border focus-within:border-border",
            "transition-all border-border",
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
                "text-sm text-foreground placeholder:text-muted-foreground/50",
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
                  : "text-muted-foreground/30 cursor-not-allowed",
              )}
            >
              {isLoading
                ? <Loader2 size={16} className="animate-spin" />
                : <Send size={16} />
              }
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground/40 text-center mt-2">
            Enter para enviar · Shift+Enter para quebrar linha
          </p>
        </div>
      </div>
    </div>
  );
}
