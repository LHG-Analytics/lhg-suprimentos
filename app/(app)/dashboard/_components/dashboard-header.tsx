"use client";

/**
 * dashboard-header.tsx
 * Header do dashboard: filtros de período + ações.
 * Tokens semânticos para suporte a light/dark mode.
 */
import { useState } from "react";
import Link from "next/link";
import { Download, Plus, ChevronDown, Calendar, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DashboardHeaderProps {
  periodoLabel: string;
}

const PERIODOS = [
  { id: "mes",       label: "Este mês" },
  { id: "trimestre", label: "3 meses"  },
  { id: "semestre",  label: "6 meses"  },
  { id: "ano",       label: "1 ano"    },
] as const;

type PeriodoId = (typeof PERIODOS)[number]["id"] | "custom";

function toInputDate(d: Date) {
  return d.toISOString().split("T")[0];
}
function fromInputDate(s: string) {
  return new Date(s + "T00:00:00");
}
function fmtBr(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function DashboardHeader({ periodoLabel }: DashboardHeaderProps) {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [periodo, setPeriodo]       = useState<PeriodoId>("mes");
  const [customStart, setCustomStart] = useState(toInputDate(firstOfMonth));
  const [customEnd,   setCustomEnd]   = useState(toInputDate(today));
  const [popOpen, setPopOpen]       = useState(false);

  const displayLabel =
    periodo === "custom"
      ? `${fmtBr(fromInputDate(customStart))} – ${fmtBr(fromInputDate(customEnd))}`
      : periodoLabel;

  function applyCustom() {
    setPeriodo("custom");
    setPopOpen(false);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-1 min-w-0">

      {/* Filtros de período */}
      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">

        {/* Chips pré-definidos */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted border border-border">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriodo(p.id)}
              className={cn(
                "h-7 px-3 rounded-md text-xs font-medium transition-all",
                periodo === p.id
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Data do período */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar size={11} />
          <span>{displayLabel}</span>
        </div>

        {/* Customizar — Popover com date range */}
        <Popover open={popOpen} onOpenChange={setPopOpen}>
          <PopoverTrigger
            className={cn(
              "hidden lg:flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium border transition-colors outline-none",
              periodo === "custom"
                ? "border-lhg-500/50 bg-lhg-500/10 text-lhg-600 dark:text-lhg-300"
                : "border-border text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            Customizar
            <ChevronDown
              size={11}
              className={cn("transition-transform", popOpen && "rotate-180")}
            />
          </PopoverTrigger>

          <PopoverContent
            align="start"
            sideOffset={6}
            className="w-72 bg-card border-border p-4 space-y-4"
          >
            <p className="text-xs font-medium text-foreground/70">Período customizado</p>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[11px] text-muted-foreground uppercase tracking-wider">
                  De
                </label>
                <input
                  type="date"
                  value={customStart}
                  max={customEnd}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-md bg-background border border-border text-foreground text-xs focus:outline-none focus:border-ring"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-muted-foreground uppercase tracking-wider">
                  Até
                </label>
                <input
                  type="date"
                  value={customEnd}
                  min={customStart}
                  max={toInputDate(today)}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-md bg-background border border-border text-foreground text-xs focus:outline-none focus:border-ring"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setPopOpen(false)}
                className="flex-1 h-8 rounded-md border border-border text-muted-foreground hover:text-foreground text-xs transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={applyCustom}
                disabled={!customStart || !customEnd}
                className="flex-1 h-8 rounded-md bg-lhg-500 hover:bg-lhg-600 text-white font-medium text-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check size={12} />
                Aplicar
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Ações */}
      <div className="flex items-center gap-2 shrink-0">
        <button className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-border text-sm transition-colors">
          <Download size={13} />
          <span className="hidden sm:inline">Exportar</span>
        </button>
        <Link
          href="/cotacoes/nova"
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-lhg-500 hover:bg-lhg-600 text-white font-medium text-sm transition-colors"
        >
          <Plus size={13} />
          <span>Nova cotação</span>
        </Link>
      </div>
    </div>
  );
}
