export default function PedidosLoading() {
  return (
    <div className="flex gap-0 h-[calc(100vh-56px)] animate-pulse">
      {/* Lista */}
      <div className="w-[340px] border-r border-border/60 flex flex-col shrink-0">
        {/* Header */}
        <div className="px-4 py-4 border-b border-border/60 space-y-3">
          <div className="h-6 w-32 bg-muted rounded" />
          <div className="h-8 w-full bg-muted/60 rounded-lg" />
          <div className="flex gap-1.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-6 w-20 bg-muted/60 rounded-full" />
            ))}
          </div>
        </div>
        {/* Items */}
        <div className="flex-1 overflow-hidden space-y-px p-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-[72px] bg-muted/30 rounded-lg" />
          ))}
        </div>
      </div>

      {/* Detalhe */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 py-5 border-b border-border/60 space-y-2">
          <div className="h-5 w-40 bg-muted rounded" />
          <div className="h-7 w-64 bg-muted rounded" />
          <div className="flex gap-3">
            <div className="h-4 w-24 bg-muted/60 rounded" />
            <div className="h-4 w-24 bg-muted/60 rounded" />
          </div>
        </div>
        <div className="flex-1 p-6 space-y-4">
          <div className="h-32 bg-muted/30 rounded-xl" />
          <div className="h-48 bg-muted/30 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
