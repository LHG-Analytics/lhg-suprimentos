/**
 * acoes-feed.tsx — LHG-220
 * Feed de ações pendentes — lado direito do dashboard.
 * Recebe dados reais do Server Component (page.tsx).
 */
import Link from "next/link";
import { formatBRL } from "@/lib/utils";
import { cn } from "@/lib/utils";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type AcaoTipo = "aprovar" | "cotacao" | "email" | "nf" | "omie";

export interface AcaoItem {
  id:       string;
  tipo:     AcaoTipo;
  /** Ex: "Patrícia L. · aguarda cotação em" */
  descricao: string;
  /** Número do documento: COT-2026-0140 */
  alvo:     string;
  /** Rota para navegação */
  alvoHref: string;
  valor:    number | null;
  /** ISO string */
  tempo:    string;
  cta:      string;
}

interface Props {
  acoes: AcaoItem[];
}

// ── Cores por tipo ─────────────────────────────────────────────────────────────
const tipoColor: Record<AcaoTipo, string> = {
  aprovar: "text-amber-400",
  cotacao: "text-sky-400",
  email:   "text-zinc-400",
  nf:      "text-red-400",
  omie:    "text-red-400",
};

// ── Tempo relativo ─────────────────────────────────────────────────────────────
function relativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins   = Math.floor(diffMs / 60_000);
  if (mins < 1)   return "agora";
  if (mins < 60)  return `${mins}min atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h atrás`;
  const days = Math.floor(hrs / 24);
  return `${days}d atrás`;
}

// ── Componente ─────────────────────────────────────────────────────────────────
export function AcoesFeed({ acoes }: Props) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <div className="text-sm font-medium text-zinc-100">Ações pendentes</div>
          <div className="text-xs text-zinc-500 mt-0.5">
            {acoes.length === 0
              ? "Nenhuma ação pendente"
              : `${acoes.length} ${acoes.length === 1 ? "item requer" : "itens requerem"} atenção`}
          </div>
        </div>
        <Link
          href="/cotacoes"
          className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          Tudo →
        </Link>
      </div>

      {/* Lista */}
      {acoes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-zinc-600">Tudo em dia 🎉</p>
        </div>
      ) : (
        <div className="flex-1 -mx-2 space-y-0.5 overflow-y-auto">
          {acoes.map((a) => (
            <Link
              key={a.id}
              href={a.alvoHref}
              className="w-full flex items-start gap-2.5 px-2 py-2 rounded-md hover:bg-zinc-800/40 transition-colors text-left group"
            >
              {/* Dot indicador */}
              <span
                className={cn(
                  "mt-1.5 w-1.5 h-1.5 rounded-full shrink-0",
                  a.tipo === "aprovar" && "bg-amber-400",
                  a.tipo === "cotacao" && "bg-sky-400",
                  a.tipo === "nf"      && "bg-red-400",
                  a.tipo === "omie"    && "bg-red-400",
                  a.tipo === "email"   && "bg-zinc-500",
                )}
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-zinc-300 leading-snug">
                  <span className="text-zinc-500">{a.descricao} </span>
                  <span className={cn("font-mono font-medium", tipoColor[a.tipo])}>
                    {a.alvo}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-600">
                  <span>{relativeTime(a.tempo)}</span>
                  {a.valor != null && (
                    <>
                      <span>·</span>
                      <span className="font-mono">{formatBRL(a.valor)}</span>
                    </>
                  )}
                </div>
              </div>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-emerald-500 self-center whitespace-nowrap shrink-0">
                {a.cta} →
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
