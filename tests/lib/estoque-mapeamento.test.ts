import { describe, it, expect } from "vitest";
import {
  normalizarNome,
  pontuarSemelhanca,
  sugerirCandidatos,
  type CandidatoNome,
} from "@/lib/estoque/mapeamento";

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

describe("sugerirCandidatos", () => {
  const catalogo: CandidatoNome[] = [
    { id: "p1", nome: "CERVEJA HEINEKEN LONG NECK" },
    { id: "p2", nome: "COCA COLA" },
    { id: "p3", nome: "RED BULL TRADICIONAL" },
    { id: "p4", nome: "PICANHA PECA KG" },
  ];

  it("retorna o melhor par primeiro", () => {
    const r = sugerirCandidatos("Coca-Cola", catalogo);
    expect(r[0].id).toBe("p2");
    expect(r[0].score).toBe(1);
  });

  it("respeita o limite de resultados", () => {
    // scoreMinimo: 0 isola o parâmetro sob teste. Com o mínimo padrão os quatro
    // produtos do catálogo não compartilham palavra com "cerveja" exceto p1, e o
    // filtro comeria a amostra antes de `limite` ter chance de agir.
    expect(sugerirCandidatos("cerveja", catalogo, { limite: 2, scoreMinimo: 0 })).toHaveLength(2);
  });

  it("descarta score abaixo do mínimo", () => {
    const r = sugerirCandidatos("Notebook Dell", catalogo, { scoreMinimo: 0.2 });
    expect(r).toEqual([]);
  });

  it("ordena por score decrescente", () => {
    const r = sugerirCandidatos("Heineken Long Neck", catalogo);
    const scores = r.map(c => c.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("empate desempata pelo nome, para a ordem ser estável", () => {
    const dois: CandidatoNome[] = [
      { id: "b", nome: "AGUA COM GAS" },
      { id: "a", nome: "AGUA SEM GAS" },
    ];
    const r = sugerirCandidatos("AGUA", dois);
    expect(r.map(c => c.id)).toEqual(["b", "a"]);
  });

  it("catálogo vazio devolve lista vazia", () => {
    expect(sugerirCandidatos("Coca", [])).toEqual([]);
  });
});
