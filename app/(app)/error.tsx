"use client";

/**
 * error.tsx — boundary global do grupo (app)
 * Exibido quando qualquer Server Component dentro de (app) lança.
 * Client Component obrigatório (Next.js requirement).
 */
import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-destructive/10 p-4">
        <AlertTriangle size={28} className="text-destructive" />
      </div>

      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">
          Algo deu errado
        </h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Ocorreu um erro ao carregar esta página. Tente novamente ou entre em
          contato com o suporte se o problema persistir.
        </p>
        {error.digest && (
          <p className="text-[11px] font-mono text-muted-foreground/50 mt-2">
            ID: {error.digest}
          </p>
        )}
      </div>

      <button
        onClick={reset}
        className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        <RefreshCw size={13} />
        Tentar novamente
      </button>
    </div>
  );
}
