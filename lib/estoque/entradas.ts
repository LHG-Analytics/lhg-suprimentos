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

/**
 * Resolve os `omie_codigo` (um por CNPJ) que representam o mesmo produto que
 * `alvo`, dentro do catálogo completo do local (todas as unidades fiscais).
 *
 * Casa por `codigo` **e** por `normalizarNome(nome)` — não só por `codigo`.
 * Medido em produção nos dois CNPJs do Ipiranga: de 1.393 códigos distintos,
 * 27 têm nome divergente entre os dois (o mesmo código interno foi reusado
 * para produtos diferentes em cada conta Omie). Casar só por `codigo` somaria
 * as entradas desses 27 produtos não relacionados.
 */
export function resolverChavesOmie(
  alvo: { codigo: string; nome: string },
  catalogo: ProdutoRef[],
): string[] {
  const nomeAlvo = normalizarNome(alvo.nome);
  const chaves: string[] = [];
  for (const produto of catalogo) {
    if (produto.codigo !== alvo.codigo) continue;
    if (normalizarNome(produto.nome) !== nomeAlvo) continue;
    if (!produto.omie_codigo) continue;
    chaves.push(produto.omie_codigo);
  }
  return chaves;
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
