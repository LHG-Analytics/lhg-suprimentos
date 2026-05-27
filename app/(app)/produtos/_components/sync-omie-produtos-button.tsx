"use client";

/**
 * sync-omie-produtos-button.tsx — LHG-206
 * Botão que dispara POST /api/omie/sync com entidade=produtos.
 *
 * Fire-and-forget: o botão libera imediatamente após disparar a requisição.
 * O usuário pode navegar livremente enquanto o sync roda em background.
 * A notificação de conclusão chega via Supabase Realtime (use-realtime-notifications).
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

    // Toast imediato — não espera resposta do servidor
    toast.info("Sincronização Omie iniciada", {
      description: "Catálogo e preços sendo atualizados em segundo plano",
      duration: 6_000,
    });

    // Libera o botão: usuário pode navegar livremente
    // (setTimeout evita double-click acidental)
    setTimeout(() => setSyncing(false), 2_000);

    // Fire-and-forget: keepalive mantém a requisição mesmo após navegação.
    // Catálogo termina em ~15s e faz router.refresh() silencioso.
    // CMC termina em ~2-3min e dispara notificação via Supabase Realtime.
    fetch("/api/omie/sync", {
      method:   "POST",
      headers:  { "Content-Type": "application/json" },
      body:     JSON.stringify({ entidade: "produtos" }),
      keepalive: true,
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error ?? `Erro HTTP ${res.status}`);
          return;
        }
        // Catálogo sincronizado — atualiza a página atual silenciosamente
        // (se o usuário ainda estiver no app)
        router.refresh();
      })
      .catch((err) => {
        // AbortError = usuário navegou, keepalive pode não estar disponível
        // neste ambiente — ignora silenciosamente
        if (err instanceof Error && err.name === "AbortError") return;
        console.error("[omie/sync]", err);
        toast.error("Erro ao iniciar sincronização com Omie");
      });
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
      {syncing ? "Iniciando…" : "Sincronizar Omie"}
    </button>
  );
}
