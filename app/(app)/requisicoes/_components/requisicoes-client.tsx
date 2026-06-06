"use client";

/**
 * requisicoes-client.tsx — LHG-209
 * Lista interativa de requisições com filtro por status, busca e wizard de criação.
 */
import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search, ClipboardList, Plus, ChevronRight, AlertTriangle, Trash2, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { deletarRequisicao } from "../actions";
import { NovaRequisicaoModal } from "./nova-requisicao-modal";
import { SyncOmieRequisicoesButton } from "./sync-omie-requisicoes-button";
import { ConfirmModal } from "@/components/ui/confirm-modal";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Solicitante { nome: string; avatar_url: string | null }
interface RequisicaoUnidade { unidade_id: string; unidades: { nome: string; slug: string } | null }
interface Requisicao {
  id:             string;
  numero:         string;
  titulo:         string;
  urgencia:       "normal" | "urgente";
  status:         ReqStatus;
  origem:         string;
  valor_estimado: number | null;
  created_at:     string;
  solicitante:    Solicitante | null;
  requisicao_unidades: RequisicaoUnidade[];
  requisicao_itens:    { id: string; produto_novo: boolean }[];
}

interface Unidade { id: string; nome: string; slug: string; cor_hex: string | null }
interface Produto  {
  id: string; codigo: string; nome: string;
  unidade_med: string; categoria: string;
  familia_omie: string | null; preco_custo: number | null;
  omie_unidade_id: string | null;
}

interface RequisicoesClientProps {
  requisicoes:      Requisicao[];
  unidades:         Unidade[];
  produtos:         Produto[];
  activeUnidadeId?: string | null;
}

type ReqStatus = "rascunho" | "cotacao" | "pendente" | "aprovado" | "rejeitado" | "cancelado" | "pendente_produto" | "aguardando_cotacao";
type FilterStatus = "todas" | ReqStatus;

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

function getInitials(nome: string) {
  return nome.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
}

// ── Badge de status ───────────────────────────────────────────────────────────

