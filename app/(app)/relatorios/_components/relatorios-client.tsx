"use client";

/**
 * relatorios-client.tsx — LHG-221 / LHG-250
 * Componente cliente para a página de Relatórios.
 * Recharts + tabelas + download CSV.
 *
 * Três abas no mesmo bloco: Fornecedores (com rating calculado), Produtos
 * (curva ABC) e Categorias. A aba de fornecedores tem toggle tabela/cards —
 * antes eram duas abas mostrando exatamente os mesmos dados.
 */
import { useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, PieChart, Pie, Cell,
} from "recharts";
import {
  TrendingDown, DollarSign, Package, Boxes,
  LayoutGrid, List, Download, Info,
} from "lucide-react";
import { cn, formatBRL } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import type { ProdutoAbc, CategoriaDetalhe, ClasseAbc } from "@/lib/relatorios";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Resumo {
  totalGasto12m:  number;
  economia12m:    number;
  economia3m:     number;
  mediaMensal:    number;
  ticketMedio:    number;
  totalPedidos:   number;
}

interface FornecedorRow {
  id: string; nome: string; categoria: string | null;
  total: number; pedidos: number;
  rating: number | null;
  confianca: string | null;
  pontualidadePct: number | null;
  competitividadePct: number | null;
  gapMedioPct: number | null;
  cotacaoCelulas: number;
  entregas: number;
  entregasNoPrazo: number;
}

interface CategoriaRow { categoria: string; total: number; }

interface EvolucaoMes {
  mes: string; key: string; gasto: number; economia: number;
}

interface Props {
  resumo:        Resumo;
  fornecedores:  FornecedorRow[];
  categorias:    CategoriaRow[];
  topProdutos:   ProdutoAbc[];
  topCategorias: CategoriaDetalhe[];
  evolucao:      EvolucaoMes[];
}

type Aba = "fornecedores" | "produtos" | "categorias";

// ── Paleta de cores para o gráfico de pizza ───────────────────────────────────
const CORES = [
  "#10b981","#38bdf8","#f59e0b","#a78bfa",
  "#f43f5e","#fb923c","#34d399","#60a5fa",
  "#e879f9","#facc15","#4ade80","#818cf8",
];

const TH = "text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium pb-3 pr-4";

// ── Tooltip customizado ────────────────────────────────────────────────────────
function CustomBarTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; fill: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-background shadow-xl p-3 min-w-[160px]">
      <div className="text-xs text-muted-foreground mb-2">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-4 text-xs">
          <span className="text-muted-foreground">{p.name === "gasto" ? "Gasto" : "Economia"}</span>
          <span className="font-mono text-foreground">{formatBRL(p.value)}</span>
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
    <div className="rounded-xl border border-border/80 bg-muted/40 p-4 flex items-start gap-3">
      <div className={cn(
        "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
        accent === "green"  ? "bg-emerald-500/10 text-emerald-400" :
        accent === "red"    ? "bg-red-500/10 text-red-400" :
        "bg-muted text-muted-foreground",
      )}>
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
        <div className="text-xl font-semibold font-mono text-foreground mt-0.5">{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground/60 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ── Rating em estrelas ────────────────────────────────────────────────────────

/**
 * Estrelas com preenchimento fracionário. A cor sozinha não comunica (WCAG),
 * então o número acompanha sempre — e `confianca` distingue uma nota lastreada
 * em centenas de cotações de uma calculada sobre 3 entregas.
 */
function Estrelas({ rating, confianca, titulo }: {
  rating: number | null; confianca: string | null; titulo?: string;
}) {
  if (rating == null) {
    return (
      <span className="text-muted-foreground/50 text-xs" title="Amostra insuficiente para calcular nota">
        —
      </span>
    );
  }

  const cor =
    rating >= 4   ? "text-emerald-400" :
    rating >= 3   ? "text-amber-400"   :
    "text-red-400";

  const pct = (rating / 5) * 100;

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={titulo}>
      <span className="relative inline-block leading-none text-[13px] tracking-[0.08em]">
        <span className="text-muted-foreground/25 select-none">★★★★★</span>
        <span
          className={cn("absolute inset-0 overflow-hidden select-none", cor)}
          style={{ width: `${pct}%` }}
          aria-hidden
        >
          ★★★★★
        </span>
      </span>
      <span className={cn("text-xs font-mono font-medium", cor)}>{rating.toFixed(1)}</span>
      {confianca === "parcial" && (
        <span
          className="text-[9px] uppercase tracking-wide text-muted-foreground/70 border border-border rounded px-1 py-px"
          title="Nota parcial: só uma das componentes (preço ou prazo) tem amostra suficiente"
        >
          parcial
        </span>
      )}
    </span>
  );
}

