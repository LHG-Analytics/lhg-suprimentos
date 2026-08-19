"use client";

/**
 * adicionar-item-modal.tsx
 * Modal para acrescentar um item a uma requisição ou a uma cotação.
 *
 * Agnóstico de destino: recebe `onConfirm` e o pai decide qual Server Action
 * chamar. Por isso serve às duas telas sem duplicar a busca de produto.
 *
 * O item pode vir do catálogo ou ser "livre" (descrição digitada) — o mesmo par
 * de casos que `criarRequisicao` aceita. Produto livre fica pendente de cadastro
 * no Omie e não bloqueia a cotação, só a geração do pedido.
 */
import { useMemo, useState } from "react";
import { X, Search, Loader2, Plus, Package, PencilLine } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProdutoOpcao {
  id: string;
  codigo: string;
  nome: string;
  unidade_med: string;
  categoria: string | null;
}

export type NovoItem =
  | { tipo: "catalogo"; produto_id: string; quantidade: number; observacao?: string }
  | { tipo: "livre"; produto_nome_livre: string; produto_unidade_med: string; quantidade: number; observacao?: string };

interface Props {
  open:     boolean;
  onClose:  () => void;
  produtos: ProdutoOpcao[];
  /** Exibe o campo observação (existe em requisicao_itens, não em cotacao_itens). */
  comObservacao?: boolean;
  titulo?:  string;
  onConfirm: (item: NovoItem) => Promise<{ ok: true } | { erro: string }>;
}

const MAX_RESULTADOS = 40;

