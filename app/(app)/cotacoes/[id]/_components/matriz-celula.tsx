"use client";

import { useState, useTransition } from "react";
import { Pencil, Check, Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { upsertMatrizCell } from "../../actions";
import { toast } from "sonner";
import {
  FORMAS_PAGAMENTO, PRAZOS_BOLETO, PARCELAS_CARTAO,
  comporPagamento, parsePagamento, type FormaPagamento,
} from "@/lib/cotacao/formas-pagamento";

export interface MatrizCellData {
  cotacao_item_id: string;
  fornecedor_id: string;
  preco_unitario: number | null;
  prazo_entrega_dias: number | null;
  condicao_pagamento: string | null;
  observacao: string | null;
  frete: number | null;
  garantia: string | null;
}

interface Props {
  itemId: string;
  fornecedorId: string;
  quantidade: number;
  cell: MatrizCellData | null;
  ehMelhorPreco: boolean;
  ehSelecionado: boolean;
  onToggleSelecao: (itemId: string, fornId: string) => void;
  onCellSaved: (itemId: string, fornId: string, data: Partial<MatrizCellData>) => void;
}

function formatBRL(v: number | null | undefined) {
  if (v == null || v === 0) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export function MatrizCelula({
  itemId, fornecedorId, quantidade, cell,
  ehMelhorPreco, ehSelecionado,
  onToggleSelecao, onCellSaved,
}: Props) {
  const [editando, setEditando] = useState(false);
  const [pending, startTransition] = useTransition();

  const [formPreco, setFormPreco] = useState("");
  const [formPrazo, setFormPrazo] = useState("");
  const [formForma, setFormForma] = useState<FormaPagamento | "">("");
  const [formDetalhe, setFormDetalhe] = useState("");
  const [formFrete, setFormFrete] = useState("");
  const [formGarantia, setFormGarantia] = useState("");
  const [formObs, setFormObs] = useState("");

  const temDados = cell?.preco_unitario != null && cell.preco_unitario > 0;
  const total = temDados && cell?.preco_unitario ? cell.preco_unitario * quantidade : null;

  function abrirEdicao(e: React.MouseEvent) {
    e.stopPropagation();
    setFormPreco(cell?.preco_unitario?.toString().replace(".", ",") ?? "");
    setFormPrazo(cell?.prazo_entrega_dias?.toString() ?? "");
    const pag = parsePagamento(cell?.condicao_pagamento);
    setFormForma(pag.forma);
    setFormDetalhe(pag.detalhe);
    setFormFrete(cell?.frete ? cell.frete.toString().replace(".", ",") : "");
    setFormGarantia(cell?.garantia ?? "");
    setFormObs(cell?.observacao ?? "");
    setEditando(true);
  }

  function fecharEdicao(e?: React.MouseEvent) {
    e?.stopPropagation();
    setEditando(false);
  }

  function handleSalvar(e: React.MouseEvent) {
    e.stopPropagation();
    const precoStr = formPreco.replace(/\./g, "").replace(",", ".");
    const preco = parseFloat(precoStr);
    if (!formPreco || isNaN(preco) || preco <= 0) {
      toast.error("Informe um preço válido");
      return;
    }

    const freteStr = formFrete.replace(/\./g, "").replace(",", ".").trim();
    const freteNum = freteStr === "" ? 0 : parseFloat(freteStr);
    if (isNaN(freteNum) || freteNum < 0) {
      toast.error("Frete inválido");
      return;
    }

    const dados: MatrizCellData = {
      cotacao_item_id: itemId,
      fornecedor_id: fornecedorId,
      preco_unitario: preco,
      prazo_entrega_dias: formPrazo ? parseInt(formPrazo) : null,
      condicao_pagamento: comporPagamento({ forma: formForma, detalhe: formDetalhe }) || null,
      observacao: formObs.trim() || null,
      frete: freteNum,
      garantia: formGarantia.trim() || null,
    };

    startTransition(async () => {
      try {
        await upsertMatrizCell(dados);
        onCellSaved(itemId, fornecedorId, dados);
        setEditando(false);
        toast.success("Cotação salva");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao salvar");
      }
    });
  }

  // ── Modo edição ──────────────────────────────────────────────────────────────
  if (editando) {
    return (
      <div
        className="rounded-lg border border-sky-500/40 bg-sky-500/[0.05] p-2.5 space-y-2"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[9px] uppercase tracking-wider text-sky-400/70 font-medium">Preencher cotação</span>
          <button onClick={fecharEdicao} className="text-muted-foreground/50 hover:text-foreground/60 transition-colors">
            <X size={10} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <label className="text-[9px] uppercase tracking-wider text-muted-foreground/60 block mb-0.5">
              Preço/UN <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/50">R$</span>
              <input
                type="text"
                inputMode="decimal"
                value={formPreco}
                onChange={e => setFormPreco(e.target.value)}
                placeholder="0,00"
                className="w-full h-7 rounded border border-border bg-background pl-6 pr-2 text-xs text-foreground focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/20"
                autoFocus
              />
            </div>
          </div>
          <div>
            <label className="text-[9px] uppercase tracking-wider text-muted-foreground/60 block mb-0.5">
              Entrega (dias)
            </label>
            <input
              type="number"
              value={formPrazo}
              onChange={e => setFormPrazo(e.target.value)}
              placeholder="—"
              min={0}
              className="w-full h-7 rounded border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/20"
            />
          </div>
        </div>

        <div>
          <label className="text-[9px] uppercase tracking-wider text-muted-foreground/60 block mb-0.5">
            Forma de pagamento
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <select
              value={formForma}
              onChange={e => { setFormForma(e.target.value as FormaPagamento | ""); setFormDetalhe(""); }}
              className="h-7 rounded border border-border bg-background px-1.5 text-xs text-foreground focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/20"
            >
              <option value="">—</option>
              {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{f}</option>)}
            </select>

            {/* Detalhe condicional: prazo (boleto) ou parcelas (cartão) */}
            {formForma === "Boleto" && (
              <select
                value={formDetalhe}
                onChange={e => setFormDetalhe(e.target.value)}
                className="h-7 rounded border border-border bg-background px-1.5 text-xs text-foreground focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/20"
              >
                <option value="">prazo…</option>
                {PRAZOS_BOLETO.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
            {formForma === "Cartão de crédito" && (
              <select
                value={formDetalhe}
                onChange={e => setFormDetalhe(e.target.value)}
                className="h-7 rounded border border-border bg-background px-1.5 text-xs text-foreground focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/20"
              >
                <option value="">parcelas…</option>
                {PARCELAS_CARTAO.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <label className="text-[9px] uppercase tracking-wider text-muted-foreground/60 block mb-0.5">
              Frete
            </label>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/50">R$</span>
              <input
                type="text"
                inputMode="decimal"
                value={formFrete}
                onChange={e => setFormFrete(e.target.value)}
                placeholder="0,00"
                className="w-full h-7 rounded border border-border bg-background pl-6 pr-2 text-xs text-foreground focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/20"
              />
            </div>
          </div>
          <div>
            <label className="text-[9px] uppercase tracking-wider text-muted-foreground/60 block mb-0.5">
              Garantia
            </label>
            <input
              type="text"
              value={formGarantia}
              onChange={e => setFormGarantia(e.target.value)}
              placeholder="ex: 12 meses"
              className="w-full h-7 rounded border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/20"
            />
          </div>
        </div>

        <div>
          <label className="text-[9px] uppercase tracking-wider text-muted-foreground/60 block mb-0.5">
            Observação
          </label>
          <input
            type="text"
            value={formObs}
            onChange={e => setFormObs(e.target.value)}
            placeholder="Condições especiais, validade da proposta…"
            className="w-full h-7 rounded border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/20"
          />
        </div>

        <div className="flex items-center justify-end gap-1.5 pt-0.5">
          <button
            onClick={fecharEdicao}
            className="text-[11px] text-muted-foreground hover:text-foreground/70 px-2 py-1 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={pending}
            className="inline-flex items-center gap-1 h-6 px-2.5 rounded bg-sky-500/15 border border-sky-500/40 text-sky-400 text-[11px] font-medium hover:bg-sky-500/25 transition-colors disabled:opacity-50"
          >
            {pending ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
            Salvar
          </button>
        </div>
      </div>
    );
  }

  // ── Sem dados (fornecedor não cotou este item) ────────────────────────────────
  if (!temDados) {
    return (
      <div
        className="group rounded-lg border border-dashed border-border/50 px-2 py-3 flex flex-col items-center gap-1.5 hover:border-sky-500/30 hover:bg-sky-500/[0.02] transition-all cursor-default"
        onClick={e => e.stopPropagation()}
      >
        <span className="text-[10px] text-muted-foreground/40">sem cotação</span>
        <button
          onClick={abrirEdicao}
          className="inline-flex items-center gap-1 text-[10px] text-sky-400/70 opacity-0 group-hover:opacity-100 transition-opacity hover:text-sky-300"
        >
          <Plus size={9} />
          Informar preço
        </button>
      </div>
    );
  }

  // ── Com dados ────────────────────────────────────────────────────────────────
  return (
    <div
      className={cn(
        "rounded-lg px-2.5 py-2 transition-all relative group cursor-pointer",
        ehSelecionado
          ? "bg-emerald-500/20 ring-1 ring-emerald-500/50"
          : ehMelhorPreco
            ? "bg-emerald-500/[0.07] hover:bg-emerald-500/12"
            : "hover:bg-muted/40",
      )}
      onClick={() => onToggleSelecao(itemId, fornecedorId)}
    >
      {/* Botão editar */}
      <button
        onClick={abrirEdicao}
        title="Editar dados desta cotação"
        className="absolute top-1.5 right-1.5 p-0.5 rounded text-muted-foreground/0 group-hover:text-muted-foreground/40 hover:!text-foreground/60 transition-colors"
      >
        <Pencil size={9} />
      </button>

      {/* Linha 1: preço */}
      <div className="flex items-center gap-1 pr-4">
        {ehSelecionado && (
          <div className="w-3 h-3 rounded-full bg-emerald-500 ring-1 ring-emerald-300 flex items-center justify-center shrink-0">
            <Check size={7} className="text-background" />
          </div>
        )}
        {!ehSelecionado && ehMelhorPreco && (
          <div className="w-3 h-3 rounded-full bg-emerald-500/30 ring-1 ring-emerald-500 flex items-center justify-center shrink-0">
            <Check size={7} className="text-emerald-400" />
          </div>
        )}
        <span className={cn(
          "font-mono text-sm font-semibold leading-none",
          ehSelecionado ? "text-emerald-300" : ehMelhorPreco ? "text-emerald-400" : "text-foreground",
        )}>
          {formatBRL(cell?.preco_unitario)}
        </span>
        <span className="text-[9px] text-muted-foreground/40 leading-none">/un</span>
      </div>

      {/* Linha 2: total */}
      {total !== null && (
        <div className={cn(
          "text-[10px] font-mono mt-0.5",
          ehSelecionado ? "text-emerald-600" : "text-muted-foreground/50",
        )}>
          Total {formatBRL(total)}
        </div>
      )}

      {/* Linha 3+: detalhes */}
      <div className="mt-2 space-y-0.5 border-t border-border/30 pt-1.5">
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted-foreground/40 w-16 shrink-0">Entrega</span>
          <span className="text-[10px] text-muted-foreground/70">
            {cell?.prazo_entrega_dias != null ? `${cell.prazo_entrega_dias} dias` : <em className="text-muted-foreground/30">—</em>}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted-foreground/40 w-16 shrink-0">Pagamento</span>
          <span className="text-[10px] text-muted-foreground/70 truncate">
            {cell?.condicao_pagamento || <em className="text-muted-foreground/30">—</em>}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted-foreground/40 w-16 shrink-0">Frete</span>
          <span className="text-[10px] text-muted-foreground/70 font-mono">
            {cell?.frete && cell.frete > 0 ? formatBRL(cell.frete) : <em className="text-muted-foreground/30">grátis</em>}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted-foreground/40 w-16 shrink-0">Garantia</span>
          <span className="text-[10px] text-muted-foreground/70 truncate">
            {cell?.garantia || <em className="text-muted-foreground/30">—</em>}
          </span>
        </div>
        {cell?.observacao && (
          <div className="text-[10px] text-muted-foreground/50 italic truncate pt-0.5">
            &ldquo;{cell.observacao}&rdquo;
          </div>
        )}
      </div>
    </div>
  );
}
