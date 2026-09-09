/**
 * lib/omie/familia-map.ts — LHG-222
 * Mapeamento das Famílias de Produto do Omie para as categorias de orçamento
 * (planilha de Custos — aba "Custos"). Atualizar sempre que houver nova família
 * no Omie ou nova categoria no orçamento.
 *
 * IMPORTANTE: os valores de FAMILIA_TO_CATEGORIA devem ser idênticos (incluindo
 * acentos e capitalização) aos nomes das linhas na coluna A da aba "Custos".
 *
 * Lógica de uso:
 *   1. `categoria` é valor DERIVADO de `familia_omie`, sempre. Todos os
 *      caminhos a recalculam por este mapa: `sync` (INSERT e UPDATE, via
 *      `mapProdutoUpsert`), `editarProduto`, `criarProduto` e
 *      `importarProdutoOmie`. Não existe edição de categoria por produto.
 *   2. Logo, corrigir aqui propaga para as quatro unidades no próximo sync — e
 *      uma correção feita direto na tabela `produtos` é sobrescrita por ele.
 *      Para reclassificar UM produto, muda-se a FAMÍLIA dele (tela Editar
 *      Produto), que recalcula a categoria e propaga para o Omie.
 *   3. O widget de orçamento usa o mapeamento como fallback quando categoria
 *      não bate com nenhuma linha da planilha.
 *
 * ⚠️ O item 2 já dizia o contrário ("produtos com categoria editada manualmente
 * NÃO são afetados"). Era falso: `mapProdutoUpsert` exclui apenas `preco_custo`
 * do payload, então `categoria` entra no ON CONFLICT DO UPDATE e é reescrita a
 * cada sincronização. Verificado em 08/09/2026 — dos 3.474 produtos ativos, só 7
 * divergiam do mapa, todos com a categoria inválida "livre" e criados à mão,
 * então na prática nada de real havia sido perdido.
 */

// ── Categorias de orçamento — nomes EXATOS da aba "Custos" ───────────────────
export const CATEGORIAS_ORCAMENTO = [
  // ── Custo de Produtos Vendidos ────────────────────────────────────────────
  "Alimentos",
  "Bebidas Alcoólicas",
  "Bebidas Não alcoólicas",
  "Bomboniere",
  "Conveniência",
  "Produtos Eróticos",
  "Tabacaria",
  // ── Custo dos Serviços Prestados ──────────────────────────────────────────
  "Enxoval de Cozinha",
  "Enxoval Têxtil",
  "Materiais de Limpeza",
  "Materiais de Manutenção",
  "Produtos Químicos - Piscina",
  "Reposições louças e talheres",
  "Utensílios de Suítes",
  "Amenities",
  "Decorações e Experiências",
  "Descartáveis",
  // ── Administrativo (unidades administrativas, ex: LHG Holding) ─────────────
  "Material de Escritório",
  "Serviços de TI, Informática e Periféricos",
  // ── Fallback ──────────────────────────────────────────────────────────────
  "Outros",
] as const;

export type CategoriaOrcamento = typeof CATEGORIAS_ORCAMENTO[number];

