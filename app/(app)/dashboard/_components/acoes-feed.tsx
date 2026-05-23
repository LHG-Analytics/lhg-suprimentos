/**
 * acoes-feed.tsx — LHG-204
 * Feed de ações pendentes — lado direito do dashboard.
 * Sprint 0: dados mock. Sprint 6: conectar a queries reais.
 */
import { formatRelativeTime, formatBRL } from "@/lib/utils";
import { cn } from "@/lib/utils";

// ── Tipos ─────────────────────────────────────────────────────────────────────
type AcaoTipo = "aprovar" | "cotacao" | "email" | "nf" | "omie";

interface Acao {
  id: string;
  tipo: AcaoTipo;
  usuario: string;
  acao: string;
  alvo: string;
  valor: number | null;
  tempo: Date;
  cta: string;
}

// ── Dados mock ─────────────────────────────────────────────────────────────────
const ACOES: Acao[] = [
  { id: "a1", tipo: "aprovar", usuario: "Rogério T.",  acao: "aguarda sua aprovação em",       alvo: "COT-2026-0140", valor: 14380, tempo: new Date(Date.now() - 1000 * 60 * 8),       cta: "Aprovar"  },
  { id: "a2", tipo: "cotacao", usuario: "Patrícia L.", acao: "criou requisição",                alvo: "REQ-2026-0238", valor: 24800, tempo: new Date(Date.now() - 1000 * 60 * 22),      cta: "Cotar"    },
  { id: "a3", tipo: "email",   usuario: "Camila F.",   acao: "aguarda envio de cotação para",   alvo: "Texlar Têxtil", valor: null,  tempo: new Date(Date.now() - 1000 * 60 * 45),      cta: "Enviar"   },
  { id: "a4", tipo: "nf",      usuario: "Camila F.",   acao: "NF recebida com divergência em",  alvo: "PED-2026-0086", valor: 18860, tempo: new Date(Date.now() - 1000 * 60 * 60 * 2),  cta: "Conferir" },
  { id: "a5", tipo: "aprovar", usuario: "Rogério T.",  acao: "aguarda aprovação em",             alvo: "COT-2026-0137", valor: 64800, tempo: new Date(Date.now() - 1000 * 60 * 60 * 4),  cta: "Aprovar"  },
  { id: "a6", tipo: "omie",    usuario: "Camila F.",   acao: "erro de sincronização com Omie em",alvo: "PED-2026-0085", valor: 7920,  tempo: new Date(Date.now() - 1000 * 60 * 60 * 7),  cta: "Resolver" },
];

// ── Cores por tipo ─────────────────────────────────────────────────────────────
const tipoColor: Record<AcaoTipo, string> = {
  aprovar: "text-amber-400",
  cotacao: "text-sky-400",
  email:   "text-zinc-400",
  nf:      "text-red-400",
  omie:    "text-red-400",
};

// ── Avatar mínimo com iniciais ─────────────────────────────────────────────────
function MiniAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="w-6 h-6 shrink-0 rounded-full bg-lhg-800 text-zinc-50 flex items-center justify-center font-mono text-[10px] font-semibold mt-0.5 select-none">
      {initials}
    </div>
  );
}

// ── Componente ─────────────────────────────────────────────────────────────────
export function AcoesFeed() {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm font-medium text-zinc-100">Ações pendentes</div>
          <div className="text-xs text-zinc-500 mt-0.5">
            {ACOES.length} itens requerem atenção
          </div>
        </div>
        <button className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors">
          Tudo →
        </button>
      </div>

      {/* Lista */}
      <div className="flex-1 -mx-2 space-y-0.5 overflow-y-auto">
        {ACOES.map((a) => (
          <button
            key={a.id}
            className="w-full flex items-start gap-2.5 px-2 py-2 rounded-md hover:bg-zinc-800/40 transition-colors text-left group"
          >
            <MiniAvatar name={a.usuario} />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-zinc-300 leading-snug">
                <span className="font-medium text-zinc-100">
                  {a.usuario.split(" ")[0]}
                </span>{" "}
                <span className="text-zinc-500">{a.acao}</span>{" "}
                <span className={cn("font-mono", tipoColor[a.tipo])}>
                  {a.alvo}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                <span>{formatRelativeTime(a.tempo)}</span>
                {a.valor && (
                  <>
                    <span>·</span>
                    <span className="font-mono">{formatBRL(a.valor)}</span>
                  </>
                )}
              </div>
            </div>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-lhg-400 self-center whitespace-nowrap">
              {a.cta} →
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
