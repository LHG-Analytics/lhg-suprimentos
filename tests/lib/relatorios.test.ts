import { describe, it, expect } from "vitest";
import {
  computeTopProdutos, computeTopCategorias, categoriaPorFornecedor,
  classeAbc, valorDoItem, type ItemPedido,
} from "@/lib/relatorios";

/** Fábrica de linha de pedido_itens, para os testes não virarem paredes de objeto. */
function item(o: {
  pedido?: string; produto?: string; categoria?: string; un?: string;
  qtd?: number; preco?: number; valor?: number | null; forn?: string;
}): ItemPedido {
  const qtd   = o.qtd   ?? 1;
  const preco = o.preco ?? 10;
  return {
    pedido_id:      o.pedido ?? "ped-1",
    quantidade:     qtd,
    preco_unitario: preco,
    valor_total:    o.valor === undefined ? qtd * preco : o.valor,
    produtos: {
      nome:        o.produto   ?? "Produto A",
      categoria:   o.categoria ?? "Alimentos",
      unidade_med: o.un        ?? "un",
    },
    pedidos: { fornecedor_id: o.forn ?? "forn-1" },
  };
}

describe("valorDoItem", () => {
  it("usa valor_total quando presente", () => {
    expect(valorDoItem(item({ qtd: 3, preco: 10, valor: 99 }))).toBe(99);
  });

  it("cai para quantidade x preço quando valor_total é null", () => {
    expect(valorDoItem(item({ qtd: 3, preco: 10, valor: null }))).toBe(30);
  });
});

describe("classeAbc", () => {
  it("classifica pelos cortes 80/95 do acumulado", () => {
    expect(classeAbc(0)).toBe("A");
    expect(classeAbc(80)).toBe("A");    // limite inclusivo
    expect(classeAbc(80.1)).toBe("B");
    expect(classeAbc(95)).toBe("B");
    expect(classeAbc(95.1)).toBe("C");
    expect(classeAbc(100)).toBe("C");
  });
});

describe("computeTopProdutos", () => {
  it("agrupa por produto, soma valores e ordena por gasto decrescente", () => {
    const r = computeTopProdutos([
      item({ produto: "Barato", valor: 10 }),
      item({ produto: "Caro",   valor: 100 }),
      item({ produto: "Caro",   valor: 50, pedido: "ped-2" }),
    ]);

    expect(r.map(p => p.nome)).toEqual(["Caro", "Barato"]);
    expect(r[0].total).toBe(150);
    expect(r[0].pedidos).toBe(2);
    expect(r[1].total).toBe(10);
  });

  it("conta pedidos distintos, não linhas", () => {
    const r = computeTopProdutos([
      item({ produto: "X", pedido: "ped-1" }),
      item({ produto: "X", pedido: "ped-1" }),
      item({ produto: "X", pedido: "ped-2" }),
    ]);
    expect(r[0].pedidos).toBe(2);
  });

  it("calcula acumulado e classe ABC ao longo da curva", () => {
    // 80 / 15 / 5 → acumulados 80 / 95 / 100
    const r = computeTopProdutos([
      item({ produto: "A", valor: 80 }),
      item({ produto: "B", valor: 15 }),
      item({ produto: "C", valor: 5 }),
    ]);

    expect(r.map(p => p.pctAcumulado)).toEqual([80, 95, 100]);
    expect(r.map(p => p.classe)).toEqual(["A", "B", "C"]);
  });

  it("mede variação de preço entre o menor e o maior pago", () => {
    const r = computeTopProdutos([
      item({ produto: "X", qtd: 1, preco: 10, valor: 10 }),
      item({ produto: "X", qtd: 1, preco: 15, valor: 15, pedido: "ped-2" }),
    ]);

    expect(r[0].precoMin).toBe(10);
    expect(r[0].precoMax).toBe(15);
    expect(r[0].variacaoPct).toBe(50);
    expect(r[0].precoMedio).toBe(12.5); // 25 / 2 unidades
  });

  it("não divide por zero com lista vazia", () => {
    expect(computeTopProdutos([])).toEqual([]);
  });

  it("ignora linhas sem produto vinculado", () => {
    const orfao = { ...item({}), produtos: null };
    expect(computeTopProdutos([orfao])).toEqual([]);
  });
});

describe("computeTopCategorias", () => {
  const nomes = new Map([["forn-1", "Fornecedor Um"], ["forn-2", "Fornecedor Dois"]]);

  it("agrupa por categoria e ordena por gasto", () => {
    const r = computeTopCategorias([
      item({ categoria: "Bebidas",   valor: 30 }),
      item({ categoria: "Alimentos", valor: 70 }),
    ], nomes);

    expect(r.map(c => c.categoria)).toEqual(["Alimentos", "Bebidas"]);
    expect(r[0].pctTotal).toBe(70);
  });

  it("identifica o produto e o fornecedor líderes da categoria", () => {
    const r = computeTopCategorias([
      item({ categoria: "Bebidas", produto: "Cerveja", valor: 80, forn: "forn-1" }),
      item({ categoria: "Bebidas", produto: "Suco",    valor: 20, forn: "forn-2" }),
    ], nomes);

    expect(r[0].produtoTop).toBe("Cerveja");
    expect(r[0].produtoTopPct).toBe(80);
    expect(r[0].fornecedorTop).toBe("Fornecedor Um");
    expect(r[0].fornecedorTopPct).toBe(80);
  });

  it("conta produtos, pedidos e fornecedores distintos", () => {
    const r = computeTopCategorias([
      item({ categoria: "C", produto: "P1", forn: "forn-1", pedido: "p1" }),
      item({ categoria: "C", produto: "P2", forn: "forn-1", pedido: "p1" }),
      item({ categoria: "C", produto: "P1", forn: "forn-2", pedido: "p2" }),
    ], nomes);

    expect(r[0].produtos).toBe(2);
    expect(r[0].pedidos).toBe(2);
    expect(r[0].fornecedores).toBe(2);
  });

  it("sinaliza 100% quando um único fornecedor atende a categoria", () => {
    const r = computeTopCategorias([
      item({ categoria: "Enxoval", forn: "forn-1", valor: 50 }),
      item({ categoria: "Enxoval", forn: "forn-1", valor: 50, pedido: "p2" }),
    ], nomes);

    expect(r[0].fornecedores).toBe(1);
    expect(r[0].fornecedorTopPct).toBe(100);
  });

  it("agrupa itens sem categoria em 'Outros'", () => {
    const semCat = { ...item({}), produtos: null };
    const r = computeTopCategorias([semCat], nomes);
    expect(r[0].categoria).toBe("Outros");
  });

  it("mostra '—' quando o fornecedor líder não está no mapa de nomes", () => {
    const r = computeTopCategorias([item({ forn: "desconhecido" })], new Map());
    expect(r[0].fornecedorTop).toBe("—");
  });
});

describe("categoriaPorFornecedor", () => {
  it("escolhe a categoria de maior gasto do fornecedor", () => {
    const r = categoriaPorFornecedor([
      item({ forn: "forn-1", categoria: "Bebidas",   valor: 30 }),
      item({ forn: "forn-1", categoria: "Alimentos", valor: 70 }),
      item({ forn: "forn-2", categoria: "Enxoval",   valor: 10 }),
    ]);

    expect(r.get("forn-1")).toBe("Alimentos");
    expect(r.get("forn-2")).toBe("Enxoval");
  });

  it("retorna mapa vazio sem itens", () => {
    expect(categoriaPorFornecedor([]).size).toBe(0);
  });
});
