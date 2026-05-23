/**
 * kpi-card.tsx — LHG-204
 * Card de KPI no estilo "Revenue Manager":
 * valor principal · delta % vs período anterior · meta opcional.
 */
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string;
  delta?: number;        // % variação (positivo = alta, negativo = queda)
  deltaKind?: "normal" | "inverse"; // inverse: queda é boa (ex: pedidos pendentes)
  prev?: string;         // valor do período anterior (ex: "R$ 158.420")
  meta?: string;         // meta ou benchmark
  metaLabel?: string;    // rótulo da meta (default: "META")
  metaDelta?: number;    // % vs meta
  accent?: "positive" | "negative" | "neutral";
  mono?: boolean;
}

export function KpiCard({
  label,
  value,
  delta,
  deltaKind = "normal",
  prev,
  meta,
  metaLabel = "META",
  accent = "neutral",
  mono = false,
}: KpiCardProps) {
  // Determina se o delta é "bom" levando em conta a inversão
  const deltaGood =
    delta === undefined
      ? null
      : deltaKind === "inverse"
      ? delta < 0
      : delta > 0;

  const deltaColor =
    deltaGood === null
      ? "text-zinc-500"
      : deltaGood
      ? "text-lhg-400"
      : "text-red-400";

  const DeltaIcon =
    delta === undefined || delta === 0
      ? Minus
      : delta > 0
      ? TrendingUp
      : TrendingDown;

  return (
    <div
      className={cn(
        "rounded-xl border bg-zinc-900/40 p-5 flex flex-col gap-3",
        "border-zinc-800/80",
        accent === "positive" && "border-lhg-500/20",
        accent === "negative" && "border-red-500/20",
      )}
    >
      {/* Label */}
      <div className="text-[10px] uppercase tracking-[0.12em] font-medium text-zinc-500">
        {label}
      </div>

      {/* Valor principal */}
      <div
        className={cn(
          "text-[28px] leading-none font-semibold tracking-tight text-zinc-50",
          mono && "font-mono",
        )}
      >
        {value}
      </div>

      {/* Delta + comparativo */}
      <div className="flex items-center justify-between mt-auto">
        <div className="flex items-center gap-1.5">
          {delta !== undefined && (
            <>
              <DeltaIcon size={13} className={deltaColor} />
              <span className={cn("text-xs font-mono font-medium", deltaColor)}>
                {delta > 0 ? "+" : ""}
                {delta.toFixed(1)}%
              </span>
            </>
          )}
          {prev && (
            <span className="text-[11px] text-zinc-600 ml-0.5">
              vs {prev}
            </span>
          )}
        </div>

        {/* Meta */}
        {meta && (
          <div className="text-right">
            <div className="text-[10px] text-zinc-600 uppercase tracking-wider">
              {metaLabel}
            </div>
            <div className="text-xs font-mono text-zinc-400 mt-0.5">{meta}</div>
          </div>
        )}
      </div>
    </div>
  );
}
