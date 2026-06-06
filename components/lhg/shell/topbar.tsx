"use client";

/**
 * topbar.tsx — LHG-202
 * Barra superior sticky h-14: breadcrumb, search ⌘K, sino de notificações, tour.
 * Botão ❓ agora dispara o tour interativo (balões de quadrinho) em vez do modal estático.
 * Tokens semânticos para suporte a light/dark mode.
 */

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import {
  Menu, Search, Bell, HelpCircle, ChevronRight,
  X, AlertTriangle, Info, CheckCircle2,
  ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BREADCRUMB_MAP } from "./nav-config";
import { CmdK } from "./cmd-k";
import { useTour } from "@/components/lhg/tour/tour-context";
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
  const { startTour } = useTour();
  const [cmdOpen,   setCmdOpen]   = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

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
    if (!notifOpen) onMarkAllRead();
    setNotifOpen((o) => !o);
  }

  return (
    <>
      <header
        className={cn(
          "h-14 border-b border-border",
          "bg-card/80 backdrop-blur-md",
          "sticky top-0 z-30",
          "px-3 sm:px-4 flex items-center gap-2 sm:gap-3",
        )}
      >
        {/* Hambúrguer mobile */}
        <button
          onClick={onToggleMobile}
          className="lg:hidden w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          aria-label="Abrir menu"
        >
          <Menu size={15} />
        </button>

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="hidden md:flex items-center gap-1.5 text-sm min-w-0 max-w-[40%]">
          {crumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1.5 min-w-0">
              {i > 0 && <ChevronRight size={12} className="text-muted-foreground/50 shrink-0" />}
              <span className={cn("truncate", i === crumbs.length - 1 ? "text-foreground font-medium" : "text-muted-foreground")}>
                {crumb}
              </span>
            </span>
          ))}
        </nav>

        {/* Título mobile */}
        <span className="md:hidden text-sm font-medium text-foreground truncate flex-1">
          {crumbs[crumbs.length - 1]}
        </span>

        {/* Search bar desktop */}
        <div className="hidden md:flex flex-1 justify-center">
          <button
            onClick={() => setCmdOpen(true)}
            className={cn(
              "w-full max-w-md flex items-center gap-2 h-8 px-2.5 rounded-md",
              "bg-muted/60 border border-border text-muted-foreground",
              "hover:border-border/80 transition-colors",
            )}
          >
            <Search size={13} />
            <span className="text-xs flex-1 text-left truncate">Buscar pedido, fornecedor, produto…</span>
            <span className="flex items-center gap-0.5">
              <kbd className="inline-flex h-4 items-center rounded border border-border bg-muted px-1.5 font-mono text-[9px] text-muted-foreground">Ctrl</kbd>
              <kbd className="inline-flex h-4 items-center rounded border border-border bg-muted px-1 font-mono text-[9px] text-muted-foreground">K</kbd>
            </span>
          </button>
        </div>

        {/* Search mobile */}
        <button
          onClick={() => setCmdOpen(true)}
          className="md:hidden w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          aria-label="Buscar"
        >
          <Search size={15} />
        </button>

        {/* ── Notificações ──────────────────────────────────────────────── */}
        <div className="relative" data-notif-panel>
          <button
            onClick={handleNotifToggle}
            className="relative w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            aria-label="Notificações"
          >
            <Bell size={15} className={notifOpen ? "text-foreground" : undefined} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-lhg-500 border-2 border-card" />
            )}
          </button>

          {/* Dropdown de notificações */}
          {notifOpen && (
            <div className="absolute right-0 top-11 z-50 w-[340px] rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/80">
                <span className="text-sm font-semibold text-foreground">Notificações</span>
                <button
                  onClick={() => setNotifOpen(false)}
                  className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X size={13} />
                </button>
              </div>

              {notifications.length === 0 ? (
                <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground/50">
                  <Bell size={22} strokeWidth={1.5} />
                  <span className="text-xs">Nenhuma notificação nesta sessão</span>
                </div>
              ) : (
                <ul className="max-h-[400px] overflow-y-auto divide-y divide-border/50">
                  {notifications.map((n) => (
                    <li key={n.id}>
                      <a
                        href={n.href ?? "#"}
                        className="flex gap-3 items-start px-4 py-3 hover:bg-muted/40 transition-colors"
                      >
                        <NotifIcon type={n.type} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-foreground leading-snug">{n.title}</p>
                          {n.description && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{n.description}</p>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground/70 shrink-0">{timeAgo(n.createdAt)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* ── Tour interativo ───────────────────────────────────────────── */}
        <button
          onClick={startTour}
          className="hidden sm:flex w-8 h-8 rounded-md items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          aria-label="Tour guiado"
          title="Ver tour guiado"
        >
          <HelpCircle size={15} />
        </button>
      </header>

      {/* Paleta de comandos */}
      <CmdK open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </>
  );
}
