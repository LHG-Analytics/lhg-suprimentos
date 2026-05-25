"use client";

/**
 * pedidos-client.tsx — LHG-214/215
 * Layout 2-col: lista filtrada à esquerda, painel de detalhe à direita.
 * Inclui timeline de eventos, ações (aprovar/rejeitar/email) e modal de email.
 */
import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Package, CheckCircle2, XCircle, Mail, Truck, Clock,
  AlertCircle, Loader2, Send, X, ChevronRight, ShoppingCart,
  ExternalLink, Star, ReceiptText, Sparkles, ArrowUpRight,
  RefreshCw, Database, Building2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { aprovarPedido, rejeitarPedido, enviarEmailFornecedor, marcarRecebido, pushPedidoOmie } from "../actions";

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

interface OmiePedido {
  id: string;
  omie_codigo: number;
  numero: number | null;
  data_pedido: string | null;
  data_previsao: string | null;
  fornecedor_nome: string | null;
  valor_total: number | null;
  situacao: string | null;
  situacao_aprovacao: string | null;
  etapa: string | null;
  numero_pedido_forn: string | null;
  omie_sincronizado_em: string;
  unidade_id: string;
  unidades: { nome: string; slug: string } | null;
}

interface Props {
  pedidos: Pedido[];
  omie_pedidos: OmiePedido[];
  unidades: { id: string; nome: string; slug: string }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" });
}

function formatDateFull(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function getFornNome(f: NonNullable<Pedido["fornecedores"]>) {
  return f.nome_fantasia || f.razao_social;
}

const STATUS_CONFIG: Record<PedStatus, { label: string; color: string; icon: React.ReactNode }> = {
  rascunho:             { label: "Rascunho",          color: "text-muted-foreground bg-muted ring-border/50",                    icon: <Package size={11} /> },
  aguardando_aprovacao: { label: "Ag. Aprovação",     color: "text-amber-400 bg-amber-500/10 ring-amber-500/20",               icon: <Clock size={11} /> },
  enviado:              { label: "Enviado",            color: "text-sky-400 bg-sky-500/10 ring-sky-500/20",                    icon: <Send size={11} /> },
  em_transito:          { label: "Em Trânsito",        color: "text-violet-400 bg-violet-500/10 ring-violet-500/20",           icon: <Truck size={11} /> },
  recebido:             { label: "Recebido",           color: "text-emerald-400 bg-emerald-500/10 ring-emerald-500/20",        icon: <CheckCircle2 size={11} /> },
  finalizado:           { label: "Finalizado",         color: "text-emerald-400 bg-emerald-500/10 ring-emerald-500/20",        icon: <CheckCircle2 size={11} /> },
  cancelado:            { label: "Cancelado",          color: "text-red-400 bg-red-500/10 ring-red-500/20",                   icon: <XCircle size={11} /> },
  erro_omie:            { label: "Erro Omie",          color: "text-red-400 bg-red-500/10 ring-red-500/20",                   icon: <AlertCircle size={11} /> },
};

const EVENTO_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
  criacao:       { color: "bg-muted",               icon: <Package size={11} className="text-muted-foreground" /> },
  aprovacao:     { color: "bg-emerald-500/20",       icon: <CheckCircle2 size={11} className="text-emerald-400" /> },
  rejeicao:      { color: "bg-red-500/20",           icon: <XCircle size={11} className="text-red-400" /> },
  email_enviado: { color: "bg-sky-500/20",           icon: <Mail size={11} className="text-sky-400" /> },
  recebimento:   { color: "bg-violet-500/20",        icon: <Truck size={11} className="text-violet-400" /> },
  omie:          { color: "bg-amber-500/20",         icon: <Sparkles size={11} className="text-amber-400" /> },
};

