import { describe, it, expect } from "vitest";
import {
  normalizarValorCelula,
  localizarColunas,
  montarPrevia,
  CABECALHO_ID_INTERNO,
  CABECALHO_VALOR_ABERTURA,
  type LinhaPlanilha,
  type ItemDoCiclo,
} from "@/lib/estoque/import-contagem";

describe("normalizarValorCelula", () => {
  // A distinção vazio/zero é a razão de esta função existir: se vazio virasse 0,
  // uma planilha preenchida pela metade zeraria o estoque de itens intocados.
  it("célula vazia é 'vazio', não zero", () => {
    expect(normalizarValorCelula(null)).toEqual({ tipo: "vazio" });
    expect(normalizarValorCelula(undefined)).toEqual({ tipo: "vazio" });
    expect(normalizarValorCelula("")).toEqual({ tipo: "vazio" });
    expect(normalizarValorCelula("   ")).toEqual({ tipo: "vazio" });
  });

  it("travessão é 'vazio' — é o que a própria exportação escreve", () => {
    expect(normalizarValorCelula("—")).toEqual({ tipo: "vazio" });
    expect(normalizarValorCelula("-")).toEqual({ tipo: "vazio" });
    expect(normalizarValorCelula("–")).toEqual({ tipo: "vazio" });
  });

  it("zero é medição legítima e é gravado", () => {
    expect(normalizarValorCelula(0)).toEqual({ tipo: "numero", valor: 0 });
    expect(normalizarValorCelula("0")).toEqual({ tipo: "numero", valor: 0 });
  });

  it("lê número nativo do Excel", () => {
    expect(normalizarValorCelula(12.5)).toEqual({ tipo: "numero", valor: 12.5 });
  });

  it("lê decimal com vírgula, como o Excel em português deixa", () => {
    expect(normalizarValorCelula("12,5")).toEqual({ tipo: "numero", valor: 12.5 });
    expect(normalizarValorCelula("0,750")).toEqual({ tipo: "numero", valor: 0.75 });
  });

  it("lê ponto de milhar junto com vírgula decimal", () => {
    expect(normalizarValorCelula("1.234,5")).toEqual({ tipo: "numero", valor: 1234.5 });
  });

  // Só o ponto é ambíguo. Grupos exatos de 3 dígitos são milhar; o resto é decimal.
  it("desambigua o ponto pela forma do número", () => {
    expect(normalizarValorCelula("1.234")).toEqual({ tipo: "numero", valor: 1234 });
    expect(normalizarValorCelula("12.5")).toEqual({ tipo: "numero", valor: 12.5 });
  });

  it("rejeita quantidade negativa", () => {
    expect(normalizarValorCelula(-3)).toEqual({ tipo: "invalido", motivo: "quantidade negativa" });
    expect(normalizarValorCelula("-3")).toEqual({ tipo: "invalido", motivo: "quantidade negativa" });
  });

  it("rejeita texto que não é número", () => {
    expect(normalizarValorCelula("ver com o Paulo")).toEqual({
      tipo: "invalido", motivo: "não é um número",
    });
    expect(normalizarValorCelula("12 un")).toEqual({ tipo: "invalido", motivo: "não é um número" });
  });
});