// ── Mapa: Família Omie → Categoria de Orçamento ───────────────────────────────
// Chave: nome da família em UPPERCASE (como vem do Omie).
// Valor: nome EXATO da categoria na planilha.
export const FAMILIA_TO_CATEGORIA: Record<string, CategoriaOrcamento> = {

  // ── Alimentos ────────────────────────────────────────────────────────────
  "ACOMPANHAMENTOS":           "Alimentos",
  "ADICIONAIS":                "Alimentos",
  "AVES":                      "Alimentos",
  "CARNES BOVINAS":            "Alimentos",
  "CONGELADOS":                "Alimentos",
  "DOCES E CHOCOLATES":        "Alimentos",
  "EMBUTIDOS E FRIOS":         "Alimentos",
  "ENTRADAS":                  "Alimentos",
  "ESTOQUE SECO":              "Alimentos",
  "HORTIFRUTI":                "Alimentos",
  "LANCHES":                   "Alimentos",
  "LATICINIOS":                "Alimentos",
  "MENU DE VERAO":             "Alimentos",
  "FESTIVAL FONDUE":           "Alimentos",   // sazonal, como MENU DE VERAO
  "PAES":                      "Alimentos",
  "COLABORADORES":             "Alimentos",   // Lapa/AdC: refeição de colaboradores (carnes, grãos)
  "PESCADOS E FRUTOS DO MAR":  "Alimentos",
  "PETISCOS":                  "Alimentos",
  "PRATOS PRINCIPAIS":         "Alimentos",
  "SOBREMESAS":                "Alimentos",
  "SOBREMESA":                 "Alimentos",   // variação singular (Lapa)
  "LANCHE":                    "Alimentos",   // variação singular de LANCHES (Lapa)
  "SORVETES":                  "Alimentos",
  /*
   * SACHES são condimentos de mesa: açúcar, adoçante, azeite, catchup, geleia,
   * maionese, manteiga, mel, molho de pimenta, mostarda, requeijão, sal.
   *
   * ⚠️ Estava em "Amenities" — erro meu no mapeamento inicial, apontado pela
   * Keila em 08/09/2026. Média de R$ 9.126,92 em 12 meses caindo na linha
   * errada do orçamento, nas quatro unidades.
   *
   * A família não é 100% homogênea: "MEXEDOR DE BAMBU EMBALADO SACHE" e
   * "PALITO SACHE" (R$ 456,47 em 12 meses) são descartáveis. Como `categoria` é
   * derivada da família, não há como excertá-los aqui — a correção é mudar a
   * FAMÍLIA desses dois produtos no cadastro (tela Editar Produto), que
   * recalcula a categoria e propaga para o Omie.
   */
  "SACHES":                    "Alimentos",

  // ── Bebidas Alcoólicas ───────────────────────────────────────────────────
  "BEBIDAS INSUMO":            "Bebidas Alcoólicas",
  "CERVEJAS":                  "Bebidas Alcoólicas",
  "COQUETEIS":                 "Bebidas Alcoólicas",
  "DESTILADOS":                "Bebidas Alcoólicas",
  "DOSES":                     "Bebidas Alcoólicas",
  "VINHOS E ESPUMANTES":       "Bebidas Alcoólicas",

  // ── Bebidas Não alcoólicas ───────────────────────────────────────────────
  "CAFE DA MANHA E CHA":       "Bebidas Não alcoólicas",
  "SOFT DRINK":                "Bebidas Não alcoólicas",
  "BEBIDAS NAO ALCOOLICAS":    "Bebidas Não alcoólicas",

  // ── Bomboniere ───────────────────────────────────────────────────────────
  "BOMBONIERE":                "Bomboniere",

  // ── Conveniência ─────────────────────────────────────────────────────────
  "CONVENIENCIA":              "Conveniência",

  // ── Produtos Eróticos ────────────────────────────────────────────────────
  "PRODUTOS EROTICOS":         "Produtos Eróticos",

  // ── Tabacaria ────────────────────────────────────────────────────────────
  "TABACARIA":                 "Tabacaria",

  // ── Enxoval de Cozinha ───────────────────────────────────────────────────
  "ENXOVAL DE COZINHA":        "Enxoval de Cozinha",
  "UTENSILIOS DE COZINHA":     "Enxoval de Cozinha",

  // ── Enxoval Têxtil ───────────────────────────────────────────────────────
  "ENXOVAL TEXTIL":            "Enxoval Têxtil",
  "ENXOVAL":                   "Enxoval Têxtil",
  "ROUPARIA":                  "Enxoval Têxtil",

  // ── Materiais de Limpeza ─────────────────────────────────────────────────
  "MATERIAL DE LIMPEZA":       "Materiais de Limpeza",
  "MATERIAL LIMPEZA":          "Materiais de Limpeza",
  "PRODUTOS DE LIMPEZA":       "Materiais de Limpeza",
  "HIGIENE E LIMPEZA":         "Materiais de Limpeza",
  "HIGIENE E LIMPEZA GOVERNANÇA": "Materiais de Limpeza",
  "HIGIENE E LIMPEZA LAVANDERIA": "Materiais de Limpeza",

  // ── Materiais de Manutenção ──────────────────────────────────────────────
  "MANUTENCAO":                "Materiais de Manutenção",
  "MATERIAL DE MANUTENCAO":    "Materiais de Manutenção",
  "MATERIAL DE MANUTENÇÃO":    "Materiais de Manutenção",   // variação com acento (Lapa)
  "FERRAMENTAS":               "Materiais de Manutenção",
  "ELETRICA":                  "Materiais de Manutenção",
  "HIDRAULICA":                "Materiais de Manutenção",
  "MAQUINAS E EQUIPAMENTOS":      "Materiais de Manutenção",   // bens duráveis / CAPEX
  "MOVEIS E UTENSILIOS DOMESTICO": "Materiais de Manutenção",
  "MÓVEIS E UTENSILIOS":          "Materiais de Manutenção",   // variação com acento (AdC)

  // ── Produtos Químicos - Piscina ──────────────────────────────────────────
  "QUIMICOS PISCINA":          "Produtos Químicos - Piscina",
  "PRODUTOS QUIMICOS":         "Produtos Químicos - Piscina",
  "ITENS DE PISCINAS":         "Produtos Químicos - Piscina",

  // ── Reposições louças e talheres ─────────────────────────────────────────
  "LOUCAS E TALHERES":         "Reposições louças e talheres",
  "REPOSICOES":                "Reposições louças e talheres",
  "PRATOS":                    "Reposições louças e talheres",

  // ── Utensílios de Suítes ─────────────────────────────────────────────────
  "UTENSILIOS SUITES":         "Utensílios de Suítes",
  "UTENSILIOS":                "Utensílios de Suítes",
  "ITENS DE SUITE":            "Utensílios de Suítes",

  // ── Amenities ────────────────────────────────────────────────────────────
  "AMENITIES":                 "Amenities",
  "CORTESIAS":                 "Amenities",

  // ── Decorações e Experiências ────────────────────────────────────────────
  "DECORACOES":                "Decorações e Experiências",
  "EXPERIENCIAS":              "Decorações e Experiências",
  "BRINDES E PRESENTES":       "Decorações e Experiências",
  "ITENS DE EXPERIENCIAS E RESERVAS": "Decorações e Experiências",

  // ── Descartáveis ─────────────────────────────────────────────────────────
  "DESCARTAVEIS":              "Descartáveis",
  "EMBALAGENS":                "Descartáveis",
  "DESCARTAVEIS COZINHA":      "Descartáveis",
  "DESCARTAVEIS/ITENS LAVANDERIA": "Descartáveis",

  // ── Material de Escritório (administrativo — ex: LHG Holding) ─────────────
  // ⚠️ distinto de "ESCRITORIO" (Lapa/AdC → Outros): esta é a compra de
  //    insumos de escritório (canetas, cartuchos, papelaria) da Holding.
  "MATERIAL DE ESCRITORIO":    "Material de Escritório",

  // ── Outros (sem categoria de custo equivalente: administrativo/operacional) ─
  "CAUCAO":                    "Outros",
  "ITENS EXTRAS":              "Outros",
  "RESERVAS":                  "Outros",
  "SERVICOS":                  "Outros",
  "TAXAS DE REEMBOLSOS":       "Outros",
  "IMPRESSOS / GRAFICA":       "Outros",
  "UNIFORMES E EPI":           "Outros",
  "UNIFORME":                  "Outros",   // variação singular (Lapa)
  "EPI - EQUIPAMENTOS DE PROTECAO INDIVIDUAL": "Outros",   // nome longo (Lapa)
  "ESCRITORIO":                "Outros",
  "ITENS DE PEQUENOS VALORES": "Outros",
  "PRODUTOS PARA COLABORADOR (RH E FESTA)": "Outros",
};

