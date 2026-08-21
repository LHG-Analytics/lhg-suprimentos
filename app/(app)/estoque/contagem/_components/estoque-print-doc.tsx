"use client";

/**
 * estoque-print-doc.tsx
 * Documento de impressão da contagem de estoque (PDF via window.print).
 *
 * Segue o mesmo desenho do Mapa de Cotação (`cotacao-print-doc.tsx`): layout
 * claro com cores fixas em vez de tokens do tema dark, porque o destino é papel.
 * Visível só dentro do overlay, escopado por `body.estoque-print-mode`.
 *
 * As colunas repetem a ordem da planilha que o time já usa, para a leitura ser
 * imediata para quem está acostumado com ela.
 */
import { calcularTeorico, calcularDivergencia, calcularARepor, rotuloMes } from "@/lib/estoque/ciclo";
import type { CicloItemView } from "./tipos";

interface Props {
  localNome:      string;
  mesIso:         string;
  status:         "aberto" | "fechado";
  itens:          CicloItemView[];
  dataEmissao:    string;
  unidadesFiscais: string[];
}

/** `—` e não vazio: célula vazia se confunde com zero, e a distinção importa. */
function num(v: number | null | undefined, casas = 3) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { maximumFractionDigits: casas });
}

const TH = "border border-zinc-300 px-2 py-1.5 text-[9px] font-bold uppercase tracking-wide text-white";
const TD = "border border-zinc-300 px-2 py-1.5 text-[10px] text-zinc-800";

