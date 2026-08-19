"use client";

/**
 * editar-requisicao-modal.tsx
 * Edita os dados de cabeçalho da requisição: título, urgência e justificativa.
 *
 * Só aparece enquanto a requisição não virou cotação — depois disso os itens já
 * foram copiados para `cotacao_itens` e a edição acontece na cotação.
 *
 * Vale especialmente para as requisições importadas do Omie, que chegavam sem
 * título e agora podem ser nomeadas.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { editarRequisicao } from "../../actions";

interface Props {
  open:    boolean;
  onClose: () => void;
  req: {
    id: string;
    titulo: string;
    urgencia: string;
    justificativa: string | null;
  };
}

export function EditarRequisicaoModal({ open, onClose, req }: Props) {
  const router = useRouter();
  const [titulo, setTitulo]     = useState(req.titulo);
  const [urgencia, setUrgencia] = useState(req.urgencia === "urgente" ? "urgente" : "normal");
  const [justif, setJustif]     = useState(req.justificativa ?? "");
  const [erro, setErro]         = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  if (!open) return null;

  async function salvar() {
    setErro(null);
    if (titulo.trim().length < 3) {
      setErro("Título precisa de pelo menos 3 caracteres.");
      return;
    }
    setSalvando(true);
    try {
      const res = await editarRequisicao(req.id, {
        titulo:        titulo.trim(),
        urgencia:      urgencia as "normal" | "urgente",
        justificativa: justif.trim() || null,
      });
      if ("erro" in res) { setErro(res.erro); return; }
      toast.success("Requisição atualizada");
      onClose();
      router.refresh();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[520px] rounded-xl border border-border bg-background shadow-2xl overflow-hidden">

        <div className="flex items-center justify-between px-5 py-4 border-b border-border/80">
          <h2 className="text-base font-semibold text-foreground">Editar requisição</h2>
          <button onClick={onClose} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 block mb-1">Título</label>
            <input
              autoFocus
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              placeholder="ex: ALIMENTOS RCC 19/08"
              className="w-full h-9 rounded-lg border border-border bg-muted/30 px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 block mb-1">Urgência</label>
            <div className="flex gap-1">
              {([
                { id: "normal",  label: "Normal" },
                { id: "urgente", label: "Urgente" },
              ] as const).map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setUrgencia(id)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                    urgencia === id
                      ? id === "urgente"
                        ? "border-red-500/50 bg-red-500/10 text-red-400"
                        : "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 block mb-1">Justificativa</label>
            <textarea
              value={justif}
              onChange={e => setJustif(e.target.value)}
              rows={3}
              placeholder="opcional"
              className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-emerald-500/50 resize-none"
            />
          </div>

          {erro && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/25 rounded-md px-3 py-2">{erro}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border/60">
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground/80 px-3 py-2 transition-colors">
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-700/60 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
          >
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
