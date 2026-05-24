"use client";

/**
 * topbar.tsx — LHG-202
 * Barra superior sticky h-14: breadcrumb, search ⌘K, sino de notificações, ajuda/onboarding.
 */

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import {
  Menu, Search, Bell, HelpCircle, ChevronRight,
  X, AlertTriangle, Info, CheckCircle2, ShoppingCart,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BREADCRUMB_MAP } from "./nav-config";
import { CmdK } from "./cmd-k";
import type { NotificationItem } from "@/hooks/use-realtime-notifications";

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface TopbarProps {
  onToggleMobile: () => void;
  notifications:  NotificationItem[];
  unreadCount:    number;
  onMarkAllRead:  () => void;
}

// ── Resolve breadcrumbs a partir do pathname ───────────────────────────────────
function useBreadcrumbs(): string[] {
  const pathname = usePathname();
  if (BREADCRUMB_MAP[pathname]) return BREADCRUMB_MAP[pathname];
  const segment = "/" + pathname.split("/").filter(Boolean)[0];
  return BREADCRUMB_MAP[segment] ?? ["Dashboard"];
}

// ── Ícone por tipo de notificação ─────────────────────────────────────────────
function NotifIcon({ type }: { type: NotificationItem["type"] }) {
  const cls = "size-3.5 shrink-0 mt-0.5";
  switch (type) {
    case "success": return <CheckCircle2 className={cn(cls, "text-emerald-400")} />;
    case "error":   return <X            className={cn(cls, "text-red-400")} />;
    case "warning": return <ShoppingCart className={cn(cls, "text-amber-400")} />;
    case "info":    return <Info         className={cn(cls, "text-sky-400")} />;
  }
}

