/** Tipos compartilhados entre a página de contagem e a tela cliente. */

export interface CicloView {
  id:  string;
  mes: string; // ISO, dia 1 do mês — ver rotuloMes em lib/estoque/ciclo.ts
}

/** Uma origem (CNPJ) das entradas de um item — ver bloco 5, entradas por CNPJ. */
export interface EntradaPorUnidade {
  unidadeNome: string;
  quantidade:  number;
}

export interface CicloItemView {
  id:               string; // id de estoque_ciclo_itens — é o que registrarContagem espera
  produtoNome:      string;
  produtoUnidadeMed: string;
  estoqueIdeal:     number;
  contagemAnterior: number | null;
  entradas:         number | null;
  saidas:           number | null;
  contagemAtual:    number | null;
  contadoPorNome:   string | null;
  contadoEm:        string | null;
  /** Rateio de `entradas` por CNPJ — vazio quando não há detalhamento (ainda não importado, ou item existe em só um CNPJ). */
  entradasDetalhe:  EntradaPorUnidade[];
}
