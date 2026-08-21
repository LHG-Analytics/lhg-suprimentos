import { describe, it, expect } from "vitest";
import { resolverChavesOmie, somarEntradasPorItem, type ProdutoRef } from "@/lib/estoque/entradas";

const catalogo: ProdutoRef[] = [
  { id: "pRCC",  codigo: "1002", nome: "COCA COLA",  omie_codigo: "111", omie_unidade_id: "uRCC" },
  { id: "pCONC", codigo: "1002", nome: "Coca-Cola",  omie_codigo: "222", omie_unidade_id: "uCONC" },
  { id: "pOutro",codigo: "1002", nome: "AGUA",       omie_codigo: "333", omie_unidade_id: "uCONC" },
  { id: "pSo1",  codigo: "2001", nome: "PICANHA",    omie_codigo: "444", omie_unidade_id: "uRCC" },
];

describe("resolverChavesOmie", () => {
  it("acha o omie_codigo dos dois CNPJs para o mesmo produto", () => {
    const r = resolverChavesOmie({ codigo: "1002", nome: "COCA COLA" }, catalogo);
    expect(r.sort()).toEqual(["111", "222"]);
  });

  it("casa nome com escrita diferente, via normalização", () => {
    const r = resolverChavesOmie({ codigo: "1002", nome: "Coca Cola" }, catalogo);
    expect(r.sort()).toEqual(["111", "222"]);
  });

  it("NÃO mistura produto diferente que reusa o mesmo codigo", () => {
    const r = resolverChavesOmie({ codigo: "1002", nome: "AGUA" }, catalogo);
    expect(r).toEqual(["333"]);
  });

  it("devolve uma chave só quando o produto existe em um CNPJ", () => {
    expect(resolverChavesOmie({ codigo: "2001", nome: "PICANHA" }, catalogo)).toEqual(["444"]);
  });

  it("devolve vazio quando não acha", () => {
    expect(resolverChavesOmie({ codigo: "9999", nome: "INEXISTENTE" }, catalogo)).toEqual([]);
  });

  it("ignora produto sem omie_codigo", () => {
    const semCodigo: ProdutoRef[] = [
      { id: "x", codigo: "1002", nome: "COCA COLA", omie_codigo: null, omie_unidade_id: "uRCC" },
    ];
    expect(resolverChavesOmie({ codigo: "1002", nome: "COCA COLA" }, semCodigo)).toEqual([]);
  });
});

describe("somarEntradasPorItem", () => {
  it("soma as entradas dos dois CNPJs", () => {
    const entradas = new Map([["111", 120], ["222", 80]]);
    const r = somarEntradasPorItem(["111", "222"], entradas);
    expect(r.quantidade).toBe(200);
    expect(r.cnpjsComEntrada).toBe(2);
  });

  it("conta zero como CNPJ sem entrada, e não como ausente", () => {
    const entradas = new Map([["111", 120]]);
    const r = somarEntradasPorItem(["111", "222"], entradas);
    expect(r.quantidade).toBe(120);
    expect(r.cnpjsComEntrada).toBe(1);
  });

  it("sem nenhuma chave, quantidade é zero", () => {
    const r = somarEntradasPorItem([], new Map([["111", 5]]));
    expect(r.quantidade).toBe(0);
    expect(r.cnpjsComEntrada).toBe(0);
  });

  it("arredonda em 3 casas", () => {
    const r = somarEntradasPorItem(["a"], new Map([["a", 2.33349]]));
    expect(r.quantidade).toBe(2.333);
  });
});
