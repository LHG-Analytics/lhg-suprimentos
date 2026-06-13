/**
 * lib/supabase/fetch-all.ts
 *
 * O PostgREST (Supabase) trava QUALQUER resposta no max-rows do projeto
 * (1000 por padrão), mesmo com .range()/.limit() maiores. Para tabelas que
 * excedem isso (ex: produtos com 1240+ linhas), é preciso paginar em blocos.
 *
 * Uso:
 *   const produtos = await fetchAllRows((from, to) =>
 *     supabase.from("produtos").select("...").order("nome").range(from, to),
 *   );
 *
 * IMPORTANTE: a query precisa de ordenação determinística (use .order com
 * coluna única ou inclua um tiebreaker) para as páginas não se sobreporem.
 */

interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

const CHUNK = 1000;

export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const all: T[] = [];

  for (let from = 0; ; from += CHUNK) {
    const { data, error } = await buildQuery(from, from + CHUNK - 1);
    if (error) {
      console.error("[fetchAllRows] erro na página", from / CHUNK, error.message);
      break;
    }
    if (!data?.length) break;
    all.push(...data);
    if (data.length < CHUNK) break;
  }

  return all;
}
