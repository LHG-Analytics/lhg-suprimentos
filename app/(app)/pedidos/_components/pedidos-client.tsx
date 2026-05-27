"use client";

/**
 * pedidos-client.tsx — LHG-214/215/231
 * Lista unificada: pedidos LHG + pedidos Omie em layout de tabela
 * (idêntico ao padrão fornecedores/produtos).
 * Click LHG  → modal de detalhe (ações: aprovar, rejeitar, email, Omie…).
 * Click Omie → modal de detalhe Omie.
 */
import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Package, CheckCircle2, XCircle, Mail, Truck, Clock,
  AlertCircle, Loader2, Send, X, ShoppingCart,
  Star, ReceiptText, Sparkles, RefreshCw, Plus,
  ChevronLeft, ChevronRight, Calendar, Download,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { aprovarPedido, rejeitarPedido, enviarEmailFornecedor, marcarRecebido, pushPedidoOmie } from "../actions";
import { useDebounce } from "@/hooks/use-debounce";
import { downloadCsv } from "@/lib/csv";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type PedStatus = "rascunho" | "aguardando_aprovacao" | "enviado" | "em_transito" | "recebido" | "finalizado" | "cancelado" | "erro_omie";

interface PedidoItem {
  id: string;
  quantidade: number;
  preco_unitario: number;
  valor_total: number | null;
  produtos: { id: string; nome: string; codigo: string; unidade_med: string; categoria: string } | null;
}

interface PedidoEvento {
  id: string;
  tipo: string;
  texto: string;
  created_at: string;
  autor_nome: string | null;
  autor: { nome: string; avatar_url: string | null } | null;
}

interface Pedido {
  id: string;
  numero: string;
  status: PedStatus;
  valor_total: number;
  condicao_pgto: string | null;
  entrega_prev: string | null;
  created_at: string;
  email_enviado_em: string | null;
  omie_status: string;
  omie_codigo: string | null;
  comprador: { nome: string; avatar_url: string | null } | null;
  aprovador: { nome: string } | null;
  fornecedores: { id: string; razao_social: string; nome_fantasia: string | null; email: string | null; rating: number | null; pontualidade_pct: number | null } | null;
  cotacoes: { id: string; numero: string; titulo: string } | null;
  pedido_itens: PedidoItem[];
  pedido_eventos: PedidoEvento[];
}

interface OmieItem {
  descricao: string;
  valor_total: number;
}

interface OmiePedido {
  id: string;
  omie_codigo: number;
  numero: number | null;
  data_pedido: string | null;
  data_previsao: string | null;
  fornecedor_nome: string | null;
  itens: OmieItem[] | null;
  valor_total: number | null;
  situacao: string | null;
  situacao_aprovacao: string | null;
  etapa: string | null;
  numero_pedido_forn: string | null;
  omie_sincronizado_em: string;
  unidade_id: string;
  unidades: { nome: string; slug: string } | null;
}

type FiltroOmie = "pendentes" | "faturados" | "recebidos" | "cancelados" | "encerrados" | "rec_parciais" | "fat_parciais";

const FILTROS_OMIE: { key: FiltroOmie; label: string }[] = [
  { key: "pendentes",    label: "Pendentes"    },
  { key: "faturados",    label: "Faturados"    },
  { key: "recebidos",    label: "Recebidos"    },
  { key: "cancelados",   label: "Cancelados"   },
  { key: "encerrados",   label: "Encerrados"   },
  { key: "rec_parciais", label: "Rec. Parciais" },
  { key: "fat_parciais", label: "Fat. Parciais" },
];

interface Props {
  pedidos: Pedido[];
  omie_pedidos: OmiePedido[];
  filtroAtivo: FiltroOmie;
}

// ── Configurações de status ───────────────────────────────────────────────────

const STATUS_CONFIG: Record<PedStatus, { label: string; color: string; icon: React.ReactNode }> = {
  rascunho:             { label: "Rascunho",      color: "text-muted-foreground bg-muted ring-border/50",              icon: <Package size={11} /> },
  aguardando_aprovacao: { label: "Ag. Aprovação", color: "text-amber-400 bg-amber-500/10 ring-amber-500/20",          icon: <Clock size={11} /> },
  enviado:              { label: "Enviado",        color: "text-sky-400 bg-sky-500/10 ring-sky-500/20",               icon: <Send size={11} /> },
  em_transito:          { label: "Em Trânsito",   color: "text-violet-400 bg-violet-500/10 ring-violet-500/20",      icon: <Truck size={11} /> },
  recebido:             { label: "Recebido",       color: "text-emerald-400 bg-emerald-500/10 ring-emerald-500/20",  icon: <CheckCircle2 size={11} /> },
  finalizado:           { label: "Finalizado",     color: "text-emerald-400 bg-emerald-500/10 ring-emerald-500/20",  icon: <CheckCircle2 size={11} /> },
  cancelado:            { label: "Cancelado",      color: "text-red-400 bg-red-500/10 ring-red-500/20",              icon: <XCircle size={11} /> },
  erro_omie:            { label: "Erro Omie",      color: "text-red-400 bg-red-500/10 ring-red-500/20",              icon: <AlertCircle size={11} /> },
};

