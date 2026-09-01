/**
 * loading.tsx — skeleton de Fornecedores.
 * Stats TOTAL / COM E-MAIL / OMIE + busca + tabela (1.079 fornecedores).
 */
import {
  SkeletonHeader,
  SkeletonKpiGrid,
  SkeletonTabela,
} from "@/components/lhg/skeletons";

export default function Loading() {
  return (
    <div className="max-w-[1600px] mx-auto space-y-4 pb-8 animate-pulse">
      <SkeletonHeader tituloW={36} subW={56} acoes={2} />
      <SkeletonKpiGrid count={3} cols={3} />
      <div className="flex gap-2">
        <div className="h-9 flex-1 max-w-sm bg-muted/60 rounded-lg" />
        <div className="h-9 w-24 bg-muted/60 rounded-lg" />
      </div>
      <SkeletonTabela linhas={10} colunas={[52, 32, 28, 20]} />
    </div>
  );
}
