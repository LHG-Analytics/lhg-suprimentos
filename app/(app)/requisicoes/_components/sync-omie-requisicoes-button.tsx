"use client";

/**
 * sync-omie-requisicoes-button.tsx
 * Botão que dispara POST /api/omie/sync com entidade=requisicoes.
 * Fire-and-forget: libera imediatamente, sync roda em background.
 * Traz as requisições abertas criadas pelos estoquistas diretamente no Omie.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function SyncOmieRequisicoesButton() {
  const [syncing, setSyncing] = useState(false);
  const router = useRouter();

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);

    toast.info("Buscando requisições do Omie…", {
      description: "Requisições criadas pelos estoquistas serão importadas",
      duration: 5_000,
    });

    try {
      const res = await fetch("/api/omie/sync", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ entidade: "requisicoes" }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? `Erro HTTP ${res.status}`);
        return;
      }

      const data = await res.json().catch(() => ({}));
      const result = data.results?.[0];
      const novos = result?.novos ?? 0;
      toast.success(
        novos > 0
          ? `${novos} requisição${novos > 1 ? "s" : ""} importada${novos > 1 ? "s" : ""} do Omie`
          : "Omie sincronizado — nenhuma requisição nova",
        { duration: 5_000 },
      );
      router.refresh();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      console.error("[omie/sync/requisicoes]", err);
      toast.error("Erro ao buscar requisições do Omie");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <button
      onClick={handleSync}
      disabled={syncing}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors",
        "border-border bg-muted/60 text-foreground hover:bg-muted hover:border-border",
        "disabled:opacity-50 disabled:cursor-not-allowed",
      )}
    >
      <RefreshCw size={14} className={cn("shrink-0", syncing && "animate-spin")} />
      {syncing ? "Buscando…" : "Buscar do Omie"}
    </button>
  );
}
