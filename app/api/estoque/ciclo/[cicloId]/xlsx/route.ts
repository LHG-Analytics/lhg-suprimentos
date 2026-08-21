/**
 * GET /api/estoque/ciclo/[cicloId]/xlsx
 *
 * Exporta um ciclo de contagem como .xlsx de verdade — não CSV renomeado.
 *
 * Roda no servidor de propósito: o exceljs pesa ~1 MB e mandá-lo para o browser
 * engordaria o bundle de todas as páginas. Aqui ele fica fora do bundle e ainda
 * dá controle real de formatação (largura de coluna, formato numérico, cabeçalho
 * congelado, cor condicional na divergência).
 */
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { calcularTeorico, calcularDivergencia, calcularARepor, rotuloMes } from "@/lib/estoque/ciclo";

// Paleta alinhada com o PDF do Mapa de Cotação (papel, não tema dark)
const VERDE_ESCURO = "FF065F46";
const CINZA_BORDA  = "FFD4D4D8";
const CINZA_FUNDO  = "FFF4F4F5";
const VERMELHO     = "FFB91C1C";
const AMBAR        = "FF92400E";

interface CicloItemRow {
  contagem_anterior: number | null;
  entradas:          number | null;
  saidas:            number | null;
  contagem_atual:    number | null;
  contado_em:        string | null;
  estoque_itens: {
    estoque_ideal: number;
    produtos: { nome: string; codigo: string; unidade_med: string; categoria: string | null } | null;
  } | null;
  user_profiles: { nome: string } | null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ cicloId: string }> },
) {
  const { cicloId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });

  const { data: ciclo } = await supabase
    .from("estoque_ciclos")
    .select("id, mes, status, fechado_em, locais_estoque(nome)")
    .eq("id", cicloId)
    .maybeSingle();

  if (!ciclo) return NextResponse.json({ erro: "Ciclo não encontrado" }, { status: 404 });

  const localNome = (ciclo.locais_estoque as { nome: string } | null)?.nome ?? "—";

  const { data: itensRaw } = await supabase
    .from("estoque_ciclo_itens")
    .select(`
      contagem_anterior, entradas, saidas, contagem_atual, contado_em,
      estoque_itens ( estoque_ideal, produtos ( nome, codigo, unidade_med, categoria ) ),
      user_profiles ( nome )
    `)
    .eq("ciclo_id", cicloId);

  const itens = (itensRaw ?? []) as unknown as CicloItemRow[];
  itens.sort((a, b) =>
    (a.estoque_itens?.produtos?.nome ?? "").localeCompare(b.estoque_itens?.produtos?.nome ?? "", "pt-BR"),
  );

  const wb = new ExcelJS.Workbook();
  wb.creator = "LHG Suprimentos";
  wb.created = new Date();

  const ws = wb.addWorksheet(`Contagem`, {
    views: [{ state: "frozen", ySplit: 5 }],   // congela cabeçalho + título
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });

  // ── Título ──────────────────────────────────────────────────────────────────
  ws.mergeCells("A1:J1");
  const t = ws.getCell("A1");
  t.value = "CONTROLE DE ESTOQUE";
  t.font = { size: 15, bold: true, color: { argb: "FF18181B" } };
  t.alignment = { horizontal: "center" };

  ws.mergeCells("A2:J2");
  const sub = ws.getCell("A2");
  sub.value = `${localNome} · ${rotuloMes(ciclo.mes)} · ${ciclo.status === "fechado" ? "fechado" : "em contagem"}`;
  sub.font = { size: 10, color: { argb: "FF71717A" } };
  sub.alignment = { horizontal: "center" };

  ws.getRow(3).height = 6;   // respiro

  // ── Cabeçalho ───────────────────────────────────────────────────────────────
  const COLUNAS = [
    { header: "ITEM",              key: "item",      width: 42 },
    { header: "CÓDIGO",            key: "codigo",    width: 12 },
    { header: "UN",                key: "un",        width: 7  },
    { header: "CATEGORIA",         key: "categoria", width: 20 },
    { header: "CONTAGEM ANTERIOR", key: "anterior",  width: 18 },
    { header: "ENTRADAS",          key: "entradas",  width: 12 },
    { header: "VENDAS PERÍODO",    key: "saidas",    width: 15 },
    { header: "TEÓRICO",           key: "teorico",   width: 12 },
    { header: "ESTOQUE ATUAL",     key: "contado",   width: 14 },
    { header: "DIVERGÊNCIA",       key: "diverg",    width: 13 },
    { header: "ESTOQUE IDEAL",     key: "ideal",     width: 14 },
    { header: "A REPOR",           key: "repor",     width: 11 },
    { header: "CONTADO POR",       key: "por",       width: 22 },
  ];

  ws.columns = COLUNAS.map(c => ({ key: c.key, width: c.width }));

  const head = ws.getRow(4);
  COLUNAS.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE_ESCURO } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: CINZA_BORDA } } };
  });
  head.height = 28;

  // ── Linhas ──────────────────────────────────────────────────────────────────
  const NUM = "#,##0.000";
  let linha = 5;

  for (const it of itens) {
    const prod    = it.estoque_itens?.produtos;
    const ideal   = it.estoque_itens?.estoque_ideal ?? 0;
    const teorico = calcularTeorico({
      contagem_anterior: it.contagem_anterior,
      entradas:          it.entradas,
      saidas:            it.saidas,
    });
    const diverg = calcularDivergencia(it.contagem_atual, teorico);
    const repor  = calcularARepor(ideal, it.contagem_atual);

    const r = ws.getRow(linha);
    // `null` vira "—" de propósito: célula vazia se confunde com zero, e zero
    // significa "medido e deu zero" enquanto — significa "ainda não importado".
    r.getCell(1).value  = prod?.nome ?? "—";
    r.getCell(2).value  = prod?.codigo ?? "—";
    r.getCell(3).value  = prod?.unidade_med ?? "—";
    r.getCell(4).value  = prod?.categoria ?? "—";
    r.getCell(5).value  = it.contagem_anterior ?? "—";
    r.getCell(6).value  = it.entradas ?? "—";
    r.getCell(7).value  = it.saidas ?? "—";
    r.getCell(8).value  = teorico ?? "—";
    r.getCell(9).value  = it.contagem_atual ?? "—";
    r.getCell(10).value = diverg ?? "—";
    r.getCell(11).value = ideal;
    r.getCell(12).value = repor ?? "—";
    r.getCell(13).value = it.user_profiles?.nome ?? "—";

    for (let c = 5; c <= 12; c++) {
      const cell = r.getCell(c);
      if (typeof cell.value === "number") cell.numFmt = NUM;
      cell.alignment = { horizontal: "right" };
    }

    // Divergência: cor só reforça, o número é sempre o dado principal
    if (typeof diverg === "number" && diverg !== 0) {
      r.getCell(10).font = { bold: true, color: { argb: diverg < 0 ? VERMELHO : AMBAR } };
    }

    if (linha % 2 === 1) {
      for (let c = 1; c <= 13; c++) {
        r.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA_FUNDO } };
      }
    }

    linha++;
  }

  // ── Rodapé com a leitura dos números ────────────────────────────────────────
  const perda = itens.reduce((acc, it) => {
    const t = calcularTeorico({
      contagem_anterior: it.contagem_anterior, entradas: it.entradas, saidas: it.saidas,
    });
    const d = calcularDivergencia(it.contagem_atual, t);
    return d != null && d < 0 ? acc + d : acc;
  }, 0);

  linha++;
  ws.mergeCells(`A${linha}:D${linha}`);
  const rot = ws.getCell(`A${linha}`);
  rot.value = "DIVERGÊNCIA NEGATIVA ACUMULADA";
  rot.font = { bold: true, size: 9, color: { argb: "FF52525B" } };

  const cel = ws.getCell(`E${linha}`);
  cel.value = perda;
  cel.numFmt = NUM;
  cel.font = { bold: true, color: { argb: perda < 0 ? VERMELHO : "FF18181B" } };
  cel.alignment = { horizontal: "right" };

  linha += 2;
  const nota = ws.getCell(`A${linha}`);
  nota.value = '"—" significa dado ainda não importado, diferente de zero, que é medição com resultado zero.';
  nota.font = { size: 8, italic: true, color: { argb: "FF71717A" } };

  const buffer = await wb.xlsx.writeBuffer();
  const nomeArquivo = `estoque-${localNome.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${ciclo.mes.slice(0, 7)}.xlsx`;

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
      "Cache-Control": "no-store",
    },
  });
}
