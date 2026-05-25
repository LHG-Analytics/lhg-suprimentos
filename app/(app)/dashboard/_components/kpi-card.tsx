/**
 * kpi-card.tsx — LHG-204
 * Card de KPI no estilo "Revenue Manager":
 * valor principal · delta % vs período anterior · meta opcional.
 * Usa tokens semânticos (bg-card, border-border, text-foreground) para
 * suportar light e dark mode corretamente.
 */
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string;
  delta?: number;
  deltaKind?: "normal" | "inverse";
  prev?: string;
  meta?: string;
  metaLabel?: string;
  metaDelta?: number;
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
  const deltaGood =
    delta === undefined
      ? null
      : deltaKind === "inverse"
      ? delta < 0
      : delta > 0;

  const deltaColor =
    deltaGood === null
      ? "text-muted-foreground"
      : deltaGood
      ? "text-lhg-500 dark:text-lhg-400"
      : "text-red-500 dark:text-red-400";

  const DeltaIcon =
    delta === undefined || delta === 0
      ? Minus
      : delta > 0
      ? TrendingUp
      : TrendingDown;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-5 flex flex-col gap-3",
        "border-border",
        accent === "positive" && "border-lhg-500/30",
        accent === "negative" && "border-red-500/30",
      )}
    >
      {/* Label */}
      <div className="text-[10px] uppercase tracking-[0.12em] font-medium text-muted-foreground">
        {label}
      </div>

      {/* Valor principal */}
      <div
        className={cn(
          "text-[28px] leading-none font-semibold tracking-tight text-foreground",
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
            <span className="text-[11px] text-muted-foreground/60 ml-0.5">
              vs {prev}
            </span>
          )}
        </div>

        {/* Meta */}
        {meta && (
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">
              {metaLabel}
            </div>
            <div className="text-xs font-mono text-muted-foreground mt-0.5">{meta}</div>
          </div>
        )}
      </div>
    </div>
  );
}
