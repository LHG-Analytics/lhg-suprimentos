"use client";

/**
 * avisos-saidas-panel.tsx — avisos da última importação de saídas (baixa por ficha)
 *
 * Mostra o resumo persistido em `estoque_ciclos.saidas_avisos` (migration 0030):
 * contagem por tipo em selos (bolinha + texto, §11) e lista expansível por tipo
 * com `<details>` nativo — sem estado, acessível, e sobrevive ao remount da
 * view do ciclo. A importação nunca é bloqueada por aviso: o painel existe
 * para a compradora saber o que NÃO foi baixado e por quê.
 */
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResumoAvisosSaidas, TipoAviso } from "@/lib/estoque/saidas-ciclo";

const TIPOS: { tipo: TipoAviso; rotulo: string; bolinha: string; explicacao: string }[] = [
  { tipo: "insumo_pendente",         rotulo: "Insumo pendente sem baixa",   bolinha: "bg-amber-400",  explicacao: "A ficha usa um insumo que ainda não tem produto decidido (ambíguo, sem cadastro ou sem quantidade). A venda não baixou esse insumo." },
  { tipo: "unidade_incompativel",    rotulo: "Unidade incompatível",        bolinha: "bg-red-400",    explicacao: "A ficha está em ml, L, g ou kg e o item é comprado em outra dimensão (ex.: garrafa em UN). Falta o conteúdo por unidade no cadastro." },
  { tipo: "sub_preparo_sem_receita", rotulo: "Sub-preparo sem receita",     bolinha: "bg-sky-400",    explicacao: "A ficha usa um preparo interno (molho, base, espuma) cuja receita ainda não foi cadastrada. A baixa das fichas que o usam ficou parcial." },
  { tipo: "fora_do_ciclo",           rotulo: "Insumo fora deste ciclo",     bolinha: "bg-violet-400", explicacao: "O insumo tem baixa por ficha mas foi cadastrado depois da abertura do ciclo. Use \"Trazer para a contagem\" e reimporte." },
  { tipo: "outro",                   rotulo: "Outros",                      bolinha: "bg-zinc-400",   explicacao: "Avisos que não se encaixam nos tipos acima (ex.: produto com ficha e vínculo 1:1 ao mesmo tempo)." },
];

function formatarInstante(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function AvisosSaidasPanel({ resumo }: { resumo: ResumoAvisosSaidas | null | undefined }) {
  if (!resumo) return null;
  const tiposComAviso = TIPOS.filter((t) => (resumo.por_tipo?.[t.tipo] ?? 0) > 0);
  const listadosParcialmente = resumo.avisos.length < resumo.total;

  if (resumo.total === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Saídas importadas em {formatarInstante(resumo.gerado_em)} sem avisos de baixa por ficha
        {resumo.produtos_ignorados > 0 ? ` · ${resumo.produtos_ignorados} ${resumo.produtos_ignorados === 1 ? "produto" : "produtos"} do Automo sem mapeamento` : ""}.
      </p>
    );
  }

  return (
    <section
      aria-label="Avisos da importação de saídas"
      className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 space-y-2"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
          <AlertTriangle size={15} className="text-amber-500" />
          {resumo.total} {resumo.total === 1 ? "aviso" : "avisos"} na baixa por ficha
        </span>
        <span className="text-xs text-muted-foreground">
          importado em {formatarInstante(resumo.gerado_em)}
          {resumo.produtos_ignorados > 0 ? ` · ${resumo.produtos_ignorados} ${resumo.produtos_ignorados === 1 ? "produto" : "produtos"} do Automo sem mapeamento` : ""}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tiposComAviso.map((t) => (
          <span key={t.tipo} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-xs text-foreground">
            <span className={cn("h-1.5 w-1.5 rounded-full", t.bolinha)} aria-hidden />
            {t.rotulo}
            <span className="font-semibold tabular-nums">{resumo.por_tipo[t.tipo]}</span>
          </span>
        ))}
      </div>

      <div className="space-y-1">
        {tiposComAviso.map((t) => {
          const itens = resumo.avisos.filter((a) => a.tipo === t.tipo);
          return (
            <details key={t.tipo} className="group rounded-md border border-border bg-card">
              <summary className="cursor-pointer select-none px-3 py-1.5 text-xs font-medium text-foreground flex items-center gap-2">
                <span className={cn("h-1.5 w-1.5 rounded-full", t.bolinha)} aria-hidden />
                {t.rotulo} ({resumo.por_tipo[t.tipo]})
                <span className="ml-auto text-muted-foreground group-open:hidden">mostrar</span>
                <span className="ml-auto text-muted-foreground hidden group-open:inline">ocultar</span>
              </summary>
              <div className="px-3 pb-2 space-y-1">
                <p className="text-[11px] text-muted-foreground">{t.explicacao}</p>
                <ul className="max-h-56 overflow-auto space-y-0.5 text-xs text-foreground/90">
                  {itens.map((a, i) => (
                    <li key={i} className="leading-snug">{a.texto}</li>
                  ))}
                  {itens.length < resumo.por_tipo[t.tipo] && (
                    <li className="text-muted-foreground">… e mais {resumo.por_tipo[t.tipo] - itens.length} (lista guardada até o limite; reimporte para ver o total atual)</li>
                  )}
                </ul>
              </div>
            </details>
          );
        })}
        {listadosParcialmente && (
          <p className="text-[11px] text-muted-foreground">
            Guardados {resumo.avisos.length} de {resumo.total} avisos.
          </p>
        )}
      </div>
    </section>
  );
}
