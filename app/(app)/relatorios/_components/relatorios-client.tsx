"use client";

/**
 * relatorios-client.tsx — LHG-221
 * Componente cliente para a página de Relatórios.
 * Recharts + tabelas + download CSV.
 */
import { useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, Package,
  FileCheck, Download, CheckCircle2, Clock, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/utils";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Resumo {
  totalGasto12m:  number;
  economia12m:    number;
  economia3m:     number;
  mediaMensal:    number;
  ticketMedio:    number;
  totalPedidos:   number;
  nfsLancadas:    number;
}

interface FornecedorRow {
  id: string; nome: string; categoria: string | null;
  rating: number | null; total: number; pedidos: number;
}

interface CategoriaRow { categoria: string; total: number; }

interface EvolucaoMes {
  mes: string; key: string; gasto: number; economia: number;
}

interface NFRow {
  id: string; numero: string | null; pedidoNumero: string;
  fornecedor: string; valorTotal: number | null; emissao: string | null;
  lancadaOmie: boolean; status: string; createdAt: string;
}

interface Props {
  resumo:      Resumo;
  fornecedores: FornecedorRow[];
  categorias:  CategoriaRow[];
  evolucao:    EvolucaoMes[];
  nfs:         NFRow[];
}

// ── Paleta de cores para o gráfico de pizza ───────────────────────────────────
const CORES = [
  "#10b981","#38bdf8","#f59e0b","#a78bfa",
  "#f43f5e","#fb923c","#34d399","#60a5fa",
  "#e879f9","#facc15","#4ade80","#818cf8",
];

