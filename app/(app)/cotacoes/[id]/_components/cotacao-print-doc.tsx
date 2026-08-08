"use client";

/**
 * cotacao-print-doc.tsx
 * Documento de impressão do Mapa de Cotação (PDF via window.print).
 * Layout claro estilo planilha de compras — cores fixas (não usa tokens dark),
 * para renderizar corretamente no papel. Visível só dentro do overlay/print.
 */
import { calcularEconomia, type ItemEconomia } from "@/lib/cotacao/economia";
import type { MatrizCellData } from "./matriz-celula";

interface Produto    { id: string; codigo: string; nome: string; unidade_med: string; omie_codigo: string | null }
interface CotacaoItem {
  id: string; quantidade: number; selecionado_forn: string | null;
  produtos: Produto | null; cotacao_matriz: MatrizCellData[];
  produto_nome_livre: string | null; produto_unidade_med: string | null; produto_novo: boolean | null;
}
interface Forn { id: string; razao_social: string; nome_fantasia: string | null; telefone?: string | null; contato?: string | null }

interface Props {
  numero:        string;
  titulo:        string;
  unidades:      string;
  comprador:     string | null;
  dataEmissao:   string;
  prazo:         string | null;
  fornecedores:  Forn[];
  itens:         CotacaoItem[];
  selecoes:      Record<string, string | null>;
  matrizMap:     Record<string, Record<string, MatrizCellData>>;
}

