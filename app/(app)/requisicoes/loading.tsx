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
          <div className="h-6 w-40 bg-zinc-800 rounded mb-2" />
          <div className="h-4 w-64 bg-zinc-800/60 rounded" />
        </div>
        <div className="h-9 w-36 bg-zinc-800 rounded-lg" />
      </div>

      {/* Filter chips */}
      <div className="flex gap-2">
        {[80, 96, 112, 88, 80, 80].map((w, i) => (
          <div
            key={i}
            className="h-8 bg-zinc-800/60 rounded-full"
            style={{ width: w }}
          />
        ))}
      </div>

      {/* Busca */}
      <div className="h-10 bg-zinc-800/40 rounded-lg w-80" />

      {/* Tabela */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
        <div className="flex gap-4 px-5 py-3 border-b border-zinc-800/80">
          {[80, 200, 120, 100, 60, 90, 80, 72].map((w, i) => (
            <div key={i} className="h-3 bg-zinc-800/60 rounded" style={{ width: w }} />
          ))}
        </div>
        {[...Array(7)].map((_, i) => (
          <div key={i} className="flex gap-4 px-5 py-3.5 border-b border-zinc-800/40">
            <div className="h-4 w-20 bg-zinc-800/50 rounded font-mono" />
            <div className="h-4 w-48 bg-zinc-800/50 rounded" />
            <div className="h-4 w-28 bg-zinc-800/40 rounded" />
            <div className="h-4 w-20 bg-zinc-800/40 rounded" />
            <div className="h-4 w-8 bg-zinc-800/40 rounded" />
            <div className="h-4 w-16 bg-zinc-800/40 rounded" />
            <div className="h-5 w-20 bg-zinc-800/50 rounded-full" />
            <div className="h-4 w-16 bg-zinc-800/40 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
