/**
 * tests/lib/estoque-saidas-ciclo.test.ts — integração da baixa por ficha no
 * cálculo de saídas do ciclo (tela de contagem).
 *
 * O contrato que importa: local SEM ficha (Lapa, Altana, Andar de Cima) produz
 * exatamente o que `converterSaidas` produz hoje. Local COM ficha soma os dois
 * caminhos e devolve avisos classificados, sem bloquear a importação.
 */
import { describe, it, expect } from "vitest";
import { converterSaidas } from "@/lib/estoque/saidas";
import { calcularSaidasDoCiclo, classificarAviso, resumirAvisos, LIMITE_AVISOS_PERSISTIDOS, type LinhaCiclo, type AvisoSaida } from "@/lib/estoque/saidas-ciclo";
import type { Ficha } from "@/lib/estoque/fichas";

const linhas: LinhaCiclo[] = [
  { ciclo_item_id: "ci-coca", estoque_item_id: "ei-coca", automo_produto_id: 379, fator_conversao: 1, unidade_med: "UN" },
  { ciclo_item_id: "ci-abacaxi", estoque_item_id: "ei-abacaxi", automo_produto_id: null, fator_conversao: 1, unidade_med: "KG" },
  { ciclo_item_id: "ci-preserv", estoque_item_id: "ei-preserv", automo_produto_id: 695, fator_conversao: 1, unidade_med: "UN" },
];
const saidas = [
  { automo_produto_id: 379, quantidade: 229 },
  { automo_produto_id: 695, quantidade: 236 },
  { automo_produto_id: 1498, quantidade: 16 }, // chá gelado (tem ficha só no Ipiranga)
  { automo_produto_id: 9999, quantidade: 3 },  // serviço sem mapeamento nenhum
];

describe("calcularSaidasDoCiclo sem fichas (Lapa, Altana, Andar de Cima)", () => {
  it("é idêntico ao converterSaidas de hoje, chaveado pelo id da linha do ciclo", () => {
    const esperado = converterSaidas(
      linhas.map((l) => ({ estoque_item_id: l.ciclo_item_id, automo_produto_id: l.automo_produto_id, fator_conversao: l.fator_conversao })),
      saidas,
    );
    const r = calcularSaidasDoCiclo(linhas, saidas, []);
    expect([...r.porLinha.entries()].sort()).toEqual([...esperado.entries()].sort());
    expect(r.avisos).toEqual([]);
  });

  it("conta como ignorados os produtos do Automo sem vínculo 1:1 nem ficha", () => {
    const r = calcularSaidasDoCiclo(linhas, saidas, []);
    expect(r.produtosIgnorados).toBe(2); // 1498 e 9999
  });
});

