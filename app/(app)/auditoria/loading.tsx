/**
 * loading.tsx — skeleton da auditoria.
 * A tela é uma linha do tempo vertical de `pedido_eventos`.
 */
import { SkeletonHeader } from "@/components/lhg/skeletons";

export default function Loading() {
  return (
    <div className="max-w-[900px] mx-auto space-y-4 pb-10 animate-pulse">
      <SkeletonHeader tituloW={32} subW={60} />
      <div className="relative pl-6 space-y-5">
        {/* Fio da linha do tempo */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border/60" />
        {[...Array(7)].map((_, i) => (
          <div key={i} className="relative">
            <div className="absolute -left-6 top-1 size-3.5 rounded-full bg-muted border-2 border-background" />
            <div className="h-4 w-52 bg-muted rounded mb-1.5" />
            <div className="h-3 w-72 bg-muted/50 rounded mb-1" />
            <div className="h-3 w-28 bg-muted/40 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
