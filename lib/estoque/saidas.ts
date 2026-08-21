/**
 * lib/estoque/saidas.ts — módulo de Estoque (bloco 3)
 * Converte as saídas agregadas do Automo (unidade de venda) para a unidade de
 * compra do LHG/Omie, por item de estoque.
 *
 * Função pura, sem Supabase nem `pg`: quem chama busca os dados e passa aqui
 * dentro. Fica testável sem mock e sem depender de rede.
 */

export interface ItemMapeado {
  estoque_item_id:    string;
  automo_produto_id:  number | null;
  fator_conversao:    number;
}

export interface SaidaAutomo {
  automo_produto_id: number;
  quantidade:         number;
}

/**
 * Devolve o mapa `estoque_item_id → quantidade convertida` (unidade de compra).
 *
 * - Item sem `automo_produto_id` não entra no mapa — não tem como saber a
 *   saída de algo que não está vinculado ao Automo.
 * - Item vinculado que não teve saída no período entra com **0**, não fica de
 *   fora: zero é "não vendeu nada", ausência seria "não sei" — e essa
 *   distinção é a base da divergência mostrada na contagem.
 * - Produto do Automo sem mapeamento no LHG é ignorado (ex.: serviços como
 *   "COMPLEMENTO DE TARIFA" que aparecem no Automo mas não são estoque).
 * - Arredonda em 3 casas, a precisão de `estoque_ciclo_itens.saidas` (numeric(12,3)).
 */
export function converterSaidas(
  itens: ItemMapeado[],
  saidas: SaidaAutomo[],
): Map<string, number> {
  const porProdutoAutomo = new Map<number, ItemMapeado>();
  for (const item of itens) {
    if (item.automo_produto_id != null) {
      porProdutoAutomo.set(item.automo_produto_id, item);
    }
  }

  const resultado = new Map<string, number>();
  for (const item of porProdutoAutomo.values()) {
    resultado.set(item.estoque_item_id, 0);
  }

  for (const saida of saidas) {
    const item = porProdutoAutomo.get(saida.automo_produto_id);
    if (!item) continue; // produto do Automo sem vínculo — ignora

    const atual = resultado.get(item.estoque_item_id) ?? 0;
    resultado.set(item.estoque_item_id, atual + saida.quantidade * item.fator_conversao);
  }

  for (const [id, valor] of resultado) {
    resultado.set(id, Math.round(valor * 1000) / 1000);
  }

  return resultado;
}