// ── Tooltip customizado ────────────────────────────────────────────────────────
function CustomBarTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; fill: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 shadow-xl p-3 min-w-[160px]">
      <div className="text-xs text-zinc-500 mb-2">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-4 text-xs">
          <span className="text-zinc-400">{p.name === "gasto" ? "Gasto" : "Economia"}</span>
          <span className="font-mono text-zinc-100">{formatBRL(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ── KPI card mínimo ───────────────────────────────────────────────────────────
function KpiMini({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; accent?: "green" | "red" | "neutral";
}) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 flex items-start gap-3">
      <div className={cn(
        "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
        accent === "green"  ? "bg-emerald-500/10 text-emerald-400" :
        accent === "red"    ? "bg-red-500/10 text-red-400" :
        "bg-zinc-800 text-zinc-400",
      )}>
        <Icon size={16} />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">{label}</div>
        <div className="text-xl font-semibold font-mono text-zinc-50 mt-0.5">{value}</div>
        {sub && <div className="text-[11px] text-zinc-600 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ── Export CSV ────────────────────────────────────────────────────────────────
function exportCSV(rows: NFRow[]) {
  const header = "NF,Pedido,Fornecedor,Valor,Emissão,Status Omie";
  const lines  = rows.map((r) =>
    [
      r.numero ?? "—",
      r.pedidoNumero,
      `"${r.fornecedor}"`,
      (r.valorTotal ?? 0).toFixed(2).replace(".", ","),
      r.emissao ?? "—",
      r.lancadaOmie ? "Lançada" : "Pendente",
    ].join(","),
  );
  const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `nfs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Componente principal ──────────────────────────────────────────────────────

export function RelatoriosClient({ resumo, fornecedores, categorias, evolucao, nfs }: Props) {
  const [abaAtiva, setAbaAtiva] = useState<"evolucao" | "fornecedores" | "nfs">("evolucao");

  const totalCategorias = categorias.reduce((s, c) => s + c.total, 0);

  return (
    <div className="max-w-[1400px] mx-auto space-y-5 pb-10">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Relatórios</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Últimos 12 meses · pedidos recebidos e finalizados</p>
        </div>
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiMini
          label="Total gasto"
          value={formatBRL(resumo.totalGasto12m)}
          sub={`Média ${formatBRL(resumo.mediaMensal)}/mês`}
          icon={DollarSign}
          accent="neutral"
        />
        <KpiMini
          label="Economia acumulada"
          value={formatBRL(resumo.economia12m)}
          sub={`${resumo.totalGasto12m > 0 ? ((resumo.economia12m / resumo.totalGasto12m) * 100).toFixed(1) : 0}% do total`}
          icon={TrendingDown}
          accent="green"
        />
        <KpiMini
          label="Pedidos finalizados"
          value={resumo.totalPedidos.toString()}
          sub={`Ticket médio ${formatBRL(resumo.ticketMedio)}`}
          icon={Package}
          accent="neutral"
        />
        <KpiMini
          label="NFs lançadas Omie"
          value={resumo.nfsLancadas.toString()}
          sub={`de ${nfs.length} registradas`}
          icon={FileCheck}
          accent={resumo.nfsLancadas < nfs.length ? "red" : "green"}
        />
      </div>

      {/* ── Gráfico evolução + pizza categorias ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-[320px]">

        {/* Barras: gasto vs economia */}
        <div className="lg:col-span-2 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5 flex flex-col">
          <div className="mb-4 shrink-0">
            <div className="text-sm font-medium text-zinc-100">Evolução mensal</div>
            <div className="text-xs text-zinc-500 mt-0.5">Gasto total e economia por IA — últimos 12 meses</div>
          </div>
          <div className="flex-1 min-h-0 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={evolucao} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(39 39 42/0.6)" vertical={false} />
                <XAxis dataKey="mes" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} dy={8} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} width={42} />
                <Tooltip content={<CustomBarTooltip />} />
                <Bar dataKey="gasto"    fill="#38bdf8" radius={[3, 3, 0, 0]} maxBarSize={32} />
                <Bar dataKey="economia" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Legenda */}
          <div className="flex items-center gap-4 mt-3 shrink-0">
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <span className="w-3 h-3 rounded-sm bg-sky-400 shrink-0" /> Gasto
            </div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <span className="w-3 h-3 rounded-sm bg-emerald-400 shrink-0" /> Economia IA
            </div>
          </div>
        </div>

        {/* Pizza: por categoria */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5 flex flex-col">
          <div className="mb-2 shrink-0">
            <div className="text-sm font-medium text-zinc-100">Por categoria</div>
            <div className="text-xs text-zinc-500 mt-0.5">% do total gasto</div>
          </div>

          {categorias.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs text-zinc-600">Sem dados</p>
            </div>
          ) : (
            <>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categorias}
                      dataKey="total"
                      nameKey="categoria"
                      cx="50%"
                      cy="50%"
                      innerRadius="55%"
                      outerRadius="80%"
                      paddingAngle={2}
                    >
                      {categorias.map((_, i) => (
                        <Cell key={i} fill={CORES[i % CORES.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) => typeof v === "number" ? formatBRL(v) : String(v)}
                      contentStyle={{ background: "#09090b", border: "1px solid #27272a", borderRadius: 8, fontSize: 12 }}
                      itemStyle={{ color: "#a1a1aa" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Lista de categorias */}
              <div className="mt-2 space-y-1.5 max-h-[140px] overflow-y-auto">
                {categorias.slice(0, 6).map((c, i) => (
                  <div key={c.categoria} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CORES[i % CORES.length] }} />
                      <span className="text-zinc-400 truncate">{c.categoria}</span>
                    </div>
                    <span className="font-mono text-zinc-500 shrink-0 ml-2">
                      {totalCategorias > 0 ? ((c.total / totalCategorias) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Abas: evolução / fornecedores / NFs ────────────────────── */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-zinc-800/80 px-5 pt-4 gap-5">
          {(["evolucao", "fornecedores", "nfs"] as const).map((tab) => {
            const labels = { evolucao: "Top fornecedores", fornecedores: "Por fornecedor", nfs: "Notas fiscais" };
            const labelsFinal = { evolucao: "Top fornecedores", fornecedores: "Por fornecedor", nfs: "NFs registradas" };
            return (
              <button
                key={tab}
                onClick={() => setAbaAtiva(tab)}
                className={cn(
                  "pb-3 text-sm font-medium border-b-2 transition-colors",
                  abaAtiva === tab
                    ? "border-emerald-500 text-zinc-100"
                    : "border-transparent text-zinc-500 hover:text-zinc-300",
                )}
              >
                {labelsFinal[tab]}
              </button>
            );
          })}
        </div>

        <div className="p-5">
          {/* Top fornecedores */}
          {abaAtiva === "evolucao" && (
            <div className="overflow-x-auto">
              {fornecedores.length === 0 ? (
                <p className="text-xs text-zinc-600 py-8 text-center">Nenhum pedido finalizado nos últimos 12 meses</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      {["Fornecedor", "Categoria", "Pedidos", "Total gasto", "% do total", "Rating"].map((h) => (
                        <th key={h} className="text-left text-[11px] uppercase tracking-wider text-zinc-500 font-medium pb-3 pr-4">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fornecedores.map((f, i) => {
                      const totalGeral = fornecedores.reduce((s, x) => s + x.total, 0);
                      const pct = totalGeral > 0 ? (f.total / totalGeral) * 100 : 0;
                      return (
                        <tr key={f.id} className="border-b border-zinc-800/40 hover:bg-zinc-800/20 transition-colors">
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-zinc-600 font-mono w-5">{i + 1}</span>
                              <span className="text-zinc-200 font-medium">{f.nome}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-zinc-500 text-xs">{f.categoria ?? "—"}</td>
                          <td className="py-3 pr-4 text-zinc-400 font-mono text-center">{f.pedidos}</td>
                          <td className="py-3 pr-4 font-mono text-zinc-100">{formatBRL(f.total)}</td>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-zinc-800 rounded-full h-1.5 min-w-[60px]">
                                <div
                                  className="h-1.5 rounded-full bg-sky-500"
                                  style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                              </div>
                              <span className="text-xs text-zinc-500 font-mono w-10 shrink-0">{pct.toFixed(0)}%</span>
                            </div>
                          </td>
                          <td className="py-3">
                            {f.rating != null ? (
                              <span className={cn(
                                "text-xs font-mono font-medium",
                                f.rating >= 4 ? "text-emerald-400" : f.rating >= 3 ? "text-amber-400" : "text-red-400",
                              )}>
                                ★ {f.rating.toFixed(1)}
                              </span>
                            ) : (
                              <span className="text-zinc-600 text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Por fornecedor (mesmo conteúdo, view alternativa) */}
          {abaAtiva === "fornecedores" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {fornecedores.length === 0 ? (
                <p className="text-xs text-zinc-600 py-8 col-span-3 text-center">Nenhum dado disponível</p>
              ) : (
                fornecedores.map((f, i) => {
                  const totalGeral = fornecedores.reduce((s, x) => s + x.total, 0);
                  const pct = totalGeral > 0 ? (f.total / totalGeral) * 100 : 0;
                  return (
                    <div key={f.id} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <div className="text-sm font-medium text-zinc-100 leading-snug">{f.nome}</div>
                          <div className="text-[11px] text-zinc-500 mt-0.5">{f.categoria ?? "Sem categoria"}</div>
                        </div>
                        <span className="text-[10px] text-zinc-600 font-mono shrink-0">#{i + 1}</span>
                      </div>
                      <div className="text-lg font-mono font-semibold text-zinc-50">{formatBRL(f.total)}</div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 bg-zinc-800 rounded-full h-1">
                          <div className="h-1 rounded-full bg-emerald-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <span className="text-[11px] text-zinc-600">{pct.toFixed(1)}%</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-zinc-600">
                        <span>{f.pedidos} pedido{f.pedidos !== 1 ? "s" : ""}</span>
                        {f.rating != null && <span className="text-amber-400">★ {f.rating.toFixed(1)}</span>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* NFs registradas */}
          {abaAtiva === "nfs" && (
            <>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-zinc-500">{nfs.length} notas fiscais registradas</span>
                <button
                  onClick={() => exportCSV(nfs)}
                  className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-200 transition-colors border border-zinc-800 rounded-lg px-3 py-1.5"
                >
                  <Download size={12} />
                  Exportar CSV
                </button>
              </div>

              <div className="overflow-x-auto">
                {nfs.length === 0 ? (
                  <p className="text-xs text-zinc-600 py-8 text-center">Nenhuma NF registrada</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        {["NF", "Pedido", "Fornecedor", "Valor", "Emissão", "Omie"].map((h) => (
                          <th key={h} className="text-left text-[11px] uppercase tracking-wider text-zinc-500 font-medium pb-3 pr-4 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {nfs.map((n) => (
                        <tr key={n.id} className="border-b border-zinc-800/40 hover:bg-zinc-800/20 transition-colors">
                          <td className="py-2.5 pr-4 font-mono text-zinc-300 text-xs">{n.numero ?? "—"}</td>
                          <td className="py-2.5 pr-4 font-mono text-zinc-400 text-xs">{n.pedidoNumero}</td>
                          <td className="py-2.5 pr-4 text-zinc-300 max-w-[180px] truncate">{n.fornecedor}</td>
                          <td className="py-2.5 pr-4 font-mono text-zinc-100 whitespace-nowrap">
                            {n.valorTotal != null ? formatBRL(n.valorTotal) : "—"}
                          </td>
                          <td className="py-2.5 pr-4 text-zinc-500 text-xs whitespace-nowrap">
                            {n.emissao ? n.emissao.slice(0, 10).split("-").reverse().join("/") : "—"}
                          </td>
                          <td className="py-2.5">
                            {n.lancadaOmie ? (
                              <span className="flex items-center gap-1 text-xs text-emerald-400">
                                <CheckCircle2 size={12} /> Lançada
                              </span>
                            ) : n.status === "erro_omie" ? (
                              <span className="flex items-center gap-1 text-xs text-red-400">
                                <XCircle size={12} /> Erro
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-zinc-600">
                                <Clock size={12} /> Pendente
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
