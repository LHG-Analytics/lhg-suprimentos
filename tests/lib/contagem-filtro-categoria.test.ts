/**
 * tests/lib/contagem-filtro-categoria.test.ts — filtro de categoria na contagem.
 *
 * Só afeta a exibição: o ciclo, os totais e a importação continuam sobre todos os
 * itens. O estado vive na URL (?categoria=...), então precisa ser reversível entre
 * rótulo e parâmetro sem perder item nenhum.
 */
import { describe, it, expect } from "vitest";
import {
  SEM_CATEGORIA,
  categoriaDoItem,
  contarPorCategoria,
  filtrarPorCategoria,
  normalizarCategoriaParam,
} from "@/lib/estoque/filtro-categoria";

const itens = [
  { id: "a", produtoCategoria: "HORTIFRUTI" },
  { id: "b", produtoCategoria: "HORTIFRUTI" },
  { id: "c", produtoCategoria: "LATICINIOS" },
  { id: "d", produtoCategoria: null },
  { id: "e", produtoCategoria: "  " },
];

describe("categoriaDoItem", () => {
  it("usa a família do produto e cai em SEM_CATEGORIA para null ou vazio", () => {
    expect(categoriaDoItem(itens[0])).toBe("HORTIFRUTI");
    expect(categoriaDoItem(itens[3])).toBe(SEM_CATEGORIA);
    expect(categoriaDoItem(itens[4])).toBe(SEM_CATEGORIA);
  });
});

describe("contarPorCategoria", () => {
  it("conta sobre TODOS os itens, em ordem decrescente e alfabética no empate, com SEM_CATEGORIA por último", () => {
    expect(contarPorCategoria(itens)).toEqual([
      { categoria: "HORTIFRUTI", quantidade: 2 },
      { categoria: "LATICINIOS", quantidade: 1 },
      { categoria: SEM_CATEGORIA, quantidade: 2 },
    ]);
  });

  it("lista vazia devolve lista vazia", () => {
    expect(contarPorCategoria([])).toEqual([]);
  });
});

describe("filtrarPorCategoria", () => {
  it("null = todas: devolve a mesma referência, sem copiar", () => {
    expect(filtrarPorCategoria(itens, null)).toBe(itens);
  });

  it("filtra pela categoria e trata SEM_CATEGORIA como os itens sem família", () => {
    expect(filtrarPorCategoria(itens, "HORTIFRUTI").map((i) => i.id)).toEqual(["a", "b"]);
    expect(filtrarPorCategoria(itens, SEM_CATEGORIA).map((i) => i.id)).toEqual(["d", "e"]);
  });

  it("categoria inexistente devolve lista vazia (a tela oferece 'Limpar filtro')", () => {
    expect(filtrarPorCategoria(itens, "PADARIA")).toEqual([]);
  });
});

describe("normalizarCategoriaParam", () => {
  it("ausente, vazio ou 'todas' viram null", () => {
    expect(normalizarCategoriaParam(null)).toBeNull();
    expect(normalizarCategoriaParam("")).toBeNull();
    expect(normalizarCategoriaParam("todas")).toBeNull();
    expect(normalizarCategoriaParam("TODAS")).toBeNull();
  });

  it("devolve o valor sem espaços nas pontas, preservando a grafia da família", () => {
    expect(normalizarCategoriaParam(" HORTIFRUTI ")).toBe("HORTIFRUTI");
    expect(normalizarCategoriaParam("EMBUTIDOS E FRIOS")).toBe("EMBUTIDOS E FRIOS");
  });
});
