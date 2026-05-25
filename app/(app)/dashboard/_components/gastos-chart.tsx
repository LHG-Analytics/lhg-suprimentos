"use client";

/**
 * gastos-chart.tsx — LHG-220
 * Gráfico de linha "Gastos por unidade" — últimos 6 meses.
 * Client Component (recharts exige window).
 * Tokens semânticos + useTheme para cores do chart em light/dark.
 */
import { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/utils";
import { useUnidade } from "@/lib/unidade-context";

export interface ChartSerie {
  id:   string;
  name: string;
  data: number[];
  cor:  string;
}

interface Props {
  series: ChartSerie[];
  labels: string[];
}

function buildChartData(activeSeries: ChartSerie[], labels: string[]) {
  return labels.map((label, i) => {
    const point: Record<string, number | string> = { mes: label };
    activeSeries.forEach((s) => {
      point[s.name] = s.data[i] ?? 0;
    });
    return point;
  });
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card shadow-xl p-3 min-w-[180px]">
      <div className="text-xs text-muted-foreground mb-2 font-medium">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: p.color }}
            />
            {p.name}
          </span>
          <span className="font-mono text-foreground tabular-nums">
            {formatBRL(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function GastosChart({ series, labels }: Props) {
  const { unidade } = useUnidade();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = !mounted || resolvedTheme !== "light";

  // Cores adaptadas ao tema
  const gridColor  = isDark ? "rgba(63,63,70,0.5)"   : "rgba(0,0,0,0.07)";
  const tickColor  = isDark ? "#71717a"               : "#9ca3af";

  const filteredSeries =
    unidade.id === "todas"
      ? series
      : series.filter((s) => s.id === unidade.id);

  const [toggledOff, setToggledOff] = useState<string[]>([]);
  const activeSeries =
    unidade.id === "todas"
      ? filteredSeries.filter((s) => !toggledOff.includes(s.id))
      : filteredSeries;

  const chartData = buildChartData(activeSeries, labels);

  function toggle(id: string) {
    setToggledOff((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const semDados = series.every((s) => s.data.every((v) => v === 0));

  return (
    <div className="rounded-xl border border-border bg-card p-5 h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5 shrink-0">
        <div>
          <div className="text-sm font-medium text-foreground">
            {unidade.id === "todas" ? "Gastos por unidade" : `Evolução de gastos · ${unidade.nome}`}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Últimos 6 meses · pedidos enviados e recebidos
          </div>
        </div>

        {/* Legenda toggleável */}
        {unidade.id === "todas" && !semDados && (
          <div className="flex flex-wrap gap-1.5 sm:justify-end">
            {series.map((s) => {
              const on = !toggledOff.includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggle(s.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded text-[11px] border transition-colors",
                    on
                      ? "border-border bg-muted text-foreground"
                      : "border-border/50 text-muted-foreground/50 hover:text-muted-foreground",
                  )}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: on ? s.cor : (isDark ? "#3f3f46" : "#d1d5db") }}
                  />
                  {s.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Chart */}
      {semDados ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground/50">
            Nenhum pedido aprovado nos últimos 6 meses
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={gridColor}
                vertical={false}
              />
              <XAxis
                dataKey="mes"
                tick={{ fill: tickColor, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                dy={8}
              />
              <YAxis
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                tick={{ fill: tickColor, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={42}
              />
              <Tooltip content={<CustomTooltip />} />
              {activeSeries.map((s) => (
                <Line
                  key={s.id}
                  type="monotone"
                  dataKey={s.name}
                  stroke={s.cor}
                  strokeWidth={unidade.id === s.id ? 2.5 : 2}
                  dot={false}
                  activeDot={{ r: 4, fill: s.cor, stroke: isDark ? "#09090b" : "#ffffff", strokeWidth: 2 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
