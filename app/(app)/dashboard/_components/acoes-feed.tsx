/**
 * acoes-feed.tsx — LHG-220
 * Feed de ações pendentes — lado direito do dashboard.
 * Tokens semânticos para suporte a light/dark mode.
 */
import Link from "next/link";
import { formatBRL } from "@/lib/utils";
import { cn } from "@/lib/utils";

export type AcaoTipo = "aprovar" | "cotacao" | "email" | "nf" | "omie";

export interface AcaoItem {
  id:        string;
  tipo:      AcaoTipo;
  descricao: string;
  alvo:      string;
  alvoHref:  string;
  valor:     number | null;
  tempo:     string;
  cta:       string;
}

interface Props {
  acoes: AcaoItem[];
}

const tipoColor: Record<AcaoTipo, string> = {
  aprovar: "text-amber-500 dark:text-amber-400",
  cotacao: "text-sky-500 dark:text-sky-400",
  email:   "text-muted-foreground",
  nf:      "text-red-500 dark:text-red-400",
  omie:    "text-red-500 dark:text-red-400",
};

function relativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins   = Math.floor(diffMs / 60_000);
  if (mins < 1)  return "agora";
  if (mins < 60) return `${mins}min atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h atrás`;
  const days = Math.floor(hrs / 24);
  return `${days}d atrás`;
}

export function AcoesFeed({ acoes }: Props) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <div className="text-sm font-medium text-foreground">Ações pendentes</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {acoes.length === 0
              ? "Nenhuma ação pendente"
              : `${acoes.length} ${acoes.length === 1 ? "item requer" : "itens requerem"} atenção`}
          </div>
        </div>
        <Link
          href="/cotacoes"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Tudo →
        </Link>
      </div>

      {/* Lista */}
      {acoes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground/50">Tudo em dia 🎉</p>
        </div>
      ) : (
        <div className="flex-1 -mx-2 space-y-0.5 overflow-y-auto">
          {acoes.map((a) => (
            <Link
              key={a.id}
              href={a.alvoHref}
              className="w-full flex items-start gap-2.5 px-2 py-2 rounded-md hover:bg-muted/50 transition-colors text-left group"
            >
              {/* Dot indicador */}
              <span
                className={cn(
                  "mt-1.5 w-1.5 h-1.5 rounded-full shrink-0",
                  a.tipo === "aprovar" && "bg-amber-400",
                  a.tipo === "cotacao" && "bg-sky-400",
                  a.tipo === "nf"      && "bg-red-400",
                  a.tipo === "omie"    && "bg-red-400",
                  a.tipo === "email"   && "bg-muted-foreground/40",
                )}
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-foreground/80 leading-snug">
                  <span className="text-muted-foreground">{a.descricao} </span>
                  <span className={cn("font-mono font-medium", tipoColor[a.tipo])}>
                    {a.alvo}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground/60">
                  <span>{relativeTime(a.tempo)}</span>
                  {a.valor != null && (
                    <>
                      <span>·</span>
                      <span className="font-mono">{formatBRL(a.valor)}</span>
                    </>
                  )}
                </div>
              </div>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-lhg-500 dark:text-emerald-500 self-center whitespace-nowrap shrink-0">
                {a.cta} →
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
