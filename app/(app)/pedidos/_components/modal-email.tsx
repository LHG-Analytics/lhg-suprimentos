"use client";

import { useState, useTransition } from "react";
import { Mail, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { enviarEmailFornecedor } from "../actions";

// ── Tipos locais ──────────────────────────────────────────────────────────────

interface PedidoItem {
  id: string;
  quantidade: number;
  preco_unitario: number;
  valor_total: number | null;
  produtos: { id: string; nome: string; codigo: string; unidade_med: string; categoria: string } | null;
}

interface Pedido {
  id: string;
  numero: string;
  valor_total: number;
  pedido_itens: PedidoItem[];
  fornecedores: { id: string; razao_social: string; nome_fantasia: string | null; email: string | null; rating: number | null; pontualidade_pct: number | null } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function getFornNome(f: NonNullable<Pedido["fornecedores"]>) {
  return f.nome_fantasia || f.razao_social;
}

// ── Componente ────────────────────────────────────────────────────────────────

export function ModalEmail({ pedido, onClose, onEnviado }: { pedido: Pedido; onClose: () => void; onEnviado: () => void }) {
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
