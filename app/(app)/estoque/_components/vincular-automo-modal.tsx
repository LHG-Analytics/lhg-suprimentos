"use client";

/**
 * vincular-automo-modal.tsx — corrige o vínculo de um item já cadastrado.
 *
 * Faltava desde o bloco 1: o modal de cadastro dizia "salve sem vínculo e ajuste
 * depois", mas só fator e estoque ideal eram editáveis na linha. Quem salvasse
 * sem vínculo, ou aceitasse uma sugestão errada, não tinha caminho de volta.
 *
 * Importa porque vínculo errado não dá erro: as vendas do item vão para o produto
 * errado (ou não vão), e a divergência sai errada todo mês, em silêncio. Medido
 * no catálogo do Lush Ipiranga, o piso antigo de semelhança deixava 330 produtos
 * com uma "melhor sugestão" que era ruído — quem aceitasse precisava de conserto.
 *
 * A action `atualizarItemEstoque` já aceitava `automo_produto_id`; o que não
 * existia era a tela.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Check, Unlink } from "lucide-react";
import { toast } from "sonner";
import { atualizarItemEstoque } from "../actions";
import { SeletorAutomo } from "./seletor-automo";
import type { ProdutoAutomo } from "@/lib/automo/client";

interface Props {
  itemId:         string;
  /** Nome do produto no LHG/Omie — base da sugestão e do cabeçalho. */
  produtoNome:    string;
  automoIdAtual:  number | null;
  produtosAutomo: ProdutoAutomo[];
  onClose:        () => void;
}

export function VincularAutomoModal({
  itemId, produtoNome, automoIdAtual, produtosAutomo, onClose,
}: Props) {
  const router = useRouter();
  const [automoId, setAutomoId] = useState<number | null>(automoIdAtual);
  const [salvando, setSalvando] = useState(false);

  const mudou = automoId !== automoIdAtual;
  const atual = automoIdAtual != null
    ? produtosAutomo.find((p) => p.id === automoIdAtual) ?? null
    : null;

  async function salvar() {
    setSalvando(true);
    try {
      // `null` é valor válido e intencional aqui: desvincular é uma decisão, não
      // ausência de decisão. O schema da action aceita nullable de propósito.
      const res = await atualizarItemEstoque(itemId, { automo_produto_id: automoId });
      if ("erro" in res) {
        toast.error(res.erro);
        return;
      }
      toast.success(automoId == null ? "Vínculo removido" : "Vínculo atualizado");
      onClose();
      router.refresh();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[8vh] px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={salvando ? undefined : onClose} />
      <div className="relative w-full max-w-[620px] rounded-xl border border-border bg-background shadow-2xl overflow-hidden">

        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border/80">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">Vínculo no Automo</h2>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{produtoNome}</p>
          </div>
          <button
            onClick={onClose}
            disabled={salvando}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50 shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[65vh] overflow-y-auto">
          {/* Vínculo atual explícito: sem isso a pessoa não sabe do que está saindo. */}
          <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">
              Vínculo atual
            </p>
            {atual ? (
              <p className="text-sm text-foreground">
                {atual.descricao}
                <span className="text-[11px] text-muted-foreground/60 ml-1.5">Automo #{atual.id}</span>
              </p>
            ) : automoIdAtual != null ? (
              // Vinculado a um id que não está mais no catálogo — produto excluído
              // no Automo. Precisa aparecer: as vendas dele nunca mais vão casar.
              <p className="text-sm text-amber-400">
                Automo #{automoIdAtual} — não existe mais no catálogo do Automo
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Sem vínculo · as vendas não são importadas</p>
            )}
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 block mb-1">
              Novo vínculo
            </label>
            <SeletorAutomo
              produtosAutomo={produtosAutomo}
              nomeAlvo={produtoNome}
              automoId={automoId}
              onChange={setAutomoId}
            />
          </div>

          {automoIdAtual != null && automoId != null && (
            <button
              onClick={() => setAutomoId(null)}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Unlink size={12} />
              Remover o vínculo e deixar sem
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-border/80 bg-card">
          <p className="text-xs text-muted-foreground">
            {mudou
              ? automoId == null
                ? "O vínculo será removido."
                : "O vínculo será trocado."
              : "Nada alterado."}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={salvando}
              className="h-9 px-3 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              onClick={salvar}
              disabled={salvando || !mudou}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-50"
            >
              {salvando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Salvar vínculo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
