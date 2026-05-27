"use client";

import { useState, useTransition } from "react";
import { XCircle, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { rejeitarPedido } from "../actions";

// ── Componente ────────────────────────────────────────────────────────────────

export function ModalRejeitar({ pedidoId, onClose, onRejeitado }: { pedidoId: string; onClose: () => void; onRejeitado: () => void }) {
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