describe("localizarColunas", () => {
  it("acha as colunas pelo nome, não pela posição", () => {
    const res = localizarColunas(["ITEM", "CÓDIGO", "UN", "ESTOQUE ATUAL", CABECALHO_ID_INTERNO]);
    expect(res).toEqual({ valor: 4, codigo: 2, nome: 1, cicloItemId: 5 });
  });

  it("usa a coluna de saldo de abertura quando o ciclo está nesse estágio", () => {
    const res = localizarColunas(
      ["ITEM", CABECALHO_VALOR_ABERTURA, "ESTOQUE ATUAL"],
      "abertura",
    );
    expect(res).toEqual({ valor: 2, codigo: null, nome: 1, cicloItemId: null });
  });

  // As duas colunas convivem no arquivo de abertura; escolher pela ordem faria o
  // import gravar no campo errado se o layout da exportação mudasse.
  it("escolhe a coluna pelo modo, não pela ordem em que aparece", () => {
    const res = localizarColunas(
      ["ITEM", CABECALHO_VALOR_ABERTURA, "ESTOQUE ATUAL"],
      "fechamento",
    );
    expect(res).toEqual({ valor: 3, codigo: null, nome: 1, cicloItemId: null });
  });

  it("avisa quando a planilha é do outro estágio da contagem", () => {
    const res = localizarColunas(["ITEM", CABECALHO_VALOR_ABERTURA], "fechamento");
    expect(res).toHaveProperty("erro");
    expect((res as { erro: string }).erro).toContain("Baixe o Excel de novo");
  });

  it("ignora acento e caixa no cabeçalho", () => {
    const res = localizarColunas(["item", "codigo", "Estoque Atual"]);
    expect(res).toEqual({ valor: 3, codigo: 2, nome: 1, cicloItemId: null });
  });

  it("erra quando não há coluna de contagem", () => {
    const res = localizarColunas(["ITEM", "CÓDIGO", "ENTRADAS"]);
    expect(res).toHaveProperty("erro");
  });

  it("erra quando nada identifica o item", () => {
    const res = localizarColunas(["ESTOQUE ATUAL", "ENTRADAS"]);
    expect(res).toHaveProperty("erro");
  });
});

// ── montarPrevia ────────────────────────────────────────────────────────────

const ID_COCA = "11111111-1111-4111-8111-111111111111";
const ID_AGUA = "22222222-2222-4222-8222-222222222222";
const ID_ALHEIO = "99999999-9999-4999-8999-999999999999";

const ITENS: ItemDoCiclo[] = [
  { cicloItemId: ID_COCA, codigo: "1001", nome: "COCA COLA",       valorAtual: null },
  { cicloItemId: ID_AGUA, codigo: "1002", nome: "AGUA COM GAS",    valorAtual: 8 },
];

function linha(over: Partial<LinhaPlanilha>): LinhaPlanilha {
  return {
    linhaExcel: 5,
    cicloItemId: null,
    codigo: null,
    nome: null,
    valor: { tipo: "numero", valor: 12 },
    ...over,
  };
}

describe("montarPrevia — casamento", () => {
  it("casa pelo id interno da coluna oculta", () => {
    const p = montarPrevia([linha({ cicloItemId: ID_COCA })], ITENS);
    expect(p.linhas[0]).toMatchObject({ status: "novo", cicloItemId: ID_COCA, valor: 12 });
    expect(p.aplicaveis).toEqual([{ cicloItemId: ID_COCA, valor: 12 }]);
  });

  it("cai para o código quando não há id", () => {
    const p = montarPrevia([linha({ codigo: "1001" })], ITENS);
    expect(p.linhas[0]).toMatchObject({ status: "novo", cicloItemId: ID_COCA });
  });

  it("cai para o nome em igualdade exata, ignorando acento e caixa", () => {
    const p = montarPrevia([linha({ nome: "Água com Gás" })], ITENS);
    expect(p.linhas[0]).toMatchObject({ cicloItemId: ID_AGUA });
  });

  // Nada de semelhança fuzzy: em lote, ela casa errado sem ninguém ver.
  it("NÃO casa por semelhança parcial de nome", () => {
    const p = montarPrevia([linha({ nome: "COCA COLA ZERO 350ML" })], ITENS);
    expect(p.linhas[0]).toMatchObject({ status: "ignorado", motivo: "não é item controlado deste ciclo" });
    expect(p.aplicaveis).toEqual([]);
  });
});

