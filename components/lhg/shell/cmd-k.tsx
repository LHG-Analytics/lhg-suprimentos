"use client";

/**
 * cmd-k.tsx — LHG-202
 * Paleta de comandos ⌘K usando primitivos cmdk.
 * Usa overlay próprio (sem Dialog) para controle total de z-index/animação.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  LayoutDashboard, ClipboardList, Scale, ShoppingCart,
  FileText, Truck, Package, Sparkles, BarChart2, Settings,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface CmdKProps {
  open: boolean;
  onClose: () => void;
}

// ── Items de navegação rápida ──────────────────────────────────────────────────
const QUICK_LINKS = [
  { label: "Dashboard",          href: "/dashboard",    icon: LayoutDashboard },
  { label: "Requisições",         href: "/requisicoes",  icon: ClipboardList },
  { label: "Cotações em aberto",  href: "/cotacoes",     icon: Scale },
  { label: "Pedidos de compra",   href: "/pedidos",      icon: ShoppingCart },
  { label: "Entrada de NF",       href: "/nf",           icon: FileText },
  { label: "Fornecedores",        href: "/fornecedores", icon: Truck },
  { label: "Produtos & catálogo", href: "/produtos",     icon: Package },
  { label: "Assistente IA",       href: "/chat",         icon: Sparkles },
  { label: "Relatórios",          href: "/relatorios",   icon: BarChart2 },
  { label: "Configurações",       href: "/admin",        icon: Settings },
];

// ── Componente ─────────────────────────────────────────────────────────────────
export function CmdK({ open, onClose }: CmdKProps) {
  const router = useRouter();

  // Fechar com Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  function navigate(href: string) {
    router.push(href);
    onClose();
  }

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh]"
      aria-modal="true"
      role="dialog"
      aria-label="Paleta de comandos"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-[560px] mx-4 rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
        <Command
          className="flex flex-col"
          shouldFilter={true}
          loop
        >
          {/* Input */}
          <div className="flex items-center gap-3 px-4 h-12 border-b border-zinc-800/80">
            <Search size={14} className="text-zinc-500 shrink-0" />
            <Command.Input
              autoFocus
              placeholder="Buscar por nº pedido, fornecedor, produto, requisição…"
              className={cn(
                "flex-1 bg-transparent h-full",
                "text-sm text-zinc-100 placeholder:text-zinc-600",
                "outline-none",
              )}
            />
            <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-zinc-700 bg-zinc-800/80 px-1.5 font-mono text-[10px] text-zinc-500">
              esc
            </kbd>
          </div>

          {/* Lista */}
          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-zinc-500">
              Nenhum resultado encontrado.
            </Command.Empty>

            <Command.Group>
              <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-zinc-600">
                Navegação
              </div>
              {QUICK_LINKS.map((item) => {
                const Icon = item.icon;
                return (
                  <Command.Item
                    key={item.href}
                    value={item.label}
                    onSelect={() => navigate(item.href)}
                    className={cn(
                      "flex items-center gap-3 px-2 py-2 rounded-md cursor-pointer",
                      "text-zinc-300 text-sm",
                      "data-[selected=true]:bg-zinc-800/60 data-[selected=true]:text-zinc-50",
                      "transition-colors outline-none",
                    )}
                  >
                    <Icon size={14} className="text-zinc-500 shrink-0" />
                    <span className="flex-1">{item.label}</span>
                  </Command.Item>
                );
              })}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
