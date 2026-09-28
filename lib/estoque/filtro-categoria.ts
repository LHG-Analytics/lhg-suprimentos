/**
 * lib/estoque/filtro-categoria.ts — filtro de categoria da tela de contagem
 *
 * Na interface a palavra é "Categoria" (é como a equipe e o Danilo falam), mas a
 * FONTE é `produtos.familia_omie` — a família do cadastro Omie (HORTIFRUTI,
 * LATICINIOS, ESTOQUE SECO...), que é a granularidade em que a prateleira é
 * contada. `produtos.categoria` é grosseira demais (78 dos 99 itens do Ipiranga
 * são só "Alimentos") e continua sendo o campo usado pela tela /estoque; a
 * diferença é de propósito. Decisão do Danilo em 28/09/2026.
 *
 * O filtro só afeta a EXIBIÇÃO: o ciclo, os totais e a importação continuam
 * sobre todos os itens. Funções puras, sem React nem Supabase.
 */

/** Rótulo do chip para item cuja família não veio do Omie. */
export const SEM_CATEGORIA = "Sem família";

/** Valor do parâmetro de URL que significa "todas" (o padrão). */
export const PARAM_TODAS = "todas";

export interface ItemComCategoria {
  /** `produtos.familia_omie`; null ou vazio = sem família. */
  produtoCategoria: string | null;
}

export interface ContagemCategoria {
  categoria: string;
  quantidade: number;
}

export function categoriaDoItem(item: ItemComCategoria): string {
  const c = item.produtoCategoria?.trim();
  return c ? c : SEM_CATEGORIA;
}

/**
 * Conta os itens por categoria sobre a lista COMPLETA (não a filtrada) — o chip
 * mostra quantos existem, não quantos estão visíveis. Ordem: mais itens primeiro,
 * alfabética no empate; "Sem família" sempre por último.
 */
export function contarPorCategoria<T extends ItemComCategoria>(itens: T[]): ContagemCategoria[] {
  const mapa = new Map<string, number>();
  for (const item of itens) {
    const c = categoriaDoItem(item);
    mapa.set(c, (mapa.get(c) ?? 0) + 1);
  }
  const lista = [...mapa].map(([categoria, quantidade]) => ({ categoria, quantidade }));
  return lista.sort((a, b) => {
    if (a.categoria === SEM_CATEGORIA) return 1;
    if (b.categoria === SEM_CATEGORIA) return -1;
    return b.quantidade - a.quantidade || a.categoria.localeCompare(b.categoria, "pt-BR");
  });
}

/** `null` = todas; devolve a mesma referência para não remontar a lista à toa. */
export function filtrarPorCategoria<T extends ItemComCategoria>(itens: T[], categoria: string | null): T[] {
  if (categoria == null) return itens;
  return itens.filter((item) => categoriaDoItem(item) === categoria);
}

/** Lê `?categoria=` da URL: ausente, vazio ou "todas" (qualquer caixa) = null. */
export function normalizarCategoriaParam(valor: string | null | undefined): string | null {
  const v = valor?.trim();
  if (!v || v.toLowerCase() === PARAM_TODAS) return null;
  return v;
}
