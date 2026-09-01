/**
 * loading.tsx — skeleton do catálogo de Produtos.
 * São 3.465 produtos ativos: esta é uma das telas em que a fronteira de Suspense
 * mais importa, porque a montagem da lista no cliente não é instantânea.
 */
import {
  SkeletonHeader,
  SkeletonKpiGrid,
  SkeletonChips,
  SkeletonTabela,
} from "@/components/lhg/skeletons";

export default function Loading() {
  return (
    <div className="max-w-[1600px] mx-auto space-y-4 pb-8 animate-pulse">
      <SkeletonHeader tituloW={32} subW={52} acoes={2} />
      <SkeletonKpiGrid count={3} cols={3} />
      {/* Busca + filtro de categoria */}
      <div className="flex gap-2">
        <div className="h-9 flex-1 max-w-sm bg-muted/60 rounded-lg" />
        <div className="h-9 w-40 bg-muted/60 rounded-lg" />
      </div>
      <SkeletonChips larguras={[88, 104, 96, 80, 92]} />
      <SkeletonTabela linhas={10} colunas={[16, 56, 24, 12, 20]} />
    </div>
  );
}
