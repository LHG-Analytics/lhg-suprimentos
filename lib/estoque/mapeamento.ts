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

/**
 * Semelhança entre dois nomes: índice de Jaccard sobre o conjunto de palavras.
 *
 * Conjunto, não sequência, de propósito — os catálogos divergem na ordem e em
 * complementos ("330ml", "UN", "CX"), e Jaccard tolera isso sem penalizar por
 * posição. Retorna 0..1.
 */
export function pontuarSemelhanca(a: string, b: string): number {
  const pa = new Set(normalizarNome(a).split(" ").filter(Boolean));
  const pb = new Set(normalizarNome(b).split(" ").filter(Boolean));
  if (pa.size === 0 || pb.size === 0) return 0;

  let comuns = 0;
  for (const p of pa) if (pb.has(p)) comuns++;

  const uniao = pa.size + pb.size - comuns;
  return uniao === 0 ? 0 : comuns / uniao;
}
