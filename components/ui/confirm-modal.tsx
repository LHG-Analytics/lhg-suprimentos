"use client";

/**
 * components/ui/confirm-modal.tsx
 * Modal de confirmação destrutiva reutilizável.
 * Substitui o window.confirm() nativo por algo visualmente consistente.
 */
import { Loader2, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfirmModalProps {
  open: boolean;
  titulo: string;
  descricao?: string;
  labelConfirmar?: string;
  carregando?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

export function ConfirmModal({
  open,
  titulo,
  descricao,
  labelConfirmar = "Excluir",
  carregando = false,
  onConfirmar,
  onCancelar,
}: ConfirmModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancelar}
      />

      {/* Card */}
      <div className="relative w-full max-w-[380px] rounded-xl border border-border bg-background shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20 shrink-0">
              <Trash2 size={15} className="text-red-400" />
            </div>
            <h2 className="text-sm font-semibold text-foreground leading-snug">
              {titulo}
            </h2>
          </div>
          <button
            onClick={onCancelar}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0 mt-0.5"
          >
            <X size={13} />
          </button>
        </div>

        {/* Descrição */}
        {descricao && (
          <div className="px-5 pb-4">
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              {descricao}
            </p>
          </div>
        )}

        {/* Aviso */}
        <div className="mx-5 mb-4 rounded-lg bg-red-500/5 border border-red-500/15 px-3 py-2">
          <p className="text-[11px] text-red-400/80">
            Esta ação não pode ser desfeita.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border/60">
          <button
            onClick={onCancelar}
            disabled={carregando}
            className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            disabled={carregando}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-4 py-1.5 text-sm font-semibold transition-colors",
              "border-red-700/60 bg-red-500/10 text-red-400 hover:bg-red-500/20",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {carregando
              ? <Loader2 size={13} className="animate-spin" />
              : <Trash2 size={13} />}
            {carregando ? "Excluindo…" : labelConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