export function EstoquePrintDoc({
  localNome, mesIso, status, itens, dataEmissao, unidadesFiscais,
}: Props) {
  const calculado = itens.map(i => {
    const teorico = calcularTeorico({
      contagem_anterior: i.contagemAnterior,
      entradas:          i.entradas,
      saidas:            i.saidas,
    });
    return {
      item:    i,
      teorico,
      diverg:  calcularDivergencia(i.contagemAtual, teorico),
      repor:   calcularARepor(i.estoqueIdeal, i.contagemAtual),
    };
  });

  const perda     = calculado.reduce((s, c) => (c.diverg != null && c.diverg < 0 ? s + c.diverg : s), 0);
  const sobra     = calculado.reduce((s, c) => (c.diverg != null && c.diverg > 0 ? s + c.diverg : s), 0);
  const contados  = itens.filter(i => i.contagemAtual != null).length;
  const comDiverg = calculado.filter(c => c.diverg != null && c.diverg !== 0).length;

  return (
    <div id="estoque-print-doc" className="print-paper mx-auto max-w-[1100px] bg-white p-8 text-zinc-900 shadow-lg">

      {/* Cabeçalho */}
      <div className="mb-4 flex items-start justify-between border-b-2 border-zinc-900 pb-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
            Setor de Compras · LHG Moteis
          </div>
          <div className="text-[18px] font-bold uppercase tracking-wide">Controle de Estoque</div>
          <div className="text-[13px] leading-tight text-zinc-600">
            {localNome} · {rotuloMes(mesIso)}
          </div>
        </div>
        <table className="text-right text-[11px]">
          <tbody>
            <tr>
              <td className="pr-2 text-zinc-500">Emitido em</td>
              <td className="font-mono">{dataEmissao}</td>
            </tr>
            <tr>
              <td className="pr-2 text-zinc-500">Situação</td>
              <td className="font-semibold">{status === "fechado" ? "Fechado" : "Em contagem"}</td>
            </tr>
            <tr>
              <td className="pr-2 text-zinc-500">Itens contados</td>
              <td className="font-mono">{contados} de {itens.length}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Faixa de contexto */}
      <div className="mb-4 grid grid-cols-3 gap-3 text-[11px]">
        <div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2">
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">Local</div>
          <div className="font-semibold">{localNome}</div>
        </div>
        <div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2">
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">
            {unidadesFiscais.length > 1 ? "CNPJs que abastecem" : "CNPJ"}
          </div>
          <div className="font-semibold leading-tight">{unidadesFiscais.join(" + ") || "—"}</div>
        </div>
        <div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2">
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">Itens com divergência</div>
          <div className="font-semibold">{comDiverg} de {itens.length}</div>
        </div>
      </div>

      {/* Tabela */}
      <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "26%" }} />
          <col style={{ width: "6%" }} />
          {Array.from({ length: 7 }, (_, i) => <col key={i} style={{ width: "8%" }} />)}
          <col style={{ width: "12%" }} />
        </colgroup>
        <thead>
          <tr className="bg-emerald-800">
            <th className={`${TH} text-left`}>Item</th>
            <th className={TH}>Un</th>
            <th className={TH}>Contagem anterior</th>
            <th className={TH}>Entradas</th>
            <th className={TH}>Vendas período</th>
            <th className={TH}>Teórico</th>
            <th className={TH}>Estoque atual</th>
            <th className={TH}>Divergência</th>
            <th className={TH}>A repor</th>
            <th className={`${TH} text-left`}>Contado por</th>
          </tr>
        </thead>
        <tbody>
          {calculado.map(({ item, teorico, diverg, repor }, idx) => (
            <tr key={item.id} className={idx % 2 ? "bg-zinc-50" : "bg-white"}>
              <td className={`${TD} align-top`}>
                <div className="font-medium leading-snug">{item.produtoNome}</div>
                {/* Rateio por CNPJ só aparece quando há mais de um — senão é ruído */}
                {unidadesFiscais.length > 1 && item.entradasDetalhe.length > 0 && (
                  <div className="mt-0.5 text-[8px] text-zinc-500">
                    {item.entradasDetalhe.map(d => `${d.unidadeNome} ${num(d.quantidade)}`).join(" · ")}
                  </div>
                )}
              </td>
              <td className={`${TD} text-center text-zinc-500`}>{item.produtoUnidadeMed}</td>
              <td className={`${TD} text-right font-mono`}>{num(item.contagemAnterior)}</td>
              <td className={`${TD} text-right font-mono`}>{num(item.entradas)}</td>
              <td className={`${TD} text-right font-mono`}>{num(item.saidas)}</td>
              <td className={`${TD} text-right font-mono`}>{num(teorico)}</td>
              <td className={`${TD} text-right font-mono font-semibold`}>{num(item.contagemAtual)}</td>
              <td
                className={`${TD} text-right font-mono font-bold ${
                  diverg == null ? "" : diverg < 0 ? "text-red-700" : diverg > 0 ? "text-amber-700" : "text-emerald-700"
                }`}
              >
                {num(diverg)}
              </td>
              <td className={`${TD} text-right font-mono`}>{num(repor)}</td>
              <td className={`${TD} text-[9px] text-zinc-600`}>{item.contadoPorNome ?? "—"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-zinc-100">
            <td className={`${TD} font-bold uppercase tracking-wide`} colSpan={7}>
              Divergência negativa acumulada (perda do período)
            </td>
            <td className={`${TD} text-right font-mono font-bold text-red-700`}>{num(perda)}</td>
            <td className={TD} colSpan={2} />
          </tr>
          {sobra > 0 && (
            <tr className="bg-zinc-100">
              <td className={`${TD} font-bold uppercase tracking-wide`} colSpan={7}>
                Divergência positiva acumulada (sobra)
              </td>
              <td className={`${TD} text-right font-mono font-bold text-amber-700`}>{num(sobra)}</td>
              <td className={TD} colSpan={2} />
            </tr>
          )}
        </tfoot>
      </table>

      {/* Leitura dos números + assinatura */}
      <div className="avoid-break mt-5 text-[10px] leading-relaxed text-zinc-500">
        <div>
          <strong>&ldquo;—&rdquo;</strong> significa dado ainda não importado, diferente de <strong>0</strong>,
          que é medição com resultado zero.
        </div>
        <div>
          Divergência = estoque contado − teórico. Negativa indica falta física: perda, quebra ou
          consumo não lançado.
        </div>
      </div>

      <div className="avoid-break mt-10 grid grid-cols-2 gap-12">
        <div className="border-t border-zinc-400 pt-1 text-center text-[10px] text-zinc-600">
          Responsável pela contagem
        </div>
        <div className="border-t border-zinc-400 pt-1 text-center text-[10px] text-zinc-600">
          Conferido por
        </div>
      </div>
    </div>
  );
}
