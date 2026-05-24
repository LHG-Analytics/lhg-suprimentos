"use client";

/**
 * produtos-client.tsx — LHG-206
 * Tabela interativa do catálogo de produtos com busca, filtro por categoria e sync Omie.
 */
import { useState, useMemo } from "react";
import { Search, Package, RefreshCw, Tag, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { SyncOmieProdutosButton } from "./sync-omie-produtos-button";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Produto {
  id: string;
  codigo: string;
  nome: string;
  unidade_med: string;
  categoria: string;
  familia_omie: string | null;
  ativo: boolean;
  preco_custo: number | null;
  omie_codigo: string | null;
  omie_sincronizado_em: string | null;
}

interface LastLog {
  created_at: string;
  total: number | null;
  novos: number | null;
  status: string | null;
}

interface ProdutosClientProps {
  produtos: Produto[];
  lastLog: LastLog | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPreco(v: number | null) {
  if (v === null || v === 0) return null;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v);
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min  = Math.floor(diff / 60_000);
  const h    = Math.floor(diff / 3_600_000);
  const d    = Math.floor(diff / 86_400_000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min atrás`;
  if (h < 24)  return `${h}h atrás`;
  return `${d}d atrás`;
}

// Cores por categoria
const CATEGORIA_COLORS: Record<string, string> = {
  "Amenities":   "bg-violet-500/10 text-violet-400 ring-violet-500/20",
  "Enxoval":     "bg-sky-500/10 text-sky-400 ring-sky-500/20",
  "Limpeza":     "bg-teal-500/10 text-teal-400 ring-teal-500/20",
  "Frigobar":    "bg-amber-500/10 text-amber-400 ring-amber-500/20",
  "Manutenção":  "bg-orange-500/10 text-orange-400 ring-orange-500/20",
  "Importado Omie": "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
};

function categoriaCor(cat: string) {
  return CATEGORIA_COLORS[cat] ?? "bg-zinc-800 text-zinc-400 ring-zinc-700/50";
}

// ── Componente ────────────────────────────────────────────────────────────────

export function ProdutosClient({ produtos, lastLog }: ProdutosClientProps) {
  const [query,       setQuery]       = useState("");
  const [categoria,   setCategoria]   = useState<string>("todas");
  const [familia,     setFamilia]     = useState<string>("todas");

  // Listas únicas para os filtros
  const categorias = useMemo(() => {
    const set = new Set(produtos.map((p) => p.categoria));
    return Array.from(set).sort();
  }, [produtos]);

  const familias = useMemo(() => {
    const set = new Set(
      produtos
        .map((p) => p.familia_omie)
        .filter((f): f is string => !!f),
    );
    return Array.from(set).sort();
  }, [produtos]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return produtos.filter((p) => {
      if (categoria !== "todas" && p.categoria !== categoria) return false;
      if (familia   !== "todas" && p.familia_omie !== familia) return false;
      if (!q) return true;
      return (
        p.nome.toLowerCase().includes(q) ||
        p.codigo.toLowerCase().includes(q) ||
        p.categoria.toLowerCase().includes(q) ||
        (p.familia_omie ?? "").toLowerCase().includes(q) ||
        p.unidade_med.toLowerCase().includes(q)
      );
    });
  }, [produtos, query, categoria, familia]);

  const totalAtivos   = produtos.filter((p) => p.ativo).length;
  const totalOmie     = produtos.filter((p) => p.omie_codigo).length;
  const totalInativos = produtos.length - totalAtivos;

  return (
    <div className="max-w-[1600px] mx-auto space-y-4 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-50 leading-tight">
            Produtos &amp; Catálogo
          </h1>
          <p className="text-[13px] text-zinc-500 mt-0.5">
            Catálogo sincronizado com o Omie ERP
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {lastLog && (
            <div className="text-right hidden sm:block">
              <div className="text-[11px] text-zinc-500 leading-tight">
                Última sincronização
              </div>
              <div className="text-[12px] text-zinc-400 font-mono leading-tight mt-0.5 flex items-center gap-1.5 justify-end">
                <RefreshCw size={10} className={cn(lastLog.status === "ok" ? "text-emerald-400" : "text-red-400")} />
                {relativeTime(lastLog.created_at)}
                <span className="text-zinc-600">·</span>
                <span>{lastLog.total ?? 0} registros</span>
              </div>
            </div>
          )}
          <SyncOmieProdutosButton />
        </div>
      </div>

      {/* ── Stats ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "TOTAL",        value: produtos.length,  color: "text-zinc-50" },
          { label: "CATEGORIAS",   value: categorias.length, color: "text-violet-400" },
          { label: "FAMÍLIAS OMIE",value: familias.length,  color: "text-amber-400" },
          { label: "OMIE",         value: totalOmie,        color: "text-sky-400" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-5 py-4"
          >
            <div className="text-[10px] uppercase tracking-[0.12em] font-medium text-zinc-500">
              {label}
            </div>
            <div className={cn("text-2xl font-mono font-semibold mt-1.5", color)}>
              {value}
            </div>
            {label === "TOTAL" && totalInativos > 0 && (
              <div className="text-[11px] text-zinc-600 mt-0.5">
                {totalInativos} inativo{totalInativos !== 1 ? "s" : ""}
              </div>
            )}
            {label === "TOTAL" && totalAtivos > 0 && totalInativos === 0 && (
              <div className="text-[11px] text-emerald-600 mt-0.5">
                todos ativos
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Busca + Filtros ─────────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        {/* Campo de busca */}
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={14}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
          />
          <input
            type="text"
            placeholder="Buscar por nome, código, família ou unidade…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={cn(
              "w-full rounded-lg border border-zinc-800 bg-zinc-900/60 pl-9 pr-4 py-2.5",
              "text-sm text-zinc-200 placeholder:text-zinc-600",
              "focus:outline-none focus:border-zinc-600 focus:ring-0 transition-colors",
            )}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filtro de categoria (orçamento) */}
        <div className="relative">
          <Tag size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className={cn(
              "rounded-lg border border-zinc-800 bg-zinc-900/60 pl-8 pr-8 py-2.5",
              "text-sm text-zinc-300 appearance-none cursor-pointer",
              "focus:outline-none focus:border-zinc-600 transition-colors",
            )}
          >
            <option value="todas">Todas as categorias</option>
            {categorias.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Filtro de família Omie */}
        {familias.length > 0 && (
          <div className="relative">
            <Layers size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            <select
              value={familia}
              onChange={(e) => setFamilia(e.target.value)}
              className={cn(
                "rounded-lg border border-zinc-800 bg-zinc-900/60 pl-8 pr-8 py-2.5",
                "text-sm text-zinc-300 appearance-none cursor-pointer",
                "focus:outline-none focus:border-zinc-600 transition-colors",
              )}
            >
              <option value="todas">Todas as famílias Omie</option>
              {familias.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── Tabela ──────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[2.5fr_1fr_1.2fr_1fr_1fr_80px] gap-4 px-5 py-3 border-b border-zinc-800/80">
          {["PRODUTO", "CATEGORIA ORÇAMENTO", "FAMÍLIA OMIE", "UNIDADE", "PREÇO CUSTO", "STATUS"].map((h) => (
            <div
              key={h}
              className="text-[10px] uppercase tracking-[0.12em] font-medium text-zinc-500"
            >
              {h}
            </div>
          ))}
        </div>

        {/* Linhas */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Package size={28} className="text-zinc-700" />
            <p className="text-sm text-zinc-500">
              {query || categoria !== "todas" || familia !== "todas"
                ? "Nenhum produto encontrado"
                : "Nenhum produto cadastrado"}
            </p>
            {!query && categoria === "todas" && familia === "todas" && (
              <p className="text-xs text-zinc-600">
                Clique em &quot;Sincronizar Omie&quot; para importar
              </p>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800/60">
            {filtered.map((p) => (
              <li
                key={p.id}
                className="grid grid-cols-[2.5fr_1fr_1.2fr_1fr_1fr_80px] gap-4 px-5 py-3.5 hover:bg-zinc-800/20 transition-colors"
              >
                {/* Produto */}
                <div className="min-w-0">
                  <div className="text-sm font-medium text-zinc-100 truncate leading-tight">
                    {p.nome}
                  </div>
                  <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
                    {p.codigo}
                    {p.omie_codigo && (
                      <>
                        <span className="mx-1 text-zinc-700">·</span>
                        <span className="text-sky-600">Omie</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Categoria (orçamento) */}
                <div className="self-center">
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1",
                    categoriaCor(p.categoria),
                  )}>
                    {p.categoria}
                  </span>
                </div>

                {/* Família Omie */}
                <div className="self-center">
                  {p.familia_omie ? (
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1",
                      "bg-amber-500/10 text-amber-400 ring-amber-500/20",
                    )}>
                      {p.familia_omie}
                    </span>
                  ) : (
                    <span className="text-[11px] text-zinc-600">—</span>
                  )}
                </div>

                {/* Unidade de medida */}
                <div className="self-center">
                  <span className="text-[12px] text-zinc-400 font-mono uppercase">
                    {p.unidade_med}
                  </span>
                </div>

                {/* Preço de custo */}
                <div className="self-center">
                  {formatPreco(p.preco_custo) ? (
                    <span className="text-[12px] text-zinc-300 font-mono">
                      {formatPreco(p.preco_custo)}
                    </span>
                  ) : (
                    <span className="text-[12px] text-zinc-600">—</span>
                  )}
                </div>

                {/* Status */}
                <div className="self-center">
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                    p.ativo
                      ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
                      : "bg-zinc-800 text-zinc-500 ring-1 ring-zinc-700/50",
                  )}>
                    {p.ativo ? "Ativo" : "Inativo"}
                  </span>
                  {p.omie_sincronizado_em && (
                    <div className="text-[10px] text-zinc-700 mt-0.5 font-mono">
                      {relativeTime(p.omie_sincronizado_em)}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Footer */}
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-zinc-800/60 flex items-center justify-between">
            <span className="text-[12px] text-zinc-600">
              {filtered.length === produtos.length
                ? `${produtos.length} produto${produtos.length !== 1 ? "s" : ""}`
                : `${filtered.length} de ${produtos.length} produto${produtos.length !== 1 ? "s" : ""}`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
