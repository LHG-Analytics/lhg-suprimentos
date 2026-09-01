/**
 * loading.tsx — skeleton de Relatórios.
 * Espelha os 4 KPIs + as 3 abas (Fornecedores / Produtos / Categorias) + tabela.
 */
import {
  SkeletonHeader,
  SkeletonKpiGrid,
  SkeletonChips,
  SkeletonTabela,
} from "@/components/lhg/skeletons";

export default function Loading() {
  return (
    <div className="max-w-[1400px] mx-auto space-y-5 pb-10 animate-pulse">
      <SkeletonHeader tituloW={32} subW={60} acoes={2} />
      <SkeletonKpiGrid count={4} cols={4} />
      <SkeletonChips larguras={[112, 96, 104]} />
      <SkeletonTabela linhas={8} colunas={[56, 20, 20, 16, 20]} />
    </div>
  );
}
