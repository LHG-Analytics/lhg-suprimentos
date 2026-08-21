/**
 * lib/estoque/entradas.ts — módulo de Estoque (bloco 4, importação de entradas do Omie)
 *
 * Cada local físico (ex: "Lush Ipiranga") pode ser abastecido por N unidades
 * fiscais/CNPJs (RCC e CONCAVO, no caso do Ipiranga), e cada CNPJ tem sua
 * própria conta Omie — logo o MESMO produto físico tem um `omie_codigo`
 * diferente em cada uma. `estoque_itens.produto_id` aponta para uma única
 * linha de `produtos`, então somar as entradas do local exige resolver, a
 * partir dessa linha, todos os `omie_codigo` (um por CNPJ) que representam o
 * mesmo produto e somar as entradas de todos eles.
 *
 * Funções puras, sem Supabase: quem chama busca os dados e passa aqui dentro.
 */

export interface ProdutoRef {
  id:               string;
  codigo:           string;
  nome:             string;
  omie_codigo:      string | null;
  omie_unidade_id:  string | null;
}

import { normalizarNome } from "@/lib/estoque/mapeamento";

export interface ChaveOmiePorUnidade {
  omie_codigo: string;
  unidade_id:  string;
}

/**
 * Como `resolverChavesOmie`, mas devolve também de qual unidade fiscal (CNPJ)
 * cada chave vem — é o que permite gravar o rateio por CNPJ em
 * `estoque_ciclo_item_entradas` (bloco 5, ver actions.ts) em vez de só o
 * total.
 *
 * Casa por `codigo` **e** por `normalizarNome(nome)` — não só por `codigo`.
 * Medido em produção nos dois CNPJs do Ipiranga: de 1.393 códigos distintos,
 * 27 têm nome divergente entre os dois (o mesmo código interno foi reusado
 * para produtos diferentes em cada conta Omie). Casar só por `codigo` somaria
 * as entradas desses 27 produtos não relacionados.
 */
export function resolverChavesOmiePorUnidade(
  alvo: { codigo: string; nome: string },
  catalogo: ProdutoRef[],
): ChaveOmiePorUnidade[] {
  const nomeAlvo = normalizarNome(alvo.nome);
  const pares: ChaveOmiePorUnidade[] = [];
  for (const produto of catalogo) {
    if (produto.codigo !== alvo.codigo) continue;
    if (normalizarNome(produto.nome) !== nomeAlvo) continue;
    if (!produto.omie_codigo || !produto.omie_unidade_id) continue;
    pares.push({ omie_codigo: produto.omie_codigo, unidade_id: produto.omie_unidade_id });
  }
  return pares;
}

/**
 * Resolve os `omie_codigo` (um por CNPJ) que representam o mesmo produto que
 * `alvo`, dentro do catálogo completo do local (todas as unidades fiscais).
 * Ver `resolverChavesOmiePorUnidade` quando também for preciso saber de qual
 * unidade cada chave vem.
 */
export function resolverChavesOmie(
  alvo: { codigo: string; nome: string },
  catalogo: ProdutoRef[],
): string[] {
  return resolverChavesOmiePorUnidade(alvo, catalogo).map((par) => par.omie_codigo);
}

/**
 * Soma as entradas de todas as chaves (uma por CNPJ) de um item, e conta de
 * quantos CNPJs efetivamente chegou entrada no período — sinal usado pela
 * tela para avisar quando um item recebeu de só parte dos CNPJs do local.
 *
 * Arredonda em 3 casas, a precisão de `estoque_ciclo_itens.entradas`
 * (numeric(12,3), mesmo padrão de `saidas`).
 */
export function somarEntradasPorItem(
  chaves: string[],
  entradas: Map<string, number>,
): { quantidade: number; cnpjsComEntrada: number } {
  let quantidade = 0;
  let cnpjsComEntrada = 0;
  for (const chave of chaves) {
    const valor = entradas.get(chave);
    if (valor === undefined) continue;
    quantidade += valor;
    cnpjsComEntrada++;
  }
  return { quantidade: Math.round(quantidade * 1000) / 1000, cnpjsComEntrada };
}
