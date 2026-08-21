"use client";

/**
 * estoque-client.tsx — módulo de Estoque (bloco 1)
 * Lista os itens controlados do local e abre o modal de cadastro.
 *
 * Fator de conversão e estoque ideal são editáveis direto na linha: o fator é
 * calibrado com o uso (a gramagem de uma porção muda), então precisa ser
 * ajustável sem remover e recadastrar o item.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, AlertTriangle, Boxes, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { removerItemEstoque, atualizarItemEstoque } from "../actions";
import { MapearItemModal } from "./mapear-item-modal";
import type { ProdutoAutomo } from "@/lib/automo/client";
import type { ProdutoLhg, ItemEstoque } from "./tipos";

interface Props {
  local:           { id: string; nome: string };
  unidadesFiscais: string[];
  itens:           ItemEstoque[];
  produtos:        ProdutoLhg[];
  produtosAutomo:  ProdutoAutomo[];
  automoErro:      string | null;
}

type Campo = "fator" | "ideal";

interface Edicao {
  id:    string;
  campo: Campo;
}

const TH = "text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium pb-3 pr-4";

interface CelulaNumeroProps {
  item:            ItemEstoque;
  campo:           Campo;
  editando:        Edicao | null;
  draft:           string;
  onIniciarEdicao: (id: string, campo: Campo, valorAtual: number) => void;
  onDraftChange:   (valor: string) => void;
  onSalvar:        (id: string, campo: Campo) => void;
  onCancelar:      () => void;
}

/**
 * Célula numérica clicável que vira input.
 *
 * Componente de módulo (não aninhado dentro de `EstoqueClient`) recebendo
 * props explícitas — evita recriar a função a cada render do pai e problemas
 * com as regras de componentes instáveis do lint do projeto.
 */
function CelulaNumero({
  item, campo, editando, draft, onIniciarEdicao, onDraftChange, onSalvar, onCancelar,
}: CelulaNumeroProps) {
  const emEdicao = editando?.id === item.id && editando.campo === campo;
  const valor = campo === "fator" ? item.fator_conversao : item.estoque_ideal;
  const casas = campo === "fator" ? 4 : 3;

  if (emEdicao) {
    return (
      <span className="inline-flex items-center gap-1 justify-end">
        <input
          autoFocus
          inputMode="decimal"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSalvar(item.id, campo);
            if (e.key === "Escape") onCancelar();
          }}
          className="w-20 h-6 rounded border border-emerald-500/50 bg-background px-1.5 text-xs font-mono text-right text-foreground focus:outline-none"
        />
        <button
          onClick={() => onSalvar(item.id, campo)}
          title="Salvar"
          className="p-0.5 text-emerald-400 hover:text-emerald-300"
        >
          <Check size={12} />
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => onIniciarEdicao(item.id, campo, valor)}
      title="Clique para editar"
      className="font-mono rounded px-1 -mx-1 hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors"
    >
      {Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: casas })}
    </button>
  );
}

