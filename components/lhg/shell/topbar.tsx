"use client";

/**
 * topbar.tsx — LHG-202
 * Barra superior sticky h-14: collapse button, breadcrumb, search ⌘K, sino, ajuda.
 */

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Menu, Search, Bell, HelpCircle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { BREADCRUMB_MAP } from "./nav-config";
import { CmdK } from "./cmd-k";

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface TopbarProps {
  onToggleMobile: () => void;
}

// ── Resolve breadcrumbs a partir do pathname ───────────────────────────────────
function useBreadcrumbs(): string[] {
  const pathname = usePathname();
  // Tenta match exato, depois prefixo decrescente
  if (BREADCRUMB_MAP[pathname]) return BREADCRUMB_MAP[pathname];
  const segment = "/" + pathname.split("/").filter(Boolean)[0];
  return BREADCRUMB_MAP[segment] ?? ["Dashboard"];
}

// ── Topbar ─────────────────────────────────────────────────────────────────────
export function Topbar({ onToggleMobile }: TopbarProps) {
  const crumbs = useBreadcrumbs();
  const [cmdOpen, setCmdOpen] = useState(false);

  // ⌘K / Ctrl+K global
  const handleKeydown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setCmdOpen(true);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [handleKeydown]);

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

        {/* Breadcrumb — oculto em telas pequenas */}
        <nav
          aria-label="Breadcrumb"
          className="hidden md:flex items-center gap-1.5 text-sm min-w-0 max-w-[40%]"
        >
          {crumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1.5 min-w-0">
              {i > 0 && (
                <ChevronRight size={12} className="text-zinc-600 shrink-0" />
              )}
              <span
                className={cn(
                  "truncate",
                  i === crumbs.length - 1
                    ? "text-zinc-200 font-medium"
                    : "text-zinc-500",
                )}
              >
                {crumb}
              </span>
            </span>
          ))}
        </nav>

        {/* Título da página em mobile */}
        <span className="md:hidden text-sm font-medium text-zinc-200 truncate flex-1">
          {crumbs[crumbs.length - 1]}
        </span>

        {/* Search bar — centralizada em desktop */}
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
            <span className="text-xs flex-1 text-left truncate">
              Buscar pedido, fornecedor, produto…
            </span>
            <span className="flex items-center gap-0.5">
              <kbd className="inline-flex h-4 items-center rounded border border-zinc-700 bg-zinc-800 px-1 font-mono text-[9px] text-zinc-500">
                ⌘
              </kbd>
              <kbd className="inline-flex h-4 items-center rounded border border-zinc-700 bg-zinc-800 px-1 font-mono text-[9px] text-zinc-500">
                K
              </kbd>
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

        {/* Notificações */}
        <button
          className="relative w-8 h-8 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
          aria-label="Notificações"
        >
          <Bell size={15} />
          {/* Indicador de notificação não lida */}
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-lhg-500" />
        </button>

        {/* Ajuda */}
        <button
          className="hidden sm:flex w-8 h-8 rounded-md items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
          aria-label="Ajuda"
        >
          <HelpCircle size={15} />
        </button>
      </header>

      {/* Paleta de comandos */}
      <CmdK open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </>
  );
}
