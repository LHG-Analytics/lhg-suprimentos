"use client";

/**
 * invite-dialog.tsx — LHG-203
 * Dialog de convite de novo usuário.
 */

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { UserPlus, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { inviteUser } from "../actions";

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Unidade {
  id: string;
  nome: string;
}

interface InviteDialogProps {
  unidades: Unidade[];
}

// ── Roles disponíveis ──────────────────────────────────────────────────────────
const ROLES = [
  { value: "solicitante", label: "Solicitante",  desc: "Abre requisições e confere NF da sua unidade" },
  { value: "comprador",   label: "Comprador",    desc: "Gerencia cotações e pedidos de todas as unidades" },
  { value: "aprovador",   label: "Aprovador",    desc: "Acesso completo a cotações e pedidos, com alçada de aprovação" },
  { value: "admin",       label: "Admin",        desc: "Acesso total: usuários, configurações e relatórios" },
];

// ── Componente ─────────────────────────────────────────────────────────────────
export function InviteDialog({ unidades }: InviteDialogProps) {
  const [open, setOpen]           = useState(false);
  const [role, setRole]           = useState("solicitante");
  const [isPending, startTransition] = useTransition();
  const formRef                   = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await inviteUser(fd);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Convite enviado com sucesso!");
        formRef.current?.reset();
        setRole("solicitante");
        setOpen(false);
      }
    });
  }

  return (
    <>
      {/* Trigger */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-lhg-500 hover:bg-lhg-400 text-zinc-950 font-medium text-sm transition-colors"
      >
        <UserPlus size={14} />
        Convidar usuário
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !isPending && setOpen(false)}
          />

          {/* Dialog */}
          <div className="relative w-full max-w-[480px] rounded-xl border border-border bg-background shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/80">
              <div>
                <h2 className="text-base font-semibold text-foreground">Convidar usuário</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  O usuário receberá um email com link de acesso.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Form */}
            <form ref={formRef} onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* Nome */}
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">
                  Nome completo <span className="text-red-400">*</span>
                </label>
                <input
                  name="nome"
                  required
                  placeholder="Ex: Keila Ferreira"
                  className={cn(
                    "w-full h-9 px-3 rounded-lg text-sm",
                    "bg-muted border border-border",
                    "text-foreground placeholder:text-muted-foreground/50",
                    "focus:outline-none focus:border-lhg-500/50 focus:ring-1 focus:ring-lhg-500/20",
                    "transition-all",
                  )}
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">
                  Email corporativo <span className="text-red-400">*</span>
                </label>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="keila@lhgmoteis.com.br"
                  className={cn(
                    "w-full h-9 px-3 rounded-lg text-sm",
                    "bg-muted border border-border",
                    "text-foreground placeholder:text-muted-foreground/50",
                    "focus:outline-none focus:border-lhg-500/50 focus:ring-1 focus:ring-lhg-500/20",
                    "transition-all",
                  )}
                />
              </div>

              {/* Papel */}
              <div>
                <label className="block text-xs text-muted-foreground mb-2">
                  Papel <span className="text-red-400">*</span>
                </label>
                <input type="hidden" name="role" value={role} />
                <div className="grid grid-cols-2 gap-1.5">
                  {ROLES.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setRole(r.value)}
                      className={cn(
                        "text-left p-2.5 rounded-lg border text-xs transition-colors",
                        role === r.value
                          ? "border-lhg-500/50 bg-lhg-500/10 text-foreground"
                          : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground/80",
                      )}
                    >
                      <div className="font-medium">{r.label}</div>
                      <div className={cn("mt-0.5 leading-snug", role === r.value ? "text-muted-foreground" : "text-muted-foreground/60")}>
                        {r.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Unidade (só para solicitante) */}
              {role === "solicitante" && (
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">
                    Unidade
                  </label>
                  <select
                    name="unidade_id"
                    className={cn(
                      "w-full h-9 px-3 rounded-lg text-sm",
                      "bg-muted border border-border",
                      "text-foreground",
                      "focus:outline-none focus:border-lhg-500/50 focus:ring-1 focus:ring-lhg-500/20",
                      "transition-all",
                    )}
                  >
                    <option value="">Sem unidade específica</option>
                    {unidades.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nome}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={isPending}
                  className="h-9 px-4 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-border/80 text-sm transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="h-9 px-4 rounded-lg bg-lhg-500 hover:bg-lhg-400 disabled:bg-muted disabled:text-muted-foreground text-zinc-950 font-medium text-sm flex items-center gap-2 transition-colors"
                >
                  {isPending ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Enviando…
                    </>
                  ) : (
                    "Enviar convite"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
