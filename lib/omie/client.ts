/**
 * lib/omie/client.ts — LHG-208
 * Cliente HTTP para a API do Omie ERP.
 *
 * Todas as chamadas Omie são POST JSON com envelope:
 *   { app_key, app_secret, call, param: [{ ... }] }
 *
 * Rate limit: 240 req/min por IP+app_key+method (~4 req/seg).
 * Estratégia: retry exponencial com jitter (3 tentativas).
 *
 * Referência: https://developer.omie.com.br/
 */

// ── Constantes ─────────────────────────────────────────────────────────────────
const OMIE_BASE = "https://app.omie.com.br/api/v1";

// Intervalo mínimo entre requests para a mesma chave (ms).
// 4 req/seg = 250ms. Usamos 280ms para folga.
const MIN_REQ_INTERVAL_MS = 280;

// Mapa de timestamps do último request por app_key (evita rate-limit)
const lastRequestAt: Map<string, number> = new Map();

// ── Tipos base ─────────────────────────────────────────────────────────────────

export interface OmieCredentials {
  appKey: string;
  appSecret: string;
}

interface OmieEnvelope<TParam = Record<string, unknown>> {
  app_key: string;
  app_secret: string;
  call: string;
  param: [TParam];
}

interface OmieFaultResponse {
  faultstring: string;
  faultcode: string;
}

// Formato alternativo de erro que algumas rotas Omie retornam
interface OmieErrorResponse {
  status: string;   // "error"
  message: string;
}

interface OmiePaginacaoParam {
  pagina: number;
  registros_por_pagina: number;
  apenas_importado_api?: "S" | "N";
  filtrar_apenas_ativo?: "S" | "N";
}

interface OmiePaginacaoResponse {
  pagina: number;
  total_de_paginas: number;
  registros: number;
  total_de_registros: number;
}

// ── Tipos: Clientes/Fornecedores ───────────────────────────────────────────────

export interface OmieClienteParam extends OmiePaginacaoParam {
  clientesFiltro?: {
    tags?: Array<{ tag: string }>;
    inativo?: "S" | "N";
    nome_fantasia?: string;
    cnpj_cpf?: string;
  };
}

export interface OmieClienteItem {
  codigo_cliente: number;
  razao_social: string;
  nome_fantasia?: string;
  cnpj_cpf: string;
  email?: string;
  telefone1_ddd?: string;
  telefone1_numero?: string;
  contato?: string;
  cep?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  ativo: "S" | "N";
  tags?: Array<{ tag: string }>;
}

export interface OmieListaClientesResponse extends OmiePaginacaoResponse {
  clientes_cadastro: OmieClienteItem[];
}

// ── Tipos: Produtos ────────────────────────────────────────────────────────────

export interface OmieProdutoParam extends OmiePaginacaoParam {
  filtrar_apenas_omiepdv?: "S" | "N";
  produtosFiltro?: {
    inativo?: "S" | "N";
    codigo?: string;
    descricao?: string;
  };
}

export interface OmieProdutoItem {
  codigo_produto: number;
  codigo_produto_integracao?: string;
  descricao: string;
  codigo?: string;            // código interno
  unidade?: string;           // 'UN', 'KG', etc.
  ncm?: string;
  ean?: string;
  valor_unitario?: number;
  descricao_detalhada?: string;
  inativo?: "S" | "N";
  familia_produto?: string;
}

export interface OmieListaProdutosResponse extends OmiePaginacaoResponse {
  produto_servico_cadastro: OmieProdutoItem[];
  // ListarCadProdutos retorna em "cadastros" em algumas versões
  cadastros?: OmieProdutoItem[];
}

// ── Rate-limit helper ──────────────────────────────────────────────────────────

async function throttle(appKey: string): Promise<void> {
  const last = lastRequestAt.get(appKey) ?? 0;
  const wait = MIN_REQ_INTERVAL_MS - (Date.now() - last);
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastRequestAt.set(appKey, Date.now());
}

// ── Core: omiePost ─────────────────────────────────────────────────────────────

/**
 * Faz uma chamada POST para a API do Omie com retry exponencial.
 * Lança `OmieError` em caso de falha definitiva.
 */
export class OmieError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "OmieError";
  }
}

export async function omiePost<TParam, TResponse>(
  endpoint: string,
  call: string,
  creds: OmieCredentials,
  param: TParam,
  maxRetries = 3,
): Promise<TResponse> {
  const url = `${OMIE_BASE}${endpoint}`;
  const body: OmieEnvelope<TParam> = {
    app_key: creds.appKey,
    app_secret: creds.appSecret,
    call,
    param: [param],
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await throttle(creds.appKey);

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        // Timeout de 30s por request
        signal: AbortSignal.timeout(30_000),
      });

      const json = await res.json();

      // Formato alternativo: { status: "error", message: "..." }
      if ("status" in json && (json as OmieErrorResponse).status === "error") {
        const msg = (json as OmieErrorResponse).message ?? "Erro desconhecido";
        throw new OmieError(msg, "CLIENT_ERROR", res.status);
      }

      // Omie retorna HTTP 200 mas com faultstring para erros de negócio
      if ("faultstring" in json) {
        const fault = json as OmieFaultResponse;
        const fs: string = fault.faultstring ?? "";
        const fc: string = fault.faultcode ?? "";

        // "Sem registros" é resposta legítima — não é erro transitório, não retenta
        const fsLow = fs.toLowerCase();
        const isEmpty =
          fsLow.includes("não existem registros") ||
          fsLow.includes("nao existem registros") ||
          fsLow.includes("nenhum registro");

        // Outros erros: retentáveis (SOAP-ENV / 5xx) ou definitivos
        const retryable =
          !isEmpty && (fc.startsWith("SOAP-ENV") || fc.startsWith("5"));
        if (!retryable || attempt === maxRetries) {
          throw new OmieError(fs, fc, res.status);
        }
        lastError = new OmieError(fs, fc, res.status);
      } else if (!res.ok) {
        if (attempt === maxRetries) {
          throw new OmieError(`HTTP ${res.status}`, undefined, res.status);
        }
        lastError = new OmieError(`HTTP ${res.status}`, undefined, res.status);
      } else {
        return json as TResponse;
      }
    } catch (err) {
      if (err instanceof OmieError) throw err; // erros definitivos: não retenta
      if (err instanceof Error) lastError = err;
      if (attempt === maxRetries) break;
    }

    // Backoff exponencial com jitter: 500ms, 1s, 2s (± 100ms aleatório)
    const delay = Math.pow(2, attempt - 1) * 500 + Math.random() * 100;
    await new Promise((r) => setTimeout(r, delay));
  }

  throw lastError ?? new OmieError("Falha desconhecida na API Omie");
}