function brl(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function nomeForn(f: Forn) { return f.nome_fantasia || f.razao_social; }

export function CotacaoPrintDoc({
  numero, titulo, unidades, comprador, dataEmissao, prazo,
  fornecedores, itens, selecoes, matrizMap,
}: Props) {
  const cell = (itemId: string, fornId: string) => matrizMap[itemId]?.[fornId] ?? null;

  function subtotalForn(fId: string) {
    return itens.reduce((acc, it) => {
      const c = cell(it.id, fId);
      return c?.preco_unitario ? acc + c.preco_unitario * it.quantidade : acc;
    }, 0);
  }
  function freteForn(fId: string) {
    return itens.reduce((acc, it) => {
      const c = cell(it.id, fId);
      return c?.preco_unitario && c.frete ? acc + c.frete : acc;
    }, 0);
  }
  function prazoForn(fId: string) {
    const ps = itens.map(it => cell(it.id, fId)?.prazo_entrega_dias).filter((p): p is number => p != null);
    return ps.length ? Math.max(...ps) : null;
  }
  function pagamentoForn(fId: string) {
    return itens.map(it => cell(it.id, fId)?.condicao_pagamento).find(p => p && p.trim()) ?? null;
  }
  function garantiaForn(fId: string) {
    const s = new Set<string>();
    itens.forEach(it => { const g = cell(it.id, fId)?.garantia?.trim(); if (g) s.add(g); });
    return s.size ? Array.from(s).join(" · ") : null;
  }
  /**
   * Observações de células SEM preço — as com preço já aparecem sob o valor, na
   * própria célula. Sem esse filtro o rodapé repetiria cada descrição de modelo,
   * virando um bloco de texto gigante no PDF.
   */
  function obsForn(fId: string) {
    const s = new Set<string>();
    itens.forEach(it => {
      const c = cell(it.id, fId);
      if (c?.preco_unitario) return;
      const o = c?.observacao?.trim();
      if (o) s.add(o);
    });
    return s.size ? Array.from(s).join(" · ") : null;
  }
  function totalSelecionadoForn(fId: string) {
    return itens.reduce((acc, it) => {
      if (selecoes[it.id] !== fId) return acc;
      const c = cell(it.id, fId);
      return c?.preco_unitario ? acc + c.preco_unitario * it.quantidade + (c.frete ?? 0) : acc;
    }, 0);
  }

  const totalGeralSelecionado = fornecedores.reduce((acc, f) => acc + totalSelecionadoForn(f.id), 0);
  const itensSelecionados = itens.filter(i => selecoes[i.id]).length;

  /**
   * Economia pelo MESMO critério da barra da tela, da lista de cotações e do
   * valor gravado na aprovação (`calcularEconomia`): por item com concorrência,
   * o preço escolhido contra o MAIOR preço cotado naquele item.
   * Reusar a função é o que impede o PDF de mostrar um número diferente da tela.
   */
  const { economia, economiaPct } = calcularEconomia(
    itens
      .filter(it => selecoes[it.id])
      .map<ItemEconomia>(it => ({
        quantidade:    it.quantidade,
        precoVencedor: cell(it.id, selecoes[it.id]!)?.preco_unitario ?? 0,
        precosCotados: Object.values(matrizMap[it.id] ?? {})
          .map(c => c.preco_unitario)
          .filter((p): p is number => p != null && p > 0),
      }))
      .filter(it => it.precoVencedor > 0),
  );

  // Larguras proporcionais — coluna item maior, fornecedores dividem o resto
  const colFornPct = fornecedores.length > 0 ? Math.max(12, Math.floor(62 / fornecedores.length)) : 20;

  return (
    <div
      id="cotacao-print-doc"
      className="bg-white text-zinc-900 mx-auto"
      style={{
        fontFamily: "var(--font-sans, system-ui)",
        maxWidth: "100%",
        padding: "4mm",
        // Garante que os fundos (header escuro, faixa verde) saiam no PDF
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      {/* Cabeçalho do documento */}
      <div className="flex items-start justify-between border-b-2 border-zinc-900 pb-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-emerald-600 text-white font-bold text-lg tracking-tight">
            LHG
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Setor de Compras · LHG Moteis</div>
            <h1 className="text-xl font-bold leading-tight text-zinc-900">Mapa de Cotação</h1>
            <div className="text-[13px] text-zinc-600 leading-tight">{titulo}</div>
          </div>
        </div>
        <table className="text-[11px] text-right">
          <tbody>
            <tr><td className="pr-2 text-zinc-500 uppercase tracking-wide">Nº</td><td className="font-mono font-semibold text-zinc-900">{numero}</td></tr>
            <tr><td className="pr-2 text-zinc-500 uppercase tracking-wide">Data</td><td className="font-mono text-zinc-800">{dataEmissao}</td></tr>
            {prazo && <tr><td className="pr-2 text-zinc-500 uppercase tracking-wide">Prazo</td><td className="font-mono text-zinc-800">{prazo}</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Faixa de metadados */}
      <div className="grid grid-cols-3 gap-3 mb-4 text-[11px]">
        <div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2">
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">Unidade</div>
          <div className="font-medium text-zinc-900">{unidades || "—"}</div>
        </div>
        <div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2">
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">Comprador</div>
          <div className="font-medium text-zinc-900">{comprador || "—"}</div>
        </div>
        <div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2">
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">Fornecedores cotados</div>
          <div className="font-medium text-zinc-900">{fornecedores.length}</div>
        </div>
      </div>

      {/* Tabela comparativa */}
      <table className="w-full border-collapse text-[10px]" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: `${38 - Math.min(18, fornecedores.length * 3)}%` }} />
          {fornecedores.map(f => <col key={f.id} style={{ width: `${colFornPct}%` }} />)}
        </colgroup>
        <thead>
          <tr className="bg-zinc-900 text-white">
            <th className="border border-zinc-700 px-2 py-2 text-left align-bottom text-[10px] uppercase tracking-wide">
              Descrição dos produtos
            </th>
            {fornecedores.map(f => (
              <th key={f.id} className="border border-zinc-700 px-2 py-2 text-center align-bottom">
                <div className="font-semibold leading-tight">{nomeForn(f)}</div>
                <div className="text-[8px] font-normal text-zinc-300 leading-tight mt-0.5">
                  {f.contato || "—"}{f.telefone ? ` · ${f.telefone}` : ""}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {itens.map((item, idx) => {
            const prod = item.produtos;
            const nome = prod?.nome ?? item.produto_nome_livre ?? "—";
            const unid = prod?.unidade_med ?? item.produto_unidade_med ?? "";
            const semOmie = item.produto_novo === true || (!!prod && !prod.omie_codigo);
            return (
              <tr key={item.id} className={idx % 2 ? "bg-zinc-50" : "bg-white"}>
                <td className="border border-zinc-300 px-2 py-1.5 align-top">
                  <div className="flex gap-1.5">
                    <span className="font-mono text-zinc-400 tabular-nums">{idx + 1}.</span>
                    <div>
                      <div className="font-medium text-zinc-900 leading-snug">{nome}</div>
                      <div className="text-[9px] text-zinc-500 font-mono">
                        {item.quantidade} {unid}{prod?.codigo ? ` · ${prod.codigo}` : ""}
                        {semOmie && <span className="text-amber-700"> · cadastrar no Omie</span>}
                      </div>
                    </div>
                  </div>
                </td>
                {fornecedores.map(f => {
                  const c = cell(item.id, f.id);
                  const sel = selecoes[item.id] === f.id;
                  const total = c?.preco_unitario ? c.preco_unitario * item.quantidade : null;
                  return (
                    <td
                      key={f.id}
                      className={`border border-zinc-300 px-2 py-1.5 text-right align-top ${sel ? "bg-emerald-50" : ""}`}
                    >
                      {c?.preco_unitario ? (
                        <>
                          <div className={`font-mono font-semibold ${sel ? "text-emerald-700" : "text-zinc-900"}`}>
                            {sel && <span className="float-left text-emerald-600">✓</span>}
                            {brl(c.preco_unitario)}
                          </div>
                          <div className="font-mono text-[9px] text-zinc-500">{brl(total)}</div>
                          {/*
                            Observação por célula. A linha do rodapé junta todas as
                            observações do fornecedor com " · " e perde a qual item
                            cada uma pertence — mas é justamente aqui que ela
                            identifica o modelo cotado para ESTE item.
                          */}
                          {c.observacao?.trim() && (
                            <div className="mt-0.5 text-[8px] leading-snug text-zinc-600 italic text-left whitespace-normal break-words">
                              {c.observacao.trim()}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          {/* Subtotal */}
          <tr className="bg-zinc-100">
            <td className="border border-zinc-300 px-2 py-1.5 text-[9px] uppercase tracking-wide text-zinc-600 font-semibold">Subtotal itens</td>
            {fornecedores.map(f => {
              const v = subtotalForn(f.id);
              return <td key={f.id} className="border border-zinc-300 px-2 py-1.5 text-right font-mono text-zinc-700">{v > 0 ? brl(v) : "—"}</td>;
            })}
          </tr>
          {/* Frete */}
          <tr className="bg-zinc-100">
            <td className="border border-zinc-300 px-2 py-1.5 text-[9px] uppercase tracking-wide text-zinc-600 font-semibold">Frete</td>
            {fornecedores.map(f => {
              const v = freteForn(f.id);
              const temCot = subtotalForn(f.id) > 0;
              return <td key={f.id} className="border border-zinc-300 px-2 py-1.5 text-right font-mono text-zinc-700">{!temCot ? "—" : v > 0 ? brl(v) : "grátis"}</td>;
            })}
          </tr>
          {/* Total selecionado */}
          <tr className="bg-emerald-600 text-white">
            <td className="border border-emerald-700 px-2 py-1.5 text-[10px] uppercase tracking-wide font-bold">Total selecionado</td>
            {fornecedores.map(f => {
              const v = totalSelecionadoForn(f.id);
              return <td key={f.id} className="border border-emerald-700 px-2 py-1.5 text-right font-mono font-bold">{v > 0 ? brl(v) : "—"}</td>;
            })}
          </tr>
          {/* Condição pgto */}
          <tr>
            <td className="border border-zinc-300 px-2 py-1.5 text-[9px] uppercase tracking-wide text-zinc-600 font-semibold">Cond. pagamento</td>
            {fornecedores.map(f => <td key={f.id} className="border border-zinc-300 px-2 py-1.5 text-center text-[9px] text-zinc-700">{pagamentoForn(f.id) ?? "—"}</td>)}
          </tr>
          {/* Prazo entrega */}
          <tr>
            <td className="border border-zinc-300 px-2 py-1.5 text-[9px] uppercase tracking-wide text-zinc-600 font-semibold">Prazo entrega</td>
            {fornecedores.map(f => { const p = prazoForn(f.id); return <td key={f.id} className="border border-zinc-300 px-2 py-1.5 text-center font-mono text-[9px] text-zinc-700">{p != null ? `${p} dias` : "—"}</td>; })}
          </tr>
          {/* Garantia */}
          <tr>
            <td className="border border-zinc-300 px-2 py-1.5 text-[9px] uppercase tracking-wide text-zinc-600 font-semibold">Garantia</td>
            {fornecedores.map(f => <td key={f.id} className="border border-zinc-300 px-2 py-1.5 text-center text-[9px] text-zinc-700">{garantiaForn(f.id) ?? "—"}</td>)}
          </tr>
          {/* Observação — só aparece se sobrou algo que não está nas células */}
          {fornecedores.some(f => obsForn(f.id)) && (
            <tr>
              <td className="border border-zinc-300 px-2 py-1.5 text-[9px] uppercase tracking-wide text-zinc-600 font-semibold align-top">Observação</td>
              {fornecedores.map(f => <td key={f.id} className="border border-zinc-300 px-2 py-1.5 text-center text-[9px] text-zinc-600 italic align-top">{obsForn(f.id) ?? "—"}</td>)}
            </tr>
          )}
        </tfoot>
      </table>

      {/* Resumo + assinatura */}
      <div className="mt-5 flex items-end justify-between avoid-break">
        <div className="text-[10px] text-zinc-500 leading-relaxed">
          <div>Emitido em {dataEmissao} pelo LHG Suprimentos.</div>
          <div>{itensSelecionados} de {itens.length} {itens.length === 1 ? "item selecionado" : "itens selecionados"}.</div>
        </div>
        <div className="flex items-end gap-8">
          {economia != null && economia > 0 && (
            <div className="text-right border-r border-zinc-300 pr-8">
              <div className="text-[9px] uppercase tracking-wider text-zinc-500">Economia (vs maior preço)</div>
              <div className="font-mono text-xl font-bold text-emerald-600">{brl(economia)}</div>
              {economiaPct != null && (
                <div className="text-[9px] text-zinc-500">
                  {economiaPct.toFixed(1)}% sobre o cenário mais caro
                </div>
              )}
            </div>
          )}
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-wider text-zinc-500">Total da compra (seleção)</div>
            <div className="font-mono text-2xl font-bold text-emerald-700">{brl(totalGeralSelecionado)}</div>
          </div>
        </div>
      </div>

      <div className="mt-10 grid grid-cols-2 gap-12 avoid-break">
        <div className="border-t border-zinc-400 pt-1 text-center text-[10px] text-zinc-600">
          {comprador || "Comprador"}<div className="text-[8px] uppercase tracking-wider text-zinc-400">Comprador responsável</div>
        </div>
        <div className="border-t border-zinc-400 pt-1 text-center text-[10px] text-zinc-600">
          Aprovação<div className="text-[8px] uppercase tracking-wider text-zinc-400">Gestor / Diretoria</div>
        </div>
      </div>
    </div>
  );
}
