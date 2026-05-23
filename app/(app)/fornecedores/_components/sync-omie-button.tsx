"use client";

/**
 * sync-omie-button.tsx — LHG-207
 * Botão que dispara POST /api/omie/sync com entidade=fornecedores.
 * Atualiza a página via router.refresh() após sucesso.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function SyncOmieButton() {
  const [syncing, setSyncing] = useState(false);
  const router = useRouter();

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);

    const toastId = toast.loading("Sincronizando fornecedores com Omie…");

    try {
      const res = await fetch("/api/omie/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entidade: "fornecedores" }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      // data.results é SyncResult[]
      const result = data.results?.[0];
      const total = result?.total ?? 0;
      const erros = result?.erros ?? 0;

      toast.success(
        erros === 0
          ? `${total} fornecedor${total !== 1 ? "es" : ""} sincronizado${total !== 1 ? "s" : ""}`
          : `${total - erros}/${total} sincronizados — ${erros} erro${erros !== 1 ? "s" : ""}`,
        { id: toastId },
      );

      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Falha ao sincronizar",
        { id: toastId },
      );
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
        "border-zinc-700 bg-zinc-800/60 text-zinc-200 hover:bg-zinc-700/80 hover:border-zinc-600",
        "disabled:opacity-50 disabled:cursor-not-allowed",
      )}
    >
      <RefreshCw
        size={14}
        className={cn("shrink-0", syncing && "animate-spin")}
      />
      {syncing ? "Sincronizando…" : "Sincronizar Omie"}
    </button>
  );
}
