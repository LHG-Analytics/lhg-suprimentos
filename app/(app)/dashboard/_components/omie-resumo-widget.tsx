/**
 * omie-resumo-widget.tsx
 * Widget de KPIs de compras do Omie — painel de resumo.
 *
 * Componente puramente visual (Server Component).
 * Recebe os dados já buscados por OmieResumoSection.
 */
import { ShoppingCart, Clock, Truck, FileText } from "lucide-react";
import { formatBRL } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { OmieResumoComprasResponse } from "@/lib/omie/client";

// ── Props ──────────────────────────────────────────────────────────────────────

interface OmieResumoWidgetProps {
  resumo:       OmieResumoComprasResponse;
  unidadeNome:  string;
  periodoLabel: string;
}

// ── Stat card interno ──────────────────────────────────────────────────────────

interface StatCardProps {
  icon:    React.ElementType;
  label:   string;
  count:   number;
  value:   number;
  color:   string;
  accent?: boolean;
}

function StatCard({ icon: Icon, label, count, value, color, accent }: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-muted/20 p-4 flex flex-col gap-2.5",
        accent ? "border-amber-500/30" : "border-border/60",
      )}
    >
      <div className="flex items-center gap-1.5">
        <Icon size={13} className={color} />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium leading-tight">
          {label}
        </span>
      </div>
      <div className="text-[22px] font-mono font-semibold text-foreground leading-none">
        {count}
      </div>
      <div className="text-[11px] font-mono text-muted-foreground">
        {formatBRL(value)}
      </div>
    </div>
  );
}

// ── Widget ─────────────────────────────────────────────────────────────────────

export function OmieResumoWidget({
  resumo,
  unidadeNome,
  periodoLabel,
}: OmieResumoWidgetProps) {
  const ped = resumo.pedidoCompra    ?? {};
  const fat = resumo.faturamentoResumo ?? {};

  const stats: StatCardProps[] = [
    {
      icon:   ShoppingCart,
      label:  "Pedidos em aberto",
      count:  ped.emAberto?.nTotal    ?? 0,
      value:  ped.emAberto?.vTotal    ?? 0,
      color:  "text-amber-400",
      accent: (ped.emAberto?.nTotal ?? 0) > 0,
    },
    {
      icon:  Clock,
      label: "Em aprovação",
      count: ped.emAprovacao?.nTotal  ?? 0,
      value: ped.emAprovacao?.vTotal  ?? 0,
      color: "text-orange-400",
    },
    {
      icon:  Truck,
      label: "Faturar hoje",
      count: ped.faturarHoje?.nTotal  ?? 0,
      value: ped.faturarHoje?.vTotal  ?? 0,
      color: "text-emerald-400",
    },
    {
      icon:  FileText,
      label: "NFs recebidas",
      count: fat.nFaturadas           ?? 0,
      value: fat.vFaturadas           ?? 0,
      color: "text-sky-400",
    },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-5">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Resumo de Compras · Omie
          </h3>
          <p className="text-[11px] text-muted-foreground/60 mt-0.5">
            {periodoLabel} · {unidadeNome}
          </p>
        </div>

        {/* Badge: compras finalizadas */}
        {(ped.compras?.nTotal ?? 0) > 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-[10px] font-medium text-emerald-400">
              {ped.compras!.nTotal} compras finalizadas
            </span>
          </div>
        )}
      </div>

      {/* ── Grid de KPIs ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

    </div>
  );
}

// ── Skeleton (usado no Suspense fallback) ──────────────────────────────────────

export function OmieResumoWidgetSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="space-y-1.5">
          <div className="h-3 w-40 bg-muted rounded" />
          <div className="h-2.5 w-32 bg-muted/60 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border/60 bg-muted/20 h-[92px]" />
        ))}
      </div>
    </div>
  );
}
