"use client";

/**
 * gastos-chart.tsx — LHG-204
 * Gráfico de linha "Gastos por unidade" — últimos 6 meses.
 * Client Component (recharts exige window).
 *
 * Unidades reais de compras: Lush Ipiranga, Lush Lapa, Andar de Cima, Altana.
 * Integrado com UnidadeContext — filtra série quando uma unidade está ativa.
 *
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
import { useUnidade } from "@/lib/unidade-context";

// ── Dados mock ─────────────────────────────────────────────────────────────────
const LABELS = ["Dez", "Jan", "Fev", "Mar", "Abr", "Mai"];

const SERIES = [
  { id: "lush-ipiranga", name: "Lush Ipiranga",  data: [82400, 78200, 91200, 88600, 102400, 96800], cor: "#10b981" },
  { id: "lush-lapa",     name: "Lush Lapa",       data: [68200, 71400, 65800, 73600,  77200, 84400], cor: "#38bdf8" },
  { id: "andar-de-cima", name: "Andar de Cima",   data: [54200, 58800, 61400, 64200,  68800, 71200], cor: "#f59e0b" },
  { id: "altana",        name: "Altana",           data: [48600, 52400, 49800, 56200,  61200, 64800], cor: "#a78bfa" },
];

// Transforma para o formato do recharts: [{ mes, "Lush Ipiranga": 82400, ... }]
function buildChartData(activeSeries: typeof SERIES) {
  return LABELS.map((label, i) => {
    const point: Record<string, number | string> = { mes: label };
    activeSeries.forEach((s) => {
      point[s.name] = s.data[i];
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
            {p.name}
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
  const { unidade } = useUnidade();

  // Filtra séries de acordo com a unidade selecionada no contexto
  // Se "todas", mostra todas. Se uma específica, mostra só ela.
  const filteredSeries =
    unidade.id === "todas"
      ? SERIES
      : SERIES.filter((s) => s.id === unidade.id);

  // Toggle local (para quando estiver em "todas")
  const [toggledOff, setToggledOff] = useState<string[]>([]);
  const activeSeries =
    unidade.id === "todas"
      ? filteredSeries.filter((s) => !toggledOff.includes(s.id))
      : filteredSeries;

  const chartData = buildChartData(activeSeries);

  function toggle(id: string) {
    setToggledOff((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5 h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5 shrink-0">
        <div>
          <div className="text-sm font-medium text-zinc-100">
            Gastos por unidade
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">
            Últimos 6 meses · soma de pedidos aprovados
            {unidade.id !== "todas" && (
              <span className="ml-1 text-zinc-400 font-medium">
                · {unidade.nome}
              </span>
            )}
          </div>
        </div>

        {/* Legenda toggleável — só aparece quando todas as unidades estão visíveis */}
        {unidade.id === "todas" && (
          <div className="flex flex-wrap gap-1.5 sm:justify-end">
            {SERIES.map((s) => {
              const on = !toggledOff.includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggle(s.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded text-[11px] border transition-colors",
                    on
                      ? "border-zinc-700 bg-zinc-800/60 text-zinc-200"
                      : "border-zinc-800/60 text-zinc-600 hover:text-zinc-400",
                  )}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: on ? s.cor : "#3f3f46" }}
                  />
                  {s.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Chart — flex-1 + min-h-0 para Recharts preencher o espaço disponível */}
      <div className="flex-1 min-h-0 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
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
            {activeSeries.map((s) => (
              <Line
                key={s.id}
                type="monotone"
                dataKey={s.name}
                stroke={s.cor}
                strokeWidth={unidade.id === s.id ? 2.5 : 2}
                dot={false}
                activeDot={{ r: 4, fill: s.cor, stroke: "#09090b", strokeWidth: 2 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
