/**
 * lib/estoque/mapeamento.ts
 * Sugestão de mapeamento entre o catálogo do Automo e o do LHG/Omie.
 *
 * Funções puras, sem Supabase, sem `pg` e sem React: a regra de semelhança é a
 * única lógica de negócio deste bloco e fica testável sem mock.
 *
 * Os dois catálogos escrevem o mesmo produto de formas diferentes
 * ("CERVEJA HEINEKEN LONG NECK" vs "Cerveja Heineken Long-Neck 330ml"), então
 * comparar string crua não serve.
 */

/** Minúsculas, sem acento, pontuação virando espaço, espaços colapsados. */
export function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
