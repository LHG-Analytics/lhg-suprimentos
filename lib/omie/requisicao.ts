/**
 * lib/omie/requisicao.ts
 * Operações Omie para Requisição de Compra.
 * Endpoint: /produtos/requisicaocompra/
 *
 * Estrutura confirmada por testes diretos na API:
 *   - Os campos vão DIRETAMENTE no param (sem wrapper rcCadastro ou requisicaoCadastro)
 *   - codCateg é OBRIGATÓRIO
 *   - codIntReqCompra: máx 20 chars — usar toOmieId()
 *   - codIntItem: máx 20 chars — usar toOmieId()
 *   - Calls válidas: IncluirReq, UpsertReq, AlterarReq, ExcluirReq, ConsultarReq, PesquisarReq
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
  /** Código de categoria do plano de contas — OBRIGATÓRIO. Ex: "2.02.87". */
  codCateg:         string;
  /** Código de integração da requisição — máx 20 chars. Use toOmieId(uuid). */
  codIntReqCompra:  string;
  dtSugestao?:      string;        // DD/MM/YYYY
  obsReqCompra?:    string;
  ItensReqCompra?:  OmieReqItem[];
}

interface ReqStatus {
  codReqCompra?:    number;
  codIntReqCompra?: string;
  cCodStatus?:      string;
  cDesStatus?:      string;
}

// ── incluirReq ────────────────────────────────────────────────────────────────

/**
 * Cria uma nova Requisição de Compra no Omie.
 * Os campos vão DIRETO no param — sem wrapper.
 * Retorna codReqCompra gerado pelo Omie.
 */
export async function incluirReq(
  creds: OmieCredentials,
  param: OmieReqParam,
): Promise<number> {
  // maxRetries = 1: sem retry para evitar erro REDUNDANT do Omie.
  // IncluirReq é uma operação de criação — se já foi criada, o retry duplica.
  const res = await omiePost<OmieReqParam, ReqStatus>(
    "/produtos/requisicaocompra/",
    "IncluirReq",
    creds,
    param,
    1,
  );
  return res.codReqCompra ?? 0;
}

// ── upsertReq ─────────────────────────────────────────────────────────────────

/**
 * Cria ou atualiza (idempotente) uma Requisição de Compra no Omie.
 * Os campos vão DIRETO no param — sem wrapper.
 * Retorna codReqCompra.
 */
export async function upsertReq(
  creds: OmieCredentials,
  param: OmieReqParam,
): Promise<number> {
  const res = await omiePost<OmieReqParam, ReqStatus>(
    "/produtos/requisicaocompra/",
    "UpsertReq",
    creds,
    param,
  );
  return res.codReqCompra ?? 0;
}

// ── consultarReq ──────────────────────────────────────────────────────────────

/**
 * Busca uma Requisição de Compra pelo código de integração.
 * Usado para recuperar codReqCompra após REDUNDANT (retry criou, 1ª chamada já tinha criado).
 */
export async function consultarReq(
  creds: OmieCredentials,
  codIntReqCompra: string,
): Promise<number> {
  const res = await omiePost<
    { codIntReqCompra: string; codReqCompra: number },
    { codReqCompra?: number }
  >(
    "/produtos/requisicaocompra/",
    "ConsultarReq",
    creds,
    { codIntReqCompra, codReqCompra: 0 },
  );
  return res.codReqCompra ?? 0;
}

// ── excluirReq ────────────────────────────────────────────────────────────────

export async function excluirReq(
  creds: OmieCredentials,
  codIntReqCompra: string,
): Promise<void> {
  await omiePost<{ codIntReqCompra: string; codReqCompra: number }, Record<string, unknown>>(
    "/produtos/requisicaocompra/",
    "ExcluirReq",
    creds,
    { codIntReqCompra: toOmieId(codIntReqCompra), codReqCompra: 0 },
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
  codCateg?:        string;
  dtSugestao?:      string;
  obsReqCompra?:    string;
  cSituacao?:       string;
  ItensReqCompra?:  OmieRequisicaoItemDetalhe[];
}

interface PesquisarReqResponse {
  pagina:             number;
  total_de_paginas:   number;
  registros:          number;
  total_de_registros: number;
  cadastros?:         OmieRequisicaoItem[];
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
      res = await omiePost<{ rcListarRequest: { pagina: number; registros_por_pagina: number } }, PesquisarReqResponse>(
        "/produtos/requisicaocompra/",
        "PesquisarReq",
        creds,
        { rcListarRequest: { pagina: page, registros_por_pagina: PER_PAGE } },
      );
    } catch (err) {
      if (isOmieEmptyError(err)) break;
      throw err;
    }

    const items = res.cadastros ?? [];
    all.push(...items);

    if (page >= res.total_de_paginas || items.length === 0) break;
    page++;
  }

  return all;
}
