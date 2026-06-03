/**
 * lib/omie/produtos.ts
 * Operações Omie para CRUD de Produtos.
 * Fase 1: Create + Update apenas. Delete não é suportado (só inativação).
 *
 * Endpoint: /produtos/produto/
 */
import { omiePost, OmieCredentials, OmieError } from "./client";

export interface OmieProdutoIncluir {
  cCodIntProduto: string;    // UUID do produto LHG — garante idempotência
  cDescricao:     string;    // nome do produto (obrigatório)
  cUnidade:       string;    // "UN", "KG", "CX", "LT", etc.
  cCodFamilia?:   string;    // código da família no Omie (opcional)
  nValorCusto?:   number;    // preço de custo (opcional)
  nValorVenda?:   number;    // preço de venda (opcional)
  cInativo:       "N";       // sempre ativo ao criar
}

export interface OmieProdutoAlterar {
  nCodProd:       number;    // código numérico Omie — obrigatório para alterar
  cCodIntProduto: string;    // UUID do produto LHG
  cDescricao?:    string;
  cUnidade?:      string;
  cCodFamilia?:   string;
  nValorCusto?:   number;
  cInativo?:      "S" | "N"; // "S" = inativar, "N" = ativar
}

interface IncluirProdutoResponse {
  nCodProd:        number;
  cCodIntProduto:  string;
  cDescricao:      string;
}

export async function incluirProduto(
  creds: OmieCredentials,
  produto: OmieProdutoIncluir,
): Promise<{ nCodProd: number; cCodIntProduto: string }> {
  const res = await omiePost<
    { produto_servico_cadastro: OmieProdutoIncluir },
    IncluirProdutoResponse
  >(
    "/produtos/produto/",
    "IncluirProduto",
    creds,
    { produto_servico_cadastro: produto },
  );

  if (!res.nCodProd) {
    throw new OmieError("Omie não retornou nCodProd após incluir produto");
  }

  return { nCodProd: res.nCodProd, cCodIntProduto: res.cCodIntProduto };
}

export async function alterarProduto(
  creds: OmieCredentials,
  produto: OmieProdutoAlterar,
): Promise<void> {
  await omiePost<
    { produto_servico_cadastro: OmieProdutoAlterar },
    Record<string, unknown>
  >(
    "/produtos/produto/",
    "AlterarProduto",
    creds,
    { produto_servico_cadastro: produto },
  );
}
