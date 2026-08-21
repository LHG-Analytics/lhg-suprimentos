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

export interface CandidatoNome {
  id:   string;
  nome: string;
}

export interface Sugestao extends CandidatoNome {
  score: number;
}

interface OpcoesSugestao {
  limite?:      number;
  scoreMinimo?: number;
}

/**
 * Ordena o catálogo pela semelhança com `alvo`.
 *
 * O desempate por nome existe para a ordem ser estável: sem ele, dois candidatos
 * de mesmo score sairiam em ordem imprevisível e a sugestão mudaria entre
 * carregamentos da tela.
 */
export function sugerirCandidatos(
  alvo: string,
  catalogo: CandidatoNome[],
  { limite = 5, scoreMinimo = 0.1 }: OpcoesSugestao = {},
): Sugestao[] {
  return catalogo
    .map(c => ({ ...c, score: pontuarSemelhanca(alvo, c.nome) }))
    .filter(c => c.score >= scoreMinimo)
    .sort((a, b) => (b.score - a.score) || a.nome.localeCompare(b.nome, "pt-BR"))
    .slice(0, limite);
}
