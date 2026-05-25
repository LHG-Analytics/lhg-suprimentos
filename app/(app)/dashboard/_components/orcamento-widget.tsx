"use client";

/**
 * orcamento-widget.tsx — LHG-222
 * Widget de Orçamento vs Realizado no dashboard.
 * Exibe barra de progresso geral + categorias com maior utilização.
 *
 * LHG-226: filtra apenas categorias rastreáveis pelo sistema de compras
 * (definidas em CATEGORIAS_ORCAMENTO). Categorias fixas da planilha como
 * "Dedetização", "Ecad", "Locação de Equipamentos" são ignoradas pois
 * não passam pelo Omie e nunca terão "Realizado" calculado.
 */
import { type OrcamentoSheet } from "@/lib/sheets/client";
import { CATEGORIAS_ORCAMENTO } from "@/lib/omie/familia-map";
import { cn } from "@/lib/utils";

// Conjunto para lookup O(1)
const CATS_VALIDAS = new Set<string>(CATEGORIAS_ORCAMENTO);

const MESES_PT_LABEL: Record<string, string> = {
  jan: "Janeiro", fev: "Fevereiro", mar: "Março",    abr: "Abril",
  mai: "Maio",    jun: "Junho",     jul: "Julho",    ago: "Agosto",
  set: "Setembro",out: "Outubro",   nov: "Novembro", dez: "Dezembro",
};

function fBRL(v: number) {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function ProgressBar({ pct, warn }: { pct: number; warn: boolean }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500",
          pct >= 100 ? "bg-red-500"
          : warn     ? "bg-amber-500"
          :            "bg-lhg-500",
        )}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

export interface OrcamentoWidgetProps {
  orcamento:         OrcamentoSheet | null;
  /** Gasto real no mês corrente, por categoria (chave = categoria exata da planilha) */
  gastosPorCategoria: Record<string, number>;
}

export function OrcamentoWidget({ orcamento, gastosPorCategoria }: OrcamentoWidgetProps) {
  if (!orcamento) {
    return (
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5 flex items-center justify-center min-h-[180px]">
        <p className="text-xs text-zinc-600">Planilha de orçamento não configurada</p>
      </div>
    );
  }

  const MESES_PT = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"] as const;
  type MesKey = typeof MESES_PT[number];
  const mes = MESES_PT[new Date().getMonth()] as MesKey;
  const mesLabel = MESES_PT_LABEL[mes] ?? mes;

  // Filtra apenas categorias rastreáveis pelo sistema (produtos + serviços via Omie)
  // Exclui custo fixos da planilha que não passam pelo sistema de compras
  // (ex: Dedetização, Ecad, Locação de Equipamentos)
  const catsRastreaveis = orcamento.categorias.filter(
    (c) => CATS_VALIDAS.has(c.categoria),
  );

  // Total do mês — apenas categorias rastreáveis
  const totalOrcado = catsRastreaveis.reduce((s, c) => s + (c.mensal[mes] ?? 0), 0);
  // Gasto real: filtra apenas as categorias rastreáveis
  const totalGasto  = Object.entries(gastosPorCategoria)
    .filter(([cat]) => CATS_VALIDAS.has(cat))
    .reduce((s, [, v]) => s + v, 0);
  const totalPct    = totalOrcado > 0 ? (totalGasto / totalOrcado) * 100 : 0;
  const totalWarn   = totalPct >= 80;
  const totalOver   = totalPct >= 100;

  // Categorias com orçamento > 0 no mês, ordenadas por % de uso
  const catRows = catsRastreaveis
    .filter((c) => (c.mensal[mes] ?? 0) > 0)
    .map((c) => {
      const orcado = c.mensal[mes] ?? 0;
      const gasto  = gastosPorCategoria[c.categoria] ?? 0;
      const pct    = orcado > 0 ? (gasto / orcado) * 100 : 0;
      return { ...c, orcado, gasto, pct };
    })
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 6);

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5 flex flex-col gap-4">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-medium text-zinc-500">
            ORÇAMENTO VS REALIZADO
          </div>
          <div className="text-xs text-zinc-600 mt-0.5">
            {mesLabel} · {orcamento.ano}
          </div>
        </div>
        <div
          className={cn(
            "text-xs font-mono font-semibold px-2 py-0.5 rounded-md",
            totalOver   ? "bg-red-500/10 text-red-400"
            : totalWarn ? "bg-amber-500/10 text-amber-400"
            :             "bg-lhg-500/10 text-lhg-400",
          )}
        >
          {totalPct.toFixed(0)}%
        </div>
      </div>

      {/* Total geral */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-baseline">
          <span className="text-[22px] font-semibold font-mono leading-none text-zinc-50">
            {fBRL(totalGasto)}
          </span>
          <span className="text-xs text-zinc-500">
            de {fBRL(totalOrcado)}
          </span>
        </div>
        <ProgressBar pct={totalPct} warn={totalWarn} />
        {totalOver && (
          <p className="text-[10px] text-red-400">
            Orçamento excedido em {fBRL(totalGasto - totalOrcado)}
          </p>
        )}
      </div>

      {/* Divisor */}
      {catRows.length > 0 && (
        <div className="border-t border-zinc-800/60 pt-2 space-y-2.5">
          <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">
            Por categoria
          </div>

          {catRows.map((c) => (
            <div key={c.categoria} className="space-y-1">
              <div className="flex justify-between items-center gap-2">
                <span className="text-xs text-zinc-400 truncate flex-1" title={c.categoria}>
                  {c.categoria}
                </span>
                <span
                  className={cn(
                    "text-[10px] font-mono shrink-0",
                    c.pct >= 100 ? "text-red-400"
                    : c.pct >= 80 ? "text-amber-400"
                    :               "text-zinc-500",
                  )}
                >
                  {fBRL(c.gasto)}/{fBRL(c.orcado)}
                </span>
              </div>
              <ProgressBar pct={c.pct} warn={c.pct >= 80} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
