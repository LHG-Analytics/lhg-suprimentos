"use client";

/**
 * dashboard-header.tsx
 * Header do dashboard: filtros de período + ações.
 * Client Component — mantém estado do período selecionado.
 */
import Link from "next/link";
import { Download, Plus, ChevronDown, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface DashboardHeaderProps {
  /** Rótulo do período atual, e.g. "01/05/2026 – 23/05/2026" */
  periodoLabel: string;
}

// ── Períodos disponíveis ────────────────────────────────────────────────────────
const PERIODOS = [
  { id: "mes",      label: "Este mês" },
  { id: "trimestre", label: "3 meses" },
  { id: "semestre",  label: "6 meses" },
  { id: "ano",       label: "1 ano" },
] as const;

type PeriodoId = (typeof PERIODOS)[number]["id"];

// ── Componente ─────────────────────────────────────────────────────────────────
export function DashboardHeader({ periodoLabel }: DashboardHeaderProps) {
  // Sprint 0: estado local apenas. Sprint 6: conectar a queries reais.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [periodo, setPeriodo] = useState<PeriodoId>("mes");

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-1 min-w-0">
      {/* ── Filtros de período ─────────────────────────────────────── */}
      <div className="flex items-center gap-1 min-w-0">
        {/* Chips de período */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-zinc-900 border border-zinc-800/80">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriodo(p.id)}
              className={cn(
                "h-7 px-3 rounded-md text-xs font-medium transition-all",
                periodo === p.id
                  ? "bg-zinc-700 text-zinc-100 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Data do período atual */}
        <div className="hidden sm:flex items-center gap-1.5 ml-2 text-xs text-zinc-600">
          <Calendar size={11} />
          <span>{periodoLabel}</span>
        </div>

        {/* Filtro customizado (placeholder) */}
        <button className="hidden lg:flex items-center gap-1 ml-1 h-7 px-2 rounded-md text-xs text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/60 transition-colors">
          Customizar
          <ChevronDown size={11} />
        </button>
      </div>

      {/* ── Ações ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 shrink-0">
        <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 text-sm transition-colors">
          <Download size={13} />
          <span className="hidden sm:inline">Exportar</span>
        </button>
        <Link
          href="/cotacoes/nova"
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-lhg-500 hover:bg-lhg-400 text-zinc-950 font-medium text-sm transition-colors"
        >
          <Plus size={13} />
          <span>Nova cotação</span>
        </Link>
      </div>
    </div>
  );
}

// ── useState precisa ser importado (client component) ─────────────────────────
import { useState } from "react";
