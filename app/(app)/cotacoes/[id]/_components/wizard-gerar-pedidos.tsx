"use client";

/**
 * wizard-gerar-pedidos.tsx — LHG-211
 * Modal de confirmação para gerar pedidos de compra a partir da cotação.
 * Agrupa os itens selecionados por fornecedor e cria um pedido por fornecedor.
 */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, ShoppingCart, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { gerarPedidosDeCotacao } from "../../actions";

interface MatrizCell {
  cotacao_item_id: string;
  fornecedor_id:   string;
  preco_unitario:  number | null;
  prazo_entrega_dias: number | null;
  condicao_pagamento: string | null;
}
interface FornecedorBase { id: string; razao_social: string; nome_fantasia: string | null }
interface CotacaoItem    { id: string; quantidade: number; produtos: { nome: string; unidade_med: string } | null }
interface Cotacao        { id: string; numero: string; titulo: string; cotacao_itens: CotacaoItem[] }

interface Props {
  open:        boolean;
  onClose:     () => void;
  cotacao:     Cotacao;
  selecoes:    Record<string, string | null>;
  fornecedores: FornecedorBase[];
  matrizMap:   Record<string, Record<string, MatrizCell>>;
}

function formatBRL(v: number | null) {
  if (!v) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export function WizardGerarPedidos({ open, onClose, cotacao, selecoes, fornecedores, matrizMap }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (!open) return null;

  // Agrupar itens selecionados por fornecedor
  const grupos: { fornecedor: FornecedorBase; itens: { item: CotacaoItem; cell: MatrizCell }[]; total: number }[] = [];

  for (const forn of fornecedores) {
    const itensDoForn = cotacao.cotacao_itens.filter(i => selecoes[i.id] === forn.id);
    if (itensDoForn.length === 0) continue;

    const itens = itensDoForn.map(item => {
      const cell = matrizMap[item.id]?.[forn.id];
      return { item, cell };
    }).filter(({ cell }) => cell);

    const total = itens.reduce((acc, { item, cell }) => {
      return acc + (cell.preco_unitario ?? 0) * item.quantidade;
    }, 0);

    grupos.push({ fornecedor: forn, itens, total });
  }

  function getFornNome(f: FornecedorBase) {
    return f.nome_fantasia || f.razao_social;
  }

  function handleConfirmar() {
    start(async () => {
      const res = await gerarPedidosDeCotacao(cotacao.id, selecoes);
      if ("erro" in res) {
        toast.error(`Erro ao gerar pedidos: ${res.erro}`);
        return;
      }
      toast.success(
        `${res.numeroPedidos} pedido${res.numeroPedidos !== 1 ? "s" : ""} gerado${res.numeroPedidos !== 1 ? "s" : ""}`,
        { description: "Os pedidos foram criados e aguardam aprovação" },
      );
      onClose();
      router.push("/pedidos");
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[620px] rounded-xl border border-border bg-background shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/80">
          <div>
            <h2 className="text-base font-semibold text-foreground">Gerar pedidos de compra</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              A cotação será dividida em <strong className="text-foreground/80">{grupos.length} pedido{grupos.length !== 1 ? "s" : ""}</strong>, um por fornecedor
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Grupos de pedidos */}
        <div className="px-6 py-4 space-y-3 max-h-[50vh] overflow-y-auto">
          {grupos.map(({ fornecedor, itens, total }) => (
            <div key={fornecedor.id} className="rounded-xl border border-border/80 bg-muted/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-foreground">{getFornNome(fornecedor)}</div>
                <div className="font-mono text-sm font-bold text-foreground">{formatBRL(total)}</div>
              </div>
              <div className="space-y-1">
                {itens.map(({ item, cell }) => (
                  <div key={item.id} className="flex items-center justify-between text-[12px]">
                    <span className="text-muted-foreground truncate">
                      {item.quantidade}× {item.produtos?.nome ?? "Produto"}
                    </span>
                    <span className="text-muted-foreground font-mono shrink-0 ml-4">
                      {formatBRL(cell.preco_unitario ? cell.preco_unitario * item.quantidade : null) ?? "—"}
                    </span>
                  </div>
                ))}
              </div>
              {itens[0]?.cell?.condicao_pagamento && (
                <div className="mt-2 text-[11px] text-muted-foreground/70">
                  Pagamento: {itens[0].cell.condicao_pagamento}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Disclaimer */}
        <div className="px-6 py-3 bg-muted/40 border-t border-border/60">
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            Os pedidos seguirão para <strong className="text-muted-foreground">aprovação</strong> antes de serem enviados aos fornecedores e sincronizados com o Omie.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border/60">
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground/80 px-3 py-2 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            disabled={pending || grupos.length === 0}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border",
              "border-emerald-700/60 bg-emerald-500/10 px-4 py-2",
              "text-sm font-semibold text-emerald-400",
              "hover:bg-emerald-500/20 transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <ShoppingCart size={14} />}
            {pending ? "Gerando…" : `Confirmar e gerar ${grupos.length} pedido${grupos.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
