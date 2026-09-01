/**
 * loading.tsx — skeleton do perfil (avatar + nome).
 */
export default function Loading() {
  return (
    <div className="max-w-[640px] mx-auto pb-8 space-y-5 animate-pulse">
      <div>
        <div className="h-6 w-28 bg-muted rounded mb-2" />
        <div className="h-4 w-64 bg-muted/60 rounded" />
      </div>
      <div className="rounded-xl border border-border/80 bg-muted/40 p-5 space-y-5">
        <div className="flex items-center gap-4">
          <div className="size-16 rounded-full bg-muted" />
          <div className="space-y-2">
            <div className="h-4 w-32 bg-muted rounded" />
            <div className="h-8 w-32 bg-muted/60 rounded-md" />
          </div>
        </div>
        {[...Array(2)].map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-20 bg-muted/60 rounded" />
            <div className="h-10 w-full bg-muted/40 rounded-lg border border-border/60" />
          </div>
        ))}
        <div className="h-9 w-28 bg-muted rounded-lg" />
      </div>
    </div>
  );
}
