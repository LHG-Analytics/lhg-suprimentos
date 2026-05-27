"use client";

/**
 * sync-omie-produtos-button.tsx — LHG-206
 * Botão que dispara POST /api/omie/sync com entidade=produtos.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function SyncOmieProdutosButton() {
  const [syncing, setSyncing] = useState(false);
  const router = useRouter();

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);

    const toastId = toast.loading("Sincronizando produtos com Omie…");

    try {
      const res = await fetch("/api/omie/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entidade: "produtos" }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      // CMC roda em background (after()) — só o catálogo retorna na resposta
      const rCatalogo = data.results?.[0];
      const total = rCatalogo?.total ?? 0;
      const erros = rCatalogo?.erros ?? 0;

      const catalogoMsg = erros === 0
        ? `${total} produto${total !== 1 ? "s" : ""} sincronizado${total !== 1 ? "s" : ""}`
        : `${total - erros}/${total} sincronizados — ${erros} erro${erros !== 1 ? "s" : ""}`;

      toast.success(
        `${catalogoMsg} · preços de custo sendo atualizados…`,
        { id: toastId, duration: 6000 },
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
        "border-border bg-muted/60 text-foreground hover:bg-muted hover:border-border",
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
