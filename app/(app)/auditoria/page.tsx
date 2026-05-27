/**
 * app/(app)/auditoria/page.tsx
 * Linha do tempo de auditoria: eventos recentes de pedidos.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buscarEventosAuditoria } from "./actions";
import {
  CheckCircle2, XCircle, Mail, Truck,
  Package, Sparkles, Clock, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

export const metadata = { title: "Auditoria" };

const TIPO_CONFIG: Record<string, { label: string; cor: string; Icon: React.ElementType }> = {
  criacao:       { label: "Criado",          cor: "text-muted-foreground",  Icon: Package },
  aprovacao:     { label: "Aprovado",         cor: "text-emerald-400",       Icon: CheckCircle2 },
  rejeicao:      { label: "Rejeitado",        cor: "text-red-400",           Icon: XCircle },
  email_enviado: { label: "E-mail enviado",   cor: "text-sky-400",           Icon: Mail },
  recebimento:   { label: "Recebido",         cor: "text-violet-400",        Icon: Truck },
  omie:          { label: "Sync Omie",        cor: "text-amber-400",         Icon: Sparkles },
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "short", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export default async function AuditoriaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eventos = await buscarEventosAuditoria(100);

  return (
    <div className="max-w-[900px] mx-auto space-y-4 pb-10">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-foreground">Auditoria</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Últimos {eventos.length} eventos · pedidos de compra
        </p>
      </div>

      {/* Linha do tempo */}
      {eventos.length === 0 ? (
        <div className="rounded-xl border border-border bg-card flex flex-col items-center py-16 gap-2 text-muted-foreground/50">
          <Clock size={28} strokeWidth={1.5} />
          <span className="text-sm">Nenhum evento registrado ainda</span>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border/50">
          {eventos.map((ev) => {
            const config = TIPO_CONFIG[ev.tipo] ?? {
              label: ev.tipo, cor: "text-muted-foreground", Icon: Clock,
            };
            const { Icon } = config;

            return (
              <div key={ev.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                {/* Ícone */}
                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <Icon size={13} className={config.cor} />
                </div>

                {/* Conteúdo */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={cn("text-xs font-semibold", config.cor)}>
                      {config.label}
                    </span>
                    <span className="text-xs text-muted-foreground">em</span>
                    <Link
                      href={ev.href}
                      className="text-xs font-mono text-foreground hover:text-emerald-500 transition-colors"
                    >
                      {ev.numero}
                    </Link>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                    {ev.texto}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-muted-foreground/60">
                      {formatDateTime(ev.created_at)}
                    </span>
                    {ev.autor_nome && (
                      <>
                        <ChevronRight size={9} className="text-muted-foreground/40" />
                        <span className="text-[10px] text-muted-foreground/60">
                          {ev.autor_nome}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