// ── Fornecedores ───────────────────────────────────────────────────────────────

/**
 * Busca uma página de fornecedores no Omie.
 * Filtra pela tag "Fornecedor" para excluir registros que são apenas clientes.
 * No Omie o cadastro é unificado (cliente + fornecedor na mesma tabela),
 * então a tag é a forma correta de distinguir fornecedores.
 */
export async function listFornecedoresPage(
  creds: OmieCredentials,
  pagina: number,
  registrosPorPagina = 50,
): Promise<OmieListaClientesResponse> {
  return omiePost<OmieClienteParam, OmieListaClientesResponse>(
    "/geral/clientes/",
    "ListarClientes",
    creds,
    {
      pagina,
      registros_por_pagina: registrosPorPagina,
      clientesFiltro: {
        inativo: "N",
        tags: [{ tag: "Fornecedor" }], // apenas quem tem a tag Fornecedor
      },
    },
  );
}

/**
 * Itera todas as páginas de fornecedores e retorna a lista completa.
 * @param onPage callback opcional chamado a cada página (progress reporting)
 */
// Mensagens Omie que indicam "sem registros" — tratar como lista vazia.
const OMIE_EMPTY_MSGS = [
  "não existem registros",
  "nao existem registros",
  "no records",
  "nenhum registro",
];

function isOmieEmptyError(err: unknown): boolean {
  if (!(err instanceof OmieError)) return false;
  const msg = err.message.toLowerCase();
  return OMIE_EMPTY_MSGS.some((m) => msg.includes(m));
}

export async function listAllFornecedores(
  creds: OmieCredentials,
  onPage?: (page: number, total: number, items: OmieClienteItem[]) => void,
): Promise<OmieClienteItem[]> {
  const all: OmieClienteItem[] = [];
  let pagina = 1;
  let totalPaginas = 1;

  do {
    let res: OmieListaClientesResponse;
    try {
      res = await listFornecedoresPage(creds, pagina);
    } catch (err) {
      if (isOmieEmptyError(err)) break; // sem registros — encerra paginação
      throw err;
    }
    totalPaginas = res.total_de_paginas;
    all.push(...res.clientes_cadastro);
    onPage?.(pagina, totalPaginas, res.clientes_cadastro);
    pagina++;
  } while (pagina <= totalPaginas);

  return all;
}

// ── Produtos ───────────────────────────────────────────────────────────────────

/**
 * Busca uma página de produtos no Omie.
 *
 * Parâmetros obrigatórios para retornar produtos cadastrados manualmente:
 *   - apenas_importado_api: "N"  → inclui produtos não importados via API
 *   - filtrar_apenas_omiepdv: "N" → inclui produtos que não são exclusivos do PDV
 * (sem esses dois flags o Omie retorna lista vazia para cadastros manuais)
 */
export async function listProdutosPage(
  creds: OmieCredentials,
  pagina: number,
  registrosPorPagina = 50,
): Promise<OmieListaProdutosResponse> {
  return omiePost<OmieProdutoParam, OmieListaProdutosResponse>(
    "/geral/produtos/",
    "ListarProdutos",
    creds,
    {
      pagina,
      registros_por_pagina: registrosPorPagina,
      apenas_importado_api: "N",    // inclui produtos cadastrados manualmente
      filtrar_apenas_omiepdv: "N",  // inclui produtos não-PDV
    },
  );
}

/**
 * Itera todas as páginas de produtos e retorna a lista completa.
 */
export async function listAllProdutos(
  creds: OmieCredentials,
  onPage?: (page: number, total: number, items: OmieProdutoItem[]) => void,
): Promise<OmieProdutoItem[]> {
  const all: OmieProdutoItem[] = [];
  let pagina = 1;
  let totalPaginas = 1;

  do {
    let res: OmieListaProdutosResponse;
    try {
      res = await listProdutosPage(creds, pagina);
    } catch (err) {
      if (isOmieEmptyError(err)) break; // sem produtos — encerra normalmente
      throw err; // propaga qualquer outro erro (inclusive REDUNDANT) para diagnóstico
    }
    totalPaginas = res.total_de_paginas;
    // Omie usa "produto_servico_cadastro" ou "cadastros" dependendo da versão
    const items = res.produto_servico_cadastro ?? res.cadastros ?? [];
    all.push(...items);
    onPage?.(pagina, totalPaginas, items);
    pagina++;
  } while (pagina <= totalPaginas);

  return all;
}