const FILTROS: { key: string; label: string }[] = [
  { key: "todos",               label: "Todos" },
  { key: "aguardando_aprovacao",label: "Ag. Aprovação" },
  { key: "enviado",             label: "Enviado" },
  { key: "em_transito",         label: "Em Trânsito" },
  { key: "recebido",            label: "Recebido" },
  { key: "cancelado",           label: "Cancelado" },
];

// ── Modal Email ───────────────────────────────────────────────────────────────

function ModalEmail({
  pedido,
  onClose,
  onEnviado,
}: {
  pedido: Pedido;
  onClose: () => void;
  onEnviado: () => void;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg]     = useState("");
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
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/80">
          <div className="flex items-center gap-2">
            <Mail size={14} className="text-sky-400" />
            <h2 className="text-sm font-semibold text-foreground">Enviar pedido ao fornecedor</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Destinatário */}
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Destinatário</div>
            <div className="text-sm font-medium text-foreground">{forn ? getFornNome(forn) : "—"}</div>
            {forn?.email ? (
              <div className="text-[12px] text-muted-foreground mt-0.5">{forn.email}</div>
            ) : (
              <div className="text-[12px] text-red-400 mt-0.5">⚠ Fornecedor sem e-mail cadastrado</div>
            )}
          </div>

          {/* Itens do pedido */}
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-2">Pedido {pedido.numero}</div>
            <div className="space-y-1">
              {pedido.pedido_itens.slice(0, 4).map(i => (
                <div key={i.id} className="flex items-center justify-between text-[12px]">
                  <span className="text-muted-foreground truncate">{i.quantidade}× {i.produtos?.nome ?? "Produto"}</span>
                  <span className="text-muted-foreground/70 font-mono shrink-0 ml-3">{formatBRL(i.preco_unitario * i.quantidade)}</span>
                </div>
              ))}
              {pedido.pedido_itens.length > 4 && (
                <div className="text-[11px] text-muted-foreground/60">+{pedido.pedido_itens.length - 4} itens</div>
              )}
            </div>
            <div className="flex justify-between mt-2 pt-2 border-t border-border/60">
              <span className="text-[11px] text-muted-foreground">Total</span>
              <span className="text-sm font-mono font-semibold text-foreground">{formatBRL(pedido.valor_total)}</span>
            </div>
          </div>

          {/* Mensagem adicional */}
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1.5">Mensagem adicional (opcional)</label>
            <textarea
              value={msg}
              onChange={e => setMsg(e.target.value)}
              placeholder="Ex: Urgente — necessário até dia 30/05…"
              rows={3}
              className={cn(
                "w-full rounded-lg border border-border bg-muted/60",
                "px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50",
                "focus:outline-none focus:ring-1 focus:ring-border resize-none transition-all",
              )}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border/60">
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground/80 px-3 py-2 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleEnviar}
            disabled={pending || !forn?.email}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border",
              "border-sky-700/60 bg-sky-500/10 px-4 py-2",
              "text-sm font-semibold text-sky-400",
              "hover:bg-sky-500/20 transition-colors",
              "disabled:opacity-40 disabled:cursor-not-allowed",
            )}
          >
            {pending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            {pending ? "Enviando…" : "Confirmar envio"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal Rejeitar ────────────────────────────────────────────────────────────

function ModalRejeitar({
  pedidoId,
  onClose,
  onRejeitado,
}: { pedidoId: string; onClose: () => void; onRejeitado: () => void }) {
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
          <div className="flex items-center gap-2">
            <XCircle size={14} className="text-red-400" />
            <h2 className="text-sm font-semibold text-foreground">Rejeitar pedido</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={14} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-muted-foreground">Informe o motivo da rejeição (opcional):</p>
          <textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder="Ex: Preço acima do orçamento aprovado…"
            rows={3}
            className={cn(
              "w-full rounded-lg border border-border bg-muted/60",
              "px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50",
              "focus:outline-none focus:ring-1 focus:ring-border resize-none",
            )}
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border/60">
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground/80 px-3 py-2 transition-colors">Cancelar</button>
          <button
            onClick={handleRejeitar}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg border border-red-700/60 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40"
          >
            {pending ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
            {pending ? "Rejeitando…" : "Confirmar rejeição"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Painel de Detalhe ─────────────────────────────────────────────────────────

function PedidoDetalhe({ pedido, onAtualizado }: { pedido: Pedido; onAtualizado: () => void }) {
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
        // Aviso soft se o orçamento do mês estiver próximo ou excedido
        if (resultado.avisoOrcamento) {
          toast.warning(resultado.avisoOrcamento, { duration: 8000 });
        }
        onAtualizado();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao aprovar");
      }
    });
  }

  function handleRecebido() {
    start(async () => {
      try {
        await marcarRecebido(pedido.id);
        toast.success("Pedido marcado como recebido");
        onAtualizado();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao atualizar");
      }
    });
  }

  function handlePushOmie() {
    start(async () => {
      try {
        const res = await pushPedidoOmie(pedido.id);
        if (res.erro) {
          toast.error(`Erro Omie: ${res.erro}`);
        } else {
          toast.success(`Pedido enviado ao Omie (#${res.omie_codigo})`);
        }
        onAtualizado();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao enviar ao Omie");
      }
    });
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header do detalhe */}
      <div className="px-6 py-5 border-b border-border/60 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1",
                st.color,
              )}>
                {st.icon}
                {st.label}
              </span>
              <span className="text-[12px] font-mono text-muted-foreground">{pedido.numero}</span>
            </div>
            <h2 className="text-lg font-semibold text-foreground leading-tight">
              {forn ? getFornNome(forn) : "Fornecedor desconhecido"}
            </h2>
            <div className="flex items-center gap-4 mt-1.5 text-[12px] text-muted-foreground">
              {pedido.cotacoes && (
                <span className="flex items-center gap-1">
                  <ReceiptText size={10} />
                  Cotação {pedido.cotacoes.numero}
                </span>
              )}
              <span>Criado em {formatDate(pedido.created_at)}</span>
              {pedido.entrega_prev && (
                <span>Entrega: {formatDate(pedido.entrega_prev)}</span>
              )}
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Total do pedido</div>
            <div className="font-mono text-xl font-bold text-foreground">{formatBRL(pedido.valor_total)}</div>
            {pedido.condicao_pgto && (
              <div className="text-[11px] text-muted-foreground/60 mt-0.5">{pedido.condicao_pgto}</div>
            )}
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-2 mt-4">
          {pedido.status === "aguardando_aprovacao" && (
            <>
              <button
                onClick={handleAprovar}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700/60 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
              >
                {pending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                Aprovar
              </button>
              <button
                onClick={() => setRejeitarOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-700/60 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors"
              >
                <XCircle size={12} />
                Rejeitar
              </button>
            </>
          )}

          {(pedido.status === "enviado" || pedido.status === "em_transito") && (
            <button
              onClick={handleRecebido}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-700/60 bg-violet-500/10 px-3 py-1.5 text-sm font-medium text-violet-400 hover:bg-violet-500/20 transition-colors disabled:opacity-50"
            >
              {pending ? <Loader2 size={12} className="animate-spin" /> : <Truck size={12} />}
              Marcar recebido
            </button>
          )}

          <button
            onClick={() => setEmailOpen(true)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              pedido.email_enviado_em
                ? "border-border bg-muted/40 text-muted-foreground hover:text-foreground/80"
                : "border-sky-700/60 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20",
            )}
          >
            <Mail size={12} />
            {pedido.email_enviado_em ? "Reenviar e-mail" : "Enviar ao fornecedor"}
          </button>

          {/* ── Chip / botão Omie ─────────────────────────── */}
          {pedido.omie_status === "sincronizado" && pedido.omie_codigo ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-700/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400 ml-auto">
              <Sparkles size={9} className="text-amber-400" />
              Omie #{pedido.omie_codigo}
            </span>
          ) : pedido.omie_status === "erro" ? (
            <button
              onClick={handlePushOmie}
              disabled={pending}
              title={`Tentar novamente`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-700/60 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50 ml-auto"
            >
              {pending ? <Loader2 size={12} className="animate-spin" /> : <AlertCircle size={12} />}
              Retentar Omie
            </button>
          ) : pedido.omie_status === "pendente" ? (
            <button
              onClick={handlePushOmie}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-700/60 bg-amber-500/10 px-3 py-1.5 text-sm font-medium text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50 ml-auto"
            >
              {pending ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {pending ? "Enviando…" : "Enviar ao Omie"}
            </button>
          ) : null}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

        {/* Itens */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
              Itens do pedido
            </span>
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

        {/* Fornecedor info */}
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
                  <Star size={10} className="text-amber-500/70 fill-amber-500/40" />
                  {forn.rating.toFixed(1)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Timeline de eventos */}
        {eventos.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium mb-3">Histórico</div>
            <div className="relative">
              {/* Linha vertical */}
              <div className="absolute left-[15px] top-0 bottom-0 w-px bg-border/60" />

              <div className="space-y-3">
                {eventos.map((ev, idx) => {
                  const cfg = EVENTO_CONFIG[ev.tipo] ?? EVENTO_CONFIG.criacao;
                  return (
                    <div key={ev.id} className="flex items-start gap-3 pl-0">
                      {/* Dot */}
                      <div className={cn(
                        "relative z-10 w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0",
                        cfg.color,
                      )}>
                        {cfg.icon}
                      </div>
                      {/* Content */}
                      <div className="flex-1 min-w-0 pt-1">
                        <p className="text-[13px] text-foreground/80 leading-snug">{ev.texto}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground/60">
                          <span>{formatDateTime(ev.created_at)}</span>
                          {(ev.autor?.nome || ev.autor_nome) && (
                            <>
                              <span>·</span>
                              <span>{ev.autor?.nome ?? ev.autor_nome}</span>
                            </>
                          )}
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

      {/* Modais */}
      {emailOpen && (
        <ModalEmail
          pedido={pedido}
          onClose={() => setEmailOpen(false)}
          onEnviado={onAtualizado}
        />
      )}
      {rejeitarOpen && (
        <ModalRejeitar
          pedidoId={pedido.id}
          onClose={() => setRejeitarOpen(false)}
          onRejeitado={onAtualizado}
        />
      )}
    </div>
  );
}

// ── Aba Pedidos Omie ──────────────────────────────────────────────────────────

function OmiePedidosTab({
  omie_pedidos,
  unidades,
}: {
  omie_pedidos: OmiePedido[];
  unidades: { id: string; nome: string; slug: string }[];
}) {
  const router                          = useRouter();
  const [busca, setBusca]               = useState("");
  const [unidadeFiltro, setUnidadeFiltro] = useState("todas");
  const [syncing, setSyncing]           = useState(false);

  // Horário do sync mais recente dentre todos os registros
  const lastSync = useMemo(() => {
    if (!omie_pedidos.length) return null;
    return omie_pedidos.reduce((latest, p) => {
      const t = new Date(p.omie_sincronizado_em).getTime();
      return t > latest ? t : latest;
    }, 0);
  }, [omie_pedidos]);

  const filtrados = useMemo(() => {
    const q = busca.toLowerCase().trim();
    return omie_pedidos.filter(p => {
      const matchUnidade = unidadeFiltro === "todas" || p.unidade_id === unidadeFiltro;
      const matchBusca   = !q ||
        (p.fornecedor_nome?.toLowerCase().includes(q) ?? false) ||
        (p.numero?.toString().includes(q) ?? false) ||
        (p.numero_pedido_forn?.toLowerCase().includes(q) ?? false);
      return matchUnidade && matchBusca;
    });
  }, [omie_pedidos, busca, unidadeFiltro]);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/omie/sync-pedidos", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        const total = (data.results as { total?: number }[] | undefined)
          ?.reduce((acc: number, r) => acc + (r.total ?? 0), 0) ?? 0;
        toast.success(`${total} pedido${total !== 1 ? "s" : ""} sincronizado${total !== 1 ? "s" : ""} com sucesso`);
        router.refresh();
      } else {
        toast.error("Erro ao sincronizar com o Omie");
      }
    } catch {
      toast.error("Erro ao sincronizar com o Omie");
    } finally {
      setSyncing(false);
    }
  }

  function getSituacaoColor(s: string | null) {
    if (!s) return "text-muted-foreground bg-muted ring-border/40";
    const l = s.toLowerCase();
    if (l.includes("cancel"))                      return "text-red-400 bg-red-500/10 ring-red-500/20";
    if (l.includes("faturad"))                     return "text-violet-400 bg-violet-500/10 ring-violet-500/20";
    if (l.includes("aprovad") && !l.includes("ção")) return "text-emerald-400 bg-emerald-500/10 ring-emerald-500/20";
    if (l.includes("aprovação") || l.includes("aprovacao")) return "text-amber-400 bg-amber-500/10 ring-amber-500/20";
    if (l.includes("pedido"))                      return "text-sky-400 bg-sky-500/10 ring-sky-500/20";
    return "text-muted-foreground bg-muted ring-border/40";
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Barra de filtros */}
      <div className="px-5 py-3 border-b border-border/60 bg-card shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            {/* Busca */}
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
              <input
                type="text"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar fornecedor, nº pedido…"
                className={cn(
                  "rounded-lg border border-border bg-muted/40",
                  "pl-7 pr-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50",
                  "focus:outline-none focus:ring-1 focus:ring-border transition-all w-60",
                )}
              />
            </div>

            {/* Filtro de unidade (só aparece se houver mais de 1) */}
            {unidades.length > 1 && (
              <div className="relative">
                <Building2 size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
                <select
                  value={unidadeFiltro}
                  onChange={e => setUnidadeFiltro(e.target.value)}
                  className={cn(
                    "rounded-lg border border-border bg-muted/40",
                    "pl-7 pr-3 py-1.5 text-sm text-foreground appearance-none",
                    "focus:outline-none focus:ring-1 focus:ring-border transition-all",
                  )}
                >
                  <option value="todas">Todas as unidades</option>
                  {unidades.map(u => (
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  ))}
                </select>
              </div>
            )}

            <span className="text-[11px] text-muted-foreground/60">
              {filtrados.length} pedido{filtrados.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {lastSync !== null && (
              <span className="text-[11px] text-muted-foreground/60 flex items-center gap-1">
                <Clock size={10} />
                Sync: {formatDateTime(new Date(lastSync).toISOString())}
              </span>
            )}
            <button
              onClick={handleSync}
              disabled={syncing}
              className={cn(
                "group inline-flex items-center gap-1.5 rounded-lg border",
                "border-amber-700/60 bg-amber-500/10 px-3 py-1.5",
                "text-sm font-medium text-amber-400",
                "hover:bg-amber-500/20 transition-colors disabled:opacity-50",
              )}
            >
              {syncing
                ? <Loader2 size={12} className="animate-spin" />
                : <RefreshCw size={12} className={syncing ? "" : "group-hover:rotate-180 transition-transform duration-500"} />}
              {syncing ? "Sincronizando…" : "Sincronizar agora"}
            </button>
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="flex-1 overflow-auto">
        {filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground/40">
            <Database size={36} strokeWidth={1.2} />
            <p className="text-sm">
              {omie_pedidos.length === 0
                ? "Nenhum pedido sincronizado — clique em \"Sincronizar agora\""
                : "Nenhum pedido encontrado"}
            </p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-card z-10 border-b border-border/60">
              <tr>
                {[
                  { label: "Nº Omie",        align: "left" },
                  { label: "Fornecedor",      align: "left" },
                  { label: "Valor",           align: "right" },
                  { label: "Situação",        align: "left" },
                  { label: "Sit. Aprovação",  align: "left" },
                  { label: "Etapa",           align: "left" },
                  { label: "Previsão",        align: "left" },
                  { label: "Unidade",         align: "left" },
                  { label: "Nº Fornecedor",   align: "left" },
                ].map(col => (
                  <th
                    key={col.label}
                    className={cn(
                      "px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium whitespace-nowrap",
                      col.align === "right" && "text-right",
                    )}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p, i) => (
                <tr
                  key={p.id}
                  className={cn(
                    "border-b border-border/40 transition-colors hover:bg-muted/30",
                    i % 2 === 0 ? "bg-transparent" : "bg-muted/10",
                  )}
                >
                  <td className="px-4 py-2.5 font-mono text-sm text-muted-foreground whitespace-nowrap">
                    {p.numero ?? p.omie_codigo}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-foreground max-w-[220px]">
                    <span className="block truncate">{p.fornecedor_nome ?? "—"}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm text-foreground whitespace-nowrap">
                    {p.valor_total !== null ? formatBRL(p.valor_total) : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {p.situacao ? (
                      <span className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 whitespace-nowrap",
                        getSituacaoColor(p.situacao),
                      )}>
                        {p.situacao}
                      </span>
                    ) : <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-muted-foreground whitespace-nowrap">
                    {p.situacao_aprovacao ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-muted-foreground whitespace-nowrap">
                    {p.etapa ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-muted-foreground whitespace-nowrap">
                    {p.data_previsao ? formatDate(p.data_previsao) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
                    {p.unidades?.nome ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-muted-foreground font-mono">
                    {p.numero_pedido_forn ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function PedidosClient({ pedidos: pedidosIniciais, omie_pedidos, unidades }: Props) {
  const [pedidos, setPedidos]   = useState(pedidosIniciais);
  const [aba, setAba]           = useState<"lhg" | "omie">("lhg");
  const [filtro, setFiltro]     = useState("todos");
  const [busca, setBusca]       = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(pedidosIniciais[0]?.id ?? null);

  const filtrados = useMemo(() => {
    const q = busca.toLowerCase().trim();
    return pedidos.filter(p => {
      const matchStatus = filtro === "todos" || p.status === filtro;
      const matchBusca = !q ||
        p.numero.toLowerCase().includes(q) ||
        (p.fornecedores ? getFornNome(p.fornecedores).toLowerCase().includes(q) : false) ||
        (p.cotacoes?.numero.toLowerCase().includes(q) ?? false);
      return matchStatus && matchBusca;
    });
  }, [pedidos, filtro, busca]);

  const selected = pedidos.find(p => p.id === selectedId) ?? null;

  // Counts por status para os chips
  const counts = useMemo(() => {
    const m: Record<string, number> = { todos: pedidos.length };
    for (const p of pedidos) {
      m[p.status] = (m[p.status] ?? 0) + 1;
    }
    return m;
  }, [pedidos]);

  // Quando um pedido é atualizado via SA, o Router.refresh() via revalidatePath
  // vai re-renderizar o Server Component. Para atualizar o cliente imediatamente,
  // forçamos a recarga apenas do pedido selecionado via window.location.reload()
  // (pode ser melhorado com router.refresh() se necessário)
  function handleAtualizado() {
    // A revalidatePath no SA vai atualizar os dados no próximo load
    // Por ora só selecionamos o próximo pedido na lista se o atual foi alterado
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">

      {/* ── Seletor de abas ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border/60 bg-card shrink-0">
        <button
          onClick={() => setAba("lhg")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            aba === "lhg"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground/80 hover:bg-muted/60",
          )}
        >
          <ShoppingCart size={13} />
          Pedidos LHG
          <span className="ml-0.5 text-[11px] text-muted-foreground/60">{pedidos.length}</span>
        </button>
        <button
          onClick={() => setAba("omie")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            aba === "omie"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground/80 hover:bg-muted/60",
          )}
        >
          <Sparkles size={13} />
          Pedidos Omie
          <span className="ml-0.5 text-[11px] text-muted-foreground/60">{omie_pedidos.length}</span>
        </button>
      </div>

      {/* ── Aba Omie ────────────────────────────────────────────────────────── */}
      {aba === "omie" && (
        <OmiePedidosTab omie_pedidos={omie_pedidos} unidades={unidades} />
      )}

      {/* ── Aba LHG (2-col) ─────────────────────────────────────────────────── */}
      {aba === "lhg" && (
      <div className="flex flex-1 overflow-hidden">

      {/* ── Painel esquerdo: lista ──────────────────────────────────────────── */}
      <div className="w-[340px] border-r border-border/60 flex flex-col shrink-0 bg-card">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-border/60 space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-semibold text-foreground flex items-center gap-2">
              <ShoppingCart size={15} className="text-muted-foreground" />
              Pedidos
              <span className="text-[12px] font-normal text-muted-foreground/60">({pedidos.length})</span>
            </h1>
          </div>

          {/* Busca */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar pedido, fornecedor…"
              className={cn(
                "w-full rounded-lg border border-border bg-muted/40",
                "pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50",
                "focus:outline-none focus:ring-1 focus:ring-border transition-all",
              )}
            />
          </div>

          {/* Filtros */}
          <div className="flex gap-1 flex-wrap">
            {FILTROS.filter(f => f.key === "todos" || (counts[f.key] ?? 0) > 0).map(f => (
              <button
                key={f.key}
                onClick={() => setFiltro(f.key)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                  filtro === f.key
                    ? "bg-muted text-foreground"
                    : "bg-muted/40 text-muted-foreground hover:text-foreground/80 hover:bg-muted/60",
                )}
              >
                {f.label}
                {counts[f.key] > 0 && (
                  <span className="ml-1 text-muted-foreground/60">{counts[f.key]}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Lista de pedidos */}
        <div className="flex-1 overflow-y-auto p-2 space-y-px">
          {filtrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground/60">
              <ShoppingCart size={24} />
              <p className="text-sm">Nenhum pedido encontrado</p>
            </div>
          ) : (
            filtrados.map(p => {
              const forn = p.fornecedores;
              const st   = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.rascunho;
              const isSel = selectedId === p.id;

              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={cn(
                    "w-full text-left rounded-lg px-3 py-3 transition-colors",
                    isSel
                      ? "bg-muted ring-1 ring-border/60"
                      : "hover:bg-muted/60",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="font-mono text-[11px] text-muted-foreground">{p.numero}</span>
                        <span className={cn(
                          "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium ring-1",
                          st.color,
                        )}>
                          {st.icon}
                          {st.label}
                        </span>
                      </div>
                      <div className="text-sm font-medium text-foreground truncate">
                        {forn ? getFornNome(forn) : "Fornecedor desconhecido"}
                      </div>
                      <div className="text-[11px] text-muted-foreground/60 mt-0.5">
                        {formatDate(p.created_at)}
                        {p.cotacoes && ` · ${p.cotacoes.numero}`}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-sm font-semibold text-foreground">{formatBRL(p.valor_total)}</div>
                      <div className="text-[10px] text-muted-foreground/60 mt-0.5">{p.pedido_itens.length} iten{p.pedido_itens.length !== 1 ? "s" : ""}</div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Painel direito: detalhe ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden bg-background/50">
        {selected ? (
          <PedidoDetalhe
            key={selected.id}
            pedido={selected}
            onAtualizado={handleAtualizado}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground/40">
            <ShoppingCart size={40} strokeWidth={1.2} />
            <p className="text-sm">Selecione um pedido para ver os detalhes</p>
          </div>
        )}
      </div>

      </div>
      )}

    </div>
  );
}
