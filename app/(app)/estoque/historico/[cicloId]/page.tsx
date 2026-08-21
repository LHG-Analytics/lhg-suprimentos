/**
 * app/(app)/estoque/historico/[cicloId]/page.tsx — módulo de Estoque (bloco 6)
 * Tabela completa de um ciclo fechado: item por item, com teórico e
 * divergência já calculados por `lib/estoque/ciclo.ts` — a mesma lógica usada
 * na tela de Contagem, para o número nunca divergir entre as duas telas.
 */
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { calcularTeorico, calcularDivergencia, rotuloMes } from "@/lib/estoque/ciclo";

interface Props {
  params: Promise<{ cicloId: string }>;
}

export const metadata = { title: "Ciclo fechado" };

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

export default async function HistoricoCicloPage({ params }: Props) {
  const { cicloId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: ciclo } = await supabase
    .from("estoque_ciclos")
    .select("id, mes, fechado_por, fechado_em, locais_estoque(nome)")
    .eq("id", cicloId)
    .maybeSingle();
  if (!ciclo) notFound();

  const { data: fechadoPor } = ciclo.fechado_por
    ? await supabase.from("user_profiles").select("nome").eq("id", ciclo.fechado_por).maybeSingle()
    : { data: null };

  const { data: itensCiclo } = await supabase
    .from("estoque_ciclo_itens")
    .select(
      "id, contagem_anterior, entradas, saidas, contagem_atual, estoque_itens(produtos(nome, unidade_med)), user_profiles(nome)",
    )
    .eq("ciclo_id", cicloId);

  type ItemCicloRow = NonNullable<typeof itensCiclo>[number];

  const itens = ((itensCiclo ?? []) as ItemCicloRow[])
    .map((row) => {
      const teorico = calcularTeorico({
        contagem_anterior: row.contagem_anterior,
        entradas: row.entradas,
        saidas: row.saidas,
      });
      const divergencia = calcularDivergencia(row.contagem_atual, teorico);
      return {
        id: row.id,
        produtoNome: row.estoque_itens?.produtos?.nome ?? "—",
        produtoUnidadeMed: row.estoque_itens?.produtos?.unidade_med ?? "",
        contagemAnterior: row.contagem_anterior,
        entradas: row.entradas,
        saidas: row.saidas,
        teorico,
        contagemAtual: row.contagem_atual,
        divergencia,
        contadoPorNome: row.user_profiles?.nome ?? "—",
      };
    })
    .sort((a, b) => a.produtoNome.localeCompare(b.produtoNome, "pt-BR"));

  return (
    <div className="space-y-4 pb-10">
      <div>
        <Link
          href="/estoque/historico"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
        >
          <ArrowLeft size={13} /> Histórico de estoque
        </Link>
        <h1 className="text-lg font-semibold text-foreground capitalize">
          {rotuloMes(ciclo.mes)} · {ciclo.locais_estoque?.nome ?? "—"}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Fechado por {fechadoPor?.nome ?? "—"}
          {ciclo.fechado_em && ` · ${formatDateTime(ciclo.fechado_em)}`}
        </p>
      </div>

      {itens.length === 0 ? (
        <div className="rounded-xl border border-border/80 bg-muted/40 py-16 text-center">
          <p className="text-sm text-muted-foreground">Nenhum item neste ciclo</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/80 bg-muted/40 overflow-hidden">
          <div className="overflow-x-auto p-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className={TH}>Item</th>
                  <th className={TH_RIGHT}>Anterior</th>
                  <th className={TH_RIGHT}>Entradas</th>
                  <th className={TH_RIGHT}>Saídas</th>
                  <th className={TH_RIGHT}>Teórico</th>
                  <th className={TH_RIGHT}>Contado</th>
                  <th className={TH_RIGHT}>Divergência</th>
                  <th className={TH}>Contado por</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item) => (
                  <tr key={item.id} className="border-b border-border/40 hover:bg-muted/50 transition-colors">
                    <td className="py-3 pr-4">
                      <div className="text-foreground font-medium">{item.produtoNome}</div>
                      <div className="text-[11px] text-muted-foreground/60">{item.produtoUnidadeMed}</div>
                    </td>
                    <td className="py-3 pr-4 text-right text-muted-foreground">
                      {item.contagemAnterior != null ? item.contagemAnterior : "—"}
                    </td>
                    <td className="py-3 pr-4 text-right text-muted-foreground">
                      {item.entradas != null ? item.entradas : "—"}
                    </td>
                    <td className="py-3 pr-4 text-right text-muted-foreground">
                      {item.saidas != null ? item.saidas : "—"}
                    </td>
                    <td className="py-3 pr-4 text-right text-muted-foreground">
                      {item.teorico != null ? item.teorico : "—"}
                    </td>
                    <td className="py-3 pr-4 text-right text-foreground font-medium">
                      {item.contagemAtual != null ? item.contagemAtual : "—"}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {item.divergencia == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span
                          className={
                            item.divergencia < 0
                              ? "text-destructive font-medium"
                              : item.divergencia > 0
                                ? "text-amber-500 font-medium"
                                : "text-emerald-500 font-medium"
                          }
                        >
                          {item.divergencia > 0 ? `+${item.divergencia}` : item.divergencia}
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-muted-foreground text-xs">{item.contadoPorNome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
