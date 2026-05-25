/**
 * loading.tsx — LHG-210
 * Skeleton da lista de cotações.
 */
export default function Loading() {
  return (
    <div className="max-w-[1600px] mx-auto space-y-4 pb-8 animate-pulse">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="h-6 w-36 bg-muted rounded mb-2" />
          <div className="h-4 w-56 bg-muted/60 rounded" />
        </div>
        <div className="h-9 w-36 bg-muted rounded-lg" />
      </div>

      {/* Mini KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-xl border border-border/80 bg-muted/40 px-5 py-4">
            <div className="h-3 w-24 bg-muted/60 rounded mb-3" />
            <div className="h-7 w-16 bg-muted rounded" />
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {[80, 96, 112, 88, 80].map((w, i) => (
          <div key={i} className="h-8 bg-muted/60 rounded-full" style={{ width: w }} />
        ))}
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-border/80 bg-muted/40 overflow-hidden">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex gap-4 px-5 py-3.5 border-b border-border/40">
            <div className="h-4 w-20 bg-muted/50 rounded" />
            <div className="h-4 w-52 bg-muted/50 rounded" />
            <div className="h-4 w-20 bg-muted/40 rounded" />
            <div className="h-4 w-16 bg-muted/40 rounded" />
            <div className="h-4 w-24 bg-muted/40 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
