/**
 * loading.tsx — skeleton das Configurações (abas Usuários / Convites).
 */
import { SkeletonHeader, SkeletonChips, SkeletonTabela } from "@/components/lhg/skeletons";

export default function Loading() {
  return (
    <div className="max-w-[1200px] mx-auto pb-8 space-y-4 animate-pulse">
      <SkeletonHeader tituloW={40} subW={64} acoes={1} />
      <SkeletonChips larguras={[88, 88]} />
      <SkeletonTabela linhas={6} colunas={[44, 52, 24, 20]} />
    </div>
  );
}
