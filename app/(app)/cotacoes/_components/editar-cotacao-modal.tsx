"use client";

/**
 * editar-cotacao-modal.tsx
 * Modal de edição básica de cotação (título, urgente, prazo).
 * Após salvar, UpsertReq é chamado automaticamente no server action.
 */
import { useState, useTransition } from "react";
import { Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { editarCotacao } from "../actions";

interface CotacaoEditavel {
  id:     string;
  numero: string;
  titulo: string;
  urgente: boolean | null;
  prazo:   string | null;
}

interface EditarCotacaoModalProps {
  open:    boolean;
  cotacao: CotacaoEditavel | null;
  onClose: () => void;
  onSaved: () => void;
}

export function EditarCotacaoModal({ open, cotacao, onClose, onSaved }: EditarCotacaoModalProps) {
  const [pending, start] = useTransition();
  const [titulo,  setTitulo]  = useState(cotacao?.titulo ?? "");
  const [urgente, setUrgente] = useState(cotacao?.urgente ?? false);
  const [prazo,   setPrazo]   = useState(cotacao?.prazo?.slice(0, 10) ?? "");

  // Sincroniza quando modal abre com nova cotação
  if (open && cotacao && titulo !== cotacao.titulo && !pending) {
    setTitulo(cotacao.titulo);
    setUrgente(cotacao.urgente ?? false);
    setPrazo(cotacao.prazo?.slice(0, 10) ?? "");
  }

  function handleSubmit() {
    if (!cotacao) return;
    if (!titulo.trim() || titulo.trim().length < 3) {
      toast.error("Título deve ter ao menos 3 caracteres");
      return;
    }
    start(async () => {
      const res = await editarCotacao(cotacao.id, {
        titulo: titulo.trim(),
        urgente,
        prazo:  prazo || null,
      });
      if ("erro" in res) {
        toast.error(res.erro);
      } else {
        toast.success(`Cotação ${cotacao.numero} atualizada`);
        onSaved();
        onClose();
      }
    });
  }

  if (!open || !cotacao) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[18vh] px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-background shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/80">
          <div>
            <h2 className="text-base font-semibold text-foreground">Editar cotação</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">{cotacao.numero}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          {/* Título */}
          <div>
            <label className="block text-[11px] uppercase tracking-[0.1em] text-muted-foreground mb-1.5 font-medium">
              Título *
            </label>
            <input
              autoFocus
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted/60 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none transition-colors"
            />
          </div>

          {/* Prazo */}
          <div>
            <label className="block text-[11px] uppercase tracking-[0.1em] text-muted-foreground mb-1.5 font-medium">
              Prazo <span className="normal-case text-muted-foreground/70">(opcional)</span>
            </label>
            <input
              type="date"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted/60 px-4 py-2.5 text-sm text-foreground focus:outline-none transition-colors"
            />
          </div>

          {/* Urgente */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setUrgente(u => !u)}
              className={cn(
                "w-9 h-5 rounded-full border transition-colors relative",
                urgente ? "bg-red-500/30 border-red-500/50" : "bg-muted border-border",
              )}
            >
              <div className={cn(
                "absolute top-0.5 w-4 h-4 rounded-full transition-all",
                urgente ? "left-[18px] bg-red-400" : "left-0.5 bg-muted-foreground",
              )} />
            </div>
            <span className={cn("text-sm font-medium", urgente ? "text-red-300" : "text-muted-foreground")}>
              Urgente
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border/60">
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground/80 px-3 py-2 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={pending}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-4 py-2",
              "border-emerald-700/60 bg-emerald-500/10 text-sm font-medium text-emerald-400",
              "hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {pending ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
