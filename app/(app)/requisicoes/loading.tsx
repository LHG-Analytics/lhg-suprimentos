/**
 * loading.tsx — LHG-209
 * Skeleton fiel da lista de requisições.
 */
export default function Loading() {
  return (
    <div className="max-w-[1600px] mx-auto space-y-4 pb-8 animate-pulse">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="h-6 w-40 bg-muted rounded mb-2" />
          <div className="h-4 w-64 bg-muted/60 rounded" />
        </div>
        <div className="h-9 w-36 bg-muted rounded-lg" />
      </div>

      {/* Filter chips */}
      <div className="flex gap-2">
        {[80, 96, 112, 88, 80, 80].map((w, i) => (
          <div
            key={i}
            className="h-8 bg-muted/60 rounded-full"
            style={{ width: w }}
          />
        ))}
      </div>

      {/* Busca */}
      <div className="h-10 bg-muted/40 rounded-lg w-80" />

      {/* Tabela */}
      <div className="rounded-xl border border-border/80 bg-muted/40 overflow-hidden">
        <div className="flex gap-4 px-5 py-3 border-b border-border/80">
          {[80, 200, 120, 100, 60, 90, 80, 72].map((w, i) => (
            <div key={i} className="h-3 bg-muted/60 rounded" style={{ width: w }} />
          ))}
        </div>
        {[...Array(7)].map((_, i) => (
          <div key={i} className="flex gap-4 px-5 py-3.5 border-b border-border/40">
            <div className="h-4 w-20 bg-muted/50 rounded font-mono" />
            <div className="h-4 w-48 bg-muted/50 rounded" />
            <div className="h-4 w-28 bg-muted/40 rounded" />
            <div className="h-4 w-20 bg-muted/40 rounded" />
            <div className="h-4 w-8 bg-muted/40 rounded" />
            <div className="h-4 w-16 bg-muted/40 rounded" />
            <div className="h-5 w-20 bg-muted/50 rounded-full" />
            <div className="h-4 w-16 bg-muted/40 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
