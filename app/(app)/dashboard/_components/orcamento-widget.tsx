"use client";

/**
 * orcamento-widget.tsx — LHG-222
 * Widget de Orçamento vs Realizado no dashboard.
 * LHG-226: filtra apenas categorias rastreáveis (CATEGORIAS_ORCAMENTO).
 * Tokens semânticos para suporte a light/dark mode.
 */
import { type OrcamentoSheet } from "@/lib/sheets/client";
import { CATEGORIAS_ORCAMENTO } from "@/lib/omie/familia-map";
import { cn } from "@/lib/utils";

const CATS_VALIDAS = new Set<string>(CATEGORIAS_ORCAMENTO);

const MESES_PT_LABEL: Record<string, string> = {
  jan: "Janeiro", fev: "Fevereiro", mar: "Março",    abr: "Abril",
  mai: "Maio",    jun: "Junho",     jul: "Julho",    ago: "Agosto",
  set: "Setembro",out: "Outubro",   nov: "Novembro", dez: "Dezembro",
};

function fBRL(v: number) {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function ProgressBar({ pct, warn, className }: { pct: number; warn: boolean; className?: string }) {
  return (
    <div className={cn("h-2 w-full rounded-full bg-muted/60 overflow-hidden", className)}>
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500",
          pct >= 100 ? "bg-red-500"
          : warn     ? "bg-amber-500"
          :            "bg-lhg-500",
        )}
        style={{ width: `${Math.max(Math.min(pct, 100), pct > 0 ? 3 : 0)}%` }}
      />
    </div>
  );
}

export interface OrcamentoWidgetProps {
  orcamento:          OrcamentoSheet | null;
  gastosPorCategoria: Record<string, number>;
}

/** Skeleton para Suspense fallback */
export function OrcamentoWidgetSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4 min-h-[200px]">
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <div className="h-2.5 w-36 rounded bg-muted animate-pulse" />
          <div className="h-2 w-20 rounded bg-muted animate-pulse" />
        </div>
        <div className="h-6 w-10 rounded-md bg-muted animate-pulse" />
      </div>
      <div className="space-y-2">
        <div className="h-7 w-40 rounded bg-muted animate-pulse" />
        <div className="h-1.5 w-full rounded-full bg-muted animate-pulse" />
      </div>
      <div className="border-t border-border pt-2 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-1">
            <div className="flex justify-between">
              <div className="h-2.5 w-32 rounded bg-muted animate-pulse" />
              <div className="h-2.5 w-24 rounded bg-muted animate-pulse" />
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function OrcamentoWidget({ orcamento, gastosPorCategoria }: OrcamentoWidgetProps) {
  if (!orcamento) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 flex items-center justify-center min-h-[180px]">
        <p className="text-xs text-muted-foreground/50">Planilha de orçamento não configurada</p>
      </div>
    );
  }

  const MESES_PT = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"] as const;
  type MesKey = typeof MESES_PT[number];
  const mes = MESES_PT[new Date().getMonth()] as MesKey;
  const mesLabel = MESES_PT_LABEL[mes] ?? mes;

  const catsRastreaveis = orcamento.categorias.filter(
    (c) => CATS_VALIDAS.has(c.categoria),
  );

  const totalOrcado = catsRastreaveis.reduce((s, c) => s + (c.mensal[mes] ?? 0), 0);
  const totalGasto  = Object.entries(gastosPorCategoria)
    .filter(([cat]) => CATS_VALIDAS.has(cat))
    .reduce((s, [, v]) => s + v, 0);
  const totalPct    = totalOrcado > 0 ? (totalGasto / totalOrcado) * 100 : 0;
  const totalWarn   = totalPct >= 80;
  const totalOver   = totalPct >= 100;

  const catRows = catsRastreaveis
    .filter((c) => (c.mensal[mes] ?? 0) > 0)
    .map((c) => {
      const orcado = c.mensal[mes] ?? 0;
      const gasto  = gastosPorCategoria[c.categoria] ?? 0;
      const pct    = orcado > 0 ? (gasto / orcado) * 100 : 0;
      return { ...c, orcado, gasto, pct };
    })
    // Ordena: primeiro quem mais gastou (%), depois quem tem maior orçamento
    .sort((a, b) => b.pct - a.pct || b.orcado - a.orcado);

  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-medium text-muted-foreground">
            ORÇAMENTO VS REALIZADO
          </div>
          <div className="text-xs text-muted-foreground/70 mt-0.5">
            {mesLabel} · {orcamento.ano}
          </div>
        </div>
        <div
          className={cn(
            "text-xs font-mono font-semibold px-2 py-0.5 rounded-md",
            totalOver   ? "bg-red-500/10 text-red-600 dark:text-red-400"
            : totalWarn ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
            :             "bg-lhg-500/10 text-lhg-600 dark:text-lhg-400",
          )}
        >
          {totalPct.toFixed(0)}%
        </div>
      </div>

      {/* Total geral */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-baseline">
          <span className="text-[22px] font-semibold font-mono leading-none text-foreground">
            {fBRL(totalGasto)}
          </span>
          <span className="text-xs text-muted-foreground">
            de {fBRL(totalOrcado)}
          </span>
        </div>
        <ProgressBar pct={totalPct} warn={totalWarn} />
        {totalOver && (
          <p className="text-[10px] text-red-600 dark:text-red-400">
            Orçamento excedido em {fBRL(totalGasto - totalOrcado)}
          </p>
        )}
      </div>

      {/* Por categoria */}
      {catRows.length > 0 && (
        <div className="border-t border-border pt-2 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
              Por categoria
            </div>
            <span className="text-[10px] text-muted-foreground/50 font-mono">
              {catRows.length} categorias
            </span>
          </div>

          {/* Lista scrollável — permite ver todas as categorias */}
          <div className="space-y-3.5 max-h-[360px] overflow-y-auto pr-1.5 -mr-1.5">
            {catRows.map((c) => {
              const over  = c.pct >= 100;
              const warn  = c.pct >= 80 && !over;
              const resto = c.orcado - c.gasto;
              return (
                <div key={c.categoria} className="space-y-1.5">
                  {/* Nome + percentual */}
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-xs font-medium text-foreground truncate flex-1" title={c.categoria}>
                      {c.categoria}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-semibold font-mono tabular-nums shrink-0 px-1.5 py-0.5 rounded",
                        over   ? "bg-red-500/10 text-red-600 dark:text-red-400"
                        : warn ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        :        "bg-muted text-muted-foreground",
                      )}
                    >
                      {c.pct.toFixed(0)}%
                    </span>
                  </div>

                  <ProgressBar pct={c.pct} warn={warn} />

                  {/* Realizado · orçado · saldo */}
                  <div className="flex justify-between items-baseline gap-2 tabular-nums">
                    <span className="text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground/90">{fBRL(c.gasto)}</span>
                      {" "}de {fBRL(c.orcado)}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] shrink-0",
                        over ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground/70",
                      )}
                    >
                      {over ? `+${fBRL(-resto)} acima` : `restam ${fBRL(resto)}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
