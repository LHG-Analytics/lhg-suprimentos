/**
 * lib/omie/familia-map.ts — LHG-222
 * Mapeamento das Famílias de Produto do Omie para as categorias de orçamento
 * (planilha de Custos). Atualizar sempre que houver nova família no Omie ou
 * nova categoria no orçamento.
 *
 * Lógica de uso:
 *   1. Na sincronização, produtos NOVOS recebem categoria = mapeamento abaixo.
 *   2. Produtos existentes com categoria editada manualmente NÃO são afetados.
 *   3. O widget de orçamento usa o mapeamento como fallback quando categoria
 *      não bate com nenhuma linha da planilha.
 */

// ── Categorias de orçamento disponíveis ──────────────────────────────────────
// Manter alinhado com os nomes exatos da aba "Custos" do Google Sheets.
export const CATEGORIAS_ORCAMENTO = [
  "Alimentos",
  "Bebidas Alcoólicas",
  "Bebidas Não-Alcoólicas",
  "Amenities",
  "Manutenção",
  "Material de Limpeza",
  "Descartáveis",
  "Outros",
] as const;

export type CategoriaOrcamento = typeof CATEGORIAS_ORCAMENTO[number];

// ── Mapa: Família Omie → Categoria de Orçamento ───────────────────────────────
export const FAMILIA_TO_CATEGORIA: Record<string, CategoriaOrcamento> = {
  // ── Alimentos ────────────────────────────────────────────────────────────
  "ACOMPANHAMENTOS":          "Alimentos",
  "ADICIONAIS":               "Alimentos",
  "AVES":                     "Alimentos",
  "CARNES BOVINAS":           "Alimentos",
  "CONGELADOS":               "Alimentos",
  "DOCES E CHOCOLATES":       "Alimentos",
  "EMBUTIDOS E FRIOS":        "Alimentos",
  "ENTRADAS":                 "Alimentos",
  "ESTOQUE SECO":             "Alimentos",
  "HORTIFRUTI":               "Alimentos",
  "LANCHES":                  "Alimentos",
  "LATICINIOS":               "Alimentos",
  "MENU DE VERAO":            "Alimentos",
  "PAES":                     "Alimentos",
  "PESCADOS E FRUTOS DO MAR": "Alimentos",
  "PETISCOS":                 "Alimentos",
  "PRATOS PRINCIPAIS":        "Alimentos",
  "SOBREMESAS":               "Alimentos",
  "SORVETES":                 "Alimentos",

  // ── Bebidas Alcoólicas ───────────────────────────────────────────────────
  "BEBIDAS INSUMO":           "Bebidas Alcoólicas",  // insumo para drinques
  "CERVEJAS":                 "Bebidas Alcoólicas",
  "COQUETEIS":                "Bebidas Alcoólicas",
  "DESTILADOS":               "Bebidas Alcoólicas",
  "DOSES":                    "Bebidas Alcoólicas",
  "VINHOS E ESPUMANTES":      "Bebidas Alcoólicas",

  // ── Bebidas Não-Alcoólicas ───────────────────────────────────────────────
  "CAFE DA MANHA E CHA":      "Bebidas Não-Alcoólicas",
  "SOFT DRINK":               "Bebidas Não-Alcoólicas",

  // ── Amenities ────────────────────────────────────────────────────────────
  "BOMBONIERE":               "Amenities",    // kits de boas-vindas
  "CORTESIAS":                "Amenities",    // mimos para hóspedes
  "SACHES":                   "Amenities",    // sachê de café, açúcar, etc.

  // ── Outros (não há categoria de orçamento direta) ────────────────────────
  "BRINDES E PRESENTES":      "Outros",
  "CAUCAO":                   "Outros",       // caução / depósito
  "COLABORADORES":            "Outros",       // benefícios RH
  "CONVENIENCIA":             "Outros",
  "ITENS EXTRAS":             "Outros",
  "PRODUTOS EROTICOS":        "Outros",       // frigobar adulto
  "RESERVAS":                 "Outros",
  "SERVICOS":                 "Outros",
  "TABACARIA":                "Outros",
  "TAXAS DE REEMBOLSOS":      "Outros",
};

/**
 * Resolve a categoria de orçamento para uma família Omie.
 * Retorna a categoria mapeada ou "Importado Omie" como fallback.
 */
export function categoriaParaFamilia(familia: string | null | undefined): string {
  if (!familia) return "Importado Omie";
  return FAMILIA_TO_CATEGORIA[familia.toUpperCase()] ?? "Importado Omie";
}
