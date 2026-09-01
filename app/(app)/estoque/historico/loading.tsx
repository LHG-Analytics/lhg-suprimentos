/**
 * loading.tsx — skeleton do histórico de ciclos de estoque.
 */
import { SkeletonHeader, SkeletonCards } from "@/components/lhg/skeletons";

export default function Loading() {
  return (
    <div className="max-w-3xl mx-auto py-10 px-4 space-y-5 animate-pulse">
      <SkeletonHeader tituloW={44} subW={56} />
      <SkeletonCards count={4} altura={80} />
    </div>
  );
}
