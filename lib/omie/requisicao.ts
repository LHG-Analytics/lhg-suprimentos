/**
 * lib/omie/requisicao.ts
 * Operações Omie para Requisição de Compra.
 * LHG "Cotação" = Omie "Requisição de Compra" (/produtos/requisicaocompra/).
 *
 * codIntReqCompra = cotacao.id (UUID)
 * Fornecedor registrado em obsReqCompra: "Fornecedor: {nome_fantasia}"
 */
import { omiePost, OmieCredentials, isOmieEmptyError } from "./client";

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
 * Preferir sobre incluirReq para evitar REDUNDANT em retries.
 * Retorna nCodReqCompra quando disponível na resposta.
 */
export async function upsertReq(
  creds: OmieCredentials,
  param: OmieReqParam,
): Promise<number> {
  const res = await omiePost<
    { requisicaoCadastro: OmieReqParam },
    { nCodReqCompra?: number; cCodIntReqCompra?: string }
  >(
    "/produtos/requisicaocompra/",
    "UpsertReq",
    creds,
    { requisicaoCadastro: param },
  );
  return res.nCodReqCompra ?? 0;
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

// ── Tipos: Listagem de Requisições ─────────────────────────────────────────────

export interface OmieRequisicaoItemDetalhe {
  nItem:       number;
  nCodProd?:   number;   // pode estar vazio se produto não mapeado
  cDescricao:  string;
  nQtde:       number;
  cUnid?:      string;
  nValUnit?:   number;
  cObsItem?:   string;
}

export interface OmieRequisicaoItem {
  nCodReqCompra:      number;
  cNumReq?:           string;
  cCodIntReqCompra?:  string;   // UUID de integração (nosso ID se criamos por aqui)
  dDtRequisicao?:     string;   // "DD/MM/YYYY"
  dDtNecessidade?:    string;
  cSituacao?:         string;   // "Aberta", "Em Cotação", "Aprovada", "Cancelada"
  cDepartamento?:     string;
  cSolicitante?:      string;
  cObs?:              string;
  det?:               OmieRequisicaoItemDetalhe[];
}

interface ListarReqResponse {
  pagina:              number;
  total_de_paginas:    number;
  registros:           number;
  total_de_registros:  number;
  requisicaoCadastro?: OmieRequisicaoItem[];
}

interface ListarReqParam {
  pagina:                number;
  registros_por_pagina:  number;
  filtrar_situacao?:     string;
}

/**
 * Lista todas as Requisições de Compra do Omie de forma paginada.
 * Retorna apenas as abertas por padrão (filtrar_situacao = "Aberta").
 * Usado pelo syncRequisicoes para pull bidirecional.
 */
export async function listAllRequisicoes(
  creds: OmieCredentials,
  situacao = "Aberta",
): Promise<OmieRequisicaoItem[]> {
  const PER_PAGE = 50;
  const all: OmieRequisicaoItem[] = [];
  let page = 1;

  while (true) {
    let res: ListarReqResponse;
    try {
      res = await omiePost<ListarReqParam, ListarReqResponse>(
        "/produtos/requisicaocompra/",
        "ListarReq",
        creds,
        {
          pagina:               page,
          registros_por_pagina: PER_PAGE,
          filtrar_situacao:     situacao,
        },
      );
    } catch (err) {
      if (isOmieEmptyError(err)) break;
      throw err;
    }

    const items = res.requisicaoCadastro ?? [];
    all.push(...items);

    if (page >= res.total_de_paginas || items.length === 0) break;
    page++;
  }

  return all;
}
