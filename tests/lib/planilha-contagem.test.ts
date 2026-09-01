import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { lerLinhasDaPlanilha, valorBrutoDaCelula } from "@/lib/estoque/planilha-contagem";
import {
  CABECALHO_ID_INTERNO,
  CABECALHO_VALOR_ABERTURA,
  CABECALHO_VALOR_FECHAMENTO,
} from "@/lib/estoque/import-contagem";

/**
 * Estes testes usam workbook de verdade porque é a única forma de exercitar a
 * coerção de célula e a busca do cabeçalho — nenhum mock reproduz o que o
 * exceljs devolve em `.value` para fórmula, texto formatado e célula mesclada.
 */

const ID_1 = "11111111-1111-4111-8111-111111111111";
const ID_2 = "22222222-2222-4222-8222-222222222222";

/** Reproduz o layout da exportação de fechamento (cabeçalho na linha 4). */
function planilhaFechamento(): ExcelJS.Worksheet {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Contagem");

  ws.mergeCells("A1:M1");
  ws.getCell("A1").value = "CONTROLE DE ESTOQUE";
  ws.mergeCells("A2:M2");
  ws.getCell("A2").value = "Lush Ipiranga · setembro de 2026 · em contagem";

  const cabecalho = [
    "ITEM", "CÓDIGO", "UN", "CATEGORIA", "CONTAGEM ANTERIOR", "ENTRADAS",
    "VENDAS PERÍODO", "TEÓRICO", CABECALHO_VALOR_FECHAMENTO, "DIVERGÊNCIA",
    "ESTOQUE IDEAL", "A REPOR", "CONTADO POR", CABECALHO_ID_INTERNO,
  ];
  cabecalho.forEach((h, i) => { ws.getRow(4).getCell(i + 1).value = h; });

  // Linha 5: item contado. Linha 6: item não contado, com "—" como a exportação
  // escreve. Os dois casos precisam sair diferentes da leitura.
  const linha5 = ["COCA COLA", "1001", "UN", "BEBIDAS", 10, 24, 20, 14, 12, -2, 12, 0, "Keila", ID_1];
  linha5.forEach((v, i) => { ws.getRow(5).getCell(i + 1).value = v; });

  const linha6 = ["AGUA COM GAS", "1002", "UN", "BEBIDAS", "—", "—", "—", "—", "—", "—", 6, "—", "—", ID_2];
  linha6.forEach((v, i) => { ws.getRow(6).getCell(i + 1).value = v; });

  // Rodapé da exportação — não é item e não pode virar linha.
  ws.mergeCells("A8:D8");
  ws.getCell("A8").value = "DIVERGÊNCIA NEGATIVA ACUMULADA";
  ws.getCell("E8").value = -2;
  ws.getCell("A10").value = 'Preencha a coluna "ESTOQUE ATUAL" e suba este arquivo de volta…';

  return ws;
}

describe("lerLinhasDaPlanilha — arquivo no formato da exportação", () => {
  it("acha o cabeçalho na linha 4 e lê só as linhas de item", () => {
    const res = lerLinhasDaPlanilha(planilhaFechamento(), "fechamento");
    expect("erro" in res).toBe(false);
    if ("erro" in res) return;

    expect(res.linhaCabecalho).toBe(4);
    expect(res.colunas.valor).toBe(9);
    expect(res.colunas.cicloItemId).toBe(14);
    // O rodapé (linhas 8 e 10) não entra: não tem item, código nem id.
    expect(res.linhas).toHaveLength(2);
  });

  it("lê o valor contado e traz o id da coluna oculta", () => {
    const res = lerLinhasDaPlanilha(planilhaFechamento(), "fechamento");
    if ("erro" in res) throw new Error(res.erro);

    expect(res.linhas[0]).toMatchObject({
      linhaExcel: 5,
      cicloItemId: ID_1,
      codigo: "1001",
      nome: "COCA COLA",
      valor: { tipo: "numero", valor: 12 },
    });
  });

  // O "—" da exportação tem que voltar como "não mexer". Se virasse 0, reimportar
  // um arquivo sem preencher zeraria o estoque de todos os itens não contados.
  it("trata o travessão da exportação como ausência de dado, não como zero", () => {
    const res = lerLinhasDaPlanilha(planilhaFechamento(), "fechamento");
    if ("erro" in res) throw new Error(res.erro);

    expect(res.linhas[1]).toMatchObject({
      linhaExcel: 6,
      cicloItemId: ID_2,
      valor: { tipo: "vazio" },
    });
  });
});

