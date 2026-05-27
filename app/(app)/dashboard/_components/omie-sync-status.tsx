/**
 * omie-sync-status.tsx
 * Card que mostra quando foi a última sincronização do Omie
 * para pedidos e fornecedores.
 * Server Component — busca dados diretamente no Supabase.
 */
import { createClient } from "@/lib/supabase/server";
import { RefreshCw, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface SyncInfo {
  label:         string;
  ultimaSync:    Date | null;
  totalSinc:     number;
  totalPendente: number;
}

function minutosAtras(date: Date): string {
  const diff  = Date.now() - date.getTime();
  const mins  = Math.floor(diff / 60_000);
  const horas = Math.floor(diff / 3_600_000);
  const dias  = Math.floor(diff / 86_400_000);
  if (mins  < 1)   return "agora mesmo";
  if (mins  < 60)  return `${mins}min atrás`;
  if (horas < 24)  return `${horas}h atrás`;
  return `${dias}d atrás`;
}

async function fetchSyncStatus() {
  const supabase = await createClient();

  const [
    { data: ultimoPedidoOmie },
    { count: pedidosSync },
    { count: pedidosPendentes },
    { data: ultimoFornecedor },
    { count: totalFornecedores },
    { count: fornecedoresSinc },
  ] = await Promise.all([
    // Último pedido sincronizado do Omie
    supabase
      .from("omie_pedidos_compra")
      .select("omie_sincronizado_em")
      .order("omie_sincronizado_em", { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Pedidos LHG com omie_status = sincronizado
    supabase
      .from("pedidos")
      .select("*", { count: "exact", head: true })
      .eq("omie_status", "sincronizado"),

    // Pedidos LHG com omie_status = pendente ou erro
    supabase
      .from("pedidos")
      .select("*", { count: "exact", head: true })
      .in("omie_status", ["pendente", "erro"] as const),

    // Último fornecedor com omie_codigo (sincronizado)
    supabase
      .from("fornecedores")
      .select("created_at")
      .not("omie_codigo", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Total de fornecedores ativos
    supabase
      .from("fornecedores")
      .select("*", { count: "exact", head: true })
      .eq("ativo", true),

    // Fornecedores com omie_codigo
    supabase
      .from("fornecedores")
      .select("*", { count: "exact", head: true })
      .eq("ativo", true)
      .not("omie_codigo", "is", null),
  ]);

  const syncs: SyncInfo[] = [
    {
      label:         "Pedidos Omie",
      ultimaSync:    ultimoPedidoOmie?.omie_sincronizado_em
                       ? new Date(ultimoPedidoOmie.omie_sincronizado_em)
                       : null,
      totalSinc:     pedidosSync    ?? 0,
      totalPendente: pedidosPendentes ?? 0,
    },
    {
      label:         "Fornecedores",
      ultimaSync:    ultimoFornecedor?.created_at
                       ? new Date(ultimoFornecedor.created_at)
                       : null,
      totalSinc:     fornecedoresSinc  ?? 0,
      totalPendente: Math.max(0, (totalFornecedores ?? 0) - (fornecedoresSinc ?? 0)),
    },
  ];

  return syncs;
}

export async function OmieSyncStatus() {
  const syncs = await fetchSyncStatus();

  return (
    <div className="rounded-xl border border-border/80 bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <RefreshCw size={13} className="text-muted-foreground" />
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
          Status Omie
        </span>
      </div>

      <div className="space-y-2.5">
        {syncs.map((s) => {
          const temProblema = s.totalPendente > 0;
          const semSync     = !s.ultimaSync;

          return (
            <div key={s.label} className="flex items-start gap-2.5">
              {/* Ícone de status */}
              <div className="mt-0.5 shrink-0">
                {semSync ? (
                  <Clock size={13} className="text-muted-foreground" />
                ) : temProblema ? (
                  <AlertCircle size={13} className="text-amber-400" />
                ) : (
                  <CheckCircle2 size={13} className="text-emerald-400" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-medium text-foreground">{s.label}</span>
                  <span className={cn(
                    "text-[10px] font-mono",
                    temProblema ? "text-amber-400" : "text-muted-foreground",
                  )}>
                    {s.totalSinc} sinc.
                    {s.totalPendente > 0 && ` · ${s.totalPendente} pend.`}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {s.ultimaSync
                    ? `Última sync: ${minutosAtras(s.ultimaSync)}`
                    : "Nenhuma sincronização registrada"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
