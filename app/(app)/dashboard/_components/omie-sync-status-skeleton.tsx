/**
 * omie-sync-status-skeleton.tsx
 * Skeleton do OmieSyncStatus para exibir enquanto o componente carrega.
 */
export function OmieSyncStatusSkeleton() {
  return (
    <div className="rounded-xl border border-border/80 bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-3.5 h-3.5 rounded bg-muted animate-pulse" />
        <div className="w-20 h-3 rounded bg-muted animate-pulse" />
      </div>
      <div className="space-y-2.5">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-start gap-2.5">
            <div className="mt-0.5 w-3.5 h-3.5 rounded-full bg-muted animate-pulse shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="flex justify-between gap-1">
                <div className="w-20 h-3 rounded bg-muted animate-pulse" />
                <div className="w-14 h-3 rounded bg-muted/50 animate-pulse" />
              </div>
              <div className="w-32 h-2.5 rounded bg-muted/40 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
