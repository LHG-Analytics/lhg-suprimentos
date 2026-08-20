import { describe, it, expect } from "vitest";
import { normalizarNome } from "@/lib/estoque/mapeamento";

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