/** Barra de proporção reutilizada nas três abas. */
function BarraPct({ pct, cor }: { pct: number; cor: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-muted rounded-full h-1.5 min-w-[60px]">
        <div className={cn("h-1.5 rounded-full", cor)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs text-muted-foreground font-mono w-10 shrink-0 text-right">{pct.toFixed(0)}%</span>
    </div>
  );
}

/** Selo A/B/C da curva ABC — bolinha + letra, nunca cor sozinha. */
function SeloClasse({ classe }: { classe: ClasseAbc }) {
  const estilo = {
    A: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    B: "bg-amber-500/10  text-amber-400  border-amber-500/30",
    C: "bg-muted         text-muted-foreground border-border",
  }[classe];
  const dot = { A: "bg-emerald-400", B: "bg-amber-400", C: "bg-muted-foreground/60" }[classe];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded border px-1.5 py-px text-[10px] font-medium", estilo)}>
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dot)} />
      {classe}
    </span>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function RelatoriosClient({
  resumo, fornecedores, categorias, topProdutos, topCategorias, evolucao,
}: Props) {
  const [abaAtiva, setAbaAtiva] = useState<Aba>("fornecedores");
  const [modoForn, setModoForn] = useState<"tabela" | "cards">("tabela");

  const totalCategorias = categorias.reduce((s, c) => s + c.total, 0);
  const totalForn       = fornecedores.reduce((s, f) => s + f.total, 0);

  // Exibição limitada; a exportação CSV leva a lista completa.
  const fornTop = fornecedores.slice(0, 12);
  const prodTop = topProdutos.slice(0, 25);

  const abas: Array<{ id: Aba; label: string; count: number }> = [
    { id: "fornecedores", label: "Fornecedores", count: fornecedores.length },
    { id: "produtos",     label: "Produtos",     count: topProdutos.length },
    { id: "categorias",   label: "Categorias",   count: topCategorias.length },
  ];

  function exportar() {
    if (abaAtiva === "fornecedores") {
      downloadCsv("relatorio-fornecedores",
        ["Fornecedor", "Categoria", "Pedidos", "Total gasto", "% do total", "Rating", "Confiança", "Competitividade %", "Gap médio %", "Pontualidade %", "Entregas", "No prazo", "Células cotadas"],
        fornecedores.map(f => [
          f.nome, f.categoria ?? "", f.pedidos, f.total.toFixed(2),
          totalForn > 0 ? ((f.total / totalForn) * 100).toFixed(1) : "0",
          f.rating?.toFixed(1) ?? "", f.confianca ?? "",
          f.competitividadePct ?? "", f.gapMedioPct ?? "", f.pontualidadePct ?? "",
          f.entregas, f.entregasNoPrazo, f.cotacaoCelulas,
        ]),
      );
    } else if (abaAtiva === "produtos") {
      downloadCsv("relatorio-produtos-curva-abc",
        ["#", "Produto", "Categoria", "Classe ABC", "Qtd", "Un", "Pedidos", "Preço médio", "Preço mín", "Preço máx", "Total", "% do total", "% acumulado"],
        topProdutos.map((p, i) => [
          i + 1, p.nome, p.categoria, p.classe, p.qtd.toFixed(3), p.unidadeMed, p.pedidos,
          p.precoMedio.toFixed(4), p.precoMin.toFixed(4), p.precoMax.toFixed(4),
          p.total.toFixed(2), p.pctTotal.toFixed(2), p.pctAcumulado.toFixed(2),
        ]),
      );
    } else {
      downloadCsv("relatorio-categorias",
        ["Categoria", "Total", "% do total", "Produtos", "Pedidos", "Fornecedores", "Produto líder", "% do produto líder", "Fornecedor líder", "% do fornecedor líder"],
        topCategorias.map(c => [
          c.categoria, c.total.toFixed(2), c.pctTotal.toFixed(2),
          c.produtos, c.pedidos, c.fornecedores,
          c.produtoTop, c.produtoTopPct.toFixed(1),
          c.fornecedorTop, c.fornecedorTopPct.toFixed(1),
        ]),
      );
    }
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-5 pb-10">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Relatórios</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Últimos 12 meses · pedidos recebidos e finalizados</p>
        </div>
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
          label="Itens distintos"
          value={topProdutos.length.toString()}
          sub={`${topCategorias.length} categoria${topCategorias.length !== 1 ? "s" : ""} · ${fornecedores.length} fornecedores`}
          icon={Boxes}
          accent="neutral"
        />
      </div>

      {/* ── Gráfico evolução + pizza categorias ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-[320px]">

        {/* Barras: gasto vs economia */}
        <div className="lg:col-span-2 rounded-xl border border-border/80 bg-muted/40 p-5 flex flex-col">
          <div className="mb-4 shrink-0">
            <div className="text-sm font-medium text-foreground">Evolução mensal</div>
            <div className="text-xs text-muted-foreground mt-0.5">Gasto total e economia por IA — últimos 12 meses</div>
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
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-3 h-3 rounded-sm bg-sky-400 shrink-0" /> Gasto
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-3 h-3 rounded-sm bg-emerald-400 shrink-0" /> Economia IA
            </div>
          </div>
        </div>

        {/* Pizza: por categoria */}
        <div className="rounded-xl border border-border/80 bg-muted/40 p-5 flex flex-col">
          <div className="mb-2 shrink-0">
            <div className="text-sm font-medium text-foreground">Por categoria</div>
            <div className="text-xs text-muted-foreground mt-0.5">% do total gasto</div>
          </div>

          {categorias.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs text-muted-foreground/60">Sem dados</p>
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
                      contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      itemStyle={{ color: "hsl(var(--muted-foreground))" }}
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
                      <span className="text-muted-foreground truncate">{c.categoria}</span>
                    </div>
                    <span className="font-mono text-muted-foreground shrink-0 ml-2">
                      {totalCategorias > 0 ? ((c.total / totalCategorias) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Abas: fornecedores / produtos / categorias ──────────────── */}
      <div className="rounded-xl border border-border/80 bg-muted/40 overflow-hidden">

        {/* Tabs + ações */}
        <div className="flex items-center justify-between border-b border-border/80 px-5 pt-4 gap-4">
          <div className="flex gap-5">
            {abas.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setAbaAtiva(tab.id)}
                className={cn(
                  "pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5",
                  abaAtiva === tab.id
                    ? "border-emerald-500 text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground/80",
                )}
              >
                {tab.label}
                <span className="text-[10px] font-mono text-muted-foreground/60">{tab.count}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 pb-2">
            {abaAtiva === "fornecedores" && (
              <div className="flex rounded-md border border-border overflow-hidden mr-1">
                <button
                  onClick={() => setModoForn("tabela")}
                  title="Ver como tabela"
                  aria-label="Ver como tabela"
                  aria-pressed={modoForn === "tabela"}
                  className={cn("p-1.5 transition-colors",
                    modoForn === "tabela" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  <List size={14} />
                </button>
                <button
                  onClick={() => setModoForn("cards")}
                  title="Ver como cards"
                  aria-label="Ver como cards"
                  aria-pressed={modoForn === "cards"}
                  className={cn("p-1.5 transition-colors border-l border-border",
                    modoForn === "cards" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  <LayoutGrid size={14} />
                </button>
              </div>
            )}
            <button
              onClick={exportar}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2 py-1.5 transition-colors"
            >
              <Download size={13} /> CSV
            </button>
          </div>
        </div>

        <div className="p-5">

          {/* ═══ Fornecedores ═══════════════════════════════════════ */}
          {abaAtiva === "fornecedores" && (
            fornecedores.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 py-8 text-center">Nenhum pedido finalizado nos últimos 12 meses</p>
            ) : modoForn === "tabela" ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className={TH}>Fornecedor</th>
                        <th className={TH}>Categoria</th>
                        <th className={cn(TH, "text-center")}>Pedidos</th>
                        <th className={TH}>Total gasto</th>
                        <th className={TH}>% do total</th>
                        <th className={cn(TH, "text-center")}>Preço</th>
                        <th className={cn(TH, "text-center")}>Prazo</th>
                        <th className={TH}>Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fornTop.map((f, i) => (
                        <tr key={f.id} className="border-b border-border/40 hover:bg-muted/50 transition-colors">
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-muted-foreground/60 font-mono w-5">{i + 1}</span>
                              <span className="text-foreground font-medium">{f.nome}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-muted-foreground text-xs">{f.categoria ?? "—"}</td>
                          <td className="py-3 pr-4 text-muted-foreground font-mono text-center">{f.pedidos}</td>
                          <td className="py-3 pr-4 font-mono text-foreground">{formatBRL(f.total)}</td>
                          <td className="py-3 pr-4">
                            <BarraPct pct={totalForn > 0 ? (f.total / totalForn) * 100 : 0} cor="bg-sky-500" />
                          </td>
                          <td className="py-3 pr-4 text-center">
                            {f.gapMedioPct != null ? (
                              <span
                                className="text-xs font-mono text-muted-foreground"
                                title={`${f.gapMedioPct}% acima do melhor preço, em média · ${f.cotacaoCelulas} itens cotados`}
                              >
                                +{f.gapMedioPct}%
                              </span>
                            ) : <span className="text-muted-foreground/50 text-xs">—</span>}
                          </td>
                          <td className="py-3 pr-4 text-center">
                            {f.pontualidadePct != null ? (
                              <span
                                className="text-xs font-mono text-muted-foreground"
                                title={`${f.entregasNoPrazo} de ${f.entregas} entregas até a data prevista`}
                              >
                                {f.pontualidadePct}%
                              </span>
                            ) : <span className="text-muted-foreground/50 text-xs">—</span>}
                          </td>
                          <td className="py-3">
                            <Estrelas
                              rating={f.rating}
                              confianca={f.confianca}
                              titulo={f.rating != null
                                ? `60% competitividade + 40% pontualidade · ${f.cotacaoCelulas} itens cotados, ${f.entregas} entregas`
                                : undefined}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <NotaRodape>
                  Rating = 60% competitividade de preço + 40% pontualidade de entrega, calculado sobre os
                  últimos 12 meses <strong>desta unidade</strong>. &quot;Preço&quot; é quanto o fornecedor fica acima
                  do melhor preço da mesma cotação, em média. Fornecedor sem amostra suficiente aparece como
                  &quot;—&quot; em vez de nota zero.
                </NotaRodape>
              </>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {fornTop.map((f, i) => (
                  <div key={f.id} className="rounded-lg border border-border bg-muted/60 p-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground leading-snug">{f.nome}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">{f.categoria ?? "Sem categoria"}</div>
                      </div>
                      <span className="text-[10px] text-muted-foreground/60 font-mono shrink-0">#{i + 1}</span>
                    </div>
                    <div className="text-lg font-mono font-semibold text-foreground">{formatBRL(f.total)}</div>
                    <div className="mt-2">
                      <BarraPct pct={totalForn > 0 ? (f.total / totalForn) * 100 : 0} cor="bg-emerald-500" />
                    </div>
                    <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground/70">
                        {f.pedidos} pedido{f.pedidos !== 1 ? "s" : ""}
                        {f.pontualidadePct != null && ` · ${f.pontualidadePct}% no prazo`}
                      </span>
                      <Estrelas rating={f.rating} confianca={f.confianca} />
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* ═══ Produtos — curva ABC ═══════════════════════════════ */}
          {abaAtiva === "produtos" && (
            topProdutos.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 py-8 text-center">Nenhum item comprado nos últimos 12 meses</p>
            ) : (
              <>
                <ResumoAbc produtos={topProdutos} />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className={TH}>Produto</th>
                        <th className={TH}>Categoria</th>
                        <th className={cn(TH, "text-center")}>Classe</th>
                        <th className={cn(TH, "text-right")}>Qtd</th>
                        <th className={cn(TH, "text-center")}>Pedidos</th>
                        <th className={cn(TH, "text-right")}>Preço médio</th>
                        <th className={cn(TH, "text-right")}>Variação</th>
                        <th className={cn(TH, "text-right")}>Total</th>
                        <th className={TH}>% acum.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prodTop.map((p, i) => {
                        const variacao = p.variacaoPct;
                        return (
                          <tr key={p.nome} className="border-b border-border/40 hover:bg-muted/50 transition-colors">
                            <td className="py-3 pr-4">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] text-muted-foreground/60 font-mono w-6 shrink-0">{i + 1}</span>
                                <span className="text-foreground font-medium">{p.nome}</span>
                              </div>
                            </td>
                            <td className="py-3 pr-4 text-muted-foreground text-xs">{p.categoria}</td>
                            <td className="py-3 pr-4 text-center"><SeloClasse classe={p.classe} /></td>
                            <td className="py-3 pr-4 font-mono text-muted-foreground text-right whitespace-nowrap">
                              {p.qtd.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                              <span className="text-muted-foreground/50 ml-1 text-[11px]">{p.unidadeMed}</span>
                            </td>
                            <td className="py-3 pr-4 font-mono text-muted-foreground text-center">{p.pedidos}</td>
                            <td className="py-3 pr-4 font-mono text-muted-foreground text-right">{formatBRL(p.precoMedio)}</td>
                            <td className="py-3 pr-4 text-right">
                              {p.pedidos > 1 && variacao > 0 ? (
                                <span
                                  className={cn("text-xs font-mono",
                                    variacao >= 30 ? "text-red-400" : variacao >= 10 ? "text-amber-400" : "text-muted-foreground")}
                                  title={`${formatBRL(p.precoMin)} a ${formatBRL(p.precoMax)} por ${p.unidadeMed}`}
                                >
                                  {variacao.toFixed(0)}%
                                </span>
                              ) : <span className="text-muted-foreground/40 text-xs">—</span>}
                            </td>
                            <td className="py-3 pr-4 font-mono text-foreground text-right whitespace-nowrap">{formatBRL(p.total)}</td>
                            <td className="py-3">
                              <BarraPct pct={p.pctAcumulado} cor="bg-violet-500" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {topProdutos.length > prodTop.length && (
                  <p className="text-[11px] text-muted-foreground/60 mt-3">
                    Exibindo os {prodTop.length} maiores de {topProdutos.length} produtos — a exportação CSV traz a lista completa.
                  </p>
                )}
                <NotaRodape>
                  Curva ABC por valor gasto: <strong>A</strong> = produtos que somam os primeiros 80% do gasto
                  (onde negociar primeiro), <strong>B</strong> = até 95%, <strong>C</strong> = a cauda.
                  &quot;Variação&quot; é a diferença entre o menor e o maior preço unitário pago no período.
                </NotaRodape>
              </>
            )
          )}

          {/* ═══ Categorias ═════════════════════════════════════════ */}
          {abaAtiva === "categorias" && (
            topCategorias.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 py-8 text-center">Nenhuma compra nos últimos 12 meses</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className={TH}>Categoria</th>
                        <th className={cn(TH, "text-right")}>Total</th>
                        <th className={TH}>% do total</th>
                        <th className={cn(TH, "text-center")}>Produtos</th>
                        <th className={cn(TH, "text-center")}>Pedidos</th>
                        <th className={cn(TH, "text-center")}>Forn.</th>
                        <th className={TH}>Produto líder</th>
                        <th className={TH}>Fornecedor líder</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topCategorias.map((c, i) => (
                        <tr key={c.categoria} className="border-b border-border/40 hover:bg-muted/50 transition-colors">
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CORES[i % CORES.length] }} />
                              <span className="text-foreground font-medium">{c.categoria}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-4 font-mono text-foreground text-right whitespace-nowrap">{formatBRL(c.total)}</td>
                          <td className="py-3 pr-4">
                            <BarraPct pct={c.pctTotal} cor="bg-emerald-500" />
                          </td>
                          <td className="py-3 pr-4 font-mono text-muted-foreground text-center">{c.produtos}</td>
                          <td className="py-3 pr-4 font-mono text-muted-foreground text-center">{c.pedidos}</td>
                          <td className="py-3 pr-4 font-mono text-muted-foreground text-center">{c.fornecedores}</td>
                          <td className="py-3 pr-4">
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]" title={c.produtoTop}>
                              {c.produtoTop}
                            </div>
                            <div className="text-[10px] text-muted-foreground/60 font-mono">{c.produtoTopPct.toFixed(0)}% da categoria</div>
                          </td>
                          <td className="py-3">
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]" title={c.fornecedorTop}>
                              {c.fornecedorTop}
                            </div>
                            <div className={cn("text-[10px] font-mono",
                              c.fornecedorTopPct >= 80 ? "text-amber-400" : "text-muted-foreground/60")}>
                              {c.fornecedorTopPct.toFixed(0)}% da categoria
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <NotaRodape>
                  A pizza acima mostra o peso de cada categoria no gasto. Esta tabela mostra a
                  <strong> concentração</strong>: categoria atendida por um único fornecedor com 80%+ do
                  volume (destacado em âmbar) é risco de dependência — vale buscar um segundo fornecedor.
                </NotaRodape>
              </>
            )
          )}

        </div>
      </div>
    </div>
  );
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function NotaRodape({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 flex items-start gap-2 text-[11px] text-muted-foreground/70 leading-relaxed">
      <Info size={13} className="shrink-0 mt-px" />
      <p>{children}</p>
    </div>
  );
}

/** Faixa-resumo da curva ABC: quantos itens em cada classe e quanto pesam. */
function ResumoAbc({ produtos }: { produtos: ProdutoAbc[] }) {
  const total = produtos.reduce((s, p) => s + p.total, 0);
  const classes = (["A", "B", "C"] as const).map((classe) => {
    const itens = produtos.filter(p => p.classe === classe);
    return {
      classe,
      itens: itens.length,
      valor: itens.reduce((s, p) => s + p.total, 0),
    };
  });

  return (
    <div className="grid grid-cols-3 gap-3 mb-5">
      {classes.map((c) => (
        <div key={c.classe} className="rounded-lg border border-border bg-muted/60 px-4 py-3">
          <div className="flex items-center justify-between mb-1">
            <SeloClasse classe={c.classe} />
            <span className="text-[10px] text-muted-foreground/60 font-mono">
              {total > 0 ? ((c.valor / total) * 100).toFixed(0) : 0}% do gasto
            </span>
          </div>
          <div className="text-sm font-mono font-semibold text-foreground">{formatBRL(c.valor)}</div>
          <div className="text-[11px] text-muted-foreground/70 mt-0.5">
            {c.itens} produto{c.itens !== 1 ? "s" : ""}
          </div>
        </div>
      ))}
    </div>
  );
}
