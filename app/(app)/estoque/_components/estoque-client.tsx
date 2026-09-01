"use client";

/**
 * estoque-client.tsx — módulo de Estoque (bloco 1)
 * Lista os itens controlados do local e abre o modal de cadastro.
 *
 * Fator de conversão e estoque ideal são editáveis direto na linha: o fator é
 * calibrado com o uso (a gramagem de uma porção muda), então precisa ser
 * ajustável sem remover e recadastrar o item.
 */
import { Suspense, use, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, AlertTriangle, Boxes, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { removerItemEstoque, atualizarItemEstoque } from "../actions";
import { MapearItemModal } from "./mapear-item-modal";
import { VincularAutomoModal } from "./vincular-automo-modal";
import type { ProdutoLhg, ItemEstoque, ResultadoAutomo } from "./tipos";

interface Props {
  local:           { id: string; nome: string };
  unidadesFiscais: string[];
  itens:           ItemEstoque[];
  produtos:        ProdutoLhg[];
  /**
   * Catálogo do Automo ainda em voo. Não é aguardado no servidor porque o banco
   * do Andar de Cima leva ~8,8s só para conectar — esperar por ele atrasava a
   * primeira pintura da tela inteira por dado que só serve a duas coisas
   * secundárias (sugestão de mapeamento e nome do item vinculado).
   */
  automoPromise:   Promise<ResultadoAutomo>;
}

/** Aviso de Automo indisponível. Em Suspense com fallback nulo: enquanto o
 *  catálogo carrega não há erro a mostrar, e um placeholder aqui só piscaria. */
function AvisoAutomo({ promise }: { promise: Promise<ResultadoAutomo> }) {
  const { erro } = use(promise);
  if (!erro) return null;
  return (
    <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.08] px-4 py-3 flex items-start gap-2">
      <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
      <p className="text-xs text-amber-300/90">{erro}</p>
    </div>
  );
}

/**
 * Overlay enquanto o catálogo do Automo não chegou.
 *
 * Só aparece se a pessoa abrir o modal antes de a promise resolver — o que na
 * prática acontece apenas no Andar de Cima (8,8s de conexão). Nas outras
 * unidades o catálogo já está pronto (< 400ms) e este estado nunca é visto.
 */
function CarregandoAutomo() {
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[8vh] px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-[620px] rounded-xl border border-border bg-background shadow-2xl px-5 py-8 flex items-center justify-center gap-2.5">
        <Loader2 size={15} className="animate-spin text-emerald-500" />
        <p className="text-sm text-muted-foreground">Carregando o catálogo do Automo…</p>
      </div>
    </div>
  );
}

/**
 * Resolve o catálogo do Automo e renderiza os modais que dependem dele.
 *
 * Fica montado desde o primeiro render de propósito — ver o comentário na
 * chamada. Só as props decidem qual modal aparece; `use()` já resolveu bem antes
 * disso em qualquer unidade que não seja o Andar de Cima.
 *
 * Os dois modais moram aqui porque os dois precisam do catálogo resolvido, e um
 * segundo gate significaria uma segunda fronteira de Suspense esperando a mesma
 * promise.
 */
function ModaisComAutomo({
  promise,
  cadastroAberto,
  onFecharCadastro,
  itemVinculando,
  onFecharVinculo,
  localId,
  produtos,
  jaControlados,
}: {
  promise: Promise<ResultadoAutomo>;
  cadastroAberto: boolean;
  onFecharCadastro: () => void;
  itemVinculando: ItemEstoque | null;
  onFecharVinculo: () => void;
  localId: string;
  produtos: ProdutoLhg[];
  jaControlados: string[];
}) {
  const { produtos: produtosAutomo } = use(promise);

  if (itemVinculando) {
    return (
      <VincularAutomoModal
        itemId={itemVinculando.id}
        produtoNome={itemVinculando.produtos?.nome ?? "—"}
        automoIdAtual={itemVinculando.automo_produto_id}
        produtosAutomo={produtosAutomo}
        onClose={onFecharVinculo}
      />
    );
  }

  if (cadastroAberto) {
    return (
      <MapearItemModal
        produtosAutomo={produtosAutomo}
        onClose={onFecharCadastro}
        localId={localId}
        produtos={produtos}
        jaControlados={jaControlados}
      />
    );
  }

  return null;
}

