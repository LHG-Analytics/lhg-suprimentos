/**
 * lib/omie/requisicao.ts
 * Operações Omie para Requisição de Compra.
 * Endpoint: /produtos/requisicaocompra/
 *
 * Estrutura confirmada pela documentação Omie:
 *   - Wrapper do param: rcCadastro (não requisicaoCadastro)
 *   - codIntReqCompra: máx 20 chars
 *   - codIntItem: máx 20 chars
 *   - Calls: IncluirReq, UpsertReq, AlterarReq, ExcluirReq, ConsultarReq, PesquisarReq
 *
 * Helper: toOmieId(uuid) → primeiros 20 chars do UUID sem hifens
 */
import { omiePost, OmieCredentials, isOmieEmptyError } from "./client";

// ── Helper: UUID → ID curto (max 20 chars, sem hifens) ────────────────────────

export function toOmieId(id: string): string {
  return id.replace(/-/g, "").slice(0, 20);
}

// ── Tipos: criação/edição ─────────────────────────────────────────────────────

export interface OmieReqItem {
  /** Código de integração do item — máx 20 chars. Use toOmieId(uuid). */
  codIntItem:  string;
  /** Código do produto no Omie (omie_codigo). Opcional. */
  codProd?:    number;
  qtde:        number;
  precoUnit:   number;
  obsItem?:    string;
}

export interface OmieReqParam {
  /** Código de integração da requisição — máx 20 chars. Use toOmieId(uuid). */
  codIntReqCompra:  string;
  dtSugestao?:      string;   // DD/MM/YYYY
  obsReqCompra?:    string;
  ItensReqCompra:   OmieReqItem[];
}

interface ReqStatus {
  codReqCompra?:    number;
  codIntReqCompra?: string;
  cStatus?:         string;
  cDescStatus?:     string;
}

// ── upsertReq ─────────────────────────────────────────────────────────────────

/**
 * Cria ou atualiza (idempotente) uma Requisição de Compra no Omie.
 * Preferir sempre sobre incluirReq — evita erro REDUNDANT em retries.
 * Retorna codReqCompra gerado pelo Omie.
 */
export async function upsertReq(
  creds: OmieCredentials,
  param: OmieReqParam,
): Promise<number> {
  const res = await omiePost<
    { rcCadastro: OmieReqParam },
    ReqStatus
  >(
    "/produtos/requisicaocompra/",
    "UpsertReq",
    creds,
    { rcCadastro: param },
  );
  return res.codReqCompra ?? 0;
}

// ── incluirReq ────────────────────────────────────────────────────────────────

/**
 * Cria uma nova Requisição de Compra no Omie.
 * Use upsertReq se puder — é idempotente e mais seguro em retries.
 */
export async function incluirReq(
  creds: OmieCredentials,
  param: OmieReqParam,
): Promise<number> {
  const res = await omiePost<
    { rcCadastro: OmieReqParam },
    ReqStatus
  >(
    "/produtos/requisicaocompra/",
    "IncluirReq",
    creds,
    { rcCadastro: param },
  );
  return res.codReqCompra ?? 0;
}

// ── excluirReq ────────────────────────────────────────────────────────────────

/**
 * Exclui uma Requisição de Compra pelo código de integração.
 * Usa rcChave conforme documentação Omie.
 */
export async function excluirReq(
  creds: OmieCredentials,
  codIntReqCompra: string,
): Promise<void> {
  await omiePost<
    { rcChave: { codIntReqCompra: string } },
    Record<string, unknown>
  >(
    "/produtos/requisicaocompra/",
    "ExcluirReq",
    creds,
    { rcChave: { codIntReqCompra: toOmieId(codIntReqCompra) } },
  );
}

// ── Tipos: listagem ────────────────────────────────────────────────────────────

export interface OmieRequisicaoItemDetalhe {
  codItem?:    number;
  codIntItem?: string;
  codProd?:    number;
  codIntProd?: string;
  qtde:        number;
  precoUnit?:  number;
  obsItem?:    string;
}

export interface OmieRequisicaoItem {
  codReqCompra:     number;
  codIntReqCompra?: string;
  dtSugestao?:      string;   // "DD/MM/YYYY"
  obsReqCompra?:    string;
  cSituacao?:       string;
  ItensReqCompra?:  OmieRequisicaoItemDetalhe[];
}

interface PesquisarReqResponse {
  nPagina:             number;
  nTotPaginas:         number;
  nRegistros:          number;
  nTotRegistros:       number;
  cadastros?:          OmieRequisicaoItem[];
  // campo alternativo — Omie às vezes retorna com nome diferente
  requisicaoCadastro?: OmieRequisicaoItem[];
}

interface PesquisarReqParam {
  nPagina:              number;
  nRegPorPagina:        number;
  cOrdenarPor?:         string;
  cOrdemDecrescente?:   string;
  filtrar_situacao?:    string;
}

// ── listAllRequisicoes ────────────────────────────────────────────────────────

/**
 * Lista todas as Requisições de Compra do Omie (paginado).
 * Call: PesquisarReq com rcListarRequest.
 */
export async function listAllRequisicoes(
  creds: OmieCredentials,
): Promise<OmieRequisicaoItem[]> {
  const PER_PAGE = 50;
  const all: OmieRequisicaoItem[] = [];
  let page = 1;

  while (true) {
    let res: PesquisarReqResponse;
    try {
      res = await omiePost<{ rcListarRequest: PesquisarReqParam }, PesquisarReqResponse>(
        "/produtos/requisicaocompra/",
        "PesquisarReq",
        creds,
        {
          rcListarRequest: {
            nPagina:        page,
            nRegPorPagina:  PER_PAGE,
          },
        },
      );
    } catch (err) {
      if (isOmieEmptyError(err)) break;
      throw err;
    }

    const items = res.cadastros ?? res.requisicaoCadastro ?? [];
    all.push(...items);

    if (page >= res.nTotPaginas || items.length === 0) break;
    page++;
  }

  return all;
}
