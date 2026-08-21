/** Tipos compartilhados entre a tela de estoque e o modal de cadastro. */

export interface ProdutoLhg {
  id:          string;
  codigo:      string;
  nome:        string;
  unidade_med: string;
  categoria:   string;
}

export interface ItemEstoque {
  id:                string;
  produto_id:        string;
  automo_produto_id: number | null;
  fator_conversao:   number;
  estoque_ideal:     number;
  ativo:             boolean;
  produtos: { nome: string; codigo: string; unidade_med: string; categoria: string } | null;
}
