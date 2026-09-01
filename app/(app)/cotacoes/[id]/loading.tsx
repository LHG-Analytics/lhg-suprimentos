/**
 * loading.tsx — skeleton da matriz comparativa de cotação.
 *
 * É a tela mais pesada do sistema (itens × fornecedores + coluna de Sugestão IA),
 * então é a que mais tempo passava sem sinal nenhum na tela. O skeleton desenha a
 * grade: primeira coluna fixa com os itens e colunas de fornecedor à direita.
 */
export default function Loading() {
  return (
    <div className="max-w-[1600px] mx-auto space-y-4 pb-8 animate-pulse">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="h-6 w-44 bg-muted rounded mb-2" />
          <div className="h-4 w-64 bg-muted/60 rounded" />
        </div>
        <div className="flex gap-2 shrink-0">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-9 w-28 bg-muted rounded-lg" />
          ))}
        </div>
      </div>

      {/* Matriz: cabeçalho de fornecedores + linhas de item */}
      <div className="rounded-xl border border-border/80 bg-muted/40 overflow-hidden">
        <div className="flex gap-3 px-4 py-3 border-b border-border/60">
          <div className="h-8 w-56 bg-muted/60 rounded shrink-0" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-8 flex-1 bg-muted/50 rounded" />
          ))}
        </div>
        {[...Array(7)].map((_, i) => (
          <div key={i} className="flex gap-3 px-4 py-3 border-b border-border/40">
            <div className="h-9 w-56 bg-muted/50 rounded shrink-0" />
            {[...Array(4)].map((_, j) => (
              <div key={j} className="h-9 flex-1 bg-muted/30 rounded" />
            ))}
          </div>
        ))}
      </div>

      {/* Barra de resumo fixa no rodapé */}
      <div className="rounded-xl border border-border/80 bg-muted/40 px-5 py-3.5 flex items-center justify-between">
        <div className="flex gap-8">
          {[...Array(3)].map((_, i) => (
            <div key={i}>
              <div className="h-3 w-24 bg-muted/60 rounded mb-2" />
              <div className="h-5 w-20 bg-muted rounded" />
            </div>
          ))}
        </div>
        <div className="h-9 w-36 bg-muted rounded-lg" />
      </div>
    </div>
  );
}