export function EstoqueClient({
  local, unidadesFiscais, itens, produtos, produtosAutomo, automoErro,
}: Props) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [editando, setEditando] = useState<Edicao | null>(null);
  const [draft, setDraft] = useState("");

  const semMapeamento = itens.filter((i) => i.automo_produto_id == null).length;

  async function remover(id: string, nome: string) {
    if (!confirm(`Remover "${nome}" da lista de itens controlados?`)) return;
    setRemovendo(id);
    try {
      const res = await removerItemEstoque(id);
      if ("erro" in res) {
        toast.error(res.erro);
        return;
      }
      toast.success("Item removido do controle");
      router.refresh();
    } finally {
      setRemovendo(null);
    }
  }

  function iniciarEdicao(id: string, campo: Campo, valorAtual: number) {
    setEditando({ id, campo });
    setDraft(String(valorAtual));
  }

  async function salvarCampo(id: string, campo: Campo) {
    const v = parseFloat(draft.replace(",", "."));
    if (!Number.isFinite(v) || v < 0 || (campo === "fator" && v <= 0)) {
      toast.error(
        campo === "fator" ? "Fator deve ser maior que zero" : "Estoque ideal não pode ser negativo",
      );
      return;
    }
    const res = await atualizarItemEstoque(
      id,
      campo === "fator" ? { fator_conversao: v } : { estoque_ideal: v },
    );
    if ("erro" in res) {
      toast.error(res.erro);
      return;
    }
    setEditando(null);
    router.refresh();
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-5 pb-10">

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Estoque · {local.nome}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Itens controlados · abastecido por {unidadesFiscais.join(" + ")}
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-emerald-700/60 bg-emerald-500/10 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors"
        >
          <Plus size={14} />
          Adicionar item
        </button>
      </div>

      {automoErro && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.08] px-4 py-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300/90">{automoErro}</p>
        </div>
      )}

      {semMapeamento > 0 && (
        <div className="rounded-lg border border-sky-500/25 bg-sky-500/[0.06] px-4 py-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-sky-400 shrink-0 mt-0.5" />
          <p className="text-xs text-sky-300/90">
            {semMapeamento} {semMapeamento === 1 ? "item sem" : "itens sem"} vínculo com o
            Automo. Sem isso as vendas desse item não serão importadas.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-border/80 bg-muted/40 overflow-hidden">
        {itens.length === 0 ? (
          <div className="py-16 text-center">
            <Boxes size={28} className="mx-auto text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground mt-3">Nenhum item controlado ainda</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Comece pelos itens da planilha: bebidas, bomboniere e os pratos porcionados.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto p-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className={TH}>Produto (LHG/Omie)</th>
                  <th className={TH}>Categoria</th>
                  <th className={TH}>Vínculo Automo</th>
                  <th className={cn(TH, "text-right")}>Fator</th>
                  <th className={cn(TH, "text-right")}>Estoque ideal</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item) => {
                  const nome = item.produtos?.nome ?? "—";
                  const noAutomo = produtosAutomo.find((p) => p.id === item.automo_produto_id);
                  return (
                    <tr key={item.id} className="border-b border-border/40 hover:bg-muted/50 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="text-foreground font-medium">{nome}</div>
                        <div className="text-[11px] text-muted-foreground/60 font-mono">
                          {item.produtos?.codigo} · {item.produtos?.unidade_med}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground text-xs">
                        {item.produtos?.categoria ?? "—"}
                      </td>
                      <td className="py-3 pr-4 text-xs">
                        {item.automo_produto_id == null ? (
                          <span className="inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
                            sem vínculo
                          </span>
                        ) : (
                          <span className="text-muted-foreground" title={`Automo id ${item.automo_produto_id}`}>
                            {noAutomo?.descricao ?? `#${item.automo_produto_id}`}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <CelulaNumero
                          item={item}
                          campo="fator"
                          editando={editando}
                          draft={draft}
                          onIniciarEdicao={iniciarEdicao}
                          onDraftChange={setDraft}
                          onSalvar={salvarCampo}
                          onCancelar={() => setEditando(null)}
                        />
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <CelulaNumero
                          item={item}
                          campo="ideal"
                          editando={editando}
                          draft={draft}
                          onIniciarEdicao={iniciarEdicao}
                          onDraftChange={setDraft}
                          onSalvar={salvarCampo}
                          onCancelar={() => setEditando(null)}
                        />
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => remover(item.id, nome)}
                          disabled={removendo === item.id}
                          title="Remover do controle"
                          className="p-1 rounded text-muted-foreground/40 hover:text-destructive transition-colors disabled:opacity-50"
                        >
                          {removendo === item.id
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Trash2 size={13} />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <MapearItemModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        localId={local.id}
        produtos={produtos}
        produtosAutomo={produtosAutomo}
        jaControlados={itens.map((i) => i.produto_id)}
      />
    </div>
  );
}
