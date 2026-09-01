/**
 * loading.tsx — skeleton do Dashboard.
 * Espelha o grid de 8 KPIs + gráfico de gastos + tabela de cotações.
 */
import {
  SkeletonHeader,
  SkeletonKpiGrid,
  SkeletonChips,
  SkeletonGrafico,
  SkeletonTabela,
} from "@/components/lhg/skeletons";

export default function Loading() {
  return (
    <div className="max-w-[1600px] mx-auto space-y-3 pb-8 animate-pulse">
      <SkeletonHeader tituloW={36} subW={64} acoes={1} />
      {/* Seletor de período */}
      <SkeletonChips larguras={[72, 80, 80, 72]} />
      <SkeletonKpiGrid count={8} cols={4} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <SkeletonGrafico altura={240} />
        </div>
        <div className="rounded-xl border border-border/80 bg-muted/40 p-5 space-y-3">
          <div className="h-4 w-32 bg-muted rounded" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 w-full bg-muted/50 rounded" />
              <div className="h-2 w-full bg-muted/30 rounded-full" />
            </div>
          ))}
        </div>
      </div>
      <SkeletonTabela linhas={5} colunas={[20, 48, 24, 16, 20]} />
    </div>
  );
}