export function AdicionarItemModal({
  open, onClose, produtos, comObservacao = false, titulo = "Adicionar item", onConfirm,
}: Props) {
  const [modo, setModo]           = useState<"catalogo" | "livre">("catalogo");
  const [busca, setBusca]         = useState("");
  const [escolhido, setEscolhido] = useState<ProdutoOpcao | null>(null);
  const [qtd, setQtd]             = useState("1");
  const [obs, setObs]             = useState("");
  const [nomeLivre, setNomeLivre] = useState("");
  const [unidLivre, setUnidLivre] = useState("UN");
  const [erro, setErro]           = useState<string | null>(null);
  const [salvando, setSalvando]   = useState(false);

  const resultados = useMemo(() => {
    const q = busca.toLowerCase().trim();
    if (!q) return produtos.slice(0, MAX_RESULTADOS);
    return produtos
      .filter(p => p.nome.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q))
      .slice(0, MAX_RESULTADOS);
  }, [produtos, busca]);

  if (!open) return null;

  function fechar() {
    setModo("catalogo"); setBusca(""); setEscolhido(null);
    setQtd("1"); setObs(""); setNomeLivre(""); setUnidLivre("UN"); setErro(null);
    onClose();
  }

  async function confirmar() {
    setErro(null);
    const quantidade = parseFloat(qtd.replace(",", "."));
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      setErro("Informe uma quantidade maior que zero.");
      return;
    }

    let item: NovoItem;
    if (modo === "catalogo") {
      if (!escolhido) { setErro("Escolha um produto do catálogo."); return; }
      item = { tipo: "catalogo", produto_id: escolhido.id, quantidade, observacao: obs.trim() || undefined };
    } else {
      if (nomeLivre.trim().length < 2) { setErro("Descreva o produto (mínimo 2 caracteres)."); return; }
      if (!unidLivre.trim())           { setErro("Informe a unidade (ex: UN, KG)."); return; }
      item = {
        tipo:                "livre",
        produto_nome_livre:  nomeLivre.trim(),
        produto_unidade_med: unidLivre.trim().toUpperCase(),
        quantidade,
        observacao:          obs.trim() || undefined,
      };
    }

    setSalvando(true);
    try {
      const res = await onConfirm(item);
      if ("erro" in res) { setErro(res.erro); return; }
      fechar();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[10vh] px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={fechar} />
      <div className="relative w-full max-w-[560px] rounded-xl border border-border bg-background shadow-2xl overflow-hidden">

        <div className="flex items-center justify-between px-5 py-4 border-b border-border/80">
          <h2 className="text-base font-semibold text-foreground">{titulo}</h2>
          <button onClick={fechar} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Catálogo x livre */}
        <div className="flex gap-1 px-5 pt-4">
          {([
            { id: "catalogo", label: "Do catálogo",       icon: Package },
            { id: "livre",    label: "Descrever produto", icon: PencilLine },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { setModo(id); setErro(null); }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                modo === id
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>

        <div className="px-5 py-4 space-y-3">
          {modo === "catalogo" ? (
            <>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                <input
                  autoFocus
                  value={busca}
                  onChange={e => { setBusca(e.target.value); setEscolhido(null); }}
                  placeholder="Buscar por nome ou código…"
                  className="w-full h-9 rounded-lg border border-border bg-muted/30 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              <div className="max-h-[220px] overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/40">
                {resultados.length === 0 ? (
                  <p className="text-xs text-muted-foreground/60 px-3 py-6 text-center">
                    Nenhum produto encontrado
                  </p>
                ) : resultados.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setEscolhido(p)}
                    className={cn(
                      "w-full text-left px-3 py-2 transition-colors",
                      escolhido?.id === p.id ? "bg-emerald-500/10" : "hover:bg-muted/50",
                    )}
                  >
                    <div className="text-sm text-foreground flex items-center gap-2">
                      {escolhido?.id === p.id && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />}
                      <span className="truncate">{p.nome}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground/60 font-mono">
                      {p.codigo} · {p.unidade_med}{p.categoria ? ` · ${p.categoria}` : ""}
                    </div>
                  </button>
                ))}
              </div>
              {produtos.length > MAX_RESULTADOS && !busca && (
                <p className="text-[11px] text-muted-foreground/50">
                  Mostrando {MAX_RESULTADOS} de {produtos.length} produtos — use a busca para achar o resto.
                </p>
              )}
            </>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 block mb-1">Produto</label>
                <input
                  autoFocus
                  value={nomeLivre}
                  onChange={e => setNomeLivre(e.target.value)}
                  placeholder="ex: Compressor 1/4 HP"
                  className="w-full h-9 rounded-lg border border-border bg-muted/30 px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-emerald-500/50"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 block mb-1">Unidade</label>
                <input
                  value={unidLivre}
                  onChange={e => setUnidLivre(e.target.value)}
                  placeholder="UN"
                  className="w-full h-9 rounded-lg border border-border bg-muted/30 px-3 text-sm text-foreground focus:outline-none focus:border-emerald-500/50"
                />
              </div>
              <p className="col-span-3 text-[11px] text-amber-400/80">
                Produto fora do catálogo entra como pendente de cadastro no Omie. Dá para cotar
                assim, mas o cadastro é exigido antes de gerar o pedido de compra.
              </p>
            </div>
          )}

          <div className={cn("grid gap-2", comObservacao ? "grid-cols-3" : "grid-cols-1")}>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 block mb-1">Quantidade</label>
              <input
                inputMode="decimal"
                value={qtd}
                onChange={e => setQtd(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-muted/30 px-3 text-sm font-mono text-foreground focus:outline-none focus:border-emerald-500/50"
              />
            </div>
            {comObservacao && (
              <div className="col-span-2">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 block mb-1">Observação</label>
                <input
                  value={obs}
                  onChange={e => setObs(e.target.value)}
                  placeholder="opcional"
                  className="w-full h-9 rounded-lg border border-border bg-muted/30 px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-emerald-500/50"
                />
              </div>
            )}
          </div>

          {erro && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/25 rounded-md px-3 py-2">{erro}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border/60">
          <button onClick={fechar} className="text-sm text-muted-foreground hover:text-foreground/80 px-3 py-2 transition-colors">
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={salvando}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-700/60 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
          >
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {salvando ? "Adicionando…" : "Adicionar"}
          </button>
        </div>
      </div>
    </div>
  );
}
