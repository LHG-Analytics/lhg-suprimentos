/**
 * components/lhg/skeletons.tsx
 *
 * Peças de skeleton compartilhadas pelos `loading.tsx` de cada rota.
 *
 * Por que cada rota precisa de um `loading.tsx`: sem ele a rota não tem fronteira
 * de Suspense, e o router do Next espera o RSC inteiro terminar no servidor antes
 * de trocar um pixel. A tela antiga fica intacta durante todo o carregamento, o
 * que é indistinguível de "o clique não funcionou" — foi exatamente a queixa dos
 * usuários. Com a fronteira, a troca é imediata.
 *
 * São peças, não um skeleton genérico: a regra do projeto (§11) é skeleton FIEL,
 * e um retângulo cinza universal mentiria sobre o que está chegando. Cada rota
 * compõe as peças no formato da sua própria tela.
 *
 * Server Components puros — nada de interatividade, nada de "use client".
 */

/** Cabeçalho: título, subtítulo e (opcionalmente) botões de ação à direita. */
export function SkeletonHeader({
  tituloW = 40,
  subW = 56,
  acoes = 0,
}: {
  /** Largura do título em unidades Tailwind (w-*). */
  tituloW?: number;
  subW?: number;
  /** Quantos botões desenhar à direita. */
  acoes?: number;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="h-6 bg-muted rounded mb-2" style={{ width: `${tituloW * 0.25}rem` }} />
        <div className="h-4 bg-muted/60 rounded" style={{ width: `${subW * 0.25}rem` }} />
      </div>
      {acoes > 0 && (
        <div className="flex items-center gap-2 shrink-0">
          {[...Array(acoes)].map((_, i) => (
            <div key={i} className="h-9 w-32 bg-muted rounded-lg" />
          ))}
        </div>
      )}
    </div>
  );
}

/** Grade de KPIs. `cols` acompanha o breakpoint real da tela correspondente. */
export function SkeletonKpiGrid({
  count = 4,
  cols = 4,
}: {
  count?: number;
  cols?: 2 | 3 | 4 | 6;
}) {
  const grade = {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-3",
    4: "grid-cols-2 lg:grid-cols-4",
    6: "grid-cols-2 md:grid-cols-3 lg:grid-cols-6",
  }[cols];

  return (
    <div className={`grid ${grade} gap-3`}>
      {[...Array(count)].map((_, i) => (
        <div key={i} className="rounded-xl border border-border/80 bg-muted/40 px-5 py-4">
          <div className="h-3 w-24 bg-muted/60 rounded mb-3" />
          <div className="h-7 w-16 bg-muted rounded" />
        </div>
      ))}
    </div>
  );
}

/** Fileira de filtros/abas em pílula. */
export function SkeletonChips({ larguras = [80, 96, 112, 88] }: { larguras?: number[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {larguras.map((w, i) => (
        <div key={i} className="h-8 bg-muted/60 rounded-full" style={{ width: w }} />
      ))}
    </div>
  );
}

/**
 * Tabela. As larguras das colunas variam de propósito: colunas idênticas leem
 * como barra de carregamento, não como tabela.
 */
export function SkeletonTabela({
  linhas = 6,
  colunas = [20, 52, 20, 16, 24],
}: {
  linhas?: number;
  colunas?: number[];
}) {
  return (
    <div className="rounded-xl border border-border/80 bg-muted/40 overflow-hidden">
      <div className="flex gap-4 px-5 py-3 border-b border-border/60">
        {colunas.map((w, i) => (
          <div key={i} className="h-3 bg-muted/60 rounded" style={{ width: w * 0.75 }} />
        ))}
      </div>
      {[...Array(linhas)].map((_, i) => (
        <div key={i} className="flex gap-4 px-5 py-3.5 border-b border-border/40">
          {colunas.map((w, j) => (
            <div
              key={j}
              className={j < 2 ? "h-4 bg-muted/50 rounded" : "h-4 bg-muted/40 rounded"}
              style={{ width: w * 4 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Lista de cards empilhados (contagem, histórico, timeline). */
export function SkeletonCards({
  count = 4,
  altura = 96,
}: {
  count?: number;
  altura?: number;
}) {
  return (
    <div className="space-y-3">
      {[...Array(count)].map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-border/80 bg-muted/40 px-5 py-4"
          style={{ minHeight: altura }}
        >
          <div className="h-4 w-40 bg-muted rounded mb-3" />
          <div className="h-3 w-64 bg-muted/60 rounded mb-2" />
          <div className="h-3 w-32 bg-muted/50 rounded" />
        </div>
      ))}
    </div>
  );
}

/** Área de gráfico. */
export function SkeletonGrafico({ altura = 280 }: { altura?: number }) {
  return (
    <div className="rounded-xl border border-border/80 bg-muted/40 p-5">
      <div className="h-4 w-40 bg-muted rounded mb-4" />
      <div className="flex items-end gap-2" style={{ height: altura }}>
        {[45, 70, 55, 85, 60, 95, 50, 75, 65, 80, 58, 88].map((h, i) => (
          <div key={i} className="flex-1 bg-muted/50 rounded-t" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}
