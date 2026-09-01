/**
 * loading.tsx — skeleton do detalhe de requisição.
 */
import { SkeletonTabela } from "@/components/lhg/skeletons";

export default function Loading() {
  return (
    <div className="max-w-[1200px] mx-auto space-y-4 pb-8 animate-pulse">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="h-6 w-52 bg-muted rounded mb-2" />
          <div className="h-4 w-64 bg-muted/60 rounded" />
        </div>
        <div className="flex gap-2 shrink-0">
          <div className="h-9 w-28 bg-muted rounded-lg" />
          <div className="h-9 w-28 bg-muted rounded-lg" />
        </div>
      </div>

      {/* Painel de dados da requisição */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border border-border/80 bg-muted/40 px-4 py-3">
            <div className="h-3 w-20 bg-muted/60 rounded mb-2" />
            <div className="h-4 w-24 bg-muted rounded" />
          </div>
        ))}
      </div>

      <SkeletonTabela linhas={6} colunas={[52, 16, 16, 20]} />
    </div>
  );
}
