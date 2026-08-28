"use client";

/**
 * mapear-item-modal.tsx — módulo de Estoque (bloco 1)
 *
 * Modal em três passos: escolher o produto do catálogo LHG/Omie, sugerir o par
 * no Automo por semelhança de nome, e definir fator de conversão + estoque
 * ideal. Os dois catálogos escrevem diferente, então a sugestão é um atalho e
 * a confirmação é sempre humana — nunca vínculo automático.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Search, Loader2, Check, Link2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { sugerirCandidatos } from "@/lib/estoque/mapeamento";
import { adicionarItemEstoque } from "../actions";
import type { ProdutoAutomo } from "@/lib/automo/client";
import type { ProdutoLhg } from "./tipos";

interface Props {
  open:           boolean;
  onClose:        () => void;
  localId:        string;
  produtos:       ProdutoLhg[];
  produtosAutomo: ProdutoAutomo[];
  jaControlados:  string[];
}

const MAX_LISTA = 40;

export function MapearItemModal({
  open, onClose, localId, produtos, produtosAutomo, jaControlados,
}: Props) {
  const router = useRouter();
  const [busca, setBusca]       = useState("");
  const [buscaAutomo, setBuscaAutomo] = useState("");
  const [produto, setProduto]   = useState<ProdutoLhg | null>(null);
  const [automoId, setAutomoId] = useState<number | null>(null);
  const [fator, setFator]       = useState("1");
  const [ideal, setIdeal]       = useState("0");
  const [erro, setErro]         = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const controlados = useMemo(() => new Set(jaControlados), [jaControlados]);

  const resultados = useMemo(() => {
    const q = busca.toLowerCase().trim();
    const base = produtos.filter((p) => !controlados.has(p.id));
    if (!q) return base.slice(0, MAX_LISTA);
    return base
      .filter((p) => p.nome.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q))
      .slice(0, MAX_LISTA);
  }, [produtos, busca, controlados]);

  // Candidatos do Automo para o produto escolhido, por semelhança de nome.
  const sugestoes = useMemo(() => {
    if (!produto || produtosAutomo.length === 0) return [];
    return sugerirCandidatos(
      produto.nome,
      produtosAutomo.map((p) => ({ id: String(p.id), nome: p.descricao })),
      { limite: 5, scoreMinimo: 0.15 },
    );
  }, [produto, produtosAutomo]);

  /**
   * O que aparece na lista do passo 2: sugestões quando a busca está vazia,
   * resultado da busca quando não está.
   *
   * O `score` vem junto só nas sugestões. Num resultado de busca ele seria
   * ruído — ela digitou o nome, já sabe o que procurou; o percentual ali só
   * confundiria ("por que 30% se é exatamente o que eu quero?").
   */
  const listaAutomo = useMemo<{ item: ProdutoAutomo; score: number | null }[]>(() => {
    const q = buscaAutomo.toLowerCase().trim();

    if (q) {
      return produtosAutomo
        .filter((p) => p.descricao.toLowerCase().includes(q) || (p.codigo ?? "").toLowerCase().includes(q))
        .slice(0, MAX_LISTA)
        .map((item) => ({ item, score: null }));
    }

    return sugestoes
      .map((s) => {
        const item = produtosAutomo.find((p) => p.id === Number(s.id));
        return item ? { item, score: s.score } : null;
      })
      .filter((v): v is { item: ProdutoAutomo; score: number } => v != null);
  }, [buscaAutomo, produtosAutomo, sugestoes]);

  if (!open) return null;

  function fechar() {
    setBusca("");
    setBuscaAutomo("");
    setProduto(null);
    setAutomoId(null);
    setFator("1");
    setIdeal("0");
    setErro(null);
    onClose();
  }

  async function salvar() {
    setErro(null);
    if (!produto) {
      setErro("Escolha o produto do catálogo.");
      return;
    }

    const f = parseFloat(fator.replace(",", "."));
    if (!Number.isFinite(f) || f <= 0) {
      setErro("Fator deve ser maior que zero.");
      return;
    }

    const i = parseFloat(ideal.replace(",", "."));
    if (!Number.isFinite(i) || i < 0) {
      setErro("Estoque ideal não pode ser negativo.");
      return;
    }

    setSalvando(true);
    try {
      const res = await adicionarItemEstoque({
        local_id:          localId,
        produto_id:        produto.id,
        automo_produto_id: automoId,
        fator_conversao:   f,
        estoque_ideal:     i,
      });
      if ("erro" in res) {
        setErro(res.erro);
        return;
      }
      toast.success("Item adicionado ao controle");
      fechar();
      router.refresh();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[8vh] px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={fechar} />
      <div className="relative w-full max-w-[620px] rounded-xl border border-border bg-background shadow-2xl overflow-hidden">

        <div className="flex items-center justify-between px-5 py-4 border-b border-border/80">
          <h2 className="text-base font-semibold text-foreground">Adicionar item ao controle</h2>
          <button
            onClick={fechar}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[65vh] overflow-y-auto">

          {/* 1. Produto do catálogo LHG/Omie */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 block mb-1">
              1. Produto no catálogo LHG/Omie
            </label>
            {produto ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/[0.07] px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm text-foreground truncate">{produto.nome}</div>
                  <div className="text-[11px] text-muted-foreground/60 font-mono">
                    {produto.codigo} · {produto.unidade_med}
                  </div>
                </div>
                <button
                  onClick={() => { setProduto(null); setAutomoId(null); setBuscaAutomo(""); }}
                  className="text-[11px] text-muted-foreground hover:text-foreground shrink-0"
                >
                  trocar
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                  <input
                    autoFocus
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar por nome ou código…"
                    className="w-full h-9 rounded-lg border border-border bg-muted/30 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div className="mt-2 max-h-[200px] overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/40">
                  {resultados.length === 0 ? (
                    <p className="text-xs text-muted-foreground/60 px-3 py-6 text-center">
                      Nenhum produto disponível
                    </p>
                  ) : (
                    resultados.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setProduto(p)}
                        className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                      >
                        <div className="text-sm text-foreground truncate">{p.nome}</div>
                        <div className="text-[11px] text-muted-foreground/60 font-mono">
                          {p.codigo} · {p.unidade_med} · {p.categoria}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {/* 2. Vínculo no Automo */}
          {produto && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 block mb-1">
                2. Produto correspondente no Automo
              </label>
              {produtosAutomo.length === 0 ? (
                <p className="text-xs text-amber-400/80 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2">
                  Catálogo do Automo indisponível. Você pode salvar sem vínculo e completar
                  depois — sem ele as vendas deste item não serão importadas.
                </p>
              ) : (
                <div className="space-y-2">
                  {/*
                    Busca no catálogo completo do Automo.
                    A sugestão por semelhança acerta a grande maioria (14 de 15 nos
                    mais vendidos), mas quando erra ela erra silenciosamente: o
                    "OLLA GEL" do Automo não existe no Omie com esse nome, e o
                    melhor par sugerido era um produto diferente com 20%. Sem uma
                    busca manual a compradora ficaria sem saída justo nesse caso.
                  */}
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                    <input
                      value={buscaAutomo}
                      onChange={(e) => setBuscaAutomo(e.target.value)}
                      placeholder="Buscar no catálogo do Automo…"
                      className="w-full h-9 rounded-lg border border-border bg-muted/30 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>

                  <p className="text-[11px] text-muted-foreground/60">
                    {buscaAutomo.trim()
                      ? `${listaAutomo.length} de ${produtosAutomo.length} produtos`
                      : sugestoes.length > 0
                        ? "Sugestões por semelhança de nome — confira antes de aceitar"
                        : "Nenhum nome parecido. Use a busca para achar o produto."}
                  </p>

                  {listaAutomo.length === 0 ? (
                    <p className="text-xs text-muted-foreground/60 rounded-lg border border-border/60 px-3 py-2">
                      Nada encontrado. Você pode salvar sem vínculo e completar depois —
                      sem ele as vendas deste item não são importadas.
                    </p>
                  ) : (
                    <div className="max-h-[220px] overflow-y-auto space-y-1">
                      {listaAutomo.map(({ item, score }) => {
                        const escolhido = automoId === item.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => setAutomoId(escolhido ? null : item.id)}
                            className={cn(
                              "w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                              escolhido
                                ? "border-emerald-500/50 bg-emerald-500/10"
                                : "border-border/60 hover:bg-muted/50",
                            )}
                          >
                            <div className="min-w-0">
                              <div className="text-sm text-foreground truncate flex items-center gap-1.5">
                                {escolhido && <Check size={12} className="text-emerald-400 shrink-0" />}
                                {item.descricao}
                              </div>
                              <div className="text-[11px] text-muted-foreground/60">
                                {item.tipo ?? "sem tipo"} · Automo #{item.id}
                              </div>
                            </div>
                            {/* Percentual só nas sugestões: num resultado de busca ele
                                não quer dizer nada — ela já sabe o que procurou. */}
                            {score != null && (
                              <span
                                title="Semelhança entre os nomes — confira antes de aceitar valores baixos"
                                className={cn(
                                  "text-[10px] font-mono shrink-0",
                                  score >= 0.7 ? "text-emerald-400"
                                    : score >= 0.4 ? "text-muted-foreground/60"
                                    : "text-amber-400",
                                )}
                              >
                                {(score * 100).toFixed(0)}%
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 3. Fator e estoque ideal */}
          {produto && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 block mb-1">
                  3. Fator de conversão
                </label>
                <input
                  inputMode="decimal"
                  value={fator}
                  onChange={(e) => setFator(e.target.value)}
                  className="w-full h-9 rounded-lg border border-border bg-muted/30 px-3 text-sm font-mono text-foreground focus:outline-none focus:border-emerald-500/50"
                />
                <p className="text-[10px] text-muted-foreground/60 mt-1">
                  1 venda no Automo = N {produto.unidade_med} no Omie. Bebida = 1; porção de
                  picanha ≈ 0,4.
                </p>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 block mb-1">
                  Estoque ideal
                </label>
                <input
                  inputMode="decimal"
                  value={ideal}
                  onChange={(e) => setIdeal(e.target.value)}
                  className="w-full h-9 rounded-lg border border-border bg-muted/30 px-3 text-sm font-mono text-foreground focus:outline-none focus:border-emerald-500/50"
                />
                <p className="text-[10px] text-muted-foreground/60 mt-1">
                  Quanto você quer ter em estoque. Alimenta a coluna &ldquo;a repor&rdquo;.
                </p>
              </div>
            </div>
          )}

          {erro && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/25 rounded-md px-3 py-2">
              {erro}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border/60">
          <button
            onClick={fechar}
            className="text-sm text-muted-foreground hover:text-foreground/80 px-3 py-2 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando || !produto}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-700/60 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
          >
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
            {salvando ? "Salvando…" : "Adicionar ao controle"}
          </button>
        </div>
      </div>
    </div>
  );
}
