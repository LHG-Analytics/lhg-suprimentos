/**
 * loading.tsx — skeleton do Assistente IA.
 * Sidebar de sessões à esquerda + área de conversa à direita.
 */
export default function Loading() {
  return (
    <div className="flex gap-4 h-[calc(100vh-8rem)] animate-pulse">
      {/* Sessões */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 rounded-xl border border-border/80 bg-muted/40 p-3 space-y-2">
        <div className="h-9 w-full bg-muted rounded-lg mb-2" />
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-9 w-full bg-muted/50 rounded-md" />
        ))}
      </aside>

      {/* Conversa */}
      <div className="flex-1 flex flex-col rounded-xl border border-border/80 bg-muted/20 p-5">
        <div className="flex-1 space-y-5">
          {[
            { largura: "60%", direita: true },
            { largura: "85%", direita: false },
            { largura: "45%", direita: true },
            { largura: "75%", direita: false },
          ].map((m, i) => (
            <div key={i} className={m.direita ? "flex justify-end" : "flex justify-start"}>
              <div
                className="rounded-xl bg-muted/50 px-4 py-3 space-y-2"
                style={{ width: m.largura }}
              >
                <div className="h-3 w-full bg-muted/60 rounded" />
                <div className="h-3 w-4/5 bg-muted/50 rounded" />
              </div>
            </div>
          ))}
        </div>
        <div className="h-12 w-full bg-muted/40 rounded-xl border border-border/60 mt-4" />
      </div>
    </div>
  );
}