const EVENTO_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
  criacao:       { color: "bg-muted",           icon: <Package size={11} className="text-muted-foreground" /> },
  aprovacao:     { color: "bg-emerald-500/20",   icon: <CheckCircle2 size={11} className="text-emerald-400" /> },
  rejeicao:      { color: "bg-red-500/20",       icon: <XCircle size={11} className="text-red-400" /> },
  email_enviado: { color: "bg-sky-500/20",       icon: <Mail size={11} className="text-sky-400" /> },
  recebimento:   { color: "bg-violet-500/20",    icon: <Truck size={11} className="text-violet-400" /> },
  omie:          { color: "bg-amber-500/20",     icon: <Sparkles size={11} className="text-amber-400" /> },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function formatDate(iso: string) {
  // Fix timezone: "2026-05-25" é interpretado como UTC meia-noite.
  // Em UTC-3 isso seria "24/05/2026 21:00" → mostraria "24 mai" (errado).
  // Adicionar "T12:00:00" garante que qualquer fuso mostre o dia correto.
  const str = iso.includes("T") ? iso : `${iso}T12:00:00`;
  return new Date(str).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" });
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function getFornNome(f: NonNullable<Pedido["fornecedores"]>) {
  return f.nome_fantasia || f.razao_social;
}

function omieSituacaoColor(s: string | null) {
  if (!s) return "text-muted-foreground bg-muted ring-border/40";
  const l = s.toLowerCase();
  if (l.includes("cancel"))                           return "text-red-400 bg-red-500/10 ring-red-500/20";
  if (l.includes("faturad"))                          return "text-violet-400 bg-violet-500/10 ring-violet-500/20";
  if (l.includes("recebid"))                          return "text-emerald-400 bg-emerald-500/10 ring-emerald-500/20";
  if (l.includes("aprovad") && !l.includes("ção"))   return "text-emerald-400 bg-emerald-500/10 ring-emerald-500/20";
  if (l.includes("aprovação") || l.includes("aprovacao")) return "text-amber-400 bg-amber-500/10 ring-amber-500/20";
  if (l.includes("pedido"))                           return "text-sky-400 bg-sky-500/10 ring-sky-500/20";
  if (l.includes("ag."))                              return "text-amber-400 bg-amber-500/10 ring-amber-500/20";
  return "text-muted-foreground bg-muted ring-border/40";
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

// ── Modal Email ───────────────────────────────────────────────────────────────

function ModalEmail({ pedido, onClose, onEnviado }: { pedido: Pedido; onClose: () => void; onEnviado: () => void }) {
  const [pending, start] = useTransition();
  const [msg, setMsg]    = useState("");
  const forn = pedido.fornecedores;

  function handleEnviar() {
    start(async () => {
      try {
        await enviarEmailFornecedor(pedido.id, msg);
        toast.success("E-mail registrado com sucesso");
        onEnviado();
        onClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao enviar e-mail");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[520px] rounded-xl border border-border bg-background shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/80">
          <div className="flex items-center gap-2">
            <Mail size={14} className="text-sky-400" />
            <h2 className="text-sm font-semibold text-foreground">Enviar pedido ao fornecedor</h2>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><X size={14} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Destinatário</div>
            <div className="text-sm font-medium text-foreground">{forn ? getFornNome(forn) : "—"}</div>
            {forn?.email
              ? <div className="text-[12px] text-muted-foreground mt-0.5">{forn.email}</div>
              : <div className="text-[12px] text-red-400 mt-0.5">⚠ Fornecedor sem e-mail cadastrado</div>}
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-2">Pedido {pedido.numero}</div>
            <div className="space-y-1">
              {pedido.pedido_itens.slice(0, 4).map(i => (
                <div key={i.id} className="flex items-center justify-between text-[12px]">
                  <span className="text-muted-foreground truncate">{i.quantidade}× {i.produtos?.nome ?? "Produto"}</span>
                  <span className="text-muted-foreground/70 font-mono shrink-0 ml-3">{formatBRL(i.preco_unitario * i.quantidade)}</span>
                </div>
              ))}
              {pedido.pedido_itens.length > 4 && <div className="text-[11px] text-muted-foreground/60">+{pedido.pedido_itens.length - 4} itens</div>}
            </div>
            <div className="flex justify-between mt-2 pt-2 border-t border-border/60">
              <span className="text-[11px] text-muted-foreground">Total</span>
              <span className="text-sm font-mono font-semibold text-foreground">{formatBRL(pedido.valor_total)}</span>
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1.5">Mensagem adicional (opcional)</label>
            <textarea value={msg} onChange={e => setMsg(e.target.value)} placeholder="Ex: Urgente — necessário até dia 30/05…" rows={3}
              className="w-full rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-border resize-none transition-all" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border/60">
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground/80 px-3 py-2 transition-colors">Cancelar</button>
          <button onClick={handleEnviar} disabled={pending || !forn?.email}
            className="inline-flex items-center gap-2 rounded-lg border border-sky-700/60 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-400 hover:bg-sky-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {pending ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
            {pending ? "Enviando…" : "Confirmar envio"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal Rejeitar ────────────────────────────────────────────────────────────

function ModalRejeitar({ pedidoId, onClose, onRejeitado }: { pedidoId: string; onClose: () => void; onRejeitado: () => void }) {
  const [pending, start] = useTransition();
  const [motivo, setMotivo] = useState("");

  function handleRejeitar() {
    start(async () => {
      try {
        await rejeitarPedido(pedidoId, motivo);
        toast.success("Pedido rejeitado");
        onRejeitado();
        onClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao rejeitar");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[15vh] px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[440px] rounded-xl border border-border bg-background shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/80">
          <div className="flex items-center gap-2"><XCircle size={14} className="text-red-400" /><h2 className="text-sm font-semibold text-foreground">Rejeitar pedido</h2></div>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><X size={14} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-muted-foreground">Informe o motivo da rejeição (opcional):</p>
          <textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex: Preço acima do orçamento aprovado…" rows={3}
            className="w-full rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-border resize-none" />
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border/60">
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground/80 px-3 py-2 transition-colors">Cancelar</button>
          <button onClick={handleRejeitar} disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg border border-red-700/60 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40">
            {pending ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
            {pending ? "Rejeitando…" : "Confirmar rejeição"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal Detalhe Pedido Omie ─────────────────────────────────────────────────

function ModalOmiePedido({ pedido, onClose, onSync }: { pedido: OmiePedido; onClose: () => void; onSync: () => void }) {
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/omie/sync-pedidos", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        const total = (data.results as { total?: number }[] | undefined)
          ?.reduce((acc: number, r) => acc + (r.total ?? 0), 0) ?? 0;
        toast.success(`${total} pedido${total !== 1 ? "s" : ""} sincronizado${total !== 1 ? "s" : ""}`);
        onSync();
        onClose();
      } else {
        toast.error("Erro ao sincronizar");
      }
    } catch {
      toast.error("Erro ao sincronizar");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[520px] rounded-xl border border-border bg-background shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/80">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-amber-400" />
            <h2 className="text-sm font-semibold text-foreground">
              Pedido Omie {pedido.numero ? `#${pedido.numero}` : `cod. ${pedido.omie_codigo}`}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><X size={14} /></button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">

          {/* Fornecedor + valor */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Fornecedor</div>
              <div className={cn("text-sm font-semibold leading-tight", pedido.fornecedor_nome ? "text-foreground" : "text-muted-foreground/50 italic")}>
                {pedido.fornecedor_nome ?? "Não identificado"}
              </div>
              {pedido.numero_pedido_forn && (
                <div className="text-[11px] text-muted-foreground/60 mt-0.5">Nº fornecedor: {pedido.numero_pedido_forn}</div>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Valor total</div>
              <div className="font-mono text-lg font-bold text-foreground">
                {pedido.valor_total !== null ? formatBRL(pedido.valor_total) : "—"}
              </div>
            </div>
          </div>

          {/* Grid de detalhes */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Etapa",            value: pedido.etapa,       badge: true },
              { label: "Situação",         value: pedido.situacao,    badge: true },
              { label: "Sit. Aprovação",   value: pedido.situacao_aprovacao, badge: false },
              { label: "Unidade",          value: pedido.unidades?.nome, badge: false },
              { label: "Data do pedido",   value: pedido.data_pedido ? formatDate(pedido.data_pedido) : null, badge: false },
              { label: "Previsão entrega", value: pedido.data_previsao ? formatDate(pedido.data_previsao) : null, badge: false },
            ].map(({ label, value, badge }) => (
              <div key={label} className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">{label}</div>
                {value ? (
                  badge ? (
                    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1", omieSituacaoColor(value))}>
                      {value}
                    </span>
                  ) : (
                    <div className="text-[12px] text-foreground font-medium">{value}</div>
                  )
                ) : (
                  <div className="text-[12px] text-muted-foreground/40">—</div>
                )}
              </div>
            ))}
          </div>

          {/* Itens do pedido */}
          {pedido.itens && pedido.itens.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1.5">
                Itens ({pedido.itens.length})
              </div>
              <div className="rounded-lg border border-border/60 overflow-hidden">
                {pedido.itens.map((item, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "flex items-center justify-between gap-3 px-3 py-2 text-[12px]",
                      idx > 0 && "border-t border-border/40",
                    )}
                  >
                    <span className="text-foreground/80 truncate">{item.descricao}</span>
                    <span className="font-mono text-muted-foreground shrink-0">{formatBRL(item.valor_total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Último sync */}
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
            <Clock size={10} />
            Sincronizado em {formatDateTime(pedido.omie_sincronizado_em)}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border/60">
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground/80 px-3 py-2 transition-colors">Fechar</button>
          <button onClick={handleSync} disabled={syncing}
            className="group inline-flex items-center gap-1.5 rounded-lg border border-amber-700/60 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50">
            {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} className="group-hover:rotate-180 transition-transform duration-500" />}
            {syncing ? "Sincronizando…" : "Sincronizar agora"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Detalhe Pedido LHG (conteúdo) ────────────────────────────────────────────

function PedidoDetalheConteudo({ pedido, onAtualizado, onClose }: { pedido: Pedido; onAtualizado: () => void; onClose: () => void }) {
  const [pending, start]      = useTransition();
  const [emailOpen, setEmailOpen] = useState(false);
  const [rejeitarOpen, setRejeitarOpen] = useState(false);

  const forn    = pedido.fornecedores;
  const st      = STATUS_CONFIG[pedido.status] ?? STATUS_CONFIG.rascunho;
  const eventos = [...pedido.pedido_eventos].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  function handleAprovar() {
    start(async () => {
      try {
        const resultado = await aprovarPedido(pedido.id);
        toast.success("Pedido aprovado");
        if (resultado.avisoOrcamento) toast.warning(resultado.avisoOrcamento, { duration: 8000 });
        onAtualizado();
      } catch (err) { toast.error(err instanceof Error ? err.message : "Erro ao aprovar"); }
    });
  }

  function handleRecebido() {
    start(async () => {
      try {
        await marcarRecebido(pedido.id);
        toast.success("Pedido marcado como recebido");
        onAtualizado();
      } catch (err) { toast.error(err instanceof Error ? err.message : "Erro ao atualizar"); }
    });
  }

  function handlePushOmie() {
    start(async () => {
      try {
        const res = await pushPedidoOmie(pedido.id);
        if (res.erro) { toast.error(`Erro Omie: ${res.erro}`); }
        else { toast.success(`Pedido enviado ao Omie (#${res.omie_codigo})`); }
        onAtualizado();
      } catch (err) { toast.error(err instanceof Error ? err.message : "Erro ao enviar ao Omie"); }
    });
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border/60 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1", st.color)}>
                {st.icon}{st.label}
              </span>
              <span className="text-[12px] font-mono text-muted-foreground">{pedido.numero}</span>
            </div>
            <h2 className="text-lg font-semibold text-foreground leading-tight">
              {forn ? getFornNome(forn) : "Fornecedor desconhecido"}
            </h2>
            <div className="flex items-center gap-4 mt-1.5 text-[12px] text-muted-foreground">
              {pedido.cotacoes && <span className="flex items-center gap-1"><ReceiptText size={10} />Cotação {pedido.cotacoes.numero}</span>}
              <span>Criado em {formatDate(pedido.created_at)}</span>
              {pedido.entrega_prev && <span>Entrega: {formatDate(pedido.entrega_prev)}</span>}
            </div>
          </div>
          <div className="flex items-start gap-2 shrink-0">
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Total</div>
              <div className="font-mono text-xl font-bold text-foreground">{formatBRL(pedido.valor_total)}</div>
              {pedido.condicao_pgto && <div className="text-[11px] text-muted-foreground/60 mt-0.5">{pedido.condicao_pgto}</div>}
            </div>
            <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors mt-0.5">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          {pedido.status === "aguardando_aprovacao" && (
            <>
              <button onClick={handleAprovar} disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700/60 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
                {pending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}Aprovar
              </button>
              <button onClick={() => setRejeitarOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-700/60 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors">
                <XCircle size={12} />Rejeitar
              </button>
            </>
          )}
          {(pedido.status === "enviado" || pedido.status === "em_transito") && (
            <button onClick={handleRecebido} disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-700/60 bg-violet-500/10 px-3 py-1.5 text-sm font-medium text-violet-400 hover:bg-violet-500/20 transition-colors disabled:opacity-50">
              {pending ? <Loader2 size={12} className="animate-spin" /> : <Truck size={12} />}Marcar recebido
            </button>
          )}
          <button onClick={() => setEmailOpen(true)}
            className={cn("inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              pedido.email_enviado_em
                ? "border-border bg-muted/40 text-muted-foreground hover:text-foreground/80"
                : "border-sky-700/60 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20")}>
            <Mail size={12} />{pedido.email_enviado_em ? "Reenviar e-mail" : "Enviar ao fornecedor"}
          </button>
          {pedido.omie_status === "sincronizado" && pedido.omie_codigo ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-700/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400 ml-auto">
              <Sparkles size={9} />Omie #{pedido.omie_codigo}
            </span>
          ) : pedido.omie_status === "erro" ? (
            <button onClick={handlePushOmie} disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-700/60 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50 ml-auto">
              {pending ? <Loader2 size={12} className="animate-spin" /> : <AlertCircle size={12} />}Retentar Omie
            </button>
          ) : pedido.omie_status === "pendente" ? (
            <button onClick={handlePushOmie} disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-700/60 bg-amber-500/10 px-3 py-1.5 text-sm font-medium text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50 ml-auto">
              {pending ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {pending ? "Enviando…" : "Enviar ao Omie"}
            </button>
          ) : null}
        </div>
      </div>

      {/* Body scrollável */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* Itens */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">Itens do pedido</span>
            <span className="text-[10px] text-muted-foreground/40">({pedido.pedido_itens.length})</span>
          </div>
          <div className="rounded-xl border border-border/80 bg-muted/40 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="px-4 py-2 text-left text-[10px] uppercase tracking-wider text-muted-foreground/60">Produto</th>
                  <th className="px-4 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground/60">Qtd</th>
                  <th className="px-4 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground/60">Unit.</th>
                  <th className="px-4 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground/60">Total</th>
                </tr>
              </thead>
              <tbody>
                {pedido.pedido_itens.map((item, i) => (
                  <tr key={item.id} className={cn(i < pedido.pedido_itens.length - 1 && "border-b border-border/40")}>
                    <td className="px-4 py-2.5">
                      <div className="text-sm text-foreground truncate max-w-[220px]">{item.produtos?.nome ?? "—"}</div>
                      <div className="text-[11px] text-muted-foreground/60 font-mono">{item.produtos?.codigo} · {item.produtos?.unidade_med}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm text-muted-foreground font-mono">{item.quantidade}</td>
                    <td className="px-4 py-2.5 text-right text-sm text-muted-foreground font-mono">{formatBRL(item.preco_unitario)}</td>
                    <td className="px-4 py-2.5 text-right text-sm font-semibold text-foreground font-mono">
                      {formatBRL(item.valor_total ?? item.preco_unitario * item.quantidade)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border/60 bg-muted/60">
                  <td colSpan={3} className="px-4 py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground/60 font-medium">Total</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-foreground">{formatBRL(pedido.valor_total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Fornecedor */}
        {forn && (
          <div className="rounded-xl border border-border/80 bg-muted/40 px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-2">Fornecedor</div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold text-muted-foreground shrink-0">
                {getFornNome(forn).slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground">{getFornNome(forn)}</div>
                {forn.email && <div className="text-[11px] text-muted-foreground">{forn.email}</div>}
              </div>
              {forn.rating !== null && (
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground/60 shrink-0">
                  <Star size={10} className="text-amber-500/70 fill-amber-500/40" />{forn.rating.toFixed(1)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Timeline */}
        {eventos.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium mb-3">Histórico</div>
            <div className="relative">
              <div className="absolute left-[15px] top-0 bottom-0 w-px bg-border/60" />
              <div className="space-y-3">
                {eventos.map(ev => {
                  const cfg = EVENTO_CONFIG[ev.tipo] ?? EVENTO_CONFIG.criacao;
                  return (
                    <div key={ev.id} className="flex items-start gap-3">
                      <div className={cn("relative z-10 w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0", cfg.color)}>
                        {cfg.icon}
                      </div>
                      <div className="flex-1 min-w-0 pt-1">
                        <p className="text-[13px] text-foreground/80 leading-snug">{ev.texto}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground/60">
                          <span>{formatDateTime(ev.created_at)}</span>
                          {(ev.autor?.nome || ev.autor_nome) && <><span>·</span><span>{ev.autor?.nome ?? ev.autor_nome}</span></>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {emailOpen && <ModalEmail pedido={pedido} onClose={() => setEmailOpen(false)} onEnviado={onAtualizado} />}
      {rejeitarOpen && <ModalRejeitar pedidoId={pedido.id} onClose={() => setRejeitarOpen(false)} onRejeitado={onAtualizado} />}
    </div>
  );
}

// ── Modal Detalhe LHG ─────────────────────────────────────────────────────────

function ModalLhgPedido({ pedido, onClose, onAtualizado }: { pedido: Pedido; onClose: () => void; onAtualizado: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[4vh] px-4 pb-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[760px] rounded-xl border border-border bg-background shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <PedidoDetalheConteudo pedido={pedido} onAtualizado={onAtualizado} onClose={onClose} />
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function PedidosClient({ pedidos: pedidosIniciais, omie_pedidos, filtroAtivo }: Props) {
  const router = useRouter();

  const [busca,        setBusca]        = useState("");
  const buscaDebounced = useDebounce(busca, 300);
  const [selectedLhg,  setSelectedLhg]  = useState<Pedido | null>(null);
  const [selectedOmie, setSelectedOmie] = useState<OmiePedido | null>(null);
  const [page,         setPage]         = useState(0);
  const [dataInicio,   setDataInicio]   = useState<string>("");
  const [dataFim,      setDataFim]      = useState<string>("");

  // counts retornados pelo Omie para cada filtro (após sync individual)
  const [filtroSyncCounts,  setFiltroSyncCounts]  = useState<Record<string, number>>({});
  const [filtroSyncing,     setFiltroSyncing]     = useState<Record<string, boolean>>({});

  // ── Sync por filtro: navega imediatamente, sincroniza em background ──────────
  async function handleFiltroSync(filtro: FiltroOmie) {
    if (filtroSyncing[filtro]) return;
    // Se já é o filtro ativo, só atualiza do banco sem chamar o Omie
    if (filtro === filtroAtivo) {
      router.refresh();
      return;
    }
    // 1. Navega imediatamente (mostra dados já no banco para esse filtro)
    router.push(`/pedidos?filtro=${filtro}`);
    // 2. Sincroniza em background
    setFiltroSyncing(prev => ({ ...prev, [filtro]: true }));
    try {
      const res  = await fetch("/api/omie/sync-pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filtro }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(`Erro ao sincronizar ${filtro}: ${data?.error ?? res.status}`);
        return;
      }
      type SyncRes = { total?: number; detalhe?: { totalRegistrosOmie?: number } };
      const r = (data.results as SyncRes[] | undefined)?.[0];
      const totalOmie = r?.detalhe?.totalRegistrosOmie ?? r?.total ?? 0;
      setFiltroSyncCounts(prev => ({ ...prev, [filtro]: totalOmie }));
      router.refresh(); // 3. Refresh com dados frescos do banco
    } catch (err) {
      toast.error(`Erro: ${err instanceof Error ? err.message : "desconhecido"}`);
    } finally {
      setFiltroSyncing(prev => ({ ...prev, [filtro]: false }));
    }
  }

  // ── Filtragem ────────────────────────────────────────────────────────────────
  type RowLhg  = { kind: "lhg";  data: Pedido }
  type RowOmie = { kind: "omie"; data: OmiePedido }
  type Row = RowLhg | RowOmie;

  const buscaQ     = buscaDebounced.toLowerCase().trim();
  const buscaAtiva = buscaQ.length >= 2;
  const buscaCurta = buscaQ.length === 1;

  const rows = useMemo<Row[]>(() => {
    // Busca textual só ativa com 2+ caracteres
    const q = buscaQ.length >= 2 ? buscaQ : "";

    const lhgRows: RowLhg[] = pedidosIniciais
      .filter(p => {
        return !q ||
          p.numero.toLowerCase().includes(q) ||
          (p.fornecedores ? getFornNome(p.fornecedores).toLowerCase().includes(q) : false) ||
          (p.cotacoes?.numero.toLowerCase().includes(q) ?? false) ||
          p.pedido_itens.some(item => item.produtos?.nome?.toLowerCase().includes(q) ?? false);
      })
      .map(p => ({ kind: "lhg", data: p }));

    const omieRows: RowOmie[] = omie_pedidos
      .filter(p => {
        return !q ||
          (p.fornecedor_nome?.toLowerCase().includes(q) ?? false) ||
          (p.numero?.toString().includes(q) ?? false) ||
          (p.numero_pedido_forn?.toLowerCase().includes(q) ?? false) ||
          (p.itens?.some(item => item.descricao.toLowerCase().includes(q)) ?? false);
      })
      .map(p => ({ kind: "omie", data: p }));

    // Filtro por data (created_at / data_pedido)
    const inicio = dataInicio ? new Date(dataInicio + "T00:00:00") : null;
    const fim    = dataFim    ? new Date(dataFim    + "T23:59:59") : null;

    const lhgFiltrados = inicio || fim
      ? lhgRows.filter(r => {
          const d = new Date(r.data.created_at);
          if (inicio && d < inicio) return false;
          if (fim    && d > fim)    return false;
          return true;
        })
      : lhgRows;

    const omieFiltrados = inicio || fim
      ? omieRows.filter(r => {
          const d = new Date(r.data.data_pedido ?? r.data.omie_sincronizado_em);
          if (inicio && d < inicio) return false;
          if (fim    && d > fim)    return false;
          return true;
        })
      : omieRows;

    // Ordena por data desc
    return [...lhgFiltrados, ...omieFiltrados].sort((a, b) => {
      const dateA = a.kind === "lhg"
        ? new Date(a.data.created_at).getTime()
        : new Date(a.data.data_pedido ?? a.data.omie_sincronizado_em).getTime();
      const dateB = b.kind === "lhg"
        ? new Date(b.data.created_at).getTime()
        : new Date(b.data.data_pedido ?? b.data.omie_sincronizado_em).getTime();
      return dateB - dateA;
    });
  }, [pedidosIniciais, omie_pedidos, buscaDebounced, dataInicio, dataFim]);

  // ── Paginação ─────────────────────────────────────────────────────────────────
  const PAGE_SIZE   = 50;
  const totalPages  = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const paginados   = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Helpers que resetam página no mesmo batch do React 18 (sem render intermediário errado)
  function handleBusca(v: string) { setBusca(v); setPage(0); }

  function handleAtualizado() {
    router.refresh();
    setSelectedLhg(null);
  }

  function exportarPedidosCSV() {
    const headers = ["Número", "Fornecedor", "Valor Total (R$)", "Status", "Criado em"];
    const csvRows = rows.map((r) => {
      if (r.kind === "lhg") {
        const p = r.data;
        return [
          p.numero,
          p.fornecedores ? (p.fornecedores.nome_fantasia ?? p.fornecedores.razao_social) : "",
          (p.valor_total ?? 0).toFixed(2).replace(".", ","),
          p.status,
          p.created_at ? new Date(p.created_at).toLocaleDateString("pt-BR") : "",
        ];
      } else {
        const p = r.data;
        return [
          p.numero ? `#${p.numero}` : `c.${p.omie_codigo}`,
          p.fornecedor_nome ?? "",
          (p.valor_total ?? 0).toFixed(2).replace(".", ","),
          p.situacao ?? "",
          p.data_pedido ? new Date(p.data_pedido + "T12:00:00").toLocaleDateString("pt-BR") : "",
        ];
      }
    });
    downloadCsv("pedidos", headers, csvRows);
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-[1600px] mx-auto space-y-4 pb-8">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground leading-tight flex items-center gap-2">
            <ShoppingCart size={18} className="text-muted-foreground" />
            Pedidos de Compra
          </h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Filtros Omie — cada botão sincroniza e exibe o status correspondente */}
          {FILTROS_OMIE.map(f => {
            const isAtivo   = filtroAtivo === f.key;
            const isSyncing = filtroSyncing[f.key];
            return (
              <button
                key={f.key}
                onClick={() => handleFiltroSync(f.key)}
                disabled={isSyncing}
                title={`Sincronizar e exibir pedidos "${f.label}" do Omie`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-40",
                  isAtivo
                    ? "border-amber-500/50 bg-amber-500/15 text-amber-400"
                    : "border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70",
                )}
              >
                {isSyncing
                  ? <Loader2 size={10} className="animate-spin" />
                  : <RefreshCw size={10} className={isAtivo ? "text-amber-400" : ""} />}
                {f.label}
                {filtroSyncCounts[f.key] != null && (
                  <span className={cn("ml-0.5 font-mono text-[10px]", isAtivo ? "text-amber-300" : "text-amber-400")}>
                    {filtroSyncCounts[f.key]}
                  </span>
                )}
              </button>
            );
          })}

          {/* Novo Pedido LHG */}
          <button
            onClick={() => toast.info("Em breve: criar novo pedido de compra")}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-700/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors shrink-0"
          >
            <Plus size={13} />
            Novo Pedido
          </button>
        </div>
      </div>

      {/* ── Busca ────────────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por número, fornecedor, cotação…"
            value={busca}
            onChange={e => handleBusca(e.target.value)}
            className={cn(
              "w-full rounded-lg border bg-muted/60 pl-9 py-2.5 text-sm text-foreground",
              "placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0 transition-colors",
              buscaAtiva ? "border-emerald-500/40 pr-28" : "border-border pr-9",
            )}
          />
          {buscaAtiva && (
            <span className={cn(
              "absolute right-8 top-1/2 -translate-y-1/2 text-[11px] font-mono px-2 py-0.5 rounded-full",
              rows.length === 0
                ? "bg-red-500/10 text-red-400"
                : "bg-emerald-500/10 text-emerald-400",
            )}>
              {rows.length} resultado{rows.length !== 1 ? "s" : ""}
            </span>
          )}
          {busca && (
            <button onClick={() => handleBusca("")} aria-label="Limpar busca" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground text-xs">✕</button>
          )}
        </div>
        {buscaCurta && (
          <p className="text-[11px] text-muted-foreground/60 pl-1">
            Digite mais um caractere para buscar…
          </p>
        )}

        {/* Filtro por data */}
        <div className="flex items-center gap-1.5">
          <Calendar size={13} className="text-muted-foreground shrink-0" />
          <input
            type="date"
            aria-label="Data inicial"
            value={dataInicio}
            onChange={e => { setDataInicio(e.target.value); setPage(0); }}
            className="h-8 rounded-md border border-border bg-muted/40 px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <input
            type="date"
            aria-label="Data final"
            value={dataFim}
            onChange={e => { setDataFim(e.target.value); setPage(0); }}
            className="h-8 rounded-md border border-border bg-muted/40 px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          {(dataInicio || dataFim) && (
            <button
              aria-label="Limpar filtro de data"
              onClick={() => { setDataInicio(""); setDataFim(""); setPage(0); }}
              className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>


      {/* ── Resumo ───────────────────────────────────────────────────────────── */}
      {rows.length > 0 && (
        <div className="flex items-center gap-3 px-1 text-[12px] text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground tabular-nums">{rows.length}</span>
            {" "}pedido{rows.length !== 1 ? "s" : ""}
          </span>
          <span className="text-border/60">·</span>
          <span>
            Custo total:{" "}
            <span className="font-mono font-semibold text-foreground">
              {formatBRL(rows.reduce((s, r) => s + (r.kind === "lhg" ? r.data.valor_total : (r.data.valor_total ?? 0)), 0))}
            </span>
          </span>
          <button
            onClick={exportarPedidosCSV}
            aria-label="Exportar pedidos como CSV"
            title="Exportar CSV"
            className="ml-auto flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors text-xs"
          >
            <Download size={13} />
            <span className="hidden sm:inline">CSV</span>
          </button>
        </div>
      )}

      {/* ── Tabela ───────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border/80 bg-muted/40 overflow-hidden">

        {/* Header da tabela */}
        <div className="grid grid-cols-[80px_1fr_100px] md:grid-cols-[80px_2fr_96px_96px_130px] gap-4 px-5 py-3 border-b border-border/80">
          <div className="text-[10px] uppercase tracking-[0.12em] font-medium text-muted-foreground">PEDIDO</div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-medium text-muted-foreground">FORNECEDOR / ITENS</div>
          <div className="hidden md:block text-[10px] uppercase tracking-[0.12em] font-medium text-muted-foreground">DATA DA COMPRA</div>
          <div className="hidden md:block text-[10px] uppercase tracking-[0.12em] font-medium text-muted-foreground">PREVISÃO ENTREGA</div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-medium text-muted-foreground">CUSTO</div>
        </div>

        {/* Linhas */}
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <ShoppingCart size={28} className="text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {busca
                ? "Nenhum pedido encontrado para os filtros selecionados"
                : "Nenhum pedido cadastrado"}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {paginados.map(row => {
              if (row.kind === "lhg") {
                const p = row.data;
                const forn = p.fornecedores;
                const st = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.rascunho;
                return (
                  <li
                    key={`lhg-${p.id}`}
                    onClick={() => setSelectedLhg(p)}
                    className="grid grid-cols-[80px_1fr_100px] md:grid-cols-[80px_2fr_96px_96px_130px] gap-4 px-5 py-3.5 hover:bg-muted/40 transition-colors cursor-pointer items-center"
                  >
                    {/* Pedido # */}
                    <div className="font-mono text-[11px] text-muted-foreground truncate">{p.numero}</div>

                    {/* Fornecedor + itens */}
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate leading-tight">
                        {forn ? getFornNome(forn) : "Fornecedor desconhecido"}
                      </div>
                      {/* Itens do pedido LHG */}
                      {p.pedido_itens.length > 0 && (
                        <div className="text-[11px] text-muted-foreground/60 mt-0.5 truncate">
                          {p.pedido_itens.slice(0, 2).map(i =>
                            `${i.quantidade}× ${i.produtos?.nome ?? "Produto"}`
                          ).join(" · ")}
                          {p.pedido_itens.length > 2 && ` +${p.pedido_itens.length - 2}`}
                        </div>
                      )}
                      {p.cotacoes && !p.pedido_itens.length && (
                        <div className="text-[11px] text-muted-foreground/60 mt-0.5 flex items-center gap-1">
                          <ReceiptText size={9} />Cotação {p.cotacoes.numero}
                        </div>
                      )}
                    </div>

                    {/* Data */}
                    <div className="hidden md:block text-[12px] text-muted-foreground">
                      {formatDate(p.created_at)}
                    </div>

                    {/* Previsão Entrega */}
                    <div className="hidden md:block text-[12px] text-muted-foreground">
                      {p.entrega_prev ? formatDate(p.entrega_prev) : "—"}
                    </div>

                    {/* Custo */}
                    <div className="font-mono text-sm font-semibold text-foreground">
                      {formatBRL(p.valor_total)}
                    </div>
                  </li>
                );
              } else {
                // Omie
                const p = row.data;
                return (
                  <li
                    key={`omie-${p.id}`}
                    onClick={() => setSelectedOmie(p)}
                    className="grid grid-cols-[80px_1fr_100px] md:grid-cols-[80px_2fr_96px_96px_130px] gap-4 px-5 py-3.5 hover:bg-muted/40 transition-colors cursor-pointer items-center"
                  >
                    {/* Pedido # */}
                    <div className="font-mono text-[11px] text-muted-foreground truncate">
                      {p.numero ? `#${p.numero}` : `c.${p.omie_codigo}`}
                    </div>

                    {/* Fornecedor + itens */}
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate leading-tight">
                        {p.fornecedor_nome ?? "Fornecedor desconhecido"}
                      </div>
                      {/* Itens do pedido Omie (produtos_consulta) */}
                      {p.itens && p.itens.length > 0 ? (
                        <div className="text-[11px] text-muted-foreground/60 mt-0.5 truncate">
                          {p.itens.slice(0, 2).map(i => i.descricao).filter(Boolean).join(" · ")}
                          {p.itens.length > 2 && ` +${p.itens.length - 2}`}
                        </div>
                      ) : p.numero_pedido_forn ? (
                        <div className="text-[11px] text-muted-foreground/60 mt-0.5">Nº forn: {p.numero_pedido_forn}</div>
                      ) : null}
                    </div>

                    {/* Data */}
                    <div className="hidden md:block text-[12px] text-muted-foreground">
                      {p.data_pedido ? formatDate(p.data_pedido) : "—"}
                    </div>

                    {/* Previsão Entrega */}
                    <div className="hidden md:block text-[12px] text-muted-foreground">
                      {p.data_previsao ? formatDate(p.data_previsao) : "—"}
                    </div>

                    {/* Valor */}
                    <div className="font-mono text-sm font-semibold text-foreground">
                      {p.valor_total !== null ? formatBRL(p.valor_total) : "—"}
                    </div>
                  </li>
                );
              }
            })}
          </ul>
        )}

        {/* Paginação */}
        {rows.length > 0 && totalPages > 1 && (
          <div className="px-5 py-3 border-t border-border/60 flex items-center justify-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              aria-label="Página anterior"
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
              aria-label="Próxima página"
              className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* ── Modais ────────────────────────────────────────────────────────────── */}
      {selectedLhg && (
        <ModalLhgPedido
          key={selectedLhg.id}
          pedido={selectedLhg}
          onClose={() => setSelectedLhg(null)}
          onAtualizado={handleAtualizado}
        />
      )}
      {selectedOmie && (
        <ModalOmiePedido
          pedido={selectedOmie}
          onClose={() => setSelectedOmie(null)}
          onSync={() => router.refresh()}
        />
      )}
    </div>
  );
}
