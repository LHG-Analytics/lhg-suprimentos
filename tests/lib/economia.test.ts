import { describe, it, expect } from "vitest";
import { calcularEconomia, type ItemEconomia } from "@/lib/cotacao/economia";

/**
 * `calcularEconomia` alimenta a aprovação da cotação, a geração de pedidos, a
 * barra da matriz e o PDF do Mapa de Cotação. Um número só, quatro consumidores —
 * daí valer testar o critério explicitamente.
 */
function item(o: { qtd?: number; vencedor: number; cotados: number[] }): ItemEconomia {
  return {
    quantidade:    o.qtd ?? 1,
    precoVencedor: o.vencedor,
    precosCotados: o.cotados,
  };
}

describe("calcularEconomia", () => {
  it("compara o vencedor com o MAIOR preço cotado, multiplicado pela quantidade", () => {
    const r = calcularEconomia([item({ qtd: 10, vencedor: 8, cotados: [8, 10] })]);
    expect(r.economia).toBe(20);          // (10 − 8) × 10
    expect(r.valorAprovado).toBe(80);     // 8 × 10
  });

  it("ignora itens sem concorrência — um único preço cotado não gera economia", () => {
    const r = calcularEconomia([item({ vencedor: 8, cotados: [8] })]);
    expect(r.economia).toBeNull();
    expect(r.economiaPct).toBeNull();
    expect(r.valorAprovado).toBe(8);      // mas o valor da compra continua contando
  });

  it("soma só os itens com concorrência, mantendo os demais no valor aprovado", () => {
    const r = calcularEconomia([
      item({ vencedor: 8,   cotados: [8, 10] }),  // concorrido → economia 2
      item({ vencedor: 100, cotados: [100] }),    // sem disputa → economia 0
    ]);
    expect(r.economia).toBe(2);
    expect(r.valorAprovado).toBe(108);
  });

  it("calcula o percentual sobre o cenário mais caro, não sobre o valor aprovado", () => {
    const r = calcularEconomia([item({ qtd: 2, vencedor: 8, cotados: [8, 10] })]);
    // economia 4 sobre base máxima 20 = 20%
    expect(r.economiaPct).toBeCloseTo(20, 5);
  });

  it("descarta preços zerados ou negativos da disputa", () => {
    // Célula marcada como "não cotou" chega como 0 e não pode virar o maior/menor
    const r = calcularEconomia([item({ vencedor: 8, cotados: [8, 0, -1] })]);
    expect(r.economia).toBeNull();        // sobra só 1 preço válido → sem concorrência
  });

  it("dá economia zero quando o vencedor É o mais caro", () => {
    const r = calcularEconomia([item({ vencedor: 10, cotados: [8, 10] })]);
    expect(r.economia).toBe(0);
    expect(r.economiaPct).toBe(0);
  });

  it("nunca retorna economia negativa por item", () => {
    const r = calcularEconomia([item({ vencedor: 10, cotados: [8, 10] })]);
    expect(r.economia).toBeGreaterThanOrEqual(0);
  });

  it("lista vazia não quebra", () => {
    const r = calcularEconomia([]);
    expect(r).toEqual({ economia: null, economiaPct: null, valorAprovado: 0 });
  });

  it("reproduz a COT-2026-0137 (AR CONDICIONADO) — R$ 53.357,83", () => {
    // Preços reais da cotação, com o menor selecionado em cada item.
    // `cotacao_matriz.preco_unitario` é numeric(12,4): usar os valores já
    // arredondados para 2 casas erra o total em 8 centavos.
    const r = calcularEconomia([
      item({ qtd: 24, vencedor: 2096.3899, cotados: [2096.3899, 2706.5680] }),
      item({ qtd: 1,  vencedor: 7892.1000, cotados: [7892.1000, 9952.6500] }),
      item({ qtd: 36, vencedor: 4003.3110, cotados: [4003.3110, 5021.4500] }),
    ]);
    expect(r.economia).toBeCloseTo(53357.83, 2);
    // 202.324,65 + R$ 6.276,97 de frete = os R$ 208.601,62 da barra da tela
    expect(r.valorAprovado).toBeCloseTo(202324.65, 2);
  });
});
