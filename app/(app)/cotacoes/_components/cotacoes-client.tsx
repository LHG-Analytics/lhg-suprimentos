"use client";

/**
 * cotacoes-client.tsx — LHG-210
 * Lista de cotações com mini-KPIs, filtros por status e criação a partir de requisição.
 */
import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Scale, Plus, ChevronRight, Sparkles,
  AlertTriangle, Calendar, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { criarCotacao } from "../actions";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type CotStatus = "rascunho" | "cotacao" | "pendente" | "aprovado" | "rejeitado" | "cancelado";
type FilterStatus = "todas" | CotStatus;

interface Cotacao {
  id:             string;
  numero:         string;
  titulo:         string;
  status:         CotStatus;
  urgente:        boolean | null;
  valor_estimado: number | null;
  economia:       number | null;
  economia_pct:   number | null;
  prazo:          string | null;
  created_at:     string;
  ai_resumo:      string | null;
  ai_analisada_em: string | null;
  comprador:      { nome: string; avatar_url: string | null } | null;
  cotacao_unidades:    { unidade_id: string; unidades: { nome: string; slug: string } | null }[];
  cotacao_itens:       { id: string }[];
  cotacao_fornecedores: { fornecedor_id: string }[];
}

interface Requisicao { id: string; numero: string; titulo: string; status: string }

