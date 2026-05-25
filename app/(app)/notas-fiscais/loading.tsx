export default function NFLoading() {
  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6 animate-pulse space-y-4">
      <div className="h-7 w-40 bg-muted rounded" />
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 bg-muted/40 rounded-xl" />
        ))}
      </div>
      <div className="h-10 bg-muted/40 rounded-xl" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-muted/30 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
