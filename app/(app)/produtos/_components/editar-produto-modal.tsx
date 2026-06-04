"use client";

/**
 * editar-produto-modal.tsx — LHG-230
 * Modal de edição de produto com sync ao Omie (AlterarProduto).
 */

import { useState, useTransition, useEffect } from "react";
import { X, Loader2, AlertTriangle, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { FAMILIA_TO_CATEGORIA } from "@/lib/omie/familia-map";
import { editarProduto, listarFamiliasOmieParaProduto, type FamiliaProdutoOmie } from "../actions";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ProdutoRow {
  id:           string;
  codigo:       string;
  nome:         string;
  preco_custo:  number | null;
  familia_omie: string | null;
  categoria:    string;
  omie_codigo:  string | null;
}

interface EditarProdutoModalProps {
  produto: ProdutoRow | null;   // null = fechado
  onClose: () => void;
}

// FAMILIA_TO_CATEGORIA mantido para calcular categoria localmente
void FAMILIA_TO_CATEGORIA;

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseBRL(v: string): number {
  // Aceita "1.234,56" (pt-BR) ou "1234.56" (en-US)
  const cleaned = v.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function formatBRL(v: number | null): string {
  if (!v) return "";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Componente ────────────────────────────────────────────────────────────────

export function EditarProdutoModal({ produto, onClose }: EditarProdutoModalProps) {
  const [nome,           setNome]           = useState(produto?.nome ?? "");
  const [precoRaw,       setPrecoRaw]       = useState(formatBRL(produto?.preco_custo ?? null));
  const [familiaDesc,    setFamiliaDesc]    = useState(produto?.familia_omie ?? "");
  const [familiaCodigo,  setFamiliaCodigo]  = useState<number | undefined>(undefined);
  const [familias,       setFamilias]       = useState<FamiliaProdutoOmie[]>([]);
  const [erro,           setErro]           = useState<string | null>(null);
  const [isPending,      startTransition]   = useTransition();

  // Carrega famílias do Omie ao abrir
  useEffect(() => {
    if (!produto?.id || familias.length > 0) return;
    listarFamiliasOmieParaProduto(produto.id)
      .then(res => {
        if ("familias" in res) {
          setFamilias(res.familias);
          // Pré-seleciona a família atual pelo nome
          const atual = res.familias.find(
            f => f.descricao.toUpperCase() === (produto.familia_omie ?? "").toUpperCase()
          );
          if (atual) setFamiliaCodigo(atual.codigo);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produto?.id]);

  // Reset quando o produto muda (modal fecha e abre com outro produto)
  const produtoId = produto?.id;
  if (!produto) return null;

  const semOmie = !produto.omie_codigo;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isPending || semOmie) return;
    setErro(null);

    const preco = parseBRL(precoRaw);
    if (preco <= 0) { setErro("Preço deve ser maior que zero"); return; }
    if (!nome.trim()) { setErro("Nome é obrigatório"); return; }
    if (!familiaDesc) { setErro("Selecione uma família"); return; }

    startTransition(async () => {
      const res = await editarProduto(produtoId!, {
        nome:           nome.trim(),
        preco_custo:    preco,
        familia_omie:   familiaDesc,
        familia_codigo: familiaCodigo,
      });
      if ("erro" in res) {
        setErro(res.erro);
      } else {
        onClose();
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !isPending) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/80">
          <div>
            <h2 className="text-sm font-semibold text-foreground leading-tight">
              Editar produto
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
              {produto.codigo}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isPending}
            className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
            aria-label="Fechar"
          >
            <X size={14} />
          </button>
        </div>

        {/* Banner: sem Omie */}
        {semOmie && (
          <div className="mx-5 mt-4 flex items-start gap-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3.5 py-3">
            <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[12px] text-amber-600 dark:text-amber-400 leading-snug">
              Produto não sincronizado com o Omie — execute o Sync primeiro
            </p>
          </div>
        )}

        {/* Banner: erro Omie */}
        {erro && (
          <div className="mx-5 mt-4 flex items-start gap-2.5 rounded-lg bg-red-500/10 border border-red-500/20 px-3.5 py-3">
            <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-[12px] text-red-600 dark:text-red-400 leading-snug">{erro}</p>
          </div>
        )}

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">

          {/* Nome */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Nome do produto
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              disabled={semOmie || isPending}
              className={cn(
                "w-full rounded-lg border border-border bg-muted/60 px-3 py-2.5",
                "text-sm text-foreground placeholder:text-muted-foreground/50",
                "focus:outline-none focus:border-border focus:ring-1 focus:ring-border/40 transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            />
          </div>

          {/* Preço de custo */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Preço de custo (R$)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={precoRaw}
              onChange={(e) => setPrecoRaw(e.target.value)}
              placeholder="0,00"
              disabled={semOmie || isPending}
              className={cn(
                "w-full rounded-lg border border-border bg-muted/60 px-3 py-2.5",
                "text-sm text-foreground font-mono placeholder:text-muted-foreground/50",
                "focus:outline-none focus:border-border focus:ring-1 focus:ring-border/40 transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            />
          </div>

          {/* Família Omie — carregada do Omie com codigo_familia */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Família Omie
            </label>
            <select
              value={familiaDesc}
              onChange={(e) => {
                const desc = e.target.value;
                setFamiliaDesc(desc);
                const fam = familias.find(f => f.descricao === desc);
                setFamiliaCodigo(fam?.codigo);
              }}
              disabled={semOmie || isPending}
              className={cn(
                "w-full rounded-lg border border-border bg-muted/60 px-3 py-2.5",
                "text-sm text-foreground appearance-none cursor-pointer",
                "focus:outline-none focus:border-border focus:ring-1 focus:ring-border/40 transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              <option value="">
                {familias.length === 0 ? "Carregando famílias…" : "Selecione uma família…"}
              </option>
              {familias.map((f) => (
                <option key={f.codigo} value={f.descricao}>
                  {f.descricao}
                </option>
              ))}
            </select>
            {familiaCodigo && (
              <p className="text-[11px] text-muted-foreground/60">
                código Omie: {familiaCodigo}
              </p>
            )}
          </div>

          {/* Campos somente leitura */}
          <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium mb-2">
              Somente leitura
            </p>
            {[
              { label: "Código Omie",    value: produto.codigo },
              { label: "ID interno Omie", value: produto.omie_codigo ?? "—" },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">{label}</span>
                <span className="text-[11px] font-mono text-foreground/70">{value}</span>
              </div>
            ))}
          </div>

          {/* Rodapé */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={semOmie || isPending}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                semOmie || isPending
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white",
              )}
            >
              {isPending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Save size={13} />
              )}
              {isPending ? "Salvando…" : "Salvar no Omie"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
