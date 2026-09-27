/**
 * tests/lib/estoque-fichas.test.ts — explosão de vendas em consumo de insumos
 * via ficha técnica (1:N), com rendimento, perda e sub-preparo aninhado.
 *
 * Puro: sem Supabase, sem pg. Quantidades das fichas reais do Lush Ipiranga.
 */
import { describe, it, expect } from "vitest";
import { converterUnidade, explodirSaidasPorFicha, converterSaidasComFichas, type Ficha } from "@/lib/estoque/fichas";

const compra = (pares: Record<string, string>) => new Map(Object.entries(pares));

describe("converterUnidade", () => {
  it("converte massa g→kg e volume ml→L", () => {
    expect(converterUnidade(180, "g", "KG")).toBe(0.18);
    expect(converterUnidade(0.15, "kg", "KG")).toBe(0.15);
    expect(converterUnidade(50, "ml", "LT")).toBe(0.05);
    expect(converterUnidade(2, "un", "UN")).toBe(2);
  });

  it("devolve null quando as dimensões não batem (g para UN)", () => {
    expect(converterUnidade(25, "g", "UN")).toBeNull();
    expect(converterUnidade(1, "un", "KG")).toBeNull();
  });
});

describe("explodirSaidasPorFicha", () => {
  it("ficha simples: 10 salmões vendidos consomem 1,5 kg de salmão", () => {
    const fichas: Ficha[] = [{
      id: "f-salmao", automo_produto_id: 1340, rendimento: 1, rendimento_unidade: "un",
      itens: [{ estoque_item_id: "salmao", quantidade: 0.22, unidade: "kg", perda_pct: 0 }],
    }];
    const { consumo, avisos } = explodirSaidasPorFicha(fichas, [{ automo_produto_id: 1340, quantidade: 10 }], compra({ salmao: "KG" }));
    expect(consumo.get("salmao")).toBe(2.2);
    expect(avisos).toEqual([]);
  });

  it("converte a unidade da ficha para a unidade de compra (180 g de rigatoni → kg)", () => {
    const fichas: Ficha[] = [{
      id: "f-rig", automo_produto_id: 1728, rendimento: 1, rendimento_unidade: "un",
      itens: [{ estoque_item_id: "rigatoni", quantidade: 180, unidade: "g", perda_pct: 0 }],
    }];
    const { consumo } = explodirSaidasPorFicha(fichas, [{ automo_produto_id: 1728, quantidade: 2 }], compra({ rigatoni: "KG" }));
    expect(consumo.get("rigatoni")).toBe(0.36);
  });

  it("rendimento > 1 divide o consumo: bruschettas rendem 4, 2 vendidas = meia ficha", () => {
    const fichas: Ficha[] = [{
      id: "f-brus", automo_produto_id: 561, rendimento: 4, rendimento_unidade: "un",
      itens: [{ estoque_item_id: "tomate-cereja", quantidade: 100, unidade: "g", perda_pct: 0 }],
    }];
    const { consumo } = explodirSaidasPorFicha(fichas, [{ automo_produto_id: 561, quantidade: 2 }], compra({ "tomate-cereja": "KG" }));
    expect(consumo.get("tomate-cereja")).toBe(0.05);
  });

  it("perda_pct infla o bruto: 280 g líquidos com 20% de perda consomem 350 g", () => {
    const fichas: Ficha[] = [{
      id: "f-suco", automo_produto_id: 389, rendimento: 1, rendimento_unidade: "un",
      itens: [{ estoque_item_id: "abacaxi", quantidade: 280, unidade: "g", perda_pct: 20 }],
    }];
    const { consumo } = explodirSaidasPorFicha(fichas, [{ automo_produto_id: 389, quantidade: 1 }], compra({ abacaxi: "KG" }));
    expect(consumo.get("abacaxi")).toBe(0.35);
  });

  it("sub-preparo aninhado: 16 chás gelados usam 800 ml de creme = 1 lote = 250 g de abacaxi", () => {
    const fichas: Ficha[] = [
      {
        id: "f-cha", automo_produto_id: 1498, rendimento: 1, rendimento_unidade: "un",
        itens: [{ ficha_filha_id: "f-creme", quantidade: 50, unidade: "ml", perda_pct: 0 }],
      },
      {
        id: "f-creme", automo_produto_id: null, rendimento: 800, rendimento_unidade: "ml",
        itens: [
          { estoque_item_id: "abacaxi", quantidade: 250, unidade: "g", perda_pct: 0 },
          { estoque_item_id: "agua", quantidade: 100, unidade: "ml", perda_pct: 0 },
        ],
      },
    ];
    const { consumo, avisos } = explodirSaidasPorFicha(fichas, [{ automo_produto_id: 1498, quantidade: 16 }], compra({ abacaxi: "KG", agua: "LT" }));
    expect(consumo.get("abacaxi")).toBe(0.25);
    expect(consumo.get("agua")).toBe(0.1);
    expect(avisos).toEqual([]);
  });

  it("unidade incompatível gera aviso e NÃO grava número (ausência é 'não sei')", () => {
    const fichas: Ficha[] = [{
      id: "f-x", automo_produto_id: 1, rendimento: 1, rendimento_unidade: "un",
      itens: [{ estoque_item_id: "queijo", quantidade: 2, unidade: "un", perda_pct: 0 }],
    }];
    const { consumo, avisos } = explodirSaidasPorFicha(fichas, [{ automo_produto_id: 1, quantidade: 3 }], compra({ queijo: "KG" }));
    expect(consumo.has("queijo")).toBe(false);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatch(/queijo/);
    expect(avisos[0]).toMatch(/un.*KG/);
  });

  it("insumo de ficha sem venda no período entra com 0, não fica de fora", () => {
    const fichas: Ficha[] = [{
      id: "f-a", automo_produto_id: 7, rendimento: 1, rendimento_unidade: "un",
      itens: [{ estoque_item_id: "picanha", quantidade: 220, unidade: "g", perda_pct: 0 }],
    }];
    const { consumo } = explodirSaidasPorFicha(fichas, [], compra({ picanha: "KG" }));
    expect(consumo.get("picanha")).toBe(0);
  });

  it("ficha que aponta para si mesma (ciclo) dispara erro em vez de laço infinito", () => {
    const fichas: Ficha[] = [
      { id: "a", automo_produto_id: 1, rendimento: 1, rendimento_unidade: "un", itens: [{ ficha_filha_id: "b", quantidade: 1, unidade: "un", perda_pct: 0 }] },
      { id: "b", automo_produto_id: null, rendimento: 1, rendimento_unidade: "un", itens: [{ ficha_filha_id: "a", quantidade: 1, unidade: "un", perda_pct: 0 }] },
    ];
    expect(() => explodirSaidasPorFicha(fichas, [{ automo_produto_id: 1, quantidade: 1 }], compra({}))).toThrow(/ciclo/i);
  });

  it("arredonda em 3 casas, a precisão de estoque_ciclo_itens.saidas", () => {
    const fichas: Ficha[] = [{
      id: "f", automo_produto_id: 1, rendimento: 3, rendimento_unidade: "un",
      itens: [{ estoque_item_id: "x", quantidade: 1, unidade: "kg", perda_pct: 0 }],
    }];
    const { consumo } = explodirSaidasPorFicha(fichas, [{ automo_produto_id: 1, quantidade: 1 }], compra({ x: "KG" }));
    expect(consumo.get("x")).toBe(0.333);
  });
});

