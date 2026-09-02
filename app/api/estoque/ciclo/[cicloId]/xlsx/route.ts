/**
 * GET /api/estoque/ciclo/[cicloId]/xlsx
 *
 * Exporta um ciclo de contagem como .xlsx de verdade — não CSV renomeado.
 *
 * Roda no servidor de propósito: o exceljs pesa ~1 MB e mandá-lo para o browser
 * engordaria o bundle de todas as páginas. Aqui ele fica fora do bundle e ainda
 * dá controle real de formatação (largura de coluna, formato numérico, cabeçalho
 * congelado, cor condicional na divergência).
 *
 * A planilha é também o formato de ENTRADA: a equipe preenche a coluna de
 * contagem e sobe o arquivo de volta (ver `analisarPlanilhaContagem`). Por isso
 * há uma coluna oculta com o `ciclo_item_id` — é ela que faz o casamento ser
 * exato e permite recusar planilha de outro mês.
 */
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { calcularTeorico, calcularDivergencia, calcularARepor, rotuloMes } from "@/lib/estoque/ciclo";
import {
  CABECALHO_ID_INTERNO,
  CABECALHO_VALOR_ABERTURA,
  CABECALHO_VALOR_FECHAMENTO,
  type ModoContagem,
} from "@/lib/estoque/import-contagem";

// Paleta alinhada com o PDF do Mapa de Cotação (papel, não tema dark)
const VERDE_ESCURO = "FF065F46";
const CINZA_BORDA  = "FFD4D4D8";
const CINZA_FUNDO  = "FFF4F4F5";
const VERMELHO     = "FFB91C1C";
const AMBAR        = "FF92400E";

const NUM = "#,##0.000";

