/** Tipos compartilhados entre a tela de estoque e o modal de cadastro. */
import type { ProdutoAutomo } from "@/lib/automo/client";

/**
 * Catálogo do Automo entregue como VALOR, com o erro dentro.
 *
 * A leitura do Automo não é aguardada no servidor (o banco do Andar de Cima leva
 * ~8,8s só para conectar) — a promise atravessa para o cliente e é consumida com
 * `use()`. Erro como campo, e não como rejeição, evita unhandled rejection caso
 * ninguém consuma a promise, e mantém o tratamento visível no componente.
 */
export interface ResultadoAutomo {
  produtos: ProdutoAutomo[];
  erro:     string | null;
}

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