interface CotacoesClientProps {
  cotacoes:    Cotacao[];
  requisicoes: Requisicao[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min  = Math.floor(diff / 60_000);
  const h    = Math.floor(diff / 3_600_000);
  const d    = Math.floor(diff / 86_400_000);
  if (min < 1)  return "agora";
  if (min < 60) return `${min}min`;
  if (h < 24)   return `${h}h atrás`;
  if (d < 30)   return `${d}d atrás`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function formatBRL(v: number | null) {
  if (!v) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<CotStatus, { label: string; cls: string }> = {
  rascunho:  { label: "Rascunho",    cls: "bg-zinc-800 text-zinc-400 ring-1 ring-zinc-700/50" },
  cotacao:   { label: "Em cotação",  cls: "bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20" },
  pendente:  { label: "Pendente",    cls: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20" },
  aprovado:  { label: "Aprovado",    cls: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20" },
  rejeitado: { label: "Rejeitado",   cls: "bg-red-500/10 text-red-400 ring-1 ring-red-500/20" },
  cancelado: { label: "Cancelado",   cls: "bg-zinc-800/50 text-zinc-600 ring-1 ring-zinc-700/30" },
};

const FILTER_ORDER: FilterStatus[] = [
  "todas", "rascunho", "cotacao", "pendente", "aprovado", "rejeitado", "cancelado",
];
const FILTER_LABELS: Record<FilterStatus, string> = {
  todas: "Todas", rascunho: "Rascunho", cotacao: "Em cotação",
  pendente: "Pendente", aprovado: "Aprovado", rejeitado: "Rejeitado", cancelado: "Cancelado",
};

// ── Modal de nova cotação ─────────────────────────────────────────────────────

function NovaCotacaoModal({
  open, onClose, requisicoes,
}: {
  open: boolean;
  onClose: () => void;
  requisicoes: Requisicao[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [titulo,      setTitulo]      = useState("");
  const [reqId,       setReqId]       = useState<string | "">("");
  const [urgente,     setUrgente]     = useState(false);
  const [errors,      setErrors]      = useState<Record<string, string>>({});

  function reset() {
    setTitulo(""); setReqId(""); setUrgente(false); setErrors({});
  }
  function handleClose() { reset(); onClose(); }

  function handleSubmit() {
    const e: Record<string, string> = {};
    if (!titulo.trim() || titulo.trim().length < 3) e.titulo = "Informe um título (mín. 3 chars)";
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    start(async () => {
      try {
        const result = await criarCotacao({
          titulo: titulo.trim(),
          requisicao_id: reqId || undefined,
          urgente,
        });
        toast.success(`Cotação ${result.numero} criada`);
        handleClose();
        router.push(`/cotacoes/${result.id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao criar cotação");
      }
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[20vh] px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80">
          <h2 className="text-base font-semibold text-zinc-50">Nova cotação</h2>
          <button onClick={handleClose} className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          {/* Título */}
          <div>
            <label className="block text-[11px] uppercase tracking-[0.1em] text-zinc-500 mb-1.5 font-medium">
              Título *
            </label>
            <input
              autoFocus
              type="text"
              placeholder="Ex: Amenities — Lush Ipiranga — Julho"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className={cn(
                "w-full rounded-lg border bg-zinc-900/60 px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600",
                "focus:outline-none transition-colors",
                errors.titulo ? "border-red-500/50" : "border-zinc-800 focus:border-zinc-600",
              )}
            />
            {errors.titulo && <p className="mt-1 text-[11px] text-red-400">{errors.titulo}</p>}
          </div>

          {/* Requisição relacionada (opcional) */}
          {requisicoes.length > 0 && (
            <div>
              <label className="block text-[11px] uppercase tracking-[0.1em] text-zinc-500 mb-1.5 font-medium">
                Requisição de origem <span className="normal-case text-zinc-600">(opcional)</span>
              </label>
              <select
                value={reqId}
                onChange={(e) => {
                  setReqId(e.target.value);
                  const req = requisicoes.find(r => r.id === e.target.value);
                  if (req && !titulo.trim()) setTitulo(req.titulo);
                }}
                className={cn(
                  "w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5",
                  "text-sm text-zinc-300 focus:outline-none focus:border-zinc-600 transition-colors",
                  "appearance-none cursor-pointer",
                )}
              >
                <option value="">— Nenhuma (cotação avulsa)</option>
                {requisicoes.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.numero} — {r.titulo}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Urgente toggle */}
          <label className="flex items-center gap-3 cursor-pointer group">
            <div
              onClick={() => setUrgente(u => !u)}
              className={cn(
                "w-9 h-5 rounded-full border transition-colors relative",
                urgente
                  ? "bg-red-500/30 border-red-500/50"
                  : "bg-zinc-800 border-zinc-700",
              )}
            >
              <div className={cn(
                "absolute top-0.5 w-4 h-4 rounded-full transition-all",
                urgente ? "left-[18px] bg-red-400" : "left-0.5 bg-zinc-500",
              )} />
            </div>
            <div>
              <span className={cn("text-sm font-medium", urgente ? "text-red-300" : "text-zinc-400")}>
                Cotação urgente
              </span>
              <p className="text-[11px] text-zinc-600">Prazo reduzido e notificação imediata</p>
            </div>
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-zinc-800/60">
          <button
            onClick={handleClose}
            className="text-sm text-zinc-500 hover:text-zinc-300 px-3 py-2 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={pending}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border",
              "border-emerald-700/60 bg-emerald-500/10 px-4 py-2",
              "text-sm font-medium text-emerald-400",
              "hover:bg-emerald-500/20 transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Scale size={14} />}
            {pending ? "Criando…" : "Criar cotação"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function CotacoesClient({ cotacoes, requisicoes }: CotacoesClientProps) {
  const router = useRouter();
  const [filter,    setFilter]    = useState<FilterStatus>("todas");
  const [query,     setQuery]     = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  // ── Mini-KPIs ──────────────────────────────────────────────────────────────
  const emCotacao     = cotacoes.filter(c => c.status === "cotacao").length;
  const economiaTotal = cotacoes.reduce((acc, c) => acc + (c.economia ?? 0), 0);
  const comCiclo      = cotacoes.filter(c => c.status !== "rascunho");
  const cicloMedio    = comCiclo.length > 0
    ? Math.round(comCiclo.reduce((acc, c) => {
        const dias = (Date.now() - new Date(c.created_at).getTime()) / 86_400_000;
        return acc + dias;
      }, 0) / comCiclo.length)
    : 0;

  // ── Counts por status ──────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of cotacoes) map[c.status] = (map[c.status] ?? 0) + 1;
    return map;
  }, [cotacoes]);

  // ── Filtrar + buscar ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return cotacoes.filter((c) => {
      if (filter !== "todas" && c.status !== filter) return false;
      if (!q) return true;
      return (
        c.numero.toLowerCase().includes(q) ||
        c.titulo.toLowerCase().includes(q) ||
        c.comprador?.nome.toLowerCase().includes(q) ||
        c.cotacao_unidades.some(cu => cu.unidades?.nome.toLowerCase().includes(q))
      );
    });
  }, [cotacoes, filter, query]);

  return (
    <div className="max-w-[1600px] mx-auto space-y-4 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-50 leading-tight">Cotações</h1>
          <p className="text-[13px] text-zinc-500 mt-0.5">Gestão de cotações e comparativo de fornecedores</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          data-tour="btn-nova-cotacao"
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors",
            "border-emerald-700/60 bg-emerald-500/10 text-emerald-400",
            "hover:bg-emerald-500/20 hover:border-emerald-600",
          )}
        >
          <Plus size={14} />
          Nova cotação
        </button>
      </div>

      {/* ── Mini-KPIs ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: "EM COTAÇÃO ATIVA",
            value: emCotacao,
            color: "text-sky-400",
            sub:   emCotacao > 0 ? `${emCotacao} aguardando respostas` : "Nenhuma cotação aberta",
          },
          {
            label: "ECONOMIA IA ACUMULADA",
            value: economiaTotal > 0 ? formatBRL(economiaTotal) : "R$ 0,00",
            color: "text-emerald-400",
            sub:   "soma de todas as sugestões IA",
          },
          {
            label: "CICLO MÉDIO (dias)",
            value: cicloMedio,
            color: "text-zinc-50",
            sub:   "do rascunho até aprovação",
          },
        ].map(({ label, value, color, sub }) => (
          <div key={label} className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-5 py-4">
            <div className="text-[10px] uppercase tracking-[0.12em] font-medium text-zinc-500">{label}</div>
            <div className={cn("text-2xl font-mono font-semibold mt-1.5", color)}>{value}</div>
            <div className="text-[11px] text-zinc-600 mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        {FILTER_ORDER.map((s) => {
          const count = s === "todas" ? cotacoes.length : (counts[s] ?? 0);
          if (s !== "todas" && count === 0) return null;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
                filter === s
                  ? "border-zinc-600 bg-zinc-800 text-zinc-100"
                  : "border-zinc-800/80 bg-zinc-900/40 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300",
              )}
            >
              {FILTER_LABELS[s]}
              <span className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-mono leading-none",
                filter === s ? "bg-zinc-700 text-zinc-300" : "bg-zinc-800/80 text-zinc-600",
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Busca ───────────────────────────────────────────────────────────── */}
      <div className="relative w-full max-w-sm">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar por nº, título, comprador…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={cn(
            "w-full rounded-lg border border-zinc-800 bg-zinc-900/60 pl-9 pr-4 py-2",
            "text-sm text-zinc-200 placeholder:text-zinc-600",
            "focus:outline-none focus:border-zinc-600 transition-colors",
          )}
        />
        {query && (
          <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 text-xs">
            ✕
          </button>
        )}
      </div>

      {/* ── Tabela ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[100px_1fr_100px_60px_60px_110px_110px_120px_80px_32px] gap-3 px-5 py-3 border-b border-zinc-800/80">
          {["Nº", "TÍTULO", "UNIDADE", "ITENS", "FORN.", "VALOR EST.", "ECONOMIA IA", "STATUS", "PRAZO", ""].map(h => (
            <div key={h} className="text-[10px] uppercase tracking-[0.12em] font-medium text-zinc-500">{h}</div>
          ))}
        </div>

        {/* Linhas */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Scale size={28} className="text-zinc-700" />
            <p className="text-sm text-zinc-500">
              {query || filter !== "todas"
                ? "Nenhuma cotação encontrada"
                : "Nenhuma cotação ainda"}
            </p>
            {!query && filter === "todas" && (
              <button
                onClick={() => setModalOpen(true)}
                className="mt-1 text-xs text-emerald-500 hover:text-emerald-400 transition-colors"
              >
                + Criar primeira cotação
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800/60">
            {filtered.map((c) => {
              const nomes = c.cotacao_unidades.map(cu => cu.unidades?.nome).filter(Boolean);
              const unidadeLabel = nomes.length === 0
                ? "—" : nomes.length === 1 ? nomes[0] : `${nomes[0]} +${nomes.length - 1}`;

              return (
                <li
                  key={c.id}
                  onClick={() => router.push(`/cotacoes/${c.id}`)}
                  className="grid grid-cols-[100px_1fr_100px_60px_60px_110px_110px_120px_80px_32px] gap-3 px-5 py-3.5 hover:bg-zinc-800/20 transition-colors cursor-pointer group"
                >
                  {/* Nº */}
                  <div className="self-center font-mono text-[11px] text-zinc-400">{c.numero}</div>

                  {/* Título */}
                  <div className="self-center min-w-0">
                    <div className="flex items-center gap-2">
                      {c.urgente && (
                        <AlertTriangle size={11} className="text-red-400 shrink-0" />
                      )}
                      {c.ai_analisada_em && (
                        <Sparkles size={11} className="text-emerald-400 shrink-0" />
                      )}
                      <span className="text-sm font-medium text-zinc-100 truncate">{c.titulo}</span>
                    </div>
                  </div>

                  {/* Unidade */}
                  <div className="self-center">
                    <span className="text-[12px] text-zinc-400 truncate block">{unidadeLabel}</span>
                  </div>

                  {/* Itens */}
                  <div className="self-center text-right">
                    <span className="font-mono text-[12px] text-zinc-400">{c.cotacao_itens.length}</span>
                  </div>

                  {/* Forn. */}
                  <div className="self-center text-right">
                    <span className="font-mono text-[12px] text-zinc-400">{c.cotacao_fornecedores.length}</span>
                  </div>

                  {/* Valor est. */}
                  <div className="self-center text-right">
                    {c.valor_estimado ? (
                      <span className="font-mono text-[12px] text-zinc-300">{formatBRL(c.valor_estimado)}</span>
                    ) : (
                      <span className="text-[12px] text-zinc-600">—</span>
                    )}
                  </div>

                  {/* Economia IA */}
                  <div className="self-center text-right">
                    {c.economia && c.economia > 0 ? (
                      <div>
                        <div className="font-mono text-[12px] text-emerald-400">
                          -{formatBRL(c.economia)}
                        </div>
                        {c.economia_pct && (
                          <div className="text-[10px] text-emerald-600">({c.economia_pct.toFixed(1)}%)</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-[12px] text-zinc-600">—</span>
                    )}
                  </div>

                  {/* Status */}
                  <div className="self-center">
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                      STATUS_STYLES[c.status]?.cls,
                    )}>
                      {STATUS_STYLES[c.status]?.label}
                    </span>
                  </div>

                  {/* Prazo */}
                  <div className="self-center">
                    {c.prazo ? (
                      <div className="flex items-center gap-1 text-[12px] text-zinc-500">
                        <Calendar size={10} />
                        {formatDate(c.prazo)}
                      </div>
                    ) : (
                      <span className="text-[12px] text-zinc-600">—</span>
                    )}
                  </div>

                  {/* Chevron */}
                  <div className="self-center flex justify-end">
                    <ChevronRight size={14} className="text-zinc-700 group-hover:text-zinc-400 transition-colors" />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Footer */}
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-zinc-800/60">
            <span className="text-[12px] text-zinc-600">
              {filtered.length === cotacoes.length
                ? `${cotacoes.length} cotação${cotacoes.length !== 1 ? "ões" : ""}`
                : `${filtered.length} de ${cotacoes.length} cotação${cotacoes.length !== 1 ? "ões" : ""}`}
            </span>
          </div>
        )}
      </div>

      {/* ── Modal ───────────────────────────────────────────────────────────── */}
      <NovaCotacaoModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        requisicoes={requisicoes}
      />
    </div>
  );
}