describe("lerLinhasDaPlanilha — linha acrescentada à mão", () => {
  /**
   * Linha nova no fim da planilha, para um produto que a equipe contou e não está
   * cadastrado. Não tem o id da exportação, então não pode ser importada — mas
   * também não pode desaparecer calada: alguém digitou aquele número.
   */
  function planilhaComLinhaExtra(): ExcelJS.Worksheet {
    const ws = planilhaFechamento();
    const extra = ["CERVEJA HEINEKEN", "9999", "UN", "BEBIDAS", "—", "—", "—", "—", 24, "—", 0, "—", "—", null];
    extra.forEach((v, i) => { ws.getRow(7).getCell(i + 1).value = v; });
    return ws;
  }

  it("conta a linha sem vínculo que tem contagem preenchida", () => {
    const res = lerLinhasDaPlanilha(planilhaComLinhaExtra(), "fechamento");
    if ("erro" in res) throw new Error(res.erro);

    expect(res.linhasSemVinculo).toBe(1);
    // Não entra como item: sem id, não há como saber a qual linha do ciclo pertence.
    expect(res.linhas).toHaveLength(2);
  });

  // O rodapé cai no mesmo descarte, mas nunca tem número na coluna de contagem —
  // se inflasse este aviso, toda importação abriria com alerta falso.
  it("não conta o rodapé da exportação como linha descartada", () => {
    const res = lerLinhasDaPlanilha(planilhaFechamento(), "fechamento");
    if ("erro" in res) throw new Error(res.erro);
    expect(res.linhasSemVinculo).toBe(0);
  });
});

describe("lerLinhasDaPlanilha — arquivo de saldo de abertura", () => {
  function planilhaAbertura(): ExcelJS.Worksheet {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Contagem");
    const cabecalho = [
      "ITEM", "CÓDIGO", "UN", "CATEGORIA", CABECALHO_VALOR_ABERTURA,
      "ESTOQUE IDEAL", "CONTADO POR", CABECALHO_ID_INTERNO,
    ];
    cabecalho.forEach((h, i) => { ws.getRow(4).getCell(i + 1).value = h; });
    const linha = ["COCA COLA", "1001", "UN", "BEBIDAS", 30, 12, "—", ID_1];
    linha.forEach((v, i) => { ws.getRow(5).getCell(i + 1).value = v; });
    return ws;
  }

  it("lê a coluna de saldo de abertura", () => {
    const res = lerLinhasDaPlanilha(planilhaAbertura(), "abertura");
    if ("erro" in res) throw new Error(res.erro);

    expect(res.colunas.valor).toBe(5);
    expect(res.linhas[0]).toMatchObject({ cicloItemId: ID_1, valor: { tipo: "numero", valor: 30 } });
  });

  it("recusa com mensagem útil quando o arquivo é do outro estágio", () => {
    const res = lerLinhasDaPlanilha(planilhaAbertura(), "fechamento");
    expect(res).toHaveProperty("erro");
    expect((res as { erro: string }).erro).toContain("Baixe o Excel de novo");
  });
});

describe("lerLinhasDaPlanilha — planilha mexida pela equipe", () => {
  it("acha o cabeçalho mesmo com linhas de anotação acima", () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Contagem");
    ws.getCell("A1").value = "conferir com o Paulo antes de mandar";
    ws.getCell("A2").value = "contagem feita 01/09 de manhã";
    ["ITEM", CABECALHO_VALOR_FECHAMENTO].forEach((h, i) => {
      ws.getRow(6).getCell(i + 1).value = h;
    });
    ws.getRow(7).getCell(1).value = "COCA COLA";
    ws.getRow(7).getCell(2).value = "12,5";

    const res = lerLinhasDaPlanilha(ws, "fechamento");
    if ("erro" in res) throw new Error(res.erro);

    expect(res.linhaCabecalho).toBe(6);
    expect(res.linhas[0]).toMatchObject({
      nome: "COCA COLA", valor: { tipo: "numero", valor: 12.5 },
    });
  });

  it("lê célula com fórmula pelo resultado calculado", () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Contagem");
    ["ITEM", CABECALHO_VALOR_FECHAMENTO].forEach((h, i) => {
      ws.getRow(1).getCell(i + 1).value = h;
    });
    ws.getRow(2).getCell(1).value = "COCA COLA";
    // Total somado na própria planilha (6 caixas + 6 avulsas) — caso real de
    // quem conta em partes e deixa a soma para o Excel.
    ws.getRow(2).getCell(2).value = { formula: "6+6", result: 12 };

    const res = lerLinhasDaPlanilha(ws, "fechamento");
    if ("erro" in res) throw new Error(res.erro);
    expect(res.linhas[0]?.valor).toEqual({ tipo: "numero", valor: 12 });
  });

  it("lê célula com texto formatado", () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Contagem");
    ["ITEM", CABECALHO_VALOR_FECHAMENTO].forEach((h, i) => {
      ws.getRow(1).getCell(i + 1).value = h;
    });
    ws.getRow(2).getCell(1).value = {
      richText: [{ text: "COCA " }, { text: "COLA", font: { bold: true } }],
    };
    ws.getRow(2).getCell(2).value = 9;

    const res = lerLinhasDaPlanilha(ws, "fechamento");
    if ("erro" in res) throw new Error(res.erro);
    expect(res.linhas[0]?.nome).toBe("COCA COLA");
  });
});

describe("valorBrutoDaCelula", () => {
  it("não devolve '[object Object]' para valor estruturado", () => {
    expect(valorBrutoDaCelula({ result: 7 })).toBe(7);
    expect(valorBrutoDaCelula({ text: "8" })).toBe("8");
    expect(valorBrutoDaCelula({ richText: [{ text: "1" }, { text: "0" }] })).toBe("10");
  });
});
