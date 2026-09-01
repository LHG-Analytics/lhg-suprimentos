/**
 * loading.tsx — skeleton de um ciclo fechado do histórico.
 */
import { SkeletonKpiGrid, SkeletonTabela } from "@/components/lhg/skeletons";

export default function Loading() {
  return (
    <div className="space-y-4 pb-10 animate-pulse">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="h-5 w-40 bg-muted rounded mb-2" />
          <div className="h-3 w-56 bg-muted/60 rounded" />
        </div>
        <div className="flex gap-2 shrink-0">
          <div className="h-8 w-20 bg-muted rounded-md" />
          <div className="h-8 w-20 bg-muted rounded-md" />
        </div>
      </div>
      <SkeletonKpiGrid count={3} cols={3} />
      <SkeletonTabela linhas={8} colunas={[48, 16, 16, 16, 16, 16]} />
    </div>
  );
}