// ── Tempo relativo ─────────────────────────────────────────────────────────────
function timeAgo(date: Date): string {
  const diff  = Date.now() - date.getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  if (mins  < 1)  return "agora";
  if (mins  < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// ── Topbar ─────────────────────────────────────────────────────────────────────
export function Topbar({ onToggleMobile, notifications, unreadCount, onMarkAllRead }: TopbarProps) {
  const crumbs = useBreadcrumbs();
  const [cmdOpen,        setCmdOpen]        = useState(false);
  const [notifOpen,      setNotifOpen]      = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  // ⌘K / ⌘N
  const handleKeydown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setCmdOpen(true);
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "n") {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent("lhg:novo"));
      setCmdOpen(true);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [handleKeydown]);

  // Fecha o painel ao clicar fora
  useEffect(() => {
    if (!notifOpen) return;
    const fn = (e: MouseEvent) => {
      if (!(e.target as Element).closest("[data-notif-panel]")) setNotifOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [notifOpen]);

  function handleNotifToggle() {
    if (!notifOpen) onMarkAllRead(); // marca como lidas ao abrir
    setNotifOpen((o) => !o);
  }

  return (
    <>
      <header
        className={cn(
          "h-14 border-b border-zinc-800/80",
          "bg-zinc-950/80 backdrop-blur-md",
          "sticky top-0 z-20",
          "px-3 sm:px-4 flex items-center gap-2 sm:gap-3",
        )}
      >
        {/* Hambúrguer mobile */}
        <button
          onClick={onToggleMobile}
          className="lg:hidden w-8 h-8 rounded-md flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
          aria-label="Abrir menu"
        >
          <Menu size={15} />
        </button>

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="hidden md:flex items-center gap-1.5 text-sm min-w-0 max-w-[40%]">
          {crumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1.5 min-w-0">
              {i > 0 && <ChevronRight size={12} className="text-zinc-600 shrink-0" />}
              <span className={cn("truncate", i === crumbs.length - 1 ? "text-zinc-200 font-medium" : "text-zinc-500")}>
                {crumb}
              </span>
            </span>
          ))}
        </nav>

        {/* Título mobile */}
        <span className="md:hidden text-sm font-medium text-zinc-200 truncate flex-1">
          {crumbs[crumbs.length - 1]}
        </span>

        {/* Search bar desktop */}
        <div className="hidden md:flex flex-1 justify-center">
          <button
            onClick={() => setCmdOpen(true)}
            className={cn(
              "w-full max-w-md flex items-center gap-2 h-8 px-2.5 rounded-md",
              "bg-zinc-900/80 border border-zinc-800/80 text-zinc-500",
              "hover:border-zinc-700 transition-colors",
            )}
          >
            <Search size={13} />
            <span className="text-xs flex-1 text-left truncate">Buscar pedido, fornecedor, produto…</span>
            <span className="flex items-center gap-0.5">
              <kbd className="inline-flex h-4 items-center rounded border border-zinc-700 bg-zinc-800 px-1 font-mono text-[9px] text-zinc-500">⌘</kbd>
              <kbd className="inline-flex h-4 items-center rounded border border-zinc-700 bg-zinc-800 px-1 font-mono text-[9px] text-zinc-500">K</kbd>
            </span>
          </button>
        </div>

        {/* Search mobile */}
        <button
          onClick={() => setCmdOpen(true)}
          className="md:hidden w-8 h-8 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
          aria-label="Buscar"
        >
          <Search size={15} />
        </button>

        {/* ── Notificações ──────────────────────────────────────────────── */}
        <div className="relative" data-notif-panel>
          <button
            onClick={handleNotifToggle}
            className="relative w-8 h-8 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
            aria-label="Notificações"
          >
            <Bell size={15} className={notifOpen ? "text-zinc-200" : undefined} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-lhg-500 border-2 border-zinc-950" />
            )}
          </button>

          {/* Dropdown */}
          {notifOpen && (
            <div className="absolute right-0 top-11 z-50 w-[340px] rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">
              {/* Cabeçalho */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/80">
                <span className="text-sm font-semibold text-zinc-100">Notificações</span>
                <button
                  onClick={() => setNotifOpen(false)}
                  className="w-6 h-6 rounded flex items-center justify-center text-zinc-500 hover:text-zinc-200 transition-colors"
                >
                  <X size={13} />
                </button>
              </div>

              {/* Lista */}
              {notifications.length === 0 ? (
                <div className="py-10 flex flex-col items-center gap-2 text-zinc-600">
                  <Bell size={22} strokeWidth={1.5} />
                  <span className="text-xs">Nenhuma notificação nesta sessão</span>
                </div>
              ) : (
                <ul className="max-h-[400px] overflow-y-auto divide-y divide-zinc-800/50">
                  {notifications.map((n) => (
                    <li key={n.id}>
                      <a
                        href={n.href ?? "#"}
                        className="flex gap-3 items-start px-4 py-3 hover:bg-zinc-900/60 transition-colors"
                      >
                        <NotifIcon type={n.type} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-zinc-200 leading-snug">{n.title}</p>
                          {n.description && (
                            <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{n.description}</p>
                          )}
                        </div>
                        <span className="text-[10px] text-zinc-600 shrink-0">{timeAgo(n.createdAt)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* ── Ajuda / Onboarding ────────────────────────────────────────── */}
        <button
          onClick={() => setOnboardingOpen(true)}
          className="hidden sm:flex w-8 h-8 rounded-md items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
          aria-label="Ajuda"
        >
          <HelpCircle size={15} />
        </button>
      </header>

      {/* Paleta de comandos */}
      <CmdK open={cmdOpen} onClose={() => setCmdOpen(false)} />

      {/* ── Modal de onboarding ────────────────────────────────────────── */}
      {onboardingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            onClick={() => setOnboardingOpen(false)}
          />
          <div className="relative z-10 w-full max-w-2xl max-h-[88vh] rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl flex flex-col">
            {/* Cabeçalho */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-800/80 shrink-0">
              <div className="w-7 h-7 rounded-lg bg-lhg-500/15 flex items-center justify-center">
                <BookOpen size={14} className="text-lhg-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-zinc-100">Guia de uso — LHG Suprimentos</h2>
                <p className="text-[11px] text-zinc-500 mt-0.5">Fluxo de trabalho e atalhos do sistema</p>
              </div>
              <button
                onClick={() => setOnboardingOpen(false)}
                className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Conteúdo */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6 text-sm">

              {/* Atalhos */}
              <section>
                <h3 className="text-[10px] uppercase tracking-[0.12em] text-zinc-600 font-medium mb-3">Atalhos</h3>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { keys: ["⌘", "K"], label: "Busca global" },
                    { keys: ["⌘", "N"], label: "Nova ação" },
                    { keys: ["Esc"],    label: "Fechar" },
                  ].map(({ keys, label }) => (
                    <div key={label} className="flex flex-col items-center gap-2 rounded-lg bg-zinc-900/60 border border-zinc-800/60 px-3 py-3">
                      <div className="flex gap-1">
                        {keys.map((k) => (
                          <kbd key={k} className="inline-flex h-5 items-center rounded border border-zinc-700 bg-zinc-800 px-1.5 font-mono text-[10px] text-zinc-300">
                            {k}
                          </kbd>
                        ))}
                      </div>
                      <span className="text-[11px] text-zinc-400 text-center">{label}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Fluxo principal */}
              <section>
                <h3 className="text-[10px] uppercase tracking-[0.12em] text-zinc-600 font-medium mb-3">Fluxo de trabalho</h3>
                <ol className="space-y-3">
                  {[
                    {
                      n: "1", title: "Nova Requisição",
                      desc: "⌘N → Nova Requisição · Preencha itens, quantidades e unidade solicitante · Salve como Rascunho",
                    },
                    {
                      n: "2", title: "Criar Cotação",
                      desc: "Menu Cotações → + Nova Cotação · Vincule a requisição · Adicione os fornecedores que participarão",
                    },
                    {
                      n: "3", title: "Solicitar preços por email",
                      desc: 'Clique "Solicitar cotação" para enviar email automático a todos os fornecedores com a lista de itens',
                    },
                    {
                      n: "4", title: "Preencher Matriz de Preços",
                      desc: 'Abra a cotação → Matriz Comparativa · Preencha os preços · Clique "Aplicar sugestão IA" para seleção automática',
                    },
                    {
                      n: "5", title: "Gerar e Aprovar Pedido",
                      desc: 'Clique "Gerar pedidos" · No menu Pedidos, aprove os pedidos aguardando aprovação',
                    },
                    {
                      n: "6", title: "Enviar ao Omie (opcional)",
                      desc: 'No pedido aprovado, clique "Enviar ao Omie" para registrar automaticamente no ERP',
                    },
                    {
                      n: "7", title: "Entrada de Nota Fiscal",
                      desc: "Menu Notas Fiscais → + Nova NF · Digite o número da NF · O sistema busca os dados automaticamente no Omie",
                    },
                  ].map(({ n, title, desc }) => (
                    <li key={n} className="flex gap-3">
                      <span className="w-6 h-6 rounded-full bg-lhg-500/15 text-lhg-400 text-[11px] font-mono font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {n}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-zinc-200">{title}</p>
                        <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">{desc}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              {/* Notificações */}
              <section>
                <h3 className="text-[10px] uppercase tracking-[0.12em] text-zinc-600 font-medium mb-3">Notificações em tempo real</h3>
                <div className="rounded-lg bg-zinc-900/50 border border-zinc-800/60 px-4 py-3 space-y-1.5 text-[12px] text-zinc-400">
                  <p>• Pedido aprovado ou rejeitado</p>
                  <p>• Nova cotação criada</p>
                  <p>• Pedido gerado a partir de cotação</p>
                  <p>• Novo pedido aguardando sua aprovação</p>
                </div>
              </section>
            </div>

            {/* Rodapé */}
            <div className="px-6 py-3 border-t border-zinc-800/80 shrink-0 flex items-center justify-between">
              <span className="text-[11px] text-zinc-600">
                Dúvidas? Contate: <span className="text-zinc-400">danilo@lushmotel.com.br</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
