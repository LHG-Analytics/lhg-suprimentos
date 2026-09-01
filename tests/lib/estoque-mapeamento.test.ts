import { describe, it, expect } from "vitest";
import {
  normalizarNome,
  pontuarSemelhanca,
  sugerirCandidatos,
  classificarSugestao,
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
    // `scoreMinimo: 0` isola o assunto do teste: "AGUA" contra "AGUA COM GAS"
    // pontua 0,333 e o piso padrão (0,35) filtraria os dois antes do desempate.
    const r = sugerirCandidatos("AGUA", dois, { scoreMinimo: 0 });
    expect(r.map(c => c.id)).toEqual(["b", "a"]);
  });

  it("catálogo vazio devolve lista vazia", () => {
    expect(sugerirCandidatos("Coca", [])).toEqual([]);
  });
});

// ── Classificação da relação entre os nomes ─────────────────────────────────
//
// Os casos abaixo NÃO são inventados: saíram da medição do catálogo do Lush
// Ipiranga (1.439 produtos × 353 do Automo) em 01/09/2026. Entre os candidatos
// com score ≥ 0,35 e não idênticos, a direção da contenção previu o acerto
// melhor que o score — 9/9 corretos num sentido, 3/3 armadilhas no outro.

describe("classificarSugestao", () => {
  it("nomes iguais depois de normalizar são idênticos", () => {
    expect(classificarSugestao("COCA COLA", "Coca-Cola")).toBe("identico");
    expect(classificarSugestao("AGUA COM GAS", "água com gás")).toBe("identico");
  });

  // Sentido bom: a compra carrega marca e tamanho, o PDV usa o nome genérico.
  it("nome do Automo contido no do LHG é o mesmo produto", () => {
    expect(classificarSugestao("COCA COLA PET 2L", "COCA COLA")).toBe("contido");
    expect(classificarSugestao("CHA DE CAMOMILA TWININGS C/10", "CHA DE CAMOMILA")).toBe("contido");
    expect(classificarSugestao("AGUA DE COCO KERO COCO 1L", "AGUA DE COCO")).toBe("contido");
  });

  // Sentido perigoso: o item do Automo é maior — um prato que consome o insumo.
  it("nome do LHG contido no do Automo é insumo dentro de prato", () => {
    expect(classificarSugestao("MORANGO", "CAIPIROSKA MORANGO")).toBe("insumo");
    expect(classificarSugestao("LIMAO SICILIANO", "VERRINE DE LIMAO SICILIANO")).toBe("insumo");
    expect(classificarSugestao("FLOR DE SAL", "SORVETE DE CARAMELO COM FLOR DE SAL")).toBe("insumo");
  });

  // Os erros plausíveis caem aqui, e é por isso que "parcial" pede conferência:
  // score alto não salva `TAPIOCA DE NUTELLA` de casar com `DE BRIGADEIRO`.
  it("palavras em comum sem contenção é parcial", () => {
    expect(classificarSugestao("TAPIOCA DE NUTELLA COM MORANGO", "TAPIOCA DE BRIGADEIRO COM MORANGO")).toBe("parcial");
    expect(classificarSugestao("COINTREAU - LICOR DE LARANJA", "SUCO DE LARANJA")).toBe("parcial");
    expect(classificarSugestao("KITKAT AO LEITE 24X41,5G", "KITKAT AO LEITE 41,5G")).toBe("parcial");
  });

  it("nome vazio não vira idêntico a nome vazio", () => {
    expect(classificarSugestao("", "")).toBe("parcial");
    expect(classificarSugestao("---", "COCA COLA")).toBe("parcial");
  });
});

describe("piso de sugestão", () => {
  // A faixa 0,15–0,34 tinha 330 produtos (23% do catálogo) cuja melhor sugestão
  // era ruído, apresentado no topo da lista com a mesma cara dos acertos.
  it("descarta o ruído que o piso antigo de 0,15 deixava passar", () => {
    const catalogo: CandidatoNome[] = [
      { id: "1", nome: "COMPLEMENTO DE TARIFA" },
      { id: "2", nome: "FIT 2 - CALCINHA VIBRATORIA 2 EM 1" },
    ];
    expect(sugerirCandidatos("MIOLO DE ACEM", catalogo)).toEqual([]);
    expect(sugerirCandidatos("ADAPTADOR SOLD CURTO 40X1.1/2 AMANCO", catalogo)).toEqual([]);
  });

  it("mantém o acerto por nome genérico, que fica acima do piso", () => {
    const catalogo: CandidatoNome[] = [{ id: "1", nome: "COCA COLA" }];
    const r = sugerirCandidatos("COCA COLA PET 2L", catalogo);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: "1", classe: "contido" });
  });

  it("traz a classe junto de cada sugestão", () => {
    const catalogo: CandidatoNome[] = [{ id: "1", nome: "CAIPIROSKA MORANGO" }];
    const r = sugerirCandidatos("MORANGO", catalogo);
    expect(r[0]?.classe).toBe("insumo");
  });
});
