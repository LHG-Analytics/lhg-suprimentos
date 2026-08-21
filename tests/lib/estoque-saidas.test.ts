import { describe, it, expect } from "vitest";
import { converterSaidas, type ItemMapeado } from "@/lib/estoque/saidas";

const itens: ItemMapeado[] = [
  { estoque_item_id: "i1", automo_produto_id: 10, fator_conversao: 1 },
  { estoque_item_id: "i2", automo_produto_id: 20, fator_conversao: 0.4 },
  { estoque_item_id: "i3", automo_produto_id: null, fator_conversao: 1 },
];

describe("converterSaidas", () => {
  it("aplica fator 1 sem alterar a quantidade", () => {
    const r = converterSaidas(itens, [{ automo_produto_id: 10, quantidade: 50 }]);
    expect(r.get("i1")).toBe(50);
  });

  it("multiplica pelo fator de conversão", () => {
    // 50 porções × 0,4 kg = 20 kg baixados
    const r = converterSaidas(itens, [{ automo_produto_id: 20, quantidade: 50 }]);
    expect(r.get("i2")).toBe(20);
  });

  it("zera item mapeado que não teve saída no período", () => {
    const r = converterSaidas(itens, [{ automo_produto_id: 10, quantidade: 5 }]);
    expect(r.get("i2")).toBe(0);
  });

  it("ignora item sem vínculo com o Automo", () => {
    const r = converterSaidas(itens, [{ automo_produto_id: 10, quantidade: 5 }]);
    expect(r.has("i3")).toBe(false);
  });

  it("ignora produto do Automo que não está mapeado", () => {
    const r = converterSaidas(itens, [{ automo_produto_id: 999, quantidade: 100 }]);
    expect(r.size).toBe(2);
    expect(r.get("i1")).toBe(0);
  });

  it("soma quando o mesmo produto aparece em mais de uma linha", () => {
    const r = converterSaidas(itens, [
      { automo_produto_id: 10, quantidade: 30 },
      { automo_produto_id: 10, quantidade: 20 },
    ]);
    expect(r.get("i1")).toBe(50);
  });

  it("arredonda para 3 casas, a precisão da coluna", () => {
    const r = converterSaidas(
      [{ estoque_item_id: "x", automo_produto_id: 1, fator_conversao: 0.333 }],
      [{ automo_produto_id: 1, quantidade: 7 }],
    );
    expect(r.get("x")).toBe(2.331);
  });

  it("lista vazia devolve zero para todos os mapeados", () => {
    const r = converterSaidas(itens, []);
    expect(r.get("i1")).toBe(0);
    expect(r.get("i2")).toBe(0);
  });
});