const STATUS_STYLES: Record<ReqStatus, { label: string; cls: string }> = {
  rascunho:          { label: "Rascunho",          cls: "bg-muted text-muted-foreground ring-1 ring-border/50" },
  cotacao:           { label: "Em cotação",         cls: "bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20" },
  pendente:          { label: "Pendente",           cls: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20" },
  aprovado:          { label: "Aprovado",           cls: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20" },
  rejeitado:         { label: "Rejeitado",          cls: "bg-red-500/10 text-red-400 ring-1 ring-red-500/20" },
  cancelado:         { label: "Cancelado",          cls: "bg-muted/50 text-muted-foreground/70 ring-1 ring-border/30" },
  pendente_produto:  { label: "Prod. pendente",     cls: "bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/20" },
  aguardando_cotacao:{ label: "Ag. cotação",        cls: "bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20" },
};

const FILTER_ORDER: FilterStatus[] = [
  "todas", "rascunho", "pendente_produto", "aguardando_cotacao", "cotacao", "pendente", "aprovado", "rejeitado", "cancelado",
];

const FILTER_LABELS: Record<FilterStatus, string> = {
  todas:              "Todas",
  rascunho:           "Rascunho",
  cotacao:            "Em cotação",
  pendente:           "Pendente",
  aprovado:           "Aprovado",
  rejeitado:          "Rejeitado",
  cancelado:          "Cancelado",
  pendente_produto:   "Prod. pendente",
  aguardando_cotacao: "Ag. cotação",
};

// ── Componente ────────────────────────────────────────────────────────────────

export function RequisicoesClient({ requisicoes, unidades, produtos, activeUnidadeId }: RequisicoesClientProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterStatus>("todas");
  const [query,  setQuery]  = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmReq,  setConfirmReq]  = useState<Requisicao | null>(null);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);
  const [, startDelete] = useTransition();

  function handleDelete(e: React.MouseEvent, req: Requisicao) {
    e.stopPropagation();
    setConfirmReq(req);
  }

  function confirmarDelete() {
    if (!confirmReq) return;
    const req = confirmReq;
    setConfirmReq(null);
    setDeletingId(req.id);
    startDelete(async () => {
      try {
        const result = await deletarRequisicao(req.id);
        if ("erro" in result) {
          toast.error(result.erro);
        } else {
          toast.success(`Requisição ${result.numero} excluída`);
          router.refresh();
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao excluir");
      } finally {
        setDeletingId(null);
      }
    });
  }

  // Contagens por status
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of requisicoes) {
      map[r.status] = (map[r.status] ?? 0) + 1;
    }
    return map;
  }, [requisicoes]);

  // Filtrar + buscar
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return requisicoes.filter((r) => {
      if (filter !== "todas" && r.status !== filter) return false;
      if (!q) return true;
      return (
        r.numero.toLowerCase().includes(q) ||
        r.titulo.toLowerCase().includes(q) ||
        r.solicitante?.nome.toLowerCase().includes(q) ||
        r.requisicao_unidades.some(ru => ru.unidades?.nome.toLowerCase().includes(q))
      );
    });
  }, [requisicoes, filter, query]);

  return (
    <div className="max-w-[1600px] mx-auto space-y-4 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground leading-tight">
            Requisições
          </h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Solicitações de compra da rede LHG
          </p>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          data-tour="btn-nova-requisicao"
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors",
            "border-emerald-700/60 bg-emerald-500/10 text-emerald-400",
            "hover:bg-emerald-500/20 hover:border-emerald-600",
          )}
        >
          <Plus size={14} />
          Nova requisição
        </button>
        <SyncOmieRequisicoesButton />
      </div>

      {/* ── Filtros por status ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        {FILTER_ORDER.map((s) => {
          const count = s === "todas" ? requisicoes.length : (counts[s] ?? 0);
          if (s !== "todas" && count === 0) return null;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
                filter === s
                  ? "border-border bg-muted text-foreground"
                  : "border-border/80 bg-muted/40 text-muted-foreground hover:border-border hover:text-foreground/80",
              )}
            >
              {FILTER_LABELS[s]}
              <span className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-mono leading-none",
                filter === s ? "bg-muted/80 text-foreground/80" : "bg-muted/60 text-muted-foreground/60",
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Busca ───────────────────────────────────────────────────────────── */}
      <div className="relative w-full max-w-sm">
        <Search
          size={14}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
        <input
          type="text"
          placeholder="Buscar por nº, título, solicitante…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={cn(
            "w-full rounded-lg border border-border bg-muted/60 pl-9 pr-4 py-2",
            "text-sm text-foreground placeholder:text-muted-foreground/50",
            "focus:outline-none focus:border-border transition-colors",
          )}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {/* ── Tabela ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border/80 bg-muted/40 overflow-hidden">
        {/* Header da tabela — oculto no mobile */}
        <div className="hidden sm:grid grid-cols-[100px_1fr_160px_100px_60px_110px_120px_80px_32px] gap-3 px-5 py-3.5 border-b border-border/80">
          {(
            [
              { label: "Nº",          align: "left"  },
              { label: "TÍTULO",      align: "left"  },
              { label: "SOLICITANTE", align: "left"  },
              { label: "UNIDADE",     align: "left"  },
              { label: "ITENS",       align: "right" },
              { label: "VALOR EST.",  align: "right" },
              { label: "STATUS",      align: "left"  },
              { label: "CRIADA",      align: "left"  },
              { label: "",            align: "left"  },
            ] as const
          ).map((h) => (
            <div
              key={h.label}
              className={cn(
                "text-[10px] uppercase tracking-[0.12em] font-medium text-muted-foreground",
                h.align === "right" && "text-right",
              )}
            >
              {h.label}
            </div>
          ))}
        </div>

        {/* Linhas */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <ClipboardList size={28} className="text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {query || filter !== "todas"
                ? "Nenhuma requisição encontrada"
                : "Nenhuma requisição ainda"}
            </p>
            {!query && filter === "todas" && (
              <button
                onClick={() => setModalOpen(true)}
                className="mt-1 text-xs text-emerald-500 hover:text-emerald-400 transition-colors"
              >
                + Criar primeira requisição
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {filtered.map((r) => {
              const nomes = r.requisicao_unidades
                .map(ru => ru.unidades?.nome)
                .filter(Boolean);
              const unidadeLabel = nomes.length === 0
                ? "—"
                : nomes.length === 1
                  ? nomes[0]
                  : `${nomes[0]} +${nomes.length - 1}`;

              return (
                <li
                  key={r.id}
                  className="cursor-pointer hover:bg-muted/40 transition-colors group"
                  onClick={() => router.push(`/requisicoes/${r.id}`)}
                >
                  {/* ── Mobile card ── */}
                  <div className="sm:hidden px-4 py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="font-mono text-[11px] text-muted-foreground">{r.numero}</span>
                        {r.urgencia === "urgente" && (
                          <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium bg-red-500/10 text-red-400 ring-1 ring-red-500/20 shrink-0">
                            <AlertTriangle size={9} />urgente
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-foreground truncate">{r.titulo}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_STYLES[r.status]?.cls)}>
                          {STATUS_STYLES[r.status]?.label}
                        </span>
                        {(r as { origem?: string }).origem === "omie" && (
                          <span className="text-[10px] font-medium text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded ring-1 ring-amber-500/20">
                            Omie
                          </span>
                        )}
                        <span className="text-[11px] text-muted-foreground">{unidadeLabel}</span>
                        {r.valor_estimado && (
                          <span className="font-mono text-[11px] text-muted-foreground">{formatBRL(r.valor_estimado)}</span>
                        )}
                        <span className="text-[11px] text-muted-foreground">{relativeTime(r.created_at)}</span>
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-muted-foreground/40 shrink-0 mt-1" />
                  </div>

                  {/* ── Desktop grid ── */}
                  <div className="hidden sm:grid grid-cols-[100px_1fr_160px_100px_60px_110px_120px_80px_32px] gap-3 px-5 py-3.5">
                    {/* Nº */}
                    <div className="self-center font-mono text-[11px] text-muted-foreground">
                      {r.numero}
                    </div>

                    {/* Título */}
                    <div className="self-center min-w-0">
                      <div className="flex items-center gap-2">
                        {r.urgencia === "urgente" && (
                          <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium bg-red-500/10 text-red-400 ring-1 ring-red-500/20 shrink-0">
                            <AlertTriangle size={9} />
                            urgente
                          </span>
                        )}
                        {(r as { origem?: string }).origem === "omie" && (
                          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20 shrink-0">
                            Omie
                          </span>
                        )}
                        <span className="text-sm font-medium text-foreground truncate">
                          {r.titulo}
                        </span>
                      </div>
                    </div>

                    {/* Solicitante */}
                    <div className="self-center flex items-center gap-2 min-w-0">
                      <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                        "bg-muted text-muted-foreground",
                      )}>
                        {r.solicitante ? getInitials(r.solicitante.nome) : "?"}
                      </div>
                      <span className="text-[12px] text-muted-foreground truncate">
                        {r.solicitante?.nome ?? "—"}
                      </span>
                    </div>

                    {/* Unidade */}
                    <div className="self-center">
                      <span className="text-[12px] text-muted-foreground truncate block">
                        {unidadeLabel}
                      </span>
                    </div>

                    {/* Itens */}
                    <div className="self-center text-right">
                      <span className="font-mono text-[12px] text-muted-foreground">
                        {r.requisicao_itens.length}
                      </span>
                      {r.requisicao_itens.some(i => i.produto_novo) && (
                        <span className="ml-1 inline-flex items-center text-[10px] text-amber-400" title="Produtos pendentes de cadastro">
                          ⚠{r.requisicao_itens.filter(i => i.produto_novo).length}
                        </span>
                      )}
                    </div>

                    {/* Valor est. */}
                    <div className="self-center text-right">
                      {r.valor_estimado ? (
                        <span className="font-mono text-[12px] text-foreground/80">
                          {formatBRL(r.valor_estimado)}
                        </span>
                      ) : (
                        <span className="text-[12px] text-muted-foreground/60">—</span>
                      )}
                    </div>

                    {/* Status */}
                    <div className="self-center">
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                        STATUS_STYLES[r.status]?.cls,
                      )}>
                        {STATUS_STYLES[r.status]?.label}
                      </span>
                    </div>

                    {/* Criada */}
                    <div className="self-center">
                      <span className="text-[12px] text-muted-foreground">
                        {relativeTime(r.created_at)}
                      </span>
                    </div>

                    {/* Ações */}
                    <div className="self-center flex justify-end">
                      {r.status !== "aprovado" ? (
                        <button
                          onClick={(e) => handleDelete(e, r)}
                          disabled={deletingId === r.id}
                          title="Excluir requisição"
                          className="p-1 rounded text-muted-foreground/30 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all disabled:cursor-not-allowed"
                        >
                          {deletingId === r.id
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Trash2 size={13} />}
                        </button>
                      ) : (
                        <ChevronRight
                          size={14}
                          className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors"
                        />
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Footer */}
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-border/60">
            <span className="text-[12px] text-muted-foreground/60">
              {filtered.length === requisicoes.length
                ? `${requisicoes.length} requisição${requisicoes.length !== 1 ? "ões" : ""}`
                : `${filtered.length} de ${requisicoes.length} requisição${requisicoes.length !== 1 ? "ões" : ""}`}
            </span>
          </div>
        )}
      </div>

      {/* ── Modal nova requisição ────────────────────────────────────────────── */}
      <NovaRequisicaoModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        unidades={unidades}
        produtos={produtos}
        activeUnidadeId={activeUnidadeId}
      />

      {/* ── Modal confirmar exclusão ─────────────────────────────────────────── */}
      <ConfirmModal
        open={!!confirmReq}
        titulo={`Excluir ${confirmReq?.numero}?`}
        descricao={`A requisição "${confirmReq?.titulo}" e todos os seus itens serão removidos permanentemente.`}
        carregando={!!deletingId}
        onConfirmar={confirmarDelete}
        onCancelar={() => setConfirmReq(null)}
      />
    </div>
  );
}
