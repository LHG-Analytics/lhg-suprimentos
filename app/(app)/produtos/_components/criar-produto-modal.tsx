"use client";

/**
 * criar-produto-modal.tsx
 * Modal para criação de produto — NCM obrigatório, cria no Omie PRIMEIRO.
 */
import { useState, useTransition } from "react";
import { Loader2, Package, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { criarProduto } from "../actions";

interface Unidade { id: string; nome: string }

interface CriarProdutoModalProps {
  open:      boolean;
  onClose:   () => void;
  onCreated: () => void;
  unidades:  Unidade[];
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-[0.1em] text-muted-foreground mb-1.5 font-medium">
        {label} {required && <span className="text-red-400 normal-case">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[10px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-border bg-muted/60 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none transition-colors";

const UNIDADES_MED = ["UN", "KG", "LT", "CX", "PC", "MT", "M2", "GL", "DZ"];
const FAMILIAS_OMIE = [
  "Alimentos e Bebidas", "Produtos de Limpeza", "Amenidades",
  "Material de Escritório", "Equipamentos", "Utensílios", "Outros",
];

export function CriarProdutoModal({ open, onClose, onCreated, unidades }: CriarProdutoModalProps) {
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    nome: "", descricao: "", unidade: "UN", ncm: "",
    valor_unitario: "", familia_omie: "Outros", codigo: "",
    unidade_id: unidades[0]?.id ?? "",
  });

  function set(k: keyof typeof form, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function handleSubmit() {
    const valorNum = parseFloat(form.valor_unitario.replace(",", "."));
    if (isNaN(valorNum) || valorNum <= 0) {
      toast.error("Informe um valor unitário válido");
      return;
    }
    start(async () => {
      const res = await criarProduto({
        nome:           form.nome,
        descricao:      form.descricao || undefined,
        unidade:        form.unidade,
        ncm:            form.ncm,
        valor_unitario: valorNum,
        familia_omie:   form.familia_omie,
        codigo:         form.codigo || undefined,
        unidade_id:     form.unidade_id,
      });
      if ("erro" in res) {
        toast.error(res.erro);
      } else {
        toast.success("Produto criado e sincronizado com o Omie!");
        onCreated();
        onClose();
        setForm({ nome: "", descricao: "", unidade: "UN", ncm: "", valor_unitario: "", familia_omie: "Outros", codigo: "", unidade_id: unidades[0]?.id ?? "" });
      }
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[5vh] px-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl border border-border bg-background shadow-2xl overflow-hidden mb-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/80">
          <h2 className="text-base font-semibold text-foreground">Novo Produto</h2>
          <button onClick={onClose} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <Field label="Unidade Omie" required>
            <select value={form.unidade_id} onChange={e => set("unidade_id", e.target.value)} className={cn(inputCls, "appearance-none cursor-pointer")}>
              {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Nome do Produto" required>
                <input type="text" value={form.nome} onChange={e => set("nome", e.target.value)} className={inputCls} placeholder="Ex: Shampoo 300ml" />
              </Field>
            </div>

            <Field label="NCM" required hint="8 dígitos — ex: 33051000">
              <input type="text" value={form.ncm} onChange={e => set("ncm", e.target.value)} className={inputCls} placeholder="33051000" maxLength={10} />
            </Field>
            <Field label="Unidade de Medida" required>
              <select value={form.unidade} onChange={e => set("unidade", e.target.value)} className={cn(inputCls, "appearance-none cursor-pointer")}>
                {UNIDADES_MED.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>

            <Field label="Valor Unitário (R$)" required>
              <input type="text" value={form.valor_unitario} onChange={e => set("valor_unitario", e.target.value)} className={inputCls} placeholder="0,00" />
            </Field>
            <Field label="Código Interno">
              <input type="text" value={form.codigo} onChange={e => set("codigo", e.target.value)} className={inputCls} placeholder="Ex: SHAM001" />
            </Field>

            <div className="col-span-2">
              <Field label="Família Omie" required>
                <select value={form.familia_omie} onChange={e => set("familia_omie", e.target.value)} className={cn(inputCls, "appearance-none cursor-pointer")}>
                  {FAMILIAS_OMIE.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </Field>
            </div>
          </div>

          <div className="rounded-lg bg-amber-500/5 border border-amber-500/15 px-3 py-2">
            <p className="text-[11px] text-amber-400/80">
              NCM é obrigatório pelo Omie. O produto será criado primeiro no Omie e depois salvo no sistema.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border/60">
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground/80 px-3 py-2 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={pending}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-4 py-2",
              "border-emerald-700/60 bg-emerald-500/10 text-sm font-medium text-emerald-400",
              "hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Package size={14} />}
            {pending ? "Criando no Omie…" : "Criar Produto"}
          </button>
        </div>
      </div>
    </div>
  );
}
