"use client";

/**
 * produtos-client.tsx — LHG-206
 * Tabela interativa do catálogo de produtos com busca, filtro por categoria e sync Omie.
 */
import { useState, useMemo } from "react";
import { Search, Package, RefreshCw, Tag, Layers, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SyncOmieProdutosButton } from "./sync-omie-produtos-button";
import { EditarProdutoModal } from "./editar-produto-modal";

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
  return CATEGORIA_COLORS[cat] ?? "bg-muted text-muted-foreground ring-border/50";
}

// ── Paginação ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

// ── Componente ────────────────────────────────────────────────────────────────

export function ProdutosClient({ produtos, lastLog }: ProdutosClientProps) {
  const [query,            setQuery]            = useState("");
  const [categoria,        setCategoria]        = useState<string>("todas");
  const [familia,          setFamilia]          = useState<string>("todas");
  const [produtoEditando,  setProdutoEditando]  = useState<Produto | null>(null);
  const [page,             setPage]             = useState(0);

  // Helpers que resetam página no mesmo batch do React 18 (sem render intermediário errado)
  function handleQuery(v: string)     { setQuery(v);      setPage(0); }
  function handleCategoria(v: string) { setCategoria(v);  setPage(0); }
  function handleFamilia(v: string)   { setFamilia(v);    setPage(0); }

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

  const q = query.toLowerCase().trim();

  // Filtro por categoria/família — sempre aplicado
  const chipFiltered = useMemo(() => produtos.filter((p) => {
    if (categoria !== "todas" && p.categoria !== categoria) return false;
    if (familia   !== "todas" && p.familia_omie !== familia) return false;
    return true;
  }), [produtos, categoria, familia]);

  // Busca textual — só ativa com 2+ caracteres
  const filtered = useMemo(() => {
    if (q.length < 2) return chipFiltered;
    return chipFiltered.filter((p) =>
      p.nome.toLowerCase().includes(q) ||
      p.codigo.toLowerCase().includes(q) ||
      p.categoria.toLowerCase().includes(q) ||
      (p.familia_omie ?? "").toLowerCase().includes(q) ||
      p.unidade_med.toLowerCase().includes(q)
    );
  }, [chipFiltered, q]);

  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginados   = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const buscaAtiva  = q.length >= 2;
  const buscaCurta  = q.length === 1;

  return (
    <div className="max-w-[1600px] mx-auto space-y-4 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground leading-tight">
            Produtos &amp; Catálogo
          </h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Catálogo sincronizado com o Omie ERP
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {lastLog && (
            <div className="text-right hidden sm:block">
              <div className="text-[11px] text-muted-foreground leading-tight">
                Última sincronização
              </div>
              <div className="text-[12px] text-muted-foreground font-mono leading-tight mt-0.5 flex items-center gap-1.5 justify-end">
                <RefreshCw size={10} className={cn(lastLog.status === "ok" ? "text-emerald-400" : "text-red-400")} />
                {relativeTime(lastLog.created_at)}
                <span className="text-muted-foreground/60">·</span>
                <span>{lastLog.total ?? 0} registros</span>
              </div>
            </div>
          )}
          <SyncOmieProdutosButton />
        </div>
      </div>

      {/* ── Busca + Filtros ─────────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        {/* Campo de busca */}
        <div className="flex-1 min-w-[200px] space-y-1">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <input
              type="text"
              placeholder="Buscar por nome, código, família ou unidade…"
              value={query}
              onChange={(e) => handleQuery(e.target.value)}
              className={cn(
                "w-full rounded-lg border bg-muted/60 pl-9 py-2.5 transition-colors",
                "text-sm text-foreground placeholder:text-muted-foreground/50",
                "focus:outline-none focus:ring-0",
                buscaAtiva ? "border-emerald-500/40 pr-28" : "border-border pr-9",
              )}
            />
            {buscaAtiva && (
              <span className={cn(
                "absolute right-8 top-1/2 -translate-y-1/2 text-[11px] font-mono px-2 py-0.5 rounded-full",
                filtered.length === 0
                  ? "bg-red-500/10 text-red-400"
                  : "bg-emerald-500/10 text-emerald-400",
              )}>
                {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
              </span>
            )}
            {query && (
              <button
                onClick={() => handleQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground text-xs"
              >
                ✕
              </button>
            )}
          </div>
          {buscaCurta && (
            <p className="text-[11px] text-muted-foreground/60 pl-1">
              Digite mais um caractere para buscar…
            </p>
          )}
        </div>

        {/* Filtro de categoria (orçamento) */}
        <div className="relative">
          <Tag size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <select
            value={categoria}
            onChange={(e) => handleCategoria(e.target.value)}
            className={cn(
              "rounded-lg border border-border bg-muted/60 pl-8 pr-8 py-2.5",
              "text-sm text-foreground appearance-none cursor-pointer",
              "focus:outline-none focus:border-border transition-colors",
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
            <Layers size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <select
              value={familia}
              onChange={(e) => handleFamilia(e.target.value)}
              className={cn(
                "rounded-lg border border-border bg-muted/60 pl-8 pr-8 py-2.5",
                "text-sm text-foreground appearance-none cursor-pointer",
                "focus:outline-none focus:border-border transition-colors",
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
      <div className="rounded-xl border border-border/80 bg-muted/40 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[2.5fr_1fr_1.2fr_1fr_1fr_80px] gap-4 px-5 py-3 border-b border-border/80">
          {["PRODUTO", "CATEGORIA ORÇAMENTO", "FAMÍLIA OMIE", "UNIDADE", "PREÇO CUSTO", "STATUS"].map((h) => (
            <div
              key={h}
              className="text-[10px] uppercase tracking-[0.12em] font-medium text-muted-foreground"
            >
              {h}
            </div>
          ))}
        </div>

        {/* Linhas */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Package size={28} className="text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {query || categoria !== "todas" || familia !== "todas"
                ? "Nenhum produto encontrado"
                : "Nenhum produto cadastrado"}
            </p>
            {!query && categoria === "todas" && familia === "todas" && (
              <p className="text-xs text-muted-foreground/60">
                Clique em &quot;Sincronizar Omie&quot; para importar
              </p>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {paginados.map((p) => (
              <li
                key={p.id}
                onClick={() => setProdutoEditando(p)}
                className="grid grid-cols-[2.5fr_1fr_1.2fr_1fr_1fr_80px] gap-4 px-5 py-3.5 hover:bg-muted/40 transition-colors cursor-pointer"
              >
                {/* Produto */}
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate leading-tight">
                    {p.nome}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                    {p.codigo}
                    {p.omie_codigo && (
                      <>
                        <span className="mx-1 text-muted-foreground/40">·</span>
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
                    <span className="text-[11px] text-muted-foreground/60">—</span>
                  )}
                </div>

                {/* Unidade de medida */}
                <div className="self-center">
                  <span className="text-[12px] text-muted-foreground font-mono uppercase">
                    {p.unidade_med}
                  </span>
                </div>

                {/* Preço de custo */}
                <div className="self-center">
                  {formatPreco(p.preco_custo) ? (
                    <span className="text-[12px] text-foreground/80 font-mono">
                      {formatPreco(p.preco_custo)}
                    </span>
                  ) : (
                    <span className="text-[12px] text-muted-foreground/60">—</span>
                  )}
                </div>

                {/* Status */}
                <div className="self-center">
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                    p.ativo
                      ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
                      : "bg-muted text-muted-foreground ring-1 ring-border/50",
                  )}>
                    {p.ativo ? "Ativo" : "Inativo"}
                  </span>
                  {p.omie_sincronizado_em && (
                    <div className="text-[10px] text-muted-foreground/40 mt-0.5 font-mono">
                      {relativeTime(p.omie_sincronizado_em)}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Footer com contagem + paginação */}
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-border/60 flex items-center justify-between gap-4">
            <span className="text-[12px] text-muted-foreground/60">
              {filtered.length === produtos.length
                ? `${produtos.length} produto${produtos.length !== 1 ? "s" : ""}`
                : `${filtered.length} de ${produtos.length} filtrado${filtered.length !== 1 ? "s" : ""}`}
            </span>

            {/* Controles de página */}
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-[12px] text-muted-foreground/80 font-mono tabular-nums">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}

            <span className="text-[11px] text-muted-foreground/40 hidden sm:block">
              Clique em uma linha para editar
            </span>
          </div>
        )}
      </div>

      {/* Modal de edição — key garante remount com dados frescos ao trocar de produto */}
      <EditarProdutoModal
        key={produtoEditando?.id ?? "closed"}
        produto={produtoEditando}
        onClose={() => setProdutoEditando(null)}
      />
    </div>
  );
}
