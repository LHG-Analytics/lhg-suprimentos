"use client";

/**
 * nova-requisicao-modal.tsx — LHG-209
 * Wizard 3 passos para criar uma nova requisição.
 * Passo 1: Título + Unidades + Urgência
 * Passo 2: Itens (filtro por família via <select> + tabela com autocomplete)
 * Passo 3: Revisão + Confirmar
 *
 * Redesign: filtro de família virou <select> compacto (era flex-wrap de 30+ chips).
 * Tokens semânticos para suporte light/dark mode.
 */
import { useState, useTransition, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X, ChevronLeft, ChevronRight, Plus, Trash2, Search,
  AlertTriangle, Check, Loader2, ClipboardList, SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { criarRequisicao, listarCategoriasOmie, type CategoriaOmie } from "../actions";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Unidade  { id: string; nome: string; slug: string; cor_hex: string | null }
interface Produto  {
  id: string; codigo: string; nome: string;
  unidade_med: string; categoria: string;
  familia_omie: string | null; preco_custo: number | null;
}
interface ItemRow {
  _key:                string;
  tipo:                "catalogo" | "livre";
  // catalogo
  produto_id:          string;
  produto:             Produto | null;
  // livre
  produto_nome_livre:  string;
  produto_unidade_med: string;
  // comum
  quantidade:          number;
  observacao:          string;
}
interface FormState {
  titulo:        string;
  urgencia:      "normal" | "urgente";
  justificativa: string;
  unidade_ids:   string[];
  itens:         ItemRow[];
  codCateg:      string;   // código de categoria Omie
}

interface Props {
  open:             boolean;
  onClose:          () => void;
  unidades:         Unidade[];
  produtos:         Produto[];
  activeUnidadeId?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nanoId() { return Math.random().toString(36).slice(2, 10); }

function emptyItem(): ItemRow {
  return { _key: nanoId(), tipo: "catalogo", produto_id: "", produto: null, produto_nome_livre: "", produto_unidade_med: "UN", quantidade: 1, observacao: "" };
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
// O dropdown é renderizado via createPortal no document.body com position:fixed
// para escapar do overflow:hidden do modal pai.

function ProdutoCombobox({
  value, onChange, produtos, familiaFiltro,
}: {
  value:         Produto | null;
  onChange:      (p: Produto) => void;
  produtos:      Produto[];
  familiaFiltro: string;
}) {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState("");
  const [pos,   setPos]   = useState({ top: 0, left: 0, width: 0 });
  const triggerRef  = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora (trigger ou dropdown)
  useEffect(() => {
    function handler(e: MouseEvent) {
      const t = e.target as Node;
      if (
        triggerRef.current?.contains(t) ||
        dropdownRef.current?.contains(t)
      ) return;
      setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function openDropdown() {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({
        top:   rect.bottom + 4,
        left:  rect.left,
        width: Math.max(rect.width, 380),
      });
    }
    setOpen((v) => !v);
    setQuery("");
  }

  const filtered = produtos.filter((p) => {
    if (familiaFiltro && p.familia_omie !== familiaFiltro) return false;
    const q = query.toLowerCase();
    if (!q) return true;
    return (
      p.nome.toLowerCase().includes(q) ||
      p.codigo.toLowerCase().includes(q) ||
      (p.familia_omie?.toLowerCase().includes(q) ?? false) ||
      p.categoria.toLowerCase().includes(q)
    );
  }).slice(0, 30);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={openDropdown}
        className={cn(
          "w-full text-left px-2 py-1.5 rounded text-[12px] transition-colors",
          "border border-transparent hover:border-border",
          value ? "text-foreground" : "text-muted-foreground",
          open && "border-border bg-muted/30",
        )}
      >
        {value ? (
          <span className="truncate block">
            <span className="font-mono text-muted-foreground/70 mr-1.5">{value.codigo}</span>
            {value.nome}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Search size={11} />
            Selecionar produto…
          </span>
        )}
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
          className="rounded-lg border border-border bg-card shadow-2xl overflow-hidden"
        >
          {/* Busca */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <Search size={12} className="text-muted-foreground shrink-0" />
            <input
              autoFocus
              type="text"
              placeholder="Buscar por nome, código ou família…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground/50 outline-none"
            />
            {familiaFiltro && (
              <span className="text-[10px] bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/40 rounded px-1.5 py-0.5 shrink-0 truncate max-w-[110px]">
                {familiaFiltro}
              </span>
            )}
          </div>

          {/* Lista */}
          <ul className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-4 text-[12px] text-muted-foreground/50 text-center">
                Nenhum produto encontrado
              </li>
            ) : (
              filtered.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      // Previne o blur do input de busca antes do clique
                      e.preventDefault();
                    }}
                    onClick={() => { onChange(p); setOpen(false); }}
                    className={cn(
                      "w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors",
                      "flex items-center justify-between gap-2",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] text-foreground truncate">{p.nome}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-muted-foreground/70 font-mono">{p.codigo}</span>
                        {p.familia_omie && (
                          <span className="text-[10px] text-muted-foreground/50 truncate max-w-[140px]">
                            {p.familia_omie}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[10px] text-muted-foreground font-mono">{p.unidade_med}</div>
                      {p.preco_custo && (
                        <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                          {formatBRL(p.preco_custo)}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>

          {/* Rodapé com contagem */}
          <div className="px-3 py-1.5 border-t border-border/60 bg-muted/20">
            <span className="text-[10px] text-muted-foreground/60">
              {filtered.length} produto{filtered.length !== 1 ? "s" : ""}
              {filtered.length === 30 ? " (mostrando 30)" : ""}
            </span>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function NovaRequisicaoModal({ open, onClose, unidades, produtos, activeUnidadeId }: Props) {
  const [step, setStep]       = useState(1);
  const [pending, startTransition] = useTransition();
  const [errors,  setErrors]  = useState<Record<string, string>>({});
  const [familiaFiltro, setFamiliaFiltro] = useState("");

  const familiasDisponiveis = Array.from(
    new Set(produtos.map(p => p.familia_omie).filter(Boolean))
  ).sort() as string[];

  // Determina a pré-seleção de unidade: prioridade para unidade ativa do cookie,
  // fallback para única unidade disponível, senão vazio.
  function defaultUnidadeIds(): string[] {
    if (activeUnidadeId) {
      const match = unidades.find(u => u.id === activeUnidadeId);
      if (match) return [match.id];
    }
    return unidades.length === 1 ? [unidades[0].id] : [];
  }

  const [form, setForm] = useState<FormState>({
    titulo:        "",
    urgencia:      "normal",
    justificativa: "",
    unidade_ids:   defaultUnidadeIds(),
    itens:         [emptyItem()],
    codCateg:      "",
  });

  const [categorias,      setCategorias]      = useState<CategoriaOmie[]>([]);
  const [categQuery,      setCategQuery]      = useState("");
  const [categCarregando, setCategCarregando] = useState(false);

  // Recarrega categorias toda vez que o modal abre OU a unidade muda
  // (sem cache para garantir descrições corretas do Omie)
  useEffect(() => {
    if (!open) return;
    const unidadeId = form.unidade_ids[0] ?? unidades[0]?.id;
    if (!unidadeId) return;
    setCategorias([]);
    setCategCarregando(true);
    listarCategoriasOmie(unidadeId)
      .then(res => { if ("categorias" in res) setCategorias(res.categorias); })
      .catch(() => {})
      .finally(() => setCategCarregando(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.unidade_ids[0]]);

  function reset() {
    setStep(1);
    setErrors({});
    setFamiliaFiltro("");
    setForm({
      titulo:        "",
      urgencia:      "normal",
      justificativa: "",
      unidade_ids:   defaultUnidadeIds(),
      itens:         [emptyItem()],
      codCateg:      "",
    });
    setCategorias([]);
    setCategQuery("");
  }

  function handleClose() { reset(); onClose(); }

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
    const itensValidos = form.itens.filter(i =>
      i.tipo === "catalogo" ? !!i.produto_id : !!i.produto_nome_livre
    );
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

  function addItem()    { setForm(f => ({ ...f, itens: [...f.itens, emptyItem()] })); }
  function removeItem(key: string) {
    setForm(f => ({ ...f, itens: f.itens.filter(i => i._key !== key) }));
  }
  function updateItem(key: string, patch: Partial<ItemRow>) {
    setForm(f => ({
      ...f,
      itens: f.itens.map(i => i._key === key ? { ...i, ...patch } : i),
    }));
  }

  function handleSubmit() {
    const itensValidos = form.itens.filter(i =>
      i.tipo === "catalogo" ? !!i.produto_id : !!i.produto_nome_livre
    );
    startTransition(async () => {
      try {
        const result = await criarRequisicao({
          titulo:        form.titulo.trim(),
          urgencia:      form.urgencia,
          justificativa: form.justificativa.trim() || undefined,
          unidade_ids:   form.unidade_ids,
          codCateg:      form.codCateg || undefined,
          itens: itensValidos.map(i =>
            i.tipo === "catalogo"
              ? { tipo: "catalogo" as const, produto_id: i.produto_id, quantidade: i.quantidade, observacao: i.observacao.trim() || undefined }
              : { tipo: "livre" as const, produto_nome_livre: i.produto_nome_livre, produto_unidade_med: i.produto_unidade_med, quantidade: i.quantidade, observacao: i.observacao.trim() || undefined }
          ),
        });
        toast.success(`Requisição ${result.numero} criada`, {
          description: `${itensValidos.length} item${itensValidos.length !== 1 ? "s" : ""} adicionado${itensValidos.length !== 1 ? "s" : ""}`,
        });
        if (result.omieOk) {
          toast.success("Enviada ao Omie ✓", { description: `Requisição registrada no Omie`, duration: 5_000 });
        } else if (result.omieAviso) {
          toast.warning("Atenção: Omie", { description: result.omieAviso, duration: 15_000 });
        }
        handleClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao criar requisição");
      }
    });
  }

  const itensValidos  = form.itens.filter(i =>
    i.tipo === "catalogo" ? !!i.produto_id : !!i.produto_nome_livre
  );
  const totalEstimado = estimarTotal(itensValidos);
  const unidadesSel   = unidades.filter(u => form.unidade_ids.includes(u.id));

  // Contagem de produtos na família selecionada
  const produtosFiltrados = familiaFiltro
    ? produtos.filter(p => p.familia_omie === familiaFiltro)
    : produtos;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[8vh] px-4" aria-modal="true" role="dialog">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      {/* Dialog */}
      <div className={cn(
        "relative w-full max-w-[780px] rounded-xl border border-border",
        "bg-card shadow-2xl overflow-hidden",
        "flex flex-col max-h-[88vh]",
      )}>

        {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-semibold text-foreground">Nova requisição</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Passo {step} de 3 · {STEP_LABELS[step - 1]}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Indicador de step ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-0 px-6 py-3 border-b border-border/60 shrink-0">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-0">
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors",
                s < step
                  ? "bg-lhg-500 text-white"
                  : s === step
                    ? "bg-muted text-foreground ring-1 ring-border"
                    : "bg-muted/60 text-muted-foreground/50",
              )}>
                {s < step ? <Check size={11} /> : s}
              </div>
              {s < 3 && (
                <div className={cn(
                  "w-16 h-px mx-1",
                  s < step ? "bg-lhg-500/40" : "bg-border",
                )} />
              )}
            </div>
          ))}
        </div>

        {/* ── Conteúdo + Sidebar ────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row flex-1 overflow-hidden">

          {/* Conteúdo principal */}
          <div className="flex-1 overflow-y-auto px-6 py-5">

            {/* ── PASSO 1 ─────────────────────────────────────────────────── */}
            {step === 1 && (
              <div className="space-y-5">

                {/* Título */}
                <div>
                  <label className="block text-[11px] uppercase tracking-[0.1em] text-muted-foreground mb-1.5 font-medium">
                    Título da requisição *
                  </label>
                  <input
                    autoFocus
                    type="text"
                    placeholder="Ex: Amenities — Lush Ipiranga — Junho"
                    value={form.titulo}
                    onChange={(e) => setForm(f => ({ ...f, titulo: e.target.value }))}
                    className={cn(
                      "w-full rounded-lg border bg-background px-4 py-2.5",
                      "text-sm text-foreground placeholder:text-muted-foreground/50",
                      "focus:outline-none focus:ring-1 focus:ring-ring transition-colors",
                      errors.titulo
                        ? "border-red-500/50 focus:border-red-500"
                        : "border-border",
                    )}
                  />
                  {errors.titulo && (
                    <p className="mt-1 text-[11px] text-red-500">{errors.titulo}</p>
                  )}
                </div>

                {/* Unidades */}
                <div>
                  <label className="block text-[11px] uppercase tracking-[0.1em] text-muted-foreground mb-1.5 font-medium">
                    Unidades *
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {unidades.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const all = unidades.map(u => u.id);
                          const isAllSelected = all.every(id => form.unidade_ids.includes(id));
                          setForm(f => ({ ...f, unidade_ids: isAllSelected ? [] : all }));
                        }}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
                          unidades.every(u => form.unidade_ids.includes(u.id))
                            ? "border-lhg-500/60 bg-lhg-500/10 text-lhg-600 dark:text-lhg-400"
                            : "border-border bg-muted/40 text-muted-foreground hover:border-border/80",
                        )}
                      >
                        {unidades.every(u => form.unidade_ids.includes(u.id)) && <Check size={10} />}
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
                              ? "border-lhg-500/60 bg-lhg-500/10 text-lhg-600 dark:text-lhg-400"
                              : "border-border bg-muted/40 text-muted-foreground hover:border-border/80",
                          )}
                        >
                          {sel && <Check size={10} />}
                          {u.nome}
                        </button>
                      );
                    })}
                  </div>
                  {errors.unidades && (
                    <p className="mt-1 text-[11px] text-red-500">{errors.unidades}</p>
                  )}
                </div>

                {/* Urgência */}
                <div>
                  <label className="block text-[11px] uppercase tracking-[0.1em] text-muted-foreground mb-1.5 font-medium">
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
                              ? "border-red-500/40 bg-red-500/8"
                              : "border-lhg-500/40 bg-lhg-500/8"
                            : "border-border bg-muted/30 hover:border-border/80",
                        )}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {u === "urgente" && (
                            <AlertTriangle size={13} className="text-red-500" />
                          )}
                          <span className={cn(
                            "text-sm font-semibold",
                            form.urgencia === u
                              ? u === "urgente" ? "text-red-600 dark:text-red-400" : "text-lhg-600 dark:text-lhg-400"
                              : "text-muted-foreground",
                          )}>
                            {u === "normal" ? "Normal" : "Urgente"}
                          </span>
                          {form.urgencia === u && (
                            <Check size={12} className={cn("ml-auto", u === "urgente" ? "text-red-500" : "text-lhg-500")} />
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {u === "normal"
                            ? "Cotação em até 48h"
                            : "Cotação em até 6h · notifica gerência"}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Categoria Omie */}
                <div>
                  <label className="block text-[11px] uppercase tracking-[0.1em] text-muted-foreground mb-1.5 font-medium">
                    Categoria Omie <span className="normal-case text-muted-foreground/60">(para onde vai o custo)</span>
                  </label>
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
                    <input
                      type="text"
                      placeholder={categCarregando ? "Carregando categorias…" : "Buscar ou selecionar categoria (ex: Alimentos)"}
                      value={categQuery || (form.codCateg ? `${form.codCateg} — ${categorias.find(c => c.codigo === form.codCateg)?.descricao ?? ""}` : "")}
                      onChange={e => { setCategQuery(e.target.value); setForm(f => ({ ...f, codCateg: "" })); }}
                      disabled={categCarregando}
                      className={cn(
                        "w-full rounded-lg border border-border bg-background pl-8 pr-4 py-2.5",
                        "text-sm text-foreground placeholder:text-muted-foreground/50",
                        "focus:outline-none focus:ring-1 focus:ring-ring transition-colors",
                      )}
                    />
                    {categCarregando && <Loader2 size={12} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
                    {/* Dropdown de categorias filtradas */}
                    {categQuery && !form.codCateg && categorias.length > 0 && (() => {
                      const ql = categQuery.toLowerCase();
                      const filtradas = categorias.filter(c =>
                        c.descricao.toLowerCase().includes(ql) || c.codigo.includes(categQuery)
                      ).slice(0, 8);
                      if (!filtradas.length) return null;
                      return (
                        <div className="absolute z-50 top-full mt-1 w-full rounded-lg border border-border bg-card shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                          {filtradas.map(c => (
                            <button
                              key={c.codigo}
                              type="button"
                              onClick={() => {
                                setForm(f => ({ ...f, codCateg: c.codigo }));
                                setCategQuery("");
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors border-b border-border/40 last:border-0"
                            >
                              <span className="text-xs font-mono text-lhg-400">{c.codigo}</span>
                              <span className="text-xs text-foreground/80 ml-2">{c.descricao}</span>
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  {form.codCateg ? (
                    <p className="text-[11px] text-emerald-400 mt-1">
                      ✓ {form.codCateg} — {categorias.find(c => c.codigo === form.codCateg)?.descricao}
                    </p>
                  ) : (
                    <p className="text-[11px] text-amber-400/80 mt-1">
                      ⚠ Nenhuma categoria selecionada — será usada a categoria padrão da unidade. Busque e clique em uma categoria para selecionar.
                    </p>
                  )}
                </div>

                {/* Justificativa */}
                <div>
                  <label className="block text-[11px] uppercase tracking-[0.1em] text-muted-foreground mb-1.5 font-medium">
                    Justificativa <span className="normal-case text-muted-foreground/60">(opcional)</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Descreva o motivo da requisição…"
                    value={form.justificativa}
                    onChange={(e) => setForm(f => ({ ...f, justificativa: e.target.value }))}
                    className={cn(
                      "w-full rounded-lg border border-border bg-background px-4 py-2.5",
                      "text-sm text-foreground placeholder:text-muted-foreground/50 resize-none",
                      "focus:outline-none focus:ring-1 focus:ring-ring transition-colors",
                    )}
                  />
                </div>
              </div>
            )}

            {/* ── PASSO 2 ─────────────────────────────────────────────────── */}
            {step === 2 && (
              <div className="space-y-3">

                {/* Barra de filtro compacta */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal size={13} className="text-muted-foreground shrink-0" />
                    <span className="text-[11px] font-medium text-muted-foreground">Família</span>
                    <select
                      value={familiaFiltro}
                      onChange={(e) => setFamiliaFiltro(e.target.value)}
                      className={cn(
                        "h-7 rounded-md border border-border bg-background",
                        "text-[12px] text-foreground px-2 pr-6",
                        "focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer",
                        "max-w-[200px]",
                      )}
                    >
                      <option value="">Todas as famílias ({produtos.length})</option>
                      {familiasDisponiveis.map(f => {
                        const count = produtos.filter(p => p.familia_omie === f).length;
                        return <option key={f} value={f}>{f} ({count})</option>;
                      })}
                    </select>
                  </div>

                  {familiaFiltro && (
                    <button
                      type="button"
                      onClick={() => setFamiliaFiltro("")}
                      className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X size={10} />
                      Limpar filtro
                    </button>
                  )}

                  <span className="ml-auto text-[11px] text-muted-foreground/60">
                    {produtosFiltrados.length} produto{produtosFiltrados.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Tabela de itens — grid de 7 colunas: tipo | produto | qtd | unid | custo | obs | del */}
                <div className="rounded-lg border border-border overflow-hidden">

                  {/* Header */}
                  <div className="hidden sm:grid grid-cols-[48px_1fr_60px_52px_88px_1fr_28px] gap-x-3 px-3 py-2 border-b border-border/80 bg-muted/50">
                    {["TIPO", "PRODUTO", "QTD", "UNID.", "ÚLT. CUSTO", "OBSERVAÇÃO", ""].map(h => (
                      <div key={h} className={cn(
                        "text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60 font-semibold",
                        h === "QTD" && "text-center",
                        h === "UNID." && "text-center",
                        h === "ÚLT. CUSTO" && "text-right",
                      )}>
                        {h}
                      </div>
                    ))}
                  </div>

                  {/* Linhas */}
                  {form.itens.map((item, rowIdx) => (
                    <div key={item._key} className={cn(
                      "border-b border-border/30 last:border-0 transition-colors hover:bg-muted/[0.07]",
                    )}>

                      {/* ── Mobile ── */}
                      <div className="sm:hidden px-3 py-2.5 space-y-2">
                        <div className="flex items-center gap-2">
                          {/* Toggle mobile */}
                          <button
                            type="button"
                            onClick={() => item.tipo === "catalogo"
                              ? updateItem(item._key, { tipo: "livre" as const, produto_id: "", produto: null })
                              : updateItem(item._key, { tipo: "catalogo" as const, produto_nome_livre: "" })
                            }
                            className={cn(
                              "shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider transition-colors border",
                              item.tipo === "catalogo"
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                                : "border-amber-500/40 bg-amber-500/10 text-amber-400",
                            )}
                          >
                            {item.tipo === "catalogo" ? "Cat" : "Livre"}
                          </button>
                          {item.tipo === "catalogo" ? (
                            <div className="flex-1 min-w-0">
                              <ProdutoCombobox value={item.produto} onChange={(p) => updateItem(item._key, { produto_id: p.id, produto: p })} produtos={produtos} familiaFiltro={familiaFiltro} />
                            </div>
                          ) : (
                            <input type="text" placeholder="Descreva o produto..." value={item.produto_nome_livre} onChange={(e) => updateItem(item._key, { produto_nome_livre: e.target.value })} className="flex-1 h-8 px-2.5 rounded-md bg-background border border-amber-500/30 text-foreground text-[12px] focus:outline-none focus:border-amber-500 placeholder:text-muted-foreground/40" />
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="number" min={1} value={item.quantidade} onChange={(e) => updateItem(item._key, { quantidade: Math.max(1, Number(e.target.value)) })} className="w-16 h-8 rounded-md border border-border bg-transparent px-2 text-[12px] text-foreground font-mono text-center focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                          {item.tipo === "livre" ? (
                            <select value={item.produto_unidade_med} onChange={(e) => updateItem(item._key, { produto_unidade_med: e.target.value })} className="w-20 h-8 px-2 rounded-md bg-background border border-amber-500/30 text-foreground text-[11px] focus:outline-none">
                              {["UN","KG","LT","CX","PC","MT","GL","SC","FR","PR"].map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          ) : (
                            <span className="text-[11px] font-mono text-muted-foreground uppercase">{item.produto?.unidade_med ?? "—"}</span>
                          )}
                          {item.tipo === "catalogo" && item.produto?.preco_custo && (
                            <span className="text-[11px] font-mono text-emerald-400 ml-auto">{formatBRL(item.produto.preco_custo)}</span>
                          )}
                          <input type="text" placeholder="obs." value={item.observacao} onChange={(e) => updateItem(item._key, { observacao: e.target.value })} className="flex-1 min-w-0 rounded border border-transparent bg-transparent px-2 py-1 text-[12px] placeholder:text-muted-foreground/40 focus:outline-none focus:border-border hover:border-border transition-colors" />
                          <button type="button" onClick={() => form.itens.length > 1 && removeItem(item._key)} disabled={form.itens.length === 1} className={cn("p-1 rounded transition-colors shrink-0", form.itens.length === 1 ? "text-muted-foreground/20 cursor-not-allowed" : "text-muted-foreground/40 hover:text-red-500 hover:bg-red-500/10")}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* ── Desktop — 7 colunas alinhadas com o header ── */}
                      <div className="hidden sm:grid grid-cols-[48px_1fr_60px_52px_88px_1fr_28px] gap-x-3 px-3 py-1.5 items-center">

                        {/* Col 1 — TIPO: pill toggle */}
                        <div className="flex justify-center">
                          <button
                            type="button"
                            title={item.tipo === "catalogo" ? "Catálogo — clique para Texto livre" : "Texto livre — clique para Catálogo"}
                            onClick={() => item.tipo === "catalogo"
                              ? updateItem(item._key, { tipo: "livre" as const, produto_id: "", produto: null })
                              : updateItem(item._key, { tipo: "catalogo" as const, produto_nome_livre: "" })
                            }
                            className={cn(
                              "w-full py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border transition-all",
                              item.tipo === "catalogo"
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                                : "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20",
                            )}
                          >
                            {item.tipo === "catalogo" ? "Cat" : "Livre"}
                          </button>
                        </div>

                        {/* Col 2 — PRODUTO */}
                        {item.tipo === "catalogo" ? (
                          <ProdutoCombobox
                            value={item.produto}
                            onChange={(p) => updateItem(item._key, { produto_id: p.id, produto: p })}
                            produtos={produtos}
                            familiaFiltro={familiaFiltro}
                          />
                        ) : (
                          <input
                            type="text"
                            placeholder="Descreva o produto..."
                            value={item.produto_nome_livre}
                            onChange={(e) => updateItem(item._key, { produto_nome_livre: e.target.value })}
                            className="w-full h-7 px-2.5 rounded-md bg-background border border-amber-500/30 text-foreground text-[12px] focus:outline-none focus:border-amber-500 placeholder:text-muted-foreground/40"
                          />
                        )}

                        {/* Col 3 — QTD */}
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={item.quantidade}
                          onChange={(e) => updateItem(item._key, { quantidade: Math.max(1, Number(e.target.value)) })}
                          className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-[12px] text-foreground font-mono text-center focus:outline-none focus:border-border hover:border-border transition-colors [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                        />

                        {/* Col 4 — UNID. */}
                        <div className="flex items-center justify-center">
                          {item.tipo === "catalogo" ? (
                            <span className="text-[11px] font-mono text-muted-foreground uppercase tabular-nums">
                              {item.produto?.unidade_med ?? "—"}
                            </span>
                          ) : (
                            <select
                              value={item.produto_unidade_med}
                              onChange={(e) => updateItem(item._key, { produto_unidade_med: e.target.value })}
                              className="w-full h-7 px-1 rounded-md bg-background border border-amber-500/30 text-foreground text-[11px] focus:outline-none focus:border-amber-500"
                            >
                              {["UN","KG","LT","CX","PC","MT","GL","SC","FR","PR"].map(u => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                            </select>
                          )}
                        </div>

                        {/* Col 5 — ÚLT. CUSTO */}
                        <div className="flex items-center justify-end">
                          {item.tipo === "catalogo" && item.produto?.preco_custo ? (
                            <span className="text-[11px] font-mono text-emerald-400 tabular-nums">
                              {formatBRL(item.produto.preco_custo)}
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground/25 select-none">—</span>
                          )}
                        </div>

                        {/* Col 6 — OBSERVAÇÃO */}
                        <input
                          type="text"
                          placeholder="(opcional)"
                          value={item.observacao}
                          onChange={(e) => updateItem(item._key, { observacao: e.target.value })}
                          className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-[12px] text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-border hover:border-border transition-colors"
                        />

                        {/* Col 7 — DELETE */}
                        <button
                          type="button"
                          onClick={() => form.itens.length > 1 && removeItem(item._key)}
                          disabled={form.itens.length === 1}
                          className={cn(
                            "flex items-center justify-center rounded-md p-1 transition-colors",
                            form.itens.length === 1
                              ? "text-muted-foreground/20 cursor-not-allowed"
                              : "text-muted-foreground/40 hover:text-red-500 hover:bg-red-500/10",
                          )}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Botão adicionar item */}
                  <div className="px-3 py-2">
                    <button
                      type="button"
                      onClick={addItem}
                      className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-lhg-600 dark:hover:text-lhg-400 transition-colors"
                    >
                      <Plus size={12} />
                      Adicionar item
                    </button>
                  </div>
                </div>

                {errors.itens && (
                  <p className="text-[11px] text-red-500">{errors.itens}</p>
                )}
              </div>
            )}

            {/* ── PASSO 3 ─────────────────────────────────────────────────── */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-muted/20 divide-y divide-border/60">

                  {/* Informações gerais */}
                  <div className="px-4 py-3 space-y-2">
                    <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-medium mb-2">
                      Informações gerais
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                      <div>
                        <div className="text-[10px] text-muted-foreground/70">TÍTULO</div>
                        <div className="text-sm text-foreground mt-0.5">{form.titulo}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground/70">URGÊNCIA</div>
                        <div className={cn(
                          "text-sm mt-0.5 font-medium",
                          form.urgencia === "urgente" ? "text-red-500" : "text-muted-foreground",
                        )}>
                          {form.urgencia === "urgente" ? "⚠ Urgente" : "Normal"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground/70">UNIDADES</div>
                        <div className="text-sm text-foreground mt-0.5">
                          {unidadesSel.map(u => u.nome).join(", ") || "—"}
                        </div>
                      </div>
                      {form.justificativa && (
                        <div className="col-span-2">
                          <div className="text-[10px] text-muted-foreground/70">JUSTIFICATIVA</div>
                          <div className="text-sm text-foreground/80 mt-0.5">{form.justificativa}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Itens */}
                  <div className="px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-medium mb-3">
                      Itens ({itensValidos.length})
                    </div>
                    <div className="space-y-2">
                      {itensValidos.map((item, idx) => (
                        <div key={item._key} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="w-5 h-5 rounded-full bg-muted text-muted-foreground text-[10px] font-mono flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm text-foreground">
                                  {item.tipo === "catalogo" ? item.produto?.nome : item.produto_nome_livre}
                                </span>
                                {item.tipo === "livre" && (
                                  <span className="text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/25 rounded px-1 py-0.5">
                                    livre
                                  </span>
                                )}
                              </div>
                              {item.observacao && (
                                <div className="text-[11px] text-muted-foreground">{item.observacao}</div>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-4">
                            <div className="font-mono text-sm text-foreground">
                              {item.quantidade} {item.tipo === "catalogo" ? item.produto?.unidade_med : item.produto_unidade_med}
                            </div>
                            {item.tipo === "catalogo" && item.produto?.preco_custo && (
                              <div className="text-[10px] text-muted-foreground/70">
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
          <div className="sm:w-52 w-full border-t sm:border-t-0 sm:border-l border-border px-4 py-3 sm:py-5 shrink-0 flex flex-row sm:flex-col gap-6 sm:gap-4 bg-muted/20 overflow-x-auto sm:overflow-x-visible">
            <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-medium">
              Resumo
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-[10px] text-muted-foreground/70">UNIDADES</div>
                <div className="text-sm font-semibold text-foreground mt-0.5">
                  {form.unidade_ids.length}
                </div>
                {unidadesSel.length > 0 && (
                  <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                    {unidadesSel.map(u => u.nome).join(", ")}
                  </div>
                )}
              </div>

              <div>
                <div className="text-[10px] text-muted-foreground/70">ITENS</div>
                <div className="text-sm font-semibold text-foreground mt-0.5">
                  {itensValidos.length}
                </div>
              </div>

              {totalEstimado > 0 && (
                <div>
                  <div className="text-[10px] text-muted-foreground/70">EST. TOTAL</div>
                  <div className="text-sm font-semibold text-lhg-600 dark:text-lhg-400 mt-0.5 font-mono">
                    {formatBRL(totalEstimado)}
                  </div>
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                    baseado no preço de custo
                  </div>
                </div>
              )}

              {form.urgencia === "urgente" && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/8 p-2.5">
                  <div className="flex items-center gap-1.5 text-red-500 text-[11px] font-medium">
                    <AlertTriangle size={11} />
                    Urgente
                  </div>
                  <p className="text-[10px] text-red-500/70 mt-0.5">
                    Cotação em até 6h
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Rodapé ────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
          <button
            type="button"
            onClick={handleClose}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancelar
          </button>

          <div className="flex items-center gap-2">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(s => s - 1)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border border-border",
                  "bg-muted/40 px-3.5 py-2 text-sm font-medium text-foreground",
                  "hover:bg-muted/60 transition-colors",
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
                  "inline-flex items-center gap-1.5 rounded-lg",
                  "bg-lhg-500 hover:bg-lhg-600 px-3.5 py-2",
                  "text-sm font-medium text-white",
                  "transition-colors",
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
                  "inline-flex items-center gap-2 rounded-lg",
                  "bg-lhg-500 hover:bg-lhg-600 px-4 py-2",
                  "text-sm font-semibold text-white",
                  "transition-colors",
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