/** Nome do produto vinculado no Automo. O fallback já era o comportamento de
 *  degradação existente (`#id`), então a espera não introduz estado novo. */
function NomeAutomo({
  promise,
  automoId,
}: {
  promise: Promise<ResultadoAutomo>;
  automoId: number;
}) {
  const { produtos } = use(promise);
  return <>{produtos.find((p) => p.id === automoId)?.descricao ?? `#${automoId}`}</>;
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
  local, unidadesFiscais, itens, produtos, automoPromise,
}: Props) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [confirmandoRemocao, setConfirmandoRemocao] = useState<string | null>(null);
  /** Item cujo vínculo com o Automo está sendo corrigido. */
  const [vinculando, setVinculando] = useState<ItemEstoque | null>(null);
  const [editando, setEditando] = useState<Edicao | null>(null);
  const [draft, setDraft] = useState("");

  const semMapeamento = itens.filter((i) => i.automo_produto_id == null).length;

  // Confirmação inline (o botão vira "remover? sim/não" na própria linha), não
  // window.confirm — proibido pelo §11 do CLAUDE.md.
  async function remover(id: string) {
    setRemovendo(id);
    try {
      const res = await removerItemEstoque(id);
      if ("erro" in res) {
        toast.error(res.erro);
        return;
      }
      toast.success("Item removido do controle");
      setConfirmandoRemocao(null);
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

      <Suspense fallback={null}>
        <AvisoAutomo promise={automoPromise} />
      </Suspense>

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
                      {/* Célula clicável: é o caminho para corrigir o vínculo depois
                          do cadastro, que antes não existia em lugar nenhum — o
                          modal prometia "ajuste depois" e não havia onde. */}
                      <td className="py-3 pr-4 text-xs">
                        <button
                          onClick={() => setVinculando(item)}
                          title="Alterar o vínculo com o Automo"
                          className="text-left rounded px-1 -mx-1 hover:bg-muted/60 transition-colors"
                        >
                          {item.automo_produto_id == null ? (
                            <span className="inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
                              sem vínculo
                            </span>
                          ) : (
                            <span className="text-muted-foreground" title={`Automo id ${item.automo_produto_id}`}>
                              <Suspense fallback={`#${item.automo_produto_id}`}>
                                <NomeAutomo promise={automoPromise} automoId={item.automo_produto_id} />
                              </Suspense>
                            </span>
                          )}
                        </button>
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
                      <td className="py-3 text-right whitespace-nowrap">
                        {confirmandoRemocao === item.id ? (
                          <span className="inline-flex items-center gap-2 text-xs">
                            <button
                              onClick={() => remover(item.id)}
                              disabled={removendo === item.id}
                              className="inline-flex items-center gap-1 font-semibold text-destructive hover:opacity-80 transition-opacity disabled:opacity-50"
                            >
                              {removendo === item.id && <Loader2 size={12} className="animate-spin" />}
                              remover
                            </button>
                            <button
                              onClick={() => setConfirmandoRemocao(null)}
                              disabled={removendo === item.id}
                              className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                            >
                              cancelar
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmandoRemocao(item.id)}
                            title="Remover do controle"
                            className="p-1 rounded text-muted-foreground/40 hover:text-destructive transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/*
        `ModalComAutomo` fica SEMPRE montado, mesmo com o modal fechado.

        ⚠️ Isto não é detalhe de estilo: a versão anterior montava o subtree que
        chama `use()` a partir do clique, e `setModalOpen(true)` é atualização
        SÍNCRONA. O React trata "subtree novo suspendeu em resposta a input
        síncrono" como ERRO, não como carregamento ("updates that suspend should
        be wrapped with startTransition") — e o erro subia até o error.tsx,
        derrubando a página inteira no clique de "Adicionar item".

        Sempre montado, a suspensão acontece no carregamento inicial, onde é
        legítima e vira apenas o fallback. O clique passa a só trocar um booleano.
      */}
      <Suspense fallback={modalOpen || vinculando ? <CarregandoAutomo /> : null}>
        <ModaisComAutomo
          promise={automoPromise}
          cadastroAberto={modalOpen}
          onFecharCadastro={() => setModalOpen(false)}
          itemVinculando={vinculando}
          onFecharVinculo={() => setVinculando(null)}
          localId={local.id}
          produtos={produtos}
          jaControlados={itens.map((i) => i.produto_id)}
        />
      </Suspense>
    </div>
  );
}
