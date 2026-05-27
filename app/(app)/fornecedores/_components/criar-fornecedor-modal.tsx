"use client";

/**
 * criar-fornecedor-modal.tsx
 * Modal para criação de fornecedor — cria no Omie PRIMEIRO, depois no Supabase.
 */
import { useState, useTransition } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { criarFornecedor } from "../actions";

interface Unidade { id: string; nome: string }

interface CriarFornecedorModalProps {
  open:      boolean;
  onClose:   () => void;
  onCreated: () => void;
  unidades:  Unidade[];
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-[0.1em] text-muted-foreground mb-1.5 font-medium">
        {label} {required && <span className="text-red-400 normal-case">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-border bg-muted/60 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none transition-colors";

export function CriarFornecedorModal({ open, onClose, onCreated, unidades }: CriarFornecedorModalProps) {
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    razao_social: "", cnpj_cpf: "", nome_fantasia: "",
    email: "", telefone: "", contato: "",
    endereco: "", cep: "", cidade: "", uf: "",
    unidade_id: unidades[0]?.id ?? "",
  });

  function set(k: keyof typeof form, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function handleSubmit() {
    start(async () => {
      const res = await criarFornecedor({ ...form });
      if ("erro" in res) {
        toast.error(res.erro);
      } else {
        toast.success("Fornecedor criado e sincronizado com o Omie!");
        onCreated();
        onClose();
        setForm({
          razao_social: "", cnpj_cpf: "", nome_fantasia: "",
          email: "", telefone: "", contato: "",
          endereco: "", cep: "", cidade: "", uf: "",
          unidade_id: unidades[0]?.id ?? "",
        });
      }
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[5vh] px-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl border border-border bg-background shadow-2xl overflow-hidden mb-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/80">
          <h2 className="text-base font-semibold text-foreground">Novo Fornecedor</h2>
          <button onClick={onClose} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <Field label="Unidade Omie" required>
            <select
              value={form.unidade_id}
              onChange={e => set("unidade_id", e.target.value)}
              className={cn(inputCls, "appearance-none cursor-pointer")}
            >
              {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Razão Social" required>
                <input type="text" value={form.razao_social} onChange={e => set("razao_social", e.target.value)} className={inputCls} placeholder="Ex: NSA Distribuidora Ltda" />
              </Field>
            </div>
            <Field label="Nome Fantasia" required>
              <input type="text" value={form.nome_fantasia} onChange={e => set("nome_fantasia", e.target.value)} className={inputCls} placeholder="Ex: NSA" />
            </Field>
            <Field label="CNPJ/CPF" required>
              <input type="text" value={form.cnpj_cpf} onChange={e => set("cnpj_cpf", e.target.value)} className={inputCls} placeholder="00.000.000/0000-00" />
            </Field>
            <Field label="E-mail">
              <input type="email" value={form.email} onChange={e => set("email", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Telefone">
              <input type="text" value={form.telefone} onChange={e => set("telefone", e.target.value)} className={inputCls} placeholder="(11) 9 0000-0000" />
            </Field>
            <div className="col-span-2">
              <Field label="Contato">
                <input type="text" value={form.contato} onChange={e => set("contato", e.target.value)} className={inputCls} placeholder="Nome do contato" />
              </Field>
            </div>
            <div className="col-span-2">
              <Field label="Endereço">
                <input type="text" value={form.endereco} onChange={e => set("endereco", e.target.value)} className={inputCls} />
              </Field>
            </div>
            <Field label="CEP">
              <input type="text" value={form.cep} onChange={e => set("cep", e.target.value)} className={inputCls} placeholder="00000-000" />
            </Field>
            <Field label="UF">
              <input type="text" value={form.uf} onChange={e => set("uf", e.target.value)} className={inputCls} maxLength={2} placeholder="SP" />
            </Field>
            <div className="col-span-2">
              <Field label="Cidade">
                <input type="text" value={form.cidade} onChange={e => set("cidade", e.target.value)} className={inputCls} />
              </Field>
            </div>
          </div>

          <div className="rounded-lg bg-amber-500/5 border border-amber-500/15 px-3 py-2">
            <p className="text-[11px] text-amber-400/80">
              O fornecedor será criado primeiro no Omie e depois salvo no sistema. Se o Omie falhar, nenhum dado será salvo.
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
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {pending ? "Criando no Omie…" : "Criar Fornecedor"}
          </button>
        </div>
      </div>
    </div>
  );
}
