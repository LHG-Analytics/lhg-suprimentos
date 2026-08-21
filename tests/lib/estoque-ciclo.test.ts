import { describe, it, expect } from "vitest";
import { calcularTeorico, calcularDivergencia, calcularARepor, rotuloMes } from "@/lib/estoque/ciclo";

describe("calcularTeorico", () => {
  it("soma anterior + entradas - saidas", () => {
    expect(calcularTeorico({ contagem_anterior: 100, entradas: 60, saidas: 50 })).toBe(110);
  });
  it("é null se entradas ainda não foram importadas", () => {
    expect(calcularTeorico({ contagem_anterior: 100, entradas: null, saidas: 50 })).toBeNull();
  });
  it("é null se saidas ainda não foram importadas", () => {
    expect(calcularTeorico({ contagem_anterior: 100, entradas: 60, saidas: null })).toBeNull();
  });
  it("trata contagem anterior ausente como zero — primeiro ciclo do item", () => {
    expect(calcularTeorico({ contagem_anterior: null, entradas: 60, saidas: 50 })).toBe(10);
  });
});

describe("calcularDivergencia", () => {
  it("é o contado menos o teórico", () => {
    expect(calcularDivergencia(109, 110)).toBe(-1);
  });
  it("é null quando o teórico é desconhecido", () => {
    expect(calcularDivergencia(109, null)).toBeNull();
  });
  it("é null quando o item ainda não foi contado", () => {
    expect(calcularDivergencia(null, 110)).toBeNull();
  });
  it("zero quando bate exato", () => {
    expect(calcularDivergencia(110, 110)).toBe(0);
  });
});

describe("calcularARepor", () => {
  it("é o ideal menos o contado", () => {
    expect(calcularARepor(24, 10)).toBe(14);
  });
  it("nunca é negativo — sobra não é reposição", () => {
    expect(calcularARepor(24, 30)).toBe(0);
  });
  it("é null quando o item ainda não foi contado", () => {
    expect(calcularARepor(24, null)).toBeNull();
  });
  it("é zero quando não há ideal configurado", () => {
    expect(calcularARepor(0, 10)).toBe(0);
  });
});

describe("rotuloMes", () => {
  it("formata o mês de referência em português", () => {
    expect(rotuloMes("2026-08-01")).toBe("agosto de 2026");
  });
  it("não desloca o mês por fuso — dia 1 continua no mês certo", () => {
    expect(rotuloMes("2026-01-01")).toBe("janeiro de 2026");
  });
});
