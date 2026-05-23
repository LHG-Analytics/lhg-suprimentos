"use client";

/**
 * gastos-chart.tsx — LHG-204
 * Gráfico de linha "Gastos por unidade" — últimos 6 meses.
 * Client Component (recharts exige window).
 * Sprint 0: dados mock. Sprint 6: conectar a queries reais.
 */
import { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/utils";

// ── Dados mock ─────────────────────────────────────────────────────────────────
const LABELS = ["Dez", "Jan", "Fev", "Mar", "Abr", "Mai"];

const SERIES = [
  { name: "Lush Ipiranga",      data: [82400, 78200, 91200, 88600, 102400, 96800] },
  { name: "Lush Vila Mariana",  data: [71200, 74800, 68900, 81200, 79800,  88400] },
  { name: "Lush Moema",         data: [62800, 66400, 71200, 69800, 74200,  82600] },
  { name: "Lush Santo Amaro",   data: [54200, 58800, 61400, 64200, 68800,  71200] },
  { name: "Lush Tatuapé",       data: [48600, 52400, 49800, 56200, 61200,  64800] },
  { name: "Lush Guarulhos",     data: [42100, 44800, 46200, 48600, 52400,  56800] },
];

const COLORS = ["#10b981", "#38bdf8", "#f59e0b", "#a78bfa", "#fb7185", "#22d3ee"];

// Transforma para o formato do recharts: [{ mes, Lush Ipiranga: 82400, ... }]
function buildChartData(active: string[]) {
  return LABELS.map((label, i) => {
    const point: Record<string, number | string> = { mes: label };
    SERIES.forEach((s) => {
      if (active.includes(s.name)) point[s.name] = s.data[i];
    });
    return point;
  });
}

// ── Tooltip customizado ────────────────────────────────────────────────────────
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
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 shadow-xl p-3 min-w-[180px]">
      <div className="text-xs text-zinc-500 mb-2 font-medium">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-zinc-400">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: p.color }}
            />
            {p.name.replace("Lush ", "")}
          </span>
          <span className="font-mono text-zinc-100 tabular-nums">
            {formatBRL(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Componente ─────────────────────────────────────────────────────────────────
export function GastosChart() {
  const [active, setActive] = useState<string[]>(SERIES.map((s) => s.name));
  const chartData = buildChartData(active);

  function toggle(name: string) {
    setActive((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name],
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <div className="text-sm font-medium text-zinc-100">
            Gastos por unidade
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">
            Últimos 6 meses · soma de pedidos aprovados
          </div>
        </div>
        {/* Legenda toggleável */}
        <div className="flex flex-wrap gap-1.5 sm:justify-end">
          {SERIES.map((s, i) => {
            const on = active.includes(s.name);
            return (
              <button
                key={s.name}
                onClick={() => toggle(s.name)}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded text-[11px] border transition-colors",
                  on
                    ? "border-zinc-700 bg-zinc-800/60 text-zinc-200"
                    : "border-zinc-800/60 text-zinc-600 hover:text-zinc-400",
                )}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: on ? COLORS[i] : "#3f3f46" }}
                />
                {s.name.replace("Lush ", "")}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart */}
      <div className="-mx-2">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgb(39 39 42 / 0.6)"
              vertical={false}
            />
            <XAxis
              dataKey="mes"
              tick={{ fill: "#71717a", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              dy={8}
            />
            <YAxis
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              tick={{ fill: "#71717a", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={42}
            />
            <Tooltip content={<CustomTooltip />} />
            {SERIES.map((s, i) =>
              active.includes(s.name) ? (
                <Line
                  key={s.name}
                  type="monotone"
                  dataKey={s.name}
                  stroke={COLORS[i]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: COLORS[i], stroke: "#09090b", strokeWidth: 2 }}
                />
              ) : null,
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
