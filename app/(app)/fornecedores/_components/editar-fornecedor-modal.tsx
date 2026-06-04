"use client";

/**
 * editar-fornecedor-modal.tsx — LHG-230
 * Modal de edição de fornecedor com sync ao Omie (AlterarCliente).
 */

import { useState, useTransition } from "react";
import { X, Loader2, AlertTriangle, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { editarFornecedor } from "../actions";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface FornecedorRow {
  id:           string;
  cnpj:         string;
  razao_social:  string;
  nome_fantasia: string | null;
  email:         string | null;
  telefone:      string | null;
  contato:       string | null;
  endereco:      string | null;
  cep:           string | null;
  cidade:        string | null;
  uf:            string | null;
  omie_codigo:   string | null;
}

interface EditarFornecedorModalProps {
  fornecedor: FornecedorRow | null;  // null = fechado
  onClose:    () => void;
}

// ── Estados brasileiros ───────────────────────────────────────────────────────

const UFS = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA",
  "MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN",
  "RO","RR","RS","SC","SE","SP","TO",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCnpj(v: string) {
  const n = v.replace(/\D/g, "");
  if (n.length === 14)
    return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (n.length === 11)
    return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return v;
}

// ── Sub-componente: campo de formulário ───────────────────────────────────────

function Field({
  label, value, onChange, disabled, type = "text", placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "w-full rounded-lg border border-border bg-muted/60 px-3 py-2",
          "text-sm text-foreground placeholder:text-muted-foreground/40",
          "focus:outline-none focus:border-border focus:ring-1 focus:ring-border/40 transition-colors",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      />
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────

export function EditarFornecedorModal({ fornecedor, onClose }: EditarFornecedorModalProps) {
  const [razaoSocial,  setRazaoSocial]  = useState(fornecedor?.razao_social ?? "");
  const [nomeFantasia, setNomeFantasia] = useState(fornecedor?.nome_fantasia ?? "");
  const [email,        setEmail]        = useState(fornecedor?.email ?? "");
  const [telefone,     setTelefone]     = useState(fornecedor?.telefone ?? "");
  const [contato,      setContato]      = useState(fornecedor?.contato ?? "");
  const [endereco,     setEndereco]     = useState(fornecedor?.endereco ?? "");
  const [cep,          setCep]          = useState(fornecedor?.cep ?? "");
  const [cidade,       setCidade]       = useState(fornecedor?.cidade ?? "");
  const [uf,           setUf]           = useState(fornecedor?.uf ?? "");
  const [erro,         setErro]         = useState<string | null>(null);
  const [isPending,    startTransition]  = useTransition();

  if (!fornecedor) return null;

  const semOmie  = !fornecedor.omie_codigo;
  const disabled = isPending; // edição local sempre permitida; Omie só sincroniza se tiver código

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;
    setErro(null);

    if (!razaoSocial.trim()) { setErro("Razão social é obrigatória"); return; }

    startTransition(async () => {
      // fornecedor é garantidamente não-nulo aqui (guard no topo do componente)
      const res = await editarFornecedor(fornecedor!.id, {
        razao_social:  razaoSocial.trim(),
        nome_fantasia: nomeFantasia.trim(),
        email:         email.trim(),
        telefone:      telefone.trim(),
        contato:       contato.trim(),
        endereco:      endereco.trim(),
        cep:           cep.trim(),
        cidade:        cidade.trim(),
        uf:            uf.trim(),
      });

      if ("erro" in res) {
        setErro(res.erro);
      } else {
        if (res.omieAviso) setErro(`⚠ Salvo localmente, mas falhou no Omie: ${res.omieAviso}`);
        onClose();
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !isPending) onClose(); }}
    >
      <div className="w-full max-w-xl rounded-xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/80 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-foreground leading-tight">
              Editar fornecedor
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
              {formatCnpj(fornecedor.cnpj)}
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

        {/* Scroll body */}
        <div className="overflow-y-auto flex-1">
          <form onSubmit={handleSubmit} className="p-5 space-y-5">

            {/* Banner: sem Omie — informativo, não bloqueia edição */}
            {semOmie && (
              <div className="flex items-start gap-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3.5 py-3">
                <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[12px] text-amber-600 dark:text-amber-400 leading-snug">
                  Fornecedor sem código Omie — dados serão salvos apenas localmente (sem sync ao Omie)
                </p>
              </div>
            )}

            {/* Banner: erro */}
            {erro && (
              <div className="flex items-start gap-2.5 rounded-lg bg-red-500/10 border border-red-500/20 px-3.5 py-3">
                <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-[12px] text-red-600 dark:text-red-400 leading-snug">{erro}</p>
              </div>
            )}

            {/* ── Seção: Cadastro ───────────────────────────────────────── */}
            <section className="space-y-3">
              <div className="text-[10px] uppercase tracking-[0.12em] font-medium text-muted-foreground/70 pb-1 border-b border-border/60">
                Cadastro
              </div>
              <Field label="Razão social"   value={razaoSocial}  onChange={setRazaoSocial}  disabled={disabled} />
              <Field label="Nome fantasia"  value={nomeFantasia} onChange={setNomeFantasia} disabled={disabled} />
            </section>

            {/* ── Seção: Contato ────────────────────────────────────────── */}
            <section className="space-y-3">
              <div className="text-[10px] uppercase tracking-[0.12em] font-medium text-muted-foreground/70 pb-1 border-b border-border/60">
                Contato
              </div>
              <Field label="E-mail"  value={email}    onChange={setEmail}    disabled={disabled} type="email" />
              <Field label="Telefone" value={telefone} onChange={setTelefone} disabled={disabled} placeholder="(11) 99999-9999" />
              <Field label="Contato (pessoa)" value={contato} onChange={setContato} disabled={disabled} />
            </section>

            {/* ── Seção: Endereço ───────────────────────────────────────── */}
            <section className="space-y-3">
              <div className="text-[10px] uppercase tracking-[0.12em] font-medium text-muted-foreground/70 pb-1 border-b border-border/60">
                Endereço
              </div>
              <Field label="CEP"      value={cep}      onChange={setCep}      disabled={disabled} placeholder="00000000" />
              <Field label="Endereço" value={endereco}  onChange={setEndereco}  disabled={disabled} />
              <Field label="Cidade"   value={cidade}    onChange={setCidade}    disabled={disabled} />

              {/* UF */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  UF
                </label>
                <select
                  value={uf}
                  onChange={(e) => setUf(e.target.value)}
                  disabled={disabled}
                  className={cn(
                    "w-full rounded-lg border border-border bg-muted/60 px-3 py-2",
                    "text-sm text-foreground appearance-none cursor-pointer",
                    "focus:outline-none focus:border-border focus:ring-1 focus:ring-border/40 transition-colors",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  <option value="">Selecione…</option>
                  {UFS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </section>

            {/* ── Somente leitura ───────────────────────────────────────── */}
            <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium mb-2">
                Somente leitura
              </p>
              {[
                { label: "CNPJ",        value: formatCnpj(fornecedor.cnpj) },
                { label: "Código Omie", value: fornecedor.omie_codigo ?? "—" },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">{label}</span>
                  <span className="text-[11px] font-mono text-foreground/70">{value}</span>
                </div>
              ))}
            </div>

            {/* Rodapé */}
            {/* Erro próximo do botão (visível mesmo com scroll) */}
            {erro && (
              <div className="flex items-start gap-2.5 rounded-lg bg-red-500/10 border border-red-500/20 px-3.5 py-3">
                <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-[12px] text-red-600 dark:text-red-400 leading-snug">{erro}</p>
              </div>
            )}

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
                disabled={disabled}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                  disabled
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
    </div>
  );
}
