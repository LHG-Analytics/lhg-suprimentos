"use client";

/**
 * historico-tabela.tsx — módulo de Estoque (bloco 6, histórico de ciclos fechados)
 *
 * Tela de análise, em desktop — por isso tabela, ao contrário dos cards
 * mobile-first de Contagem. Cada linha leva ao detalhe item a item do ciclo.
 */
import { useRouter } from "next/navigation";
import { History, ChevronRight } from "lucide-react";
import { rotuloMes } from "@/lib/estoque/ciclo";
import type { CicloFechadoView } from "./tipos";

interface Props {
  linhas: CicloFechadoView[];
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TH = "text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium pb-3 pr-4";
const TH_RIGHT = `${TH} text-right`;

export function HistoricoTabela({ linhas }: Props) {
  const router = useRouter();

  if (linhas.length === 0) {
    return (
      <div className="rounded-xl border border-border/80 bg-muted/40 py-16 text-center">
        <History size={28} className="mx-auto text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground mt-3">Nenhum ciclo fechado ainda</p>
        <p className="text-xs text-muted-foreground/60 mt-1 max-w-sm mx-auto">
          Os ciclos aparecem aqui depois que a contagem do mês é fechada em Contagem.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/80 bg-muted/40 overflow-hidden">
      <div className="overflow-x-auto p-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className={TH}>Mês</th>
              <th className={TH_RIGHT}>Itens</th>
              <th className={TH_RIGHT}>Com divergência</th>
              <th className={TH_RIGHT}>Perda do mês</th>
              <th className={TH}>Fechado por</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha) => (
              <tr
                key={linha.id}
                onClick={() => router.push(`/estoque/historico/${linha.id}`)}
                className="border-b border-border/40 hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <td className="py-3 pr-4 text-foreground font-medium capitalize">{rotuloMes(linha.mes)}</td>
                <td className="py-3 pr-4 text-right text-muted-foreground">{linha.totalItens}</td>
                <td className="py-3 pr-4 text-right text-muted-foreground">{linha.itensComDivergencia}</td>
                <td className="py-3 pr-4 text-right">
                  {linha.perda !== 0 ? (
                    <span className="text-destructive font-medium">
                      {linha.perda.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-3 pr-4 text-muted-foreground">
                  {linha.fechadoPorNome}
                  {linha.fechadoEm && (
                    <span className="text-[11px] text-muted-foreground/60"> · {formatDateTime(linha.fechadoEm)}</span>
                  )}
                </td>
                <td className="py-3 text-right">
                  <ChevronRight size={16} className="text-muted-foreground/40" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
