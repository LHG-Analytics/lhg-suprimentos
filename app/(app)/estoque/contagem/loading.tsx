/**
 * loading.tsx — skeleton da contagem.
 *
 * Reproduz o layout mobile-first da tela (header fixo com barra de progresso e
 * cards de item), não o container centralizado das outras rotas: a contagem é
 * feita no celular, andando pelo estoque, e um skeleton com forma diferente da
 * tela real leria como troca de página.
 */
export default function Loading() {
  return (
    <div className="flex flex-col -m-4 sm:-m-6 animate-pulse">
      <header className="sticky top-0 z-20 bg-background/95 border-b border-border px-4 py-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="h-4 w-28 bg-muted rounded mb-1.5" />
            <div className="h-3 w-24 bg-muted/60 rounded" />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-8 w-8 lg:w-24 bg-muted/60 rounded-md" />
            ))}
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden" />
      </header>

      <main className="flex-1 px-4 py-4 space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="rounded-xl border border-border/80 bg-muted/40 px-4 py-4">
            <div className="h-4 w-44 bg-muted rounded mb-1.5" />
            <div className="h-3 w-10 bg-muted/50 rounded mb-3" />
            <div className="flex gap-4 mb-3">
              {[56, 48, 56, 48].map((w, j) => (
                <div key={j} className="h-3 bg-muted/40 rounded" style={{ width: w }} />
              ))}
            </div>
            <div className="h-12 w-full bg-muted/30 rounded-lg border border-border/60" />
          </div>
        ))}
      </main>
    </div>
  );
}