describe("calcularSaidasDoCiclo com fichas (Lush Ipiranga)", () => {
  const fichas: Ficha[] = [
    {
      id: "f-cha", automo_produto_id: 1498, rendimento: 1, rendimento_unidade: "un",
      itens: [
        { ficha_filha_id: "f-creme", quantidade: 50, unidade: "ml", perda_pct: 0 },
        { insumo_pendente: "Xarope de hibisco", quantidade: 30, unidade: "ml", perda_pct: 0 },
      ],
    },
    {
      id: "f-creme", automo_produto_id: null, rendimento: 800, rendimento_unidade: "ml",
      itens: [{ estoque_item_id: "ei-abacaxi", quantidade: 250, unidade: "g", perda_pct: 0 }],
    },
    {
      id: "f-combo", automo_produto_id: 1735, rendimento: 1, rendimento_unidade: "un",
      itens: [{ estoque_item_id: "ei-coca", quantidade: 6, unidade: "un", perda_pct: 0 }],
    },
  ];

  it("soma o caminho 1:1 com a ficha e grava pelo id da linha do ciclo", () => {
    const r = calcularSaidasDoCiclo(linhas, [...saidas, { automo_produto_id: 1735, quantidade: 2 }], fichas);
    expect(r.porLinha.get("ci-coca")).toBe(241);     // 229 avulsas + 2 combos × 6
    expect(r.porLinha.get("ci-abacaxi")).toBe(0.25); // 16 chás × 50 ml = 1 lote de creme = 250 g
    expect(r.porLinha.get("ci-preserv")).toBe(236);  // inalterado
  });

  it("produto coberto por ficha não conta como ignorado", () => {
    const r = calcularSaidasDoCiclo(linhas, saidas, fichas);
    expect(r.produtosIgnorados).toBe(1); // só o 9999
  });

  it("devolve os avisos classificados por tipo, com nomes no lugar dos ids", () => {
    const nomes = new Map([["f-cha", "CHA GELADO LUSH"], ["ei-abacaxi", "ABACAXI PEROLA"]]);
    const r = calcularSaidasDoCiclo(linhas, saidas, fichas, nomes);
    const pendente = r.avisos.find((a) => a.tipo === "insumo_pendente");
    expect(pendente?.texto).toMatch(/CHA GELADO LUSH/);
    expect(pendente?.texto).toMatch(/Xarope de hibisco/);
    expect(pendente?.texto).not.toMatch(/f-cha/);
  });

  it("insumo de ficha que não está no ciclo vira aviso 'fora_do_ciclo' e não é gravado", () => {
    // LARANJA PERA comprada em KG, ficha em kg, cadastrada depois da abertura do ciclo:
    // com a unidade real do item, o aviso é "fora do ciclo" — não "unidade incompatível".
    const fichaComItemNovo: Ficha[] = [{
      id: "f-x", automo_produto_id: 1498, rendimento: 1, rendimento_unidade: "un",
      itens: [{ estoque_item_id: "ei-novo", quantidade: 1, unidade: "kg", perda_pct: 0 }],
    }];
    const r = calcularSaidasDoCiclo(linhas, saidas, fichaComItemNovo, new Map([["ei-novo", "LARANJA PERA"]]), new Map([["ei-novo", "KG"]]));
    expect([...r.porLinha.keys()]).not.toContain("ei-novo");
    expect(r.itensForaDoCiclo).toEqual(["LARANJA PERA"]);
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0].tipo).toBe("fora_do_ciclo");
    expect(r.avisos[0].texto).toMatch(/LARANJA PERA/);
  });
});

describe("resumirAvisos (o que vai para estoque_ciclos.saidas_avisos)", () => {
  it("conta por tipo, guarda o total real e limita a lista persistida", () => {
    const avisos: AvisoSaida[] = Array.from({ length: LIMITE_AVISOS_PERSISTIDOS + 5 }, (_, i) => ({
      tipo: i % 2 === 0 ? "insumo_pendente" : "unidade_incompativel",
      texto: `aviso ${i}`,
    }));
    const resumo = resumirAvisos({ porLinha: new Map(), avisos, produtosIgnorados: 3, itensForaDoCiclo: ["A", "B"] }, "2026-09-27T21:00:00.000Z");
    expect(resumo.total).toBe(LIMITE_AVISOS_PERSISTIDOS + 5);
    expect(resumo.avisos).toHaveLength(LIMITE_AVISOS_PERSISTIDOS);
    expect(resumo.por_tipo.insumo_pendente + resumo.por_tipo.unidade_incompativel).toBe(LIMITE_AVISOS_PERSISTIDOS + 5);
    expect(resumo.por_tipo.sub_preparo_sem_receita).toBe(0);
    expect(resumo.produtos_ignorados).toBe(3);
    expect(resumo.itens_fora_do_ciclo).toBe(2);
    expect(resumo.gerado_em).toBe("2026-09-27T21:00:00.000Z");
  });

  it("sem avisos gera resumo vazio mas com carimbo, para a tela dizer 'importado sem avisos'", () => {
    const resumo = resumirAvisos({ porLinha: new Map(), avisos: [], produtosIgnorados: 0, itensForaDoCiclo: [] }, "2026-09-27T21:00:00.000Z");
    expect(resumo.total).toBe(0);
    expect(resumo.avisos).toEqual([]);
  });
});

describe("classificarAviso", () => {
  it("reconhece os quatro tipos da lib e cai em 'outro' para o resto", () => {
    expect(classificarAviso('ficha X: insumo pendente "Y" sem baixa (produto não decidido)')).toBe("insumo_pendente");
    expect(classificarAviso("item Z: L da ficha X não converte para a unidade de compra UN")).toBe("unidade_incompativel");
    expect(classificarAviso("ficha CALDO DE LEGUMES: pedida em L, mas o rendimento está em g")).toBe("unidade_incompativel");
    expect(classificarAviso("sub-preparo S sem receita (sem itens): baixa parcial das fichas que o usam")).toBe("sub_preparo_sem_receita");
    expect(classificarAviso("produto Automo 1340 tem ficha técnica e vínculo 1:1 com E; usada só a ficha")).toBe("outro");
  });
});
