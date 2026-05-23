"use client";

/**
 * user-row-actions.tsx — LHG-203
 * Ações inline de cada linha da tabela de usuários:
 * - Trocar papel (dropdown)
 * - Banir / desbanir
 */

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronDown, Loader2, ShieldOff, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateUserRole, banUser } from "../actions";

// ── Tipos ─────────────────────────────────────────────────────────────────────
type Role = "admin" | "comprador" | "aprovador" | "solicitante";

interface UserRowActionsProps {
  userId:      string;
  currentRole: Role;
  banned:      boolean;
  isSelf:      boolean;
}

const ROLE_LABELS: Record<Role, string> = {
  admin:       "Admin",
  comprador:   "Comprador",
  aprovador:   "Aprovador",
  solicitante: "Solicitante",
};

const ROLE_COLOR: Record<Role, string> = {
  admin:       "text-lhg-400 bg-lhg-500/15",
  comprador:   "text-sky-400 bg-sky-500/15",
  aprovador:   "text-amber-400 bg-amber-500/15",
  solicitante: "text-zinc-400 bg-zinc-800",
};

// ── Componente ─────────────────────────────────────────────────────────────────
export function UserRowActions({
  userId,
  currentRole,
  banned,
  isSelf,
}: UserRowActionsProps) {
  const [dropOpen, setDropOpen]      = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleRoleChange(role: Role) {
    setDropOpen(false);
    if (role === currentRole) return;
    startTransition(async () => {
      const result = await updateUserRole(userId, role);
      if (result.error) toast.error(result.error);
      else toast.success(`Papel atualizado para ${ROLE_LABELS[role]}.`);
    });
  }

  function handleBanToggle() {
    startTransition(async () => {
      const result = await banUser(userId, !banned);
      if (result.error) toast.error(result.error);
      else toast.success(banned ? "Acesso restaurado." : "Usuário suspenso.");
    });
  }

  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      {/* Badge de papel com dropdown */}
      <div className="relative">
        <button
          onClick={() => !isSelf && setDropOpen((v) => !v)}
          disabled={isPending || isSelf}
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors",
            ROLE_COLOR[currentRole],
            !isSelf && "hover:opacity-80 cursor-pointer",
            isSelf && "cursor-default",
          )}
        >
          {isPending ? (
            <Loader2 size={10} className="animate-spin" />
          ) : (
            ROLE_LABELS[currentRole]
          )}
          {!isSelf && <ChevronDown size={10} className="opacity-60" />}
        </button>

        {dropOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setDropOpen(false)}
            />
            <div className="absolute left-0 top-full mt-1 z-20 w-36 rounded-lg border border-zinc-800 bg-zinc-950 shadow-xl py-1">
              {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                <button
                  key={r}
                  onClick={() => handleRoleChange(r)}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-xs transition-colors",
                    r === currentRole
                      ? "text-zinc-100 bg-zinc-800/60"
                      : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/40",
                  )}
                >
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Ban toggle */}
      {!isSelf && (
        <button
          onClick={handleBanToggle}
          disabled={isPending}
          className={cn(
            "w-7 h-7 rounded-md flex items-center justify-center transition-colors",
            banned
              ? "text-zinc-500 hover:text-lhg-400 hover:bg-lhg-500/10"
              : "text-zinc-500 hover:text-red-400 hover:bg-red-500/10",
          )}
          title={banned ? "Restaurar acesso" : "Suspender usuário"}
        >
          {banned ? (
            <ShieldCheck size={15} />
          ) : (
            <ShieldOff size={15} />
          )}
        </button>
      )}
    </div>
  );
}
