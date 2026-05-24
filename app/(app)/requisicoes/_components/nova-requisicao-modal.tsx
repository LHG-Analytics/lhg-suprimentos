"use client";

/**
 * nova-requisicao-modal.tsx — LHG-209
 * Wizard 3 passos para criar uma nova requisição.
 * Passo 1: Título + Unidades + Urgência
 * Passo 2: Itens (tabela com autocomplete de produtos)
 * Passo 3: Revisão + Confirmar
 */
import { useState, useTransition, useRef, useEffect } from "react";
import {
  X, ChevronLeft, ChevronRight, Plus, Trash2, Search,
  AlertTriangle, Check, Loader2, ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { criarRequisicao } from "../actions";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Unidade  { id: string; nome: string; slug: string; cor_hex: string | null }
interface Produto  {
  id: string; codigo: string; nome: string;
  unidade_med: string; categoria: string; preco_custo: number | null;
}
interface ItemRow {
  _key:        string; // local uuid para key React
  produto_id:  string;
  produto:     Produto | null;
  quantidade:  number;
  observacao:  string;
}
interface FormState {
  titulo:       string;
  urgencia:     "normal" | "urgente";
  justificativa: string;
  unidade_ids:  string[];
  itens:        ItemRow[];
}

interface Props {
  open:      boolean;
  onClose:   () => void;
  unidades:  Unidade[];
  produtos:  Produto[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nanoId() {
  return Math.random().toString(36).slice(2, 10);
}

function emptyItem(): ItemRow {
  return { _key: nanoId(), produto_id: "", produto: null, quantidade: 1, observacao: "" };
}

function formatBRL(v: number | null) {
  if (!v) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function estimarTotal(itens: ItemRow[]) {
  return itens.reduce((acc, i) => {
    if (!i.produto?.preco_custo) return acc;
    return acc + i.produto.preco_custo * i.quantidade;
  }, 0);
}

const STEP_LABELS = ["Unidades & urgência", "Itens", "Revisão"];

// ── Produto Combobox ──────────────────────────────────────────────────────────

function ProdutoCombobox({
  value, onChange, produtos,
}: {
  value: Produto | null;
  onChange: (p: Produto) => void;
  produtos: Produto[];
}) {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = produtos.filter((p) => {
    const q = query.toLowerCase();
    return (
      p.nome.toLowerCase().includes(q) ||
      p.codigo.toLowerCase().includes(q) ||
      p.categoria.toLowerCase().includes(q)
    );
  }).slice(0, 20);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen(!open); setQuery(""); }}
        className={cn(
          "w-full text-left px-2 py-1.5 rounded text-[12px] transition-colors",
          "border border-transparent hover:border-zinc-700",
          value ? "text-zinc-200" : "text-zinc-600",
        )}
      >
        {value ? (
          <span className="truncate block">
            <span className="font-mono text-zinc-500 mr-1.5">{value.codigo}</span>
            {value.nome}
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <Search size={11} />
            Selecionar produto…
          </span>
        )}
      </button>

      {open && (
        <div className={cn(
          "absolute z-50 top-full left-0 mt-1 w-80 rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl",
          "overflow-hidden",
        )}>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800">
            <Search size={12} className="text-zinc-500 shrink-0" />
            <input
              autoFocus
              type="text"
              placeholder="Buscar por nome ou código…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-[12px] text-zinc-200 placeholder:text-zinc-600 outline-none"
            />
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-[12px] text-zinc-600 text-center">
                Nenhum produto encontrado
              </li>
            ) : (
              filtered.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => { onChange(p); setOpen(false); }}
                    className={cn(
                      "w-full text-left px-3 py-2 hover:bg-zinc-800/60 transition-colors",
                      "flex items-center justify-between gap-2",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="text-[12px] text-zinc-200 truncate">{p.nome}</div>
                      <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                        {p.codigo} · {p.categoria}
                      </div>
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono shrink-0">
                      {p.unidade_med}
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function NovaRequisicaoModal({ open, onClose, unidades, produtos }: Props) {
  const [step, setStep] = useState(1);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState<FormState>({
    titulo:        "",
    urgencia:      "normal",
    justificativa: "",
    unidade_ids:   unidades.length === 1 ? [unidades[0].id] : [],
    itens:         [emptyItem()],
  });

  function reset() {
    setStep(1);
    setErrors({});
    setForm({
      titulo:        "",
      urgencia:      "normal",
      justificativa: "",
      unidade_ids:   unidades.length === 1 ? [unidades[0].id] : [],
      itens:         [emptyItem()],
    });
  }

  function handleClose() {
    reset();
    onClose();
  }

  // ── Validação por step ──────────────────────────────────────────────────────

  function validateStep1() {
    const e: Record<string, string> = {};
    if (!form.titulo.trim() || form.titulo.trim().length < 3)
      e.titulo = "Informe um título (mínimo 3 caracteres)";
    if (form.unidade_ids.length === 0)
      e.unidades = "Selecione ao menos uma unidade";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateStep2() {
    const e: Record<string, string> = {};
    const itensValidos = form.itens.filter(i => i.produto_id);
    if (itensValidos.length === 0)
      e.itens = "Adicione ao menos um item";
    const semQtd = itensValidos.find(i => !i.quantidade || i.quantidade <= 0);
    if (semQtd) e.itens = "Todos os itens precisam ter quantidade maior que zero";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleNext() {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    setStep((s) => s + 1);
  }

  // ── Itens helpers ───────────────────────────────────────────────────────────

  function addItem() {
    setForm(f => ({ ...f, itens: [...f.itens, emptyItem()] }));
  }

  function removeItem(key: string) {
    setForm(f => ({ ...f, itens: f.itens.filter(i => i._key !== key) }));
  }

  function updateItem(key: string, patch: Partial<ItemRow>) {
    setForm(f => ({
      ...f,
      itens: f.itens.map(i => i._key === key ? { ...i, ...patch } : i),
    }));
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  function handleSubmit() {
    const itensValidos = form.itens.filter(i => i.produto_id);
    startTransition(async () => {
      try {
        const result = await criarRequisicao({
          titulo:        form.titulo.trim(),
          urgencia:      form.urgencia,
          justificativa: form.justificativa.trim() || undefined,
          unidade_ids:   form.unidade_ids,
          itens:         itensValidos.map(i => ({
            produto_id: i.produto_id,
            quantidade: i.quantidade,
            observacao: i.observacao.trim() || undefined,
          })),
        });
        toast.success(`Requisição ${result.numero} criada`, {
          description: `${itensValidos.length} item${itensValidos.length !== 1 ? "s" : ""} adicionado${itensValidos.length !== 1 ? "s" : ""}`,
        });
        handleClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao criar requisição");
      }
    });
  }

  // ── Dados derivados ─────────────────────────────────────────────────────────

  const itensValidos  = form.itens.filter(i => i.produto_id);
  const totalEstimado = estimarTotal(itensValidos);
  const unidadesSel   = unidades.filter(u => form.unidade_ids.includes(u.id));

  if (!open) return null;

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[8vh] px-4"
      aria-modal="true"
      role="dialog"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className={cn(
        "relative w-full max-w-[760px] rounded-xl border border-zinc-800",
        "bg-zinc-950 shadow-2xl overflow-hidden",
        "flex flex-col max-h-[88vh]",
      )}>

        {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-zinc-50">Nova requisição</h2>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Passo {step} de 3 · {STEP_LABELS[step - 1]}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Indicador de step ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-0 px-6 py-3 border-b border-zinc-800/60 shrink-0">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-0">
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors",
                s < step
                  ? "bg-emerald-500 text-zinc-950"
                  : s === step
                    ? "bg-zinc-700 text-zinc-100 ring-1 ring-zinc-500"
                    : "bg-zinc-800/60 text-zinc-600",
              )}>
                {s < step ? <Check size={11} /> : s}
              </div>
              {s < 3 && (
                <div className={cn(
                  "w-16 h-px mx-1",
                  s < step ? "bg-emerald-500/40" : "bg-zinc-800",
                )} />
              )}
            </div>
          ))}
        </div>

        {/* ── Conteúdo (scroll) + Sidebar ───────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Conteúdo principal */}
          <div className="flex-1 overflow-y-auto px-6 py-5">

            {/* ── PASSO 1 ─────────────────────────────────────────────────── */}
            {step === 1 && (
              <div className="space-y-5">

                {/* Título */}
                <div>
                  <label className="block text-[11px] uppercase tracking-[0.1em] text-zinc-500 mb-1.5 font-medium">
                    Título da requisição *
                  </label>
                  <input
                    autoFocus
                    type="text"
                    placeholder="Ex: Amenities — Lush Ipiranga — Junho"
                    value={form.titulo}
                    onChange={(e) => setForm(f => ({ ...f, titulo: e.target.value }))}
                    className={cn(
                      "w-full rounded-lg border bg-zinc-900/60 px-4 py-2.5",
                      "text-sm text-zinc-200 placeholder:text-zinc-600",
                      "focus:outline-none transition-colors",
                      errors.titulo
                        ? "border-red-500/50 focus:border-red-500"
                        : "border-zinc-800 focus:border-zinc-600",
                    )}
                  />
                  {errors.titulo && (
                    <p className="mt-1 text-[11px] text-red-400">{errors.titulo}</p>
                  )}
                </div>

                {/* Unidades */}
                <div>
                  <label className="block text-[11px] uppercase tracking-[0.1em] text-zinc-500 mb-1.5 font-medium">
                    Unidades *
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {unidades.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const all = unidades.map(u => u.id);
                          const isAllSelected = all.every(id => form.unidade_ids.includes(id));
                          setForm(f => ({
                            ...f,
                            unidade_ids: isAllSelected ? [] : all,
                          }));
                        }}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
                          unidades.every(u => form.unidade_ids.includes(u.id))
                            ? "border-emerald-600/60 bg-emerald-500/15 text-emerald-400"
                            : "border-zinc-700 bg-zinc-800/40 text-zinc-400 hover:border-zinc-600",
                        )}
                      >
                        {unidades.every(u => form.unidade_ids.includes(u.id)) && (
                          <Check size={10} />
                        )}
                        Todas as unidades
                      </button>
                    )}
                    {unidades.map((u) => {
                      const sel = form.unidade_ids.includes(u.id);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            setForm(f => ({
                              ...f,
                              unidade_ids: sel
                                ? f.unidade_ids.filter(id => id !== u.id)
                                : [...f.unidade_ids, u.id],
                            }));
                          }}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
                            sel
                              ? "border-emerald-600/60 bg-emerald-500/15 text-emerald-400"
                              : "border-zinc-700 bg-zinc-800/40 text-zinc-400 hover:border-zinc-600",
                          )}
                        >
                          {sel && <Check size={10} />}
                          {u.nome}
                        </button>
                      );
                    })}
                  </div>
                  {errors.unidades && (
                    <p className="mt-1 text-[11px] text-red-400">{errors.unidades}</p>
                  )}
                </div>

                {/* Urgência */}
                <div>
                  <label className="block text-[11px] uppercase tracking-[0.1em] text-zinc-500 mb-1.5 font-medium">
                    Urgência
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {(["normal", "urgente"] as const).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, urgencia: u }))}
                        className={cn(
                          "rounded-xl border p-4 text-left transition-colors",
                          form.urgencia === u
                            ? u === "urgente"
                              ? "border-red-500/40 bg-red-500/10"
                              : "border-zinc-600 bg-zinc-800/60"
                            : "border-zinc-800/80 bg-zinc-900/40 hover:border-zinc-700",
                        )}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {u === "urgente" && (
                            <AlertTriangle size={13} className="text-red-400" />
                          )}
                          <span className={cn(
                            "text-sm font-semibold",
                            form.urgencia === u
                              ? u === "urgente" ? "text-red-300" : "text-zinc-100"
                              : "text-zinc-400",
                          )}>
                            {u === "normal" ? "Normal" : "Urgente"}
                          </span>
                          {form.urgencia === u && (
                            <Check size={12} className={u === "urgente" ? "text-red-400 ml-auto" : "text-emerald-400 ml-auto"} />
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-500">
                          {u === "normal"
                            ? "Cotação em até 48h"
                            : "Cotação em até 6h · notifica gerência"}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Justificativa */}
                <div>
                  <label className="block text-[11px] uppercase tracking-[0.1em] text-zinc-500 mb-1.5 font-medium">
                    Justificativa <span className="normal-case text-zinc-600">(opcional)</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Descreva o motivo da requisição…"
                    value={form.justificativa}
                    onChange={(e) => setForm(f => ({ ...f, justificativa: e.target.value }))}
                    className={cn(
                      "w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-2.5",
                      "text-sm text-zinc-200 placeholder:text-zinc-600 resize-none",
                      "focus:outline-none focus:border-zinc-600 transition-colors",
                    )}
                  />
                </div>
              </div>
            )}

            {/* ── PASSO 2 ─────────────────────────────────────────────────── */}
            {step === 2 && (
              <div className="space-y-3">
                <p className="text-[12px] text-zinc-500">
                  Adicione os produtos que deseja cotar. Você pode digitar o nome ou código.
                </p>

                {/* Tabela de itens */}
                <div className="rounded-lg border border-zinc-800/80 overflow-hidden">
                  {/* Header */}
                  <div className="grid grid-cols-[1fr_80px_80px_1fr_32px] gap-2 px-3 py-2.5 border-b border-zinc-800/80 bg-zinc-900/60">
                    {["PRODUTO", "QTD", "UNID.", "OBSERVAÇÃO", ""].map(h => (
                      <div key={h} className="text-[10px] uppercase tracking-[0.1em] text-zinc-500 font-medium">
                        {h}
                      </div>
                    ))}
                  </div>

                  {/* Linhas */}
                  {form.itens.map((item, idx) => (
                    <div
                      key={item._key}
                      className="grid grid-cols-[1fr_80px_80px_1fr_32px] gap-2 px-3 py-1.5 border-b border-zinc-800/40 hover:bg-zinc-800/10 transition-colors"
                    >
                      {/* Produto */}
                      <ProdutoCombobox
                        value={item.produto}
                        onChange={(p) => updateItem(item._key, {
                          produto_id: p.id,
                          produto:    p,
                        })}
                        produtos={produtos}
                      />

                      {/* Quantidade */}
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={item.quantidade}
                        onChange={(e) => updateItem(item._key, {
                          quantidade: Math.max(1, Number(e.target.value)),
                        })}
                        className={cn(
                          "w-full rounded border border-transparent bg-transparent",
                          "px-2 py-1.5 text-[12px] text-zinc-200 font-mono text-center",
                          "focus:outline-none focus:border-zinc-700 hover:border-zinc-700 transition-colors",
                          "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none",
                        )}
                      />

                      {/* Unidade de medida (readonly) */}
                      <div className="flex items-center justify-center">
                        <span className="text-[11px] font-mono text-zinc-500 uppercase">
                          {item.produto?.unidade_med ?? "—"}
                        </span>
                      </div>

                      {/* Observação */}
                      <input
                        type="text"
                        placeholder="(opcional)"
                        value={item.observacao}
                        onChange={(e) => updateItem(item._key, { observacao: e.target.value })}
                        className={cn(
                          "w-full rounded border border-transparent bg-transparent",
                          "px-2 py-1.5 text-[12px] text-zinc-300 placeholder:text-zinc-700",
                          "focus:outline-none focus:border-zinc-700 hover:border-zinc-700 transition-colors",
                        )}
                      />

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => form.itens.length > 1 && removeItem(item._key)}
                        disabled={form.itens.length === 1}
                        className={cn(
                          "flex items-center justify-center rounded p-1 transition-colors",
                          form.itens.length === 1
                            ? "text-zinc-800 cursor-not-allowed"
                            : "text-zinc-600 hover:text-red-400 hover:bg-red-500/10",
                        )}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}

                  {/* Botão adicionar */}
                  <div className="px-3 py-2">
                    <button
                      type="button"
                      onClick={addItem}
                      className="inline-flex items-center gap-1.5 text-[12px] text-zinc-500 hover:text-emerald-400 transition-colors"
                    >
                      <Plus size={12} />
                      Adicionar item
                    </button>
                  </div>
                </div>

                {errors.itens && (
                  <p className="text-[11px] text-red-400">{errors.itens}</p>
                )}
              </div>
            )}

            {/* ── PASSO 3 ─────────────────────────────────────────────────── */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 divide-y divide-zinc-800/60">

                  {/* Informações gerais */}
                  <div className="px-4 py-3 space-y-2">
                    <div className="text-[10px] uppercase tracking-[0.1em] text-zinc-500 font-medium mb-2">
                      Informações gerais
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                      <div>
                        <div className="text-[10px] text-zinc-600">TÍTULO</div>
                        <div className="text-sm text-zinc-200 mt-0.5">{form.titulo}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-zinc-600">URGÊNCIA</div>
                        <div className={cn(
                          "text-sm mt-0.5 font-medium",
                          form.urgencia === "urgente" ? "text-red-400" : "text-zinc-400",
                        )}>
                          {form.urgencia === "urgente" ? "⚠ Urgente" : "Normal"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-zinc-600">UNIDADES</div>
                        <div className="text-sm text-zinc-200 mt-0.5">
                          {unidadesSel.map(u => u.nome).join(", ") || "—"}
                        </div>
                      </div>
                      {form.justificativa && (
                        <div className="col-span-2">
                          <div className="text-[10px] text-zinc-600">JUSTIFICATIVA</div>
                          <div className="text-sm text-zinc-300 mt-0.5">{form.justificativa}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Itens */}
                  <div className="px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.1em] text-zinc-500 font-medium mb-3">
                      Itens ({itensValidos.length})
                    </div>
                    <div className="space-y-2">
                      {itensValidos.map((item, idx) => (
                        <div key={item._key} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-500 text-[10px] font-mono flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <div>
                              <div className="text-sm text-zinc-200">{item.produto?.nome}</div>
                              {item.observacao && (
                                <div className="text-[11px] text-zinc-500">{item.observacao}</div>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-4">
                            <div className="font-mono text-sm text-zinc-300">
                              {item.quantidade} {item.produto?.unidade_med}
                            </div>
                            {item.produto?.preco_custo && (
                              <div className="text-[10px] text-zinc-600">
                                est. {formatBRL(item.produto.preco_custo * item.quantidade)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Sidebar resumo ────────────────────────────────────────────────── */}
          <div className="w-52 border-l border-zinc-800/80 px-4 py-5 shrink-0 flex flex-col gap-4">
            <div className="text-[10px] uppercase tracking-[0.1em] text-zinc-600 font-medium">
              Resumo
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-[10px] text-zinc-600">UNIDADES</div>
                <div className="text-sm font-semibold text-zinc-200 mt-0.5">
                  {form.unidade_ids.length}
                </div>
                {unidadesSel.length > 0 && (
                  <div className="text-[11px] text-zinc-500 mt-0.5 leading-tight">
                    {unidadesSel.map(u => u.nome).join(", ")}
                  </div>
                )}
              </div>

              <div>
                <div className="text-[10px] text-zinc-600">ITENS</div>
                <div className="text-sm font-semibold text-zinc-200 mt-0.5">
                  {itensValidos.length}
                </div>
              </div>

              {totalEstimado > 0 && (
                <div>
                  <div className="text-[10px] text-zinc-600">EST. TOTAL</div>
                  <div className="text-sm font-semibold text-emerald-400 mt-0.5 font-mono">
                    {formatBRL(totalEstimado)}
                  </div>
                  <div className="text-[10px] text-zinc-600 mt-0.5">
                    baseado no preço de custo
                  </div>
                </div>
              )}

              {form.urgencia === "urgente" && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-2.5">
                  <div className="flex items-center gap-1.5 text-red-400 text-[11px] font-medium">
                    <AlertTriangle size={11} />
                    Urgente
                  </div>
                  <p className="text-[10px] text-red-400/70 mt-0.5">
                    Cotação em até 6h
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Rodapé ────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800/80 shrink-0">
          <button
            type="button"
            onClick={handleClose}
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Cancelar
          </button>

          <div className="flex items-center gap-2">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(s => s - 1)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border border-zinc-700",
                  "bg-zinc-800/60 px-3.5 py-2 text-sm font-medium text-zinc-300",
                  "hover:bg-zinc-700/60 transition-colors",
                )}
              >
                <ChevronLeft size={14} />
                Voltar
              </button>
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border",
                  "border-emerald-700/60 bg-emerald-500/10 px-3.5 py-2",
                  "text-sm font-medium text-emerald-400",
                  "hover:bg-emerald-500/20 transition-colors",
                )}
              >
                Continuar
                <ChevronRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={pending}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border",
                  "border-emerald-700/60 bg-emerald-500/15 px-4 py-2",
                  "text-sm font-semibold text-emerald-400",
                  "hover:bg-emerald-500/25 transition-colors",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                {pending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Criando…
                  </>
                ) : (
                  <>
                    <ClipboardList size={14} />
                    Criar requisição
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