interface CicloItemRow {
  id:                string;
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

/** Tudo o que uma célula pode precisar, calculado uma vez por linha. */
interface Contexto {
  it:      CicloItemRow;
  ideal:   number;
  teorico: number | null;
  diverg:  number | null;
  repor:   number | null;
}

interface ColunaDef {
  header:    string;
  width:     number;
  /** `null` sai como "—". */
  valor:     (ctx: Contexto) => string | number | null;
  numerica?: boolean;
  /** Cor ARGB para a fonte, quando o valor merece destaque. */
  destaque?: (ctx: Contexto) => string | null;
  /** Coluna técnica: existe para o import casar, não para a pessoa ler. */
  oculta?:   boolean;
}

const COL_ITEM: ColunaDef      = { header: "ITEM",      width: 42, valor: (c) => c.it.estoque_itens?.produtos?.nome ?? null };
const COL_CODIGO: ColunaDef    = { header: "CÓDIGO",    width: 12, valor: (c) => c.it.estoque_itens?.produtos?.codigo ?? null };
const COL_UN: ColunaDef        = { header: "UN",        width: 7,  valor: (c) => c.it.estoque_itens?.produtos?.unidade_med ?? null };
const COL_CATEGORIA: ColunaDef = { header: "CATEGORIA", width: 20, valor: (c) => c.it.estoque_itens?.produtos?.categoria ?? null };
const COL_IDEAL: ColunaDef     = { header: "ESTOQUE IDEAL", width: 14, valor: (c) => c.ideal, numerica: true };
const COL_POR: ColunaDef       = { header: "CONTADO POR",   width: 22, valor: (c) => c.it.user_profiles?.nome ?? null };

/*
 * Coluna técnica que carrega o vínculo com a linha do ciclo.
 *
 * Oculta porque não é informação para quem lê a planilha, mas presente porque é
 * o que permite ao import casar exato e RECUSAR arquivo de outro mês — sem ela,
 * a planilha de setembro importaria lisa no ciclo de outubro, casando por código.
 */
const COL_ID: ColunaDef = {
  header: CABECALHO_ID_INTERNO, width: 38, oculta: true, valor: (c) => c.it.id,
};

/**
 * Colunas do arquivo de saldo de abertura.
 *
 * TEÓRICO, ESTOQUE ATUAL, DIVERGÊNCIA e A REPOR ficam de fora: nesse estágio
 * todas valem "—", e a de nome mais convidativo ("ESTOQUE ATUAL") é justamente a
 * que NÃO deve ser preenchida — quem conta no dia 1 está medindo o estoque atual,
 * e escreveria ali. Restando uma única coluna de número, não há como errar.
 */
const COLUNAS_ABERTURA: ColunaDef[] = [
  COL_ITEM, COL_CODIGO, COL_UN, COL_CATEGORIA,
  { header: CABECALHO_VALOR_ABERTURA, width: 20, valor: (c) => c.it.contagem_anterior, numerica: true },
  COL_IDEAL, COL_POR, COL_ID,
];

/**
 * Colunas do arquivo de contagem de fechamento — a planilha completa.
 *
 * `montarColunasFechamento` recebe `ehPrimeiroCiclo` porque a coluna do saldo
 * inicial muda de nome: no primeiro ciclo do local não existe mês anterior, e
 * chamá-la de "CONTAGEM ANTERIOR" no papel é a mesma mentira que estava na tela.
 *
 * ⚠️ O rótulo leva "(INFORMATIVO)" de propósito. `CABECALHO_VALOR_ABERTURA` é a
 * constante que o IMPORT procura para saber em qual coluna gravar; se este
 * cabeçalho fosse idêntico a ela, uma planilha de fechamento passaria a ter duas
 * colunas candidatas e alguém poderia preencher a errada e ver o número ser
 * ignorado em silêncio.
 */
function montarColunasFechamento(ehPrimeiroCiclo: boolean): ColunaDef[] {
  return [
    COL_ITEM, COL_CODIGO, COL_UN, COL_CATEGORIA,
    {
      header: ehPrimeiroCiclo ? `${CABECALHO_VALOR_ABERTURA} (INFORMATIVO)` : "CONTAGEM ANTERIOR",
      width: 20,
      valor: (c) => c.it.contagem_anterior,
      numerica: true,
    },
    { header: "ENTRADAS",       width: 12, valor: (c) => c.it.entradas, numerica: true },
    { header: "VENDAS PERÍODO", width: 15, valor: (c) => c.it.saidas,   numerica: true },
    { header: "TEÓRICO",        width: 12, valor: (c) => c.teorico,     numerica: true },
    { header: CABECALHO_VALOR_FECHAMENTO, width: 14, valor: (c) => c.it.contagem_atual, numerica: true },
    {
      header: "DIVERGÊNCIA", width: 13, numerica: true,
      valor: (c) => c.diverg,
      // A cor só reforça; o número é sempre o dado principal.
      destaque: (c) => (c.diverg != null && c.diverg !== 0 ? (c.diverg < 0 ? VERMELHO : AMBAR) : null),
    },
    COL_IDEAL,
    { header: "A REPOR", width: 11, valor: (c) => c.repor, numerica: true },
    COL_POR, COL_ID,
  ];
}

function contextoDe(it: CicloItemRow): Contexto {
  const ideal = it.estoque_itens?.estoque_ideal ?? 0;
  const teorico = calcularTeorico({
    contagem_anterior: it.contagem_anterior,
    entradas:          it.entradas,
    saidas:            it.saidas,
  });
  return {
    it, ideal, teorico,
    diverg: calcularDivergencia(it.contagem_atual, teorico),
    repor:  calcularARepor(ideal, it.contagem_atual),
  };
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
    .select("id, local_id, mes, status, fechado_em, locais_estoque(nome)")
    .eq("id", cicloId)
    .maybeSingle();

  if (!ciclo) return NextResponse.json({ erro: "Ciclo não encontrado" }, { status: 404 });

  const localNome = (ciclo.locais_estoque as { nome: string } | null)?.nome ?? "—";

  const { data: itensRaw } = await supabase
    .from("estoque_ciclo_itens")
    .select(`
      id, contagem_anterior, entradas, saidas, contagem_atual, contado_em,
      estoque_itens ( estoque_ideal, produtos ( nome, codigo, unidade_med, categoria ) ),
      user_profiles ( nome )
    `)
    .eq("ciclo_id", cicloId);

  const itens = (itensRaw ?? []) as unknown as CicloItemRow[];
  itens.sort((a, b) =>
    (a.estoque_itens?.produtos?.nome ?? "").localeCompare(b.estoque_itens?.produtos?.nome ?? "", "pt-BR"),
  );

  // Mesma regra da tela (`faltaSaldoAbertura` em contagem/page.tsx): o modo
  // depende do que falta preencher, não de qual ciclo é — assim que o último
  // saldo de abertura entra, a exportação passa ao formato de fechamento.
  const { count: ciclosAnteriores } = await supabase
    .from("estoque_ciclos")
    .select("id", { count: "exact", head: true })
    .eq("local_id", ciclo.local_id)
    .lt("mes", ciclo.mes);
  const ehPrimeiroCiclo = (ciclosAnteriores ?? 0) === 0;
  const modo: ModoContagem =
    ehPrimeiroCiclo && itens.some((it) => it.contagem_anterior == null)
      ? "abertura"
      : "fechamento";

  const colunas = modo === "abertura" ? COLUNAS_ABERTURA : montarColunasFechamento(ehPrimeiroCiclo);
  const visiveis = colunas.filter((c) => !c.oculta).length;

  const wb = new ExcelJS.Workbook();
  wb.creator = "LHG Suprimentos";
  wb.created = new Date();

  const ws = wb.addWorksheet(`Contagem`, {
    views: [{ state: "frozen", ySplit: 5 }],   // congela cabeçalho + título
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });

  ws.columns = colunas.map((c) => ({ width: c.width }));
  colunas.forEach((c, i) => {
    if (c.oculta) ws.getColumn(i + 1).hidden = true;
  });

  const ultimaVisivel = ws.getColumn(visiveis).letter;

  // ── Título ──────────────────────────────────────────────────────────────────
  ws.mergeCells(`A1:${ultimaVisivel}1`);
  const t = ws.getCell("A1");
  t.value = "CONTROLE DE ESTOQUE";
  t.font = { size: 15, bold: true, color: { argb: "FF18181B" } };
  t.alignment = { horizontal: "center" };

  ws.mergeCells(`A2:${ultimaVisivel}2`);
  const sub = ws.getCell("A2");
  sub.value =
    `${localNome} · ${rotuloMes(ciclo.mes)} · ` +
    `${ciclo.status === "fechado" ? "fechado" : modo === "abertura" ? "saldo de abertura" : "em contagem"}`;
  sub.font = { size: 10, color: { argb: "FF71717A" } };
  sub.alignment = { horizontal: "center" };

  ws.getRow(3).height = 6;   // respiro

  // ── Cabeçalho ───────────────────────────────────────────────────────────────
  const head = ws.getRow(4);
  colunas.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE_ESCURO } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: CINZA_BORDA } } };
  });
  head.height = 28;

  // ── Linhas ──────────────────────────────────────────────────────────────────
  let linha = 5;

  for (const it of itens) {
    const ctx = contextoDe(it);
    const r = ws.getRow(linha);

    colunas.forEach((c, i) => {
      const cell = r.getCell(i + 1);
      const valor = c.valor(ctx);
      // `null` vira "—" de propósito: célula vazia se confunde com zero, e zero
      // significa "medido e deu zero" enquanto — significa "ainda não importado".
      // O import faz a leitura inversa e trata os dois como "não mexer".
      cell.value = valor ?? "—";

      if (c.numerica) {
        if (typeof cell.value === "number") cell.numFmt = NUM;
        cell.alignment = { horizontal: "right" };
      }

      const cor = c.destaque?.(ctx);
      if (cor) cell.font = { bold: true, color: { argb: cor } };

      if (linha % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA_FUNDO } };
      }
    });

    linha++;
  }

  // ── Rodapé com a leitura dos números ────────────────────────────────────────
  // No saldo de abertura não existe divergência ainda (nada foi comparado com
  // teórico), então o total não vai ao arquivo — imprimir 0 sugeriria "conferido
  // e sem furo", que é o oposto do que se sabe nesse momento.
  if (modo === "fechamento") {
    const perda = itens.reduce((acc, it) => {
      const d = contextoDe(it).diverg;
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
  }

  linha += 2;
  const nota = ws.getCell(`A${linha}`);
  nota.value =
    `Preencha a coluna "${modo === "abertura" ? CABECALHO_VALOR_ABERTURA : CABECALHO_VALOR_FECHAMENTO}" ` +
    `e suba este arquivo de volta em Contagem › Importar Excel. ` +
    `Deixe em branco o item que não foi contado — em branco significa "não contei", ` +
    `enquanto 0 significa "contei e não tem nenhum".`;
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
