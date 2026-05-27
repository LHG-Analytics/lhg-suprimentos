"use client";

/**
 * dashboard-header.tsx
 * Header do dashboard: filtros de período + ações.
 * Tokens semânticos para suporte a light/dark mode.
 *
 * Filtros propagados via URL (?from=YYYY-MM-DD&to=YYYY-MM-DD) para que
 * o OmieResumoSection (Server Component) possa ler e re-buscar os dados.
 */
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Download, Plus, ChevronDown, Calendar, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/** Props vindas do Server Component (lidas de searchParams) */
interface DashboardHeaderProps {
  from?: string; // ISO YYYY-MM-DD
  to?:   string; // ISO YYYY-MM-DD
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
function fmtBr(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Calcula a data de início de cada período pré-definido */
function computeFromDate(periodoId: Exclude<PeriodoId, "custom">, hoje: Date): Date {
  switch (periodoId) {
    case "mes":       return new Date(hoje.getFullYear(), hoje.getMonth(),     1);
    case "trimestre": return new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1);
    case "semestre":  return new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1);
    case "ano":       return new Date(hoje.getFullYear() - 1, hoje.getMonth(), 1);
  }
}

/** Detecta qual chip está ativo comparando a data 'from' com os períodos canônicos */
function detectPeriodo(from: string | undefined, hoje: Date): PeriodoId {
  if (!from) return "mes";
  const fromDate = new Date(from + "T00:00:00");
  for (const p of PERIODOS) {
    if (fromDate.toDateString() === computeFromDate(p.id, hoje).toDateString()) return p.id;
  }
  return "custom";
}

export function DashboardHeader({ from, to }: DashboardHeaderProps) {
  const router = useRouter();
  // useMemo: new Date() não muda durante o ciclo de vida do componente
  const hoje = useMemo(() => new Date(), []);

  // Período ativo derivado das props (sem useState — fonte de verdade é a URL)
  const periodo = detectPeriodo(from, hoje);

  // Estado local apenas para os date-pickers do popover customizado
  const [customStart, setCustomStart] = useState(
    from ?? toInputDate(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
  );
  const [customEnd, setCustomEnd] = useState(to ?? toInputDate(hoje));
  const [popOpen, setPopOpen] = useState(false);

  // Rótulo de data exibido ao lado do ícone de calendário
  const fromDate     = from ? new Date(from + "T00:00:00") : new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const toDate       = to   ? new Date(to   + "T00:00:00") : hoje;
  const displayLabel = `${fmtBr(fromDate)} – ${fmtBr(toDate)}`;

  /** Navega para ?from=...&to=... sem adicionar entrada no histórico */
  function navigateTo(fromIso: string, toIso: string) {
    router.replace(`?from=${fromIso}&to=${toIso}`, { scroll: false });
  }

  function handlePreset(periodoId: Exclude<PeriodoId, "custom">) {
    navigateTo(toInputDate(computeFromDate(periodoId, hoje)), toInputDate(hoje));
  }

  function applyCustom() {
    if (!customStart || !customEnd) return;
    navigateTo(customStart, customEnd);
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
              onClick={() => handlePreset(p.id)}
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
                  max={toInputDate(hoje)}
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
