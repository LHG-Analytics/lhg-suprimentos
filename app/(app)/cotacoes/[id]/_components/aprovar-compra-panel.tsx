"use client";

/**
 * aprovar-compra-panel.tsx
 * Painel de seleção de fornecedor vencedor por item + botão "Aprovar compra".
 * - Checkbox por item (seleção individual)
 * - Checkbox "Selecionar todos"
 * - Popover "Atribuir a fornecedor" com lista dos fornecedores da cotação
 * - Badge por item com fornecedor vencedor atual
 * - Botão "Aprovar compra" habilitado só quando 100% dos itens têm vencedor
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, Loader2, ShoppingCart, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { atribuirFornecedorVencedor, aprovarCotacao } from "../../actions";

interface Fornecedor {
  id:            string;
  razao_social:  string;
  nome_fantasia: string | null;
}

interface Item {
  id:               string;
  quantidade:       number;
  selecionado_forn: string | null;
  produtos:         { nome: string } | null;
}

interface Props {
  cotacaoId:     string;
  cotacaoStatus: string;
  itens:         Item[];
  fornecedores:  Fornecedor[];
}

function fornNome(f: Fornecedor) {
  return f.nome_fantasia || f.razao_social;
}

const CORES = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#38bdf8"];

export function AprovarCompraPanel({ cotacaoId, cotacaoStatus, itens, fornecedores }: Props) {
  const router = useRouter();
  const [selecionados,  setSelecionados]  = useState<Set<string>>(new Set());
  const [popoverOpen,   setPopoverOpen]   = useState(false);
  const [pendingAtrib,  startAtrib]       = useTransition();
  const [pendingAprov,  startAprov]       = useTransition();

  const aprovado         = cotacaoStatus === "aprovado";
  const todosSelecionados = selecionados.size === itens.length && itens.length > 0;
  const todosTemVencedor  = itens.every(i => i.selecionado_forn);

  const fornById = new Map(fornecedores.map(f => [f.id, f]));
  const corForn  = new Map(fornecedores.map((f, idx) => [f.id, CORES[idx % CORES.length]]));

  function toggleItem(id: string) {
    setSelecionados(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelecionados(
      todosSelecionados ? new Set() : new Set(itens.map(i => i.id))
    );
  }

  function atribuir(fornId: string | null) {
    setPopoverOpen(false);
    startAtrib(async () => {
      const res = await atribuirFornecedorVencedor(Array.from(selecionados), fornId);
      if ("erro" in res) toast.error(res.erro);
      else {
        toast.success(fornId ? "Fornecedor vencedor atribuído" : "Seleção removida");
        setSelecionados(new Set());
      }
    });
  }

  function handleAprovar() {
    startAprov(async () => {
      const res = await aprovarCotacao(cotacaoId);
      if ("erro" in res) {
        toast.error(res.erro);
        return;
      }
      const { pedidos } = res;
      const totalOk   = pedidos.filter(p => p.omieOk).length;
      const totalPend = pedidos.filter(p => !p.omieOk).length;
      toast.success(
        `${pedidos.length} pedido(s) gerado(s)`,
        {
          description: totalPend > 0
            ? `${totalOk} enviado(s) ao Omie · ${totalPend} pendente(s) — use "Tentar novamente" nos pedidos`
            : "Todos enviados ao Omie e ao(s) fornecedor(es)",
          duration: 8000,
        }
      );
      router.push("/pedidos");
    });
  }

  if (aprovado) return null;

  return (
    <div className="rounded-xl border border-border/80 bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Selecionar fornecedor vencedor
        </span>
        {selecionados.size > 0 && (
          <div className="relative">
            <button
              onClick={() => setPopoverOpen(v => !v)}
              disabled={pendingAtrib}
              className="flex items-center gap-1.5 h-7 px-3 rounded-md bg-lhg-500 hover:bg-lhg-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              {pendingAtrib && <Loader2 size={11} className="animate-spin" />}
              Atribuir a fornecedor ({selecionados.size})
              <ChevronDown size={11} />
            </button>
            {popoverOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-border bg-card shadow-xl overflow-hidden">
                {fornecedores.map(f => (
                  <button
                    key={f.id}
                    onClick={() => atribuir(f.id)}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors flex items-center gap-2"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: corForn.get(f.id) }}
                    />
                    {fornNome(f)}
                  </button>
                ))}
                <button
                  onClick={() => atribuir(null)}
                  className="w-full text-left px-3 py-2.5 text-xs text-muted-foreground hover:bg-muted/40 border-t border-border/60 flex items-center gap-1.5"
                >
                  <X size={11} />
                  Remover seleção
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabela de itens */}
      <div className="rounded-lg border border-border/60 overflow-hidden">
        <div className="grid grid-cols-[32px_1fr_160px] gap-2 px-3 py-2 bg-muted/30 border-b border-border/60">
          <input
            type="checkbox"
            checked={todosSelecionados}
            onChange={toggleAll}
            className="w-4 h-4 accent-lhg-500 cursor-pointer"
          />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Produto</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Vencedor</span>
        </div>

        {itens.map(item => {
          const forn = item.selecionado_forn ? fornById.get(item.selecionado_forn) : null;
          const cor  = item.selecionado_forn ? corForn.get(item.selecionado_forn) : undefined;
          return (
            <div
              key={item.id}
              className={cn(
                "grid grid-cols-[32px_1fr_160px] gap-2 px-3 py-2.5 border-b border-border/40 last:border-0 items-center",
                selecionados.has(item.id) && "bg-lhg-500/05",
              )}
            >
              <input
                type="checkbox"
                checked={selecionados.has(item.id)}
                onChange={() => toggleItem(item.id)}
                className="w-4 h-4 accent-lhg-500 cursor-pointer"
              />
              <span className="text-sm text-foreground truncate">
                {item.produtos?.nome ?? "—"}
                <span className="ml-2 text-xs text-muted-foreground">×{item.quantidade}</span>
              </span>
              {forn ? (
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full truncate"
                  style={{ background: `${cor}20`, color: cor, border: `1px solid ${cor}40` }}
                >
                  {fornNome(forn)}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground/50 italic">não atribuído</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Botão Aprovar */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-muted-foreground">
          {itens.filter(i => i.selecionado_forn).length}/{itens.length} itens com vencedor
          {todosTemVencedor && <CheckCircle2 size={11} className="inline ml-1 text-emerald-400" />}
        </span>
        <button
          onClick={handleAprovar}
          disabled={!todosTemVencedor || pendingAprov}
          title={!todosTemVencedor ? "Todos os itens precisam ter fornecedor vencedor" : undefined}
          className={cn(
            "flex items-center gap-2 h-9 px-5 rounded-lg font-medium text-sm transition-colors",
            todosTemVencedor && !pendingAprov
              ? "bg-emerald-500 hover:bg-emerald-600 text-white"
              : "bg-muted text-muted-foreground cursor-not-allowed",
          )}
        >
          {pendingAprov
            ? <Loader2 size={14} className="animate-spin" />
            : <ShoppingCart size={14} />
          }
          {pendingAprov ? "Gerando pedidos…" : "Aprovar compra"}
        </button>
      </div>
    </div>
  );
}