/**
 * Override de mapeamento POR UNIDADE (chave = slug).
 * Para unidades administrativas (ex: LHG Holding) a mesma família Omie tem
 * significado diferente das operacionais — ex: "MAQUINAS E EQUIPAMENTOS" é
 * TI/informática na Holding, mas é equipamento de cozinha/serviço nas demais.
 *
 * É uma WHITELIST: se a unidade tem override, SÓ as famílias listadas mapeiam;
 * qualquer outra família cai em "Outros" (a Holding rastreia só 2 categorias).
 */
export const MAPA_FAMILIA_POR_UNIDADE: Record<string, Record<string, CategoriaOrcamento>> = {
  "lhg-holding": {
    "MATERIAL DE ESCRITORIO":  "Material de Escritório",
    "MAQUINAS E EQUIPAMENTOS":  "Serviços de TI, Informática e Periféricos",
  },
};

/**
 * Resolve a categoria de orçamento para uma família Omie.
 * Quando `unidadeSlug` tem override (whitelist), usa-o; senão usa o mapa global.
 * Retorna a categoria mapeada ou "Outros" como fallback.
 */
export function categoriaParaFamilia(
  familia: string | null | undefined,
  unidadeSlug?: string | null,
): string {
  if (!familia) return "Outros";
  const f = familia.toUpperCase();
  const override = unidadeSlug ? MAPA_FAMILIA_POR_UNIDADE[unidadeSlug] : undefined;
  if (override) return override[f] ?? "Outros"; // whitelist: resto → Outros
  return FAMILIA_TO_CATEGORIA[f] ?? "Outros";
}