describe("montarPrevia — efeitos", () => {
  it("marca 'substitui' com o valor anterior quando o item já tinha contagem", () => {
    const p = montarPrevia([linha({ cicloItemId: ID_AGUA, valor: { tipo: "numero", valor: 12 } })], ITENS);
    expect(p.linhas[0]).toMatchObject({ status: "substitui", de: 8, valor: 12 });
  });

  it("marca 'igual' e não grava quando o valor não muda", () => {
    const p = montarPrevia([linha({ cicloItemId: ID_AGUA, valor: { tipo: "numero", valor: 8 } })], ITENS);
    expect(p.linhas[0]).toMatchObject({ status: "igual" });
    expect(p.aplicaveis).toEqual([]);
  });

  it("some com a linha em branco — é item que a equipe não contou", () => {
    const p = montarPrevia([linha({ cicloItemId: ID_COCA, valor: { tipo: "vazio" } })], ITENS);
    expect(p.linhas).toEqual([]);
    expect(p.aplicaveis).toEqual([]);
  });

  it("ignora a linha inválida sem derrubar as boas", () => {
    const p = montarPrevia(
      [
        linha({ linhaExcel: 5, cicloItemId: ID_COCA, valor: { tipo: "invalido", motivo: "quantidade negativa" } }),
        linha({ linhaExcel: 6, cicloItemId: ID_AGUA, valor: { tipo: "numero", valor: 3 } }),
      ],
      ITENS,
    );
    expect(p.resumo).toMatchObject({ ignorados: 1, substituidos: 1 });
    expect(p.aplicaveis).toEqual([{ cicloItemId: ID_AGUA, valor: 3 }]);
  });

  it("a primeira linha vence quando o item aparece duas vezes", () => {
    const p = montarPrevia(
      [
        linha({ linhaExcel: 5, cicloItemId: ID_COCA, valor: { tipo: "numero", valor: 10 } }),
        linha({ linhaExcel: 6, cicloItemId: ID_COCA, valor: { tipo: "numero", valor: 20 } }),
      ],
      ITENS,
    );
    expect(p.aplicaveis).toEqual([{ cicloItemId: ID_COCA, valor: 10 }]);
    expect(p.linhas[1]).toMatchObject({ status: "ignorado", motivo: "item repetido na planilha" });
  });

  it("ignora item que não é do ciclo, mantendo o resto", () => {
    const p = montarPrevia(
      [
        linha({ linhaExcel: 5, cicloItemId: ID_COCA }),
        linha({ linhaExcel: 6, cicloItemId: ID_ALHEIO }),
      ],
      ITENS,
    );
    expect(p.erroArquivo).toBeNull();
    expect(p.resumo).toMatchObject({ novos: 1, ignorados: 1 });
  });
});

describe("montarPrevia — arquivo do mês errado", () => {
  // Sem esta trava, a planilha de setembro importaria lisa no ciclo de outubro
  // (casando por código) e sobrescreveria a contagem certa.
  it("recusa o arquivo inteiro quando nenhum id pertence ao ciclo", () => {
    const p = montarPrevia(
      [linha({ cicloItemId: ID_ALHEIO, codigo: "1001", valor: { tipo: "numero", valor: 99 } })],
      ITENS,
    );
    expect(p.erroArquivo).toContain("outra contagem");
    expect(p.aplicaveis).toEqual([]);
    expect(p.linhas).toEqual([]);
  });

  it("não recusa quando o arquivo não traz id nenhum — casamento por código é válido", () => {
    const p = montarPrevia([linha({ codigo: "1001" })], ITENS);
    expect(p.erroArquivo).toBeNull();
    expect(p.aplicaveis).toHaveLength(1);
  });
});

describe("montarPrevia — ambiguidade no ciclo", () => {
  const AMBIGUOS: ItemDoCiclo[] = [
    { cicloItemId: ID_COCA, codigo: "1001", nome: "COCA COLA", valorAtual: null },
    { cicloItemId: ID_AGUA, codigo: "1001", nome: "COCA COLA", valorAtual: null },
  ];

  it("ignora em vez de chutar quando o código aparece em dois itens", () => {
    const p = montarPrevia([linha({ codigo: "1001" })], AMBIGUOS);
    expect(p.linhas[0]).toMatchObject({
      status: "ignorado", motivo: "código aparece em mais de um item do ciclo",
    });
  });

  it("ignora em vez de chutar quando o nome aparece em dois itens", () => {
    const p = montarPrevia([linha({ nome: "COCA COLA" })], AMBIGUOS);
    expect(p.linhas[0]).toMatchObject({
      status: "ignorado", motivo: "nome aparece em mais de um item do ciclo",
    });
  });
});
