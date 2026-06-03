"use client";

/**
 * produto-omie-modal.tsx
 * Modal para Keila cadastrar um produto no Omie a partir de um item de texto livre.
 */
import { useState, useTransition } from "react";
import { X, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { criarProdutoOmie, vincularProdutoItem } from "../../actions";

interface Props {
  open:             boolean;
  onClose:          () => void;
  requisicaoItemId?: string;  // undefined = modo standalone (só cria, não vincula)
  unidadeId:        string;
  nomeSugerido:     string;
}

const UNIDADES = ["UN", "KG", "LT", "CX", "PC", "MT", "GL", "SC", "FR", "PR"];

export function ProdutoOmieModal({ open, onClose, requisicaoItemId, unidadeId, nomeSugerido }: Props) {
  const [nome, setNome]       = useState(nomeSugerido);
  const [unidade, setUnidade] = useState("UN");
  const [familia, setFamilia] = useState("");
  const [custo, setCusto]     = useState("");
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const valorCusto = custo ? Number(custo.replace(",", ".")) : undefined;
        const { produtoId } = await criarProdutoOmie(unidadeId, {
          nome, unidade, familia: familia || undefined, valorCusto,
        });

        if (requisicaoItemId) {
          await vincularProdutoItem(requisicaoItemId, produtoId);
          toast.success(`Produto "${nome}" criado no Omie e vinculado`);
        } else {
          toast.success(`Produto "${nome}" criado no Omie`);
        }
        onClose();
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-foreground">Cadastrar produto no Omie</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nome do produto *</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              className="w-full h-9 px-3 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:border-ring"
              placeholder="Ex: Sabonete líquido 5L"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Unidade *</label>
              <select
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:border-ring"
              >
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Preço de custo</label>
              <input
                value={custo}
                onChange={(e) => setCusto(e.target.value)}
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                className="w-full h-9 px-3 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:border-ring"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Família Omie (opcional)</label>
            <input
              value={familia}
              onChange={(e) => setFamilia(e.target.value)}
              className="w-full h-9 px-3 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:border-ring"
              placeholder="Ex: AMENITIES"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 h-9 rounded-lg border border-border text-muted-foreground hover:text-foreground text-sm transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={pending || !nome || !unidade}
              className="flex-1 h-9 rounded-lg bg-lhg-500 hover:bg-lhg-600 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
              {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Criar no Omie
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
