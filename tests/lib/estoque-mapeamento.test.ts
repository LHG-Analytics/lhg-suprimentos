import { describe, it, expect } from "vitest";
import { normalizarNome, pontuarSemelhanca } from "@/lib/estoque/mapeamento";

describe("normalizarNome", () => {
  it("passa para minúsculas e remove acentos", () => {
    expect(normalizarNome("ÁGUA SEM GÁS")).toBe("agua sem gas");
  });

  it("troca pontuação e hífen por espaço", () => {
    expect(normalizarNome("Long-Neck, 330ml.")).toBe("long neck 330ml");
  });

  it("colapsa espaços repetidos e apara as pontas", () => {
    expect(normalizarNome("  COCA   COLA  ")).toBe("coca cola");
  });

  it("não quebra com string vazia", () => {
    expect(normalizarNome("")).toBe("");
  });
});

describe("pontuarSemelhanca", () => {
  it("dá 1 para nomes iguais depois de normalizar", () => {
    expect(pontuarSemelhanca("COCA COLA", "Coca-Cola")).toBe(1);
  });

  it("dá 0 quando não há palavra em comum", () => {
    expect(pontuarSemelhanca("PICANHA", "Coca-Cola")).toBe(0);
  });

  it("pontua pela fração de palavras em comum", () => {
    expect(pontuarSemelhanca("CERVEJA HEINEKEN", "Cerveja Heineken Long Neck")).toBeCloseTo(0.5, 5);
  });

  it("ignora ordem das palavras", () => {
    expect(pontuarSemelhanca("HEINEKEN CERVEJA", "Cerveja Heineken")).toBe(1);
  });

  it("não conta palavra repetida duas vezes", () => {
    expect(pontuarSemelhanca("AGUA AGUA", "Agua")).toBe(1);
  });

  it("dá 0 quando um dos lados é vazio", () => {
    expect(pontuarSemelhanca("", "Coca-Cola")).toBe(0);
  });
});
