/**
 * loading.tsx — skeleton da lista de usuários.
 */
import { SkeletonHeader, SkeletonTabela } from "@/components/lhg/skeletons";

export default function Loading() {
  return (
    <div className="max-w-[1200px] mx-auto pb-8 space-y-4 animate-pulse">
      <SkeletonHeader tituloW={32} subW={56} />
      <SkeletonTabela linhas={6} colunas={[44, 52, 24, 20]} />
    </div>
  );
}
