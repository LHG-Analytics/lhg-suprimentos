/**
 * lib/omie/requisicao.ts
 * Operações Omie para Requisição de Compra.
 * LHG "Cotação" = Omie "Requisição de Compra" (/produtos/requisicaocompra/).
 *
 * codIntReqCompra = cotacao.id (UUID)
 * Fornecedor registrado em obsReqCompra: "Fornecedor: {nome_fantasia}"
 */
import { omiePost, OmieCredentials } from "./client";

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface OmieReqItem {
  codIntItem:  string;   // UUID do cotacao_item
  codProd?:    number;   // produto.omie_codigo (se existir)
  qtde:        number;
  precoUnit:   number;   // 0 se não houver preço ainda
  obsItem?:    string;
}

export interface OmieReqParam {
  codIntReqCompra:  string;           // cotacao.id
  dtSugestao?:      string;           // DD/MM/YYYY
  obsReqCompra?:    string;           // "Fornecedor: {nome}"
  ItensReqCompra:   OmieReqItem[];
}

interface IncluirReqResponse {
  nCodReqCompra?: number;
  cCodIntReqCompra?: string;
}

// ── incluirReq ─────────────────────────────────────────────────────────────────

/**
 * Cria uma Requisição de Compra no Omie.
 * Retorna o nCodReqCompra gerado pelo Omie (salvar em cotacoes.omie_codigo).
 */
export async function incluirReq(
  creds: OmieCredentials,
  param: OmieReqParam,
): Promise<number> {
  const res = await omiePost<
    { requisicaoCadastro: OmieReqParam },
    IncluirReqResponse
  >(
    "/produtos/requisicaocompra/",
    "IncluirReq",
    creds,
    { requisicaoCadastro: param },
  );
  return res.nCodReqCompra ?? 0;
}

// ── upsertReq ─────────────────────────────────────────────────────────────────

/**
 * Cria ou atualiza (idempotente) uma Requisição de Compra no Omie.
 * Usar em editarCotacao.
 */
export async function upsertReq(
  creds: OmieCredentials,
  param: OmieReqParam,
): Promise<void> {
  await omiePost<
    { requisicaoCadastro: OmieReqParam },
    Record<string, unknown>
  >(
    "/produtos/requisicaocompra/",
    "UpsertReq",
    creds,
    { requisicaoCadastro: param },
  );
}

// ── excluirReq ─────────────────────────────────────────────────────────────────

/**
 * Exclui uma Requisição de Compra no Omie pelo código de integração.
 */
export async function excluirReq(
  creds: OmieCredentials,
  codIntReqCompra: string,
): Promise<void> {
  await omiePost<
    { requisicaoCadastro: { codIntReqCompra: string } },
    Record<string, unknown>
  >(
    "/produtos/requisicaocompra/",
    "ExcluirReq",
    creds,
    { requisicaoCadastro: { codIntReqCompra } },
  );
}