describe("converterSaidasComFichas", () => {
  it("soma o caminho 1:1 (fator) com o caminho por ficha no mesmo insumo", () => {
    // Coca Zero vendida avulsa (fator 1) e dentro de um combo cuja ficha leva 6 latas
    const itens = [{ estoque_item_id: "coca-zero", automo_produto_id: 379, fator_conversao: 1 }];
    const fichas: Ficha[] = [{
      id: "f-combo", automo_produto_id: 1735, rendimento: 1, rendimento_unidade: "un",
      itens: [{ estoque_item_id: "coca-zero", quantidade: 6, unidade: "un", perda_pct: 0 }],
    }];
    const saidas = [{ automo_produto_id: 379, quantidade: 10 }, { automo_produto_id: 1735, quantidade: 2 }];
    const { consumo } = converterSaidasComFichas(itens, saidas, fichas, compra({ "coca-zero": "UN" }));
    expect(consumo.get("coca-zero")).toBe(22);
  });

  it("produto com ficha E vínculo 1:1 usa só a ficha e avisa, sem contar duas vezes", () => {
    const itens = [{ estoque_item_id: "salmao", automo_produto_id: 1340, fator_conversao: 0.22 }];
    const fichas: Ficha[] = [{
      id: "f-salmao", automo_produto_id: 1340, rendimento: 1, rendimento_unidade: "un",
      itens: [{ estoque_item_id: "salmao", quantidade: 220, unidade: "g", perda_pct: 0 }],
    }];
    const { consumo, avisos } = converterSaidasComFichas(itens, [{ automo_produto_id: 1340, quantidade: 5 }], fichas, compra({ salmao: "KG" }));
    expect(consumo.get("salmao")).toBe(1.1);
    expect(avisos.some((a) => /1340/.test(a))).toBe(true);
  });
});

describe("itens pendentes e sub-preparo sem receita", () => {
  it("insumo pendente (sem produto decidido) não baixa nada e gera aviso quando a ficha vende", () => {
    const fichas: Ficha[] = [{
      id: "f-tartare", automo_produto_id: 1726, rendimento: 1, rendimento_unidade: "un",
      itens: [
        { estoque_item_id: "mignon", quantidade: 150, unidade: "g", perda_pct: 0 },
        { insumo_pendente: "Molho especial (para finalizar)", quantidade: 20, unidade: "g", perda_pct: 0 },
      ],
    }];
    const { consumo, avisos } = explodirSaidasPorFicha(fichas, [{ automo_produto_id: 1726, quantidade: 4 }], compra({ mignon: "KG" }));
    expect(consumo.get("mignon")).toBe(0.6);
    expect(consumo.size).toBe(1);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatch(/Molho especial/);
    expect(avisos[0]).toMatch(/pendente/i);
  });

  it("sub-preparo sem receita (ficha vazia) gera aviso de baixa parcial, uma vez por ficha vendida", () => {
    const fichas: Ficha[] = [
      { id: "f-caesar", automo_produto_id: 564, rendimento: 1, rendimento_unidade: "un",
        itens: [{ ficha_filha_id: "f-supreme", quantidade: 50, unidade: "g", perda_pct: 0 }] },
      { id: "f-supreme", automo_produto_id: null, rendimento: 1, rendimento_unidade: "g", itens: [] },
    ];
    const { consumo, avisos } = explodirSaidasPorFicha(fichas, [{ automo_produto_id: 564, quantidade: 3 }], compra({}));
    expect(consumo.size).toBe(0);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatch(/f-supreme/);
    expect(avisos[0]).toMatch(/sem receita|sem itens/i);
  });
});
