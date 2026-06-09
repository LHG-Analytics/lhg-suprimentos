"use client";

import { useState, useTransition } from "react";
import { Pencil, X, Loader2, Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { editarPedido } from "../actions";

interface FornecedorLite {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
}

interface ProdutoLite {
  id: string;
  nome: string;
  codigo: string;
  unidade_med: string;
  categoria: string;
}

interface PedidoItem {
  id: string;
  quantidade: number;
  preco_unitario: number;
  produtos: { nome: string; unidade_med: string } | null;
}

interface Pedido {
  id: string;
  numero: string;
  fornecedor_id: string | null;
  condicao_pgto: string | null;
  entrega_prev: string | null;
  omie_status: string;
  omie_codigo: string | null;
  pedido_itens: PedidoItem[];
}

interface NovoItem {
  _key: string;
  produto_id: string;
  nome: string;
  unidade: string;
  quantidade: number;
  preco_unitario: number;
}

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

let _keyCounter = 0;
function nextKey() { return String(++_keyCounter); }

export function ModalEditarPedido({
  pedido,
  fornecedores,
  produtos,
  onClose,
  onEditado,
}: {
  pedido: Pedido;
  fornecedores: FornecedorLite[];
  produtos: ProdutoLite[];
  onClose: () => void;
  onEditado: () => void;
}) {
  const [pending, start] = useTransition();

  const [fornecedorId,  setFornecedorId]  = useState(pedido.fornecedor_id ?? "");
  const [entregaPrev,   setEntregaPrev]   = useState(pedido.entrega_prev ?? "");
  const [condicaoPgto,  setCondicaoPgto]  = useState(pedido.condicao_pgto ?? "");
  const [itens,         setItens]         = useState(
    pedido.pedido_itens.map(i => ({
      id:             i.id,
      nome:           i.produtos?.nome ?? "Produto",
      unidade:        i.produtos?.unidade_med ?? "UN",
      quantidade:     i.quantidade,
      preco_unitario: i.preco_unitario,
    })),
  );

  // Novos itens a adicionar
  const [novosItens,   setNovosItens]   = useState<NovoItem[]>([]);
  const [adicionando,  setAdicionando]  = useState(false);
  const [novoProdId,   setNovoProdId]   = useState("");
  const [novaQtd,      setNovaQtd]      = useState("1");
  const [novoPreco,    setNovoPreco]    = useState("");
  const [buscaProd,    setBuscaProd]    = useState("");

  const total = itens.reduce((acc, i) => acc + i.quantidade * i.preco_unitario, 0)
    + novosItens.reduce((acc, i) => acc + i.quantidade * i.preco_unitario, 0);

  const fornecedorMudou     = fornecedorId !== (pedido.fornecedor_id ?? "");
  const omieJaSincronizado  = pedido.omie_status === "sincronizado" && !!pedido.omie_codigo;
  const temNovosItens       = novosItens.length > 0;

  // Filtra produtos pelo texto de busca
  const produtosFiltrados = buscaProd.trim()
    ? produtos.filter(p =>
        p.nome.toLowerCase().includes(buscaProd.toLowerCase()) ||
        p.codigo.toLowerCase().includes(buscaProd.toLowerCase()),
      ).slice(0, 30)
    : produtos.slice(0, 30);

  const produtoSelecionado = produtos.find(p => p.id === novoProdId);

  function handleItemChange(idx: number, field: "quantidade" | "preco_unitario", raw: string) {
    const num = parseFloat(raw.replace(",", ".")) || 0;
    setItens(prev => prev.map((item, i) => i === idx ? { ...item, [field]: num } : item));
  }

  function handleAdicionarItem() {
    if (!novoProdId || !produtoSelecionado) { toast.error("Selecione um produto"); return; }
    const qtd   = parseFloat(novaQtd.replace(",", "."));
    const preco = parseFloat(novoPreco.replace(",", "."));
    if (!qtd || qtd <= 0)    { toast.error("Informe uma quantidade válida"); return; }
    if (!preco || preco <= 0) { toast.error("Informe um preço válido");      return; }

    setNovosItens(prev => [...prev, {
      _key:           nextKey(),
      produto_id:     produtoSelecionado.id,
      nome:           produtoSelecionado.nome,
      unidade:        produtoSelecionado.unidade_med,
      quantidade:     qtd,
      preco_unitario: preco,
    }]);

    // Resetar campos
    setNovoProdId(""); setBuscaProd(""); setNovaQtd("1"); setNovoPreco("");
    setAdicionando(false);
  }

  function removerNovoItem(key: string) {
    setNovosItens(prev => prev.filter(i => i._key !== key));
  }

  function handleSave() {
    start(async () => {
      try {
        const res = await editarPedido(pedido.id, {
          fornecedor_id: fornecedorId || undefined,
          entrega_prev:  entregaPrev  || null,
          condicao_pgto: condicaoPgto || null,
          itens: itens.map(i => ({
            id:             i.id,
            quantidade:     i.quantidade,
            preco_unitario: i.preco_unitario,
          })),
          novosItens: novosItens.length > 0 ? novosItens.map(i => ({
            produto_id:     i.produto_id,
            quantidade:     i.quantidade,
            preco_unitario: i.preco_unitario,
          })) : undefined,
        });
        if ("erro" in res) { toast.error(res.erro); return; }
        toast.success("Pedido atualizado");
        onEditado();
        onClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao editar pedido");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[5vh] px-4 pb-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[640px] rounded-xl border border-border bg-background shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/80 shrink-0">
          <div className="flex items-center gap-2">
            <Pencil size={14} className="text-violet-400" />
            <h2 className="text-sm font-semibold text-foreground">Editar Pedido {pedido.numero}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Avisos */}
          {omieJaSincronizado && fornecedorMudou && (
            <div className="rounded-lg border border-amber-700/40 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-400">
              Atenção: o pedido já foi enviado ao Omie (#{pedido.omie_codigo}). Ao alterar o fornecedor, o pedido ficará como "pendente" e precisará ser excluído no Omie antes de reenviar.
            </div>
          )}
          {omieJaSincronizado && temNovosItens && (
            <div className="rounded-lg border border-amber-700/40 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-400">
              Atenção: o pedido já foi enviado ao Omie (#{pedido.omie_codigo}). Ao adicionar itens, o pedido ficará como "pendente" e precisará ser excluído no Omie antes de reenviar.
            </div>
          )}

          {/* Fornecedor */}
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1.5">Fornecedor</label>
            <select
              value={fornecedorId}
              onChange={e => setFornecedorId(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-border transition-all"
            >
              <option value="">Selecionar fornecedor…</option>
              {fornecedores.map(f => (
                <option key={f.id} value={f.id}>{f.nome_fantasia ?? f.razao_social}</option>
              ))}
            </select>
          </div>

          {/* Condição + Prazo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1.5">Condição de pagamento</label>
              <input
                type="text"
                value={condicaoPgto}
                onChange={e => setCondicaoPgto(e.target.value)}
                placeholder="Ex: 30 dias, 30/60/90…"
                className="w-full rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-border transition-all"
              />
            </div>
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1.5">Prazo de entrega</label>
              <input
                type="date"
                value={entregaPrev}
                onChange={e => setEntregaPrev(e.target.value)}
                className="w-full rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-border transition-all"
              />
            </div>
          </div>

          {/* Itens existentes */}
          <div>
            <div className="text-[11px] text-muted-foreground mb-2">Itens do pedido ({itens.length})</div>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/40">
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-muted-foreground/60">Produto</th>
                    <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground/60 w-24">Qtd</th>
                    <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground/60 w-32">Preço Unit.</th>
                    <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground/60 w-28">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((item, idx) => (
                    <tr key={item.id} className={idx < itens.length - 1 ? "border-b border-border/40" : ""}>
                      <td className="px-3 py-2.5">
                        <div className="text-sm text-foreground leading-tight">{item.nome}</div>
                        <div className="text-[11px] text-muted-foreground">{item.unidade}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="number" min="0.001" step="0.001"
                          value={item.quantidade}
                          onChange={e => handleItemChange(idx, "quantidade", e.target.value)}
                          className="w-full text-right rounded border border-border/60 bg-muted/50 px-2 py-1 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-border"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="number" min="0" step="0.0001"
                          value={item.preco_unitario}
                          onChange={e => handleItemChange(idx, "preco_unitario", e.target.value)}
                          className="w-full text-right rounded border border-border/60 bg-muted/50 px-2 py-1 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-border"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-sm text-muted-foreground">
                        {formatBRL(item.quantidade * item.preco_unitario)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Novos itens adicionados */}
          {novosItens.length > 0 && (
            <div>
              <div className="text-[11px] text-emerald-400 mb-2 font-medium">
                + {novosItens.length} novo(s) item(s)
              </div>
              <div className="rounded-lg border border-emerald-700/30 bg-emerald-500/5 overflow-hidden">
                <table className="w-full">
                  <tbody>
                    {novosItens.map((item) => (
                      <tr key={item._key} className="border-b border-border/30 last:border-0">
                        <td className="px-3 py-2.5 w-8">
                          <button
                            onClick={() => removerNovoItem(item._key)}
                            className="p-0.5 rounded text-muted-foreground/40 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="text-sm text-foreground leading-tight">{item.nome}</div>
                          <div className="text-[11px] text-muted-foreground">{item.unidade}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-[12px] text-muted-foreground w-20">
                          {item.quantidade}×
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-[12px] text-muted-foreground w-28">
                          {formatBRL(item.preco_unitario)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-sm text-foreground/80 w-28">
                          {formatBRL(item.quantidade * item.preco_unitario)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Formulário de adição de item */}
          {adicionando ? (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-3">
              <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Adicionar item</div>

              {/* Busca de produto */}
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">Produto</label>
                <input
                  type="text"
                  placeholder="Buscar por nome ou código…"
                  value={buscaProd}
                  onChange={e => { setBuscaProd(e.target.value); setNovoProdId(""); }}
                  className="w-full rounded border border-border bg-muted/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-border"
                />
                {buscaProd && !produtoSelecionado && (
                  <div className="mt-1 max-h-40 overflow-y-auto rounded border border-border bg-background shadow-lg">
                    {produtosFiltrados.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum produto encontrado</div>
                    ) : produtosFiltrados.map(p => (
                      <button
                        key={p.id}
                        onClick={() => { setNovoProdId(p.id); setBuscaProd(p.nome); }}
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm hover:bg-muted/60 transition-colors",
                          novoProdId === p.id && "bg-muted/80",
                        )}
                      >
                        <span className="text-foreground">{p.nome}</span>
                        <span className="ml-2 text-[11px] text-muted-foreground/60">{p.codigo} · {p.unidade_med}</span>
                      </button>
                    ))}
                  </div>
                )}
                {produtoSelecionado && (
                  <div className="mt-1 flex items-center gap-2 text-[12px] text-emerald-400">
                    <Check size={11} />
                    {produtoSelecionado.nome} · {produtoSelecionado.unidade_med}
                  </div>
                )}
              </div>

              {/* Qtd + Preço */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">Quantidade</label>
                  <input
                    type="number" min="0.001" step="0.001"
                    placeholder="1"
                    value={novaQtd}
                    onChange={e => setNovaQtd(e.target.value)}
                    className="w-full rounded border border-border bg-muted/60 px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-border"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">Preço unitário</label>
                  <input
                    type="number" min="0" step="0.01"
                    placeholder="0,00"
                    value={novoPreco}
                    onChange={e => setNovoPreco(e.target.value)}
                    className="w-full rounded border border-border bg-muted/60 px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-border"
                  />
                </div>
              </div>

              {/* Botões de adicionar/cancelar */}
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={() => { setAdicionando(false); setNovoProdId(""); setBuscaProd(""); setNovaQtd("1"); setNovoPreco(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAdicionarItem}
                  className="inline-flex items-center gap-1.5 rounded border border-emerald-700/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                >
                  <Plus size={11} />
                  Incluir
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdicionando(true)}
              className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-emerald-400 transition-colors"
            >
              <Plus size={13} />
              Adicionar item
            </button>
          )}

          {/* Total */}
          <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Total atualizado</span>
            <span className="font-mono font-bold text-foreground">{formatBRL(total)}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border/60 shrink-0">
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground/80 px-3 py-2 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg border border-violet-700/60 bg-violet-500/10 px-4 py-2 text-sm font-semibold text-violet-400 hover:bg-violet-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            {pending ? "Salvando…" : "Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}
