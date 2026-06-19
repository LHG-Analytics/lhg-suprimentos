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
 *   1. Na sincronização, produtos NOVOS recebem categoria = mapeamento abaixo.
 *   2. Produtos existentes com categoria editada manualmente NÃO são afetados.
 *   3. O widget de orçamento usa o mapeamento como fallback quando categoria
 *      não bate com nenhuma linha da planilha.
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
  "PAES":                      "Alimentos",
  "COLABORADORES":             "Alimentos",   // Lapa/AdC: refeição de colaboradores (carnes, grãos)
  "PESCADOS E FRUTOS DO MAR":  "Alimentos",
  "PETISCOS":                  "Alimentos",
  "PRATOS PRINCIPAIS":         "Alimentos",
  "SOBREMESAS":                "Alimentos",
  "SORVETES":                  "Alimentos",

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
  "SACHES":                    "Amenities",

  // ── Decorações e Experiências ────────────────────────────────────────────
  "DECORACOES":                "Decorações e Experiências",
  "EXPERIENCIAS":              "Decorações e Experiências",
  "BRINDES E PRESENTES":       "Decorações e Experiências",
  "ITENS DE EXPERIENCIAS E RESERVAS": "Decorações e Experiências",

  // ── Descartáveis ─────────────────────────────────────────────────────────
  "DESCARTAVEIS":              "Descartáveis",
  "EMBALAGENS":                "Descartáveis",
  "DESCARTAVEIS COZINHA":      "Descartáveis",

  // ── Outros (sem categoria de custo equivalente: administrativo/operacional) ─
  "CAUCAO":                    "Outros",
  "ITENS EXTRAS":              "Outros",
  "RESERVAS":                  "Outros",
  "SERVICOS":                  "Outros",
  "TAXAS DE REEMBOLSOS":       "Outros",
  "IMPRESSOS / GRAFICA":       "Outros",
  "UNIFORMES E EPI":           "Outros",
  "ESCRITORIO":                "Outros",
  "ITENS DE PEQUENOS VALORES": "Outros",
  "PRODUTOS PARA COLABORADOR (RH E FESTA)": "Outros",
};

/**
 * Resolve a categoria de orçamento para uma família Omie.
 * Retorna a categoria mapeada ou "Outros" como fallback.
 */
export function categoriaParaFamilia(familia: string | null | undefined): string {
  if (!familia) return "Outros";
  return FAMILIA_TO_CATEGORIA[familia.toUpperCase()] ?? "Outros";
}
