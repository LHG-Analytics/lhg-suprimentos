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
  codigo?: string;              // código interno (ex: "INS00002")
  unidade?: string;             // 'UN', 'KG', etc.
  ncm?: string;
  ean?: string;
  valor_unitario?: number;
  // ATENÇÃO: na API real o campo é "descr_detalhada", não "descricao_detalhada"
  descr_detalhada?: string;
  descricao_detalhada?: string; // alias mantido para compatibilidade
  inativo?: "S" | "N";
  // Família do produto: a API Omie retorna "descricao_familia" (nome da família)
  // e "codigo_familia" (ID numérico). "familia_produto" não existe na resposta.
  descricao_familia?: string;   // nome da família — campo correto da API
  codigo_familia?: number;      // ID numérico da família
  familia_produto?: string;     // campo legado (não retornado pela API real)
  [key: string]: unknown;       // permite inspecionar campos não mapeados
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

// ── Tipos: Nota de Entrada ─────────────────────────────────────────────────────

/** Um item (linha) de uma nota de entrada no Omie. */
export interface OmieNotaEntradaDet {
  /** Número sequencial do item (1, 2, 3...) */
  nItem: number;
  /** Código do produto no Omie (ou código interno como fallback) */
  cCodProd: string;
  /** Descrição do produto */
  cDescrProd: string;
  /** Unidade de medida (UN, KG, LT, etc.) */
  cUnid: string;
  /** Quantidade */
  nQtde: number;
  /** Valor unitário */
  nValUnit: number;
  /** Valor total = nQtde × nValUnit */
  nValTotal: number;
  /** Código NCM (opcional) */
  cCodNCM?: string;
  /** Código EAN/GTIN (opcional) */
  cEAN?: string;
  /** Desconto (opcional, padrão 0) */
  nValDesc?: number;
}

/** Parâmetros para IncluirNota em /produtos/notaentrada/ */
export interface OmieIncluirNotaParam {
  /** 0 = gerar código automático */
  nCodNota?: number;
  /** Número da NF (ex: "000001") */
  cNumNF: string;
  /** Série da NF (ex: "1") */
  cSerie: string;
  /** Data de emissão no formato DD/MM/YYYY */
  dDtEmissao: string;
  /** Data de entrada/recebimento no formato DD/MM/YYYY */
  dDtEntrada: string;
  /** Chave de acesso NF-e (44 dígitos) */
  cChaveNFe: string;
  /** Código do fornecedor no Omie (preferencial se omie_codigo disponível) */
  nCodFornecedor?: number;
  /** CNPJ do fornecedor — alternativa quando omie_codigo não está disponível */
  cCNPJFornecedor?: string;
  /** Valor total da nota */
  nValorTotalNota: number;
  /** Finalidade NF-e: "1"=normal, "2"=complementar, "3"=ajuste, "4"=devolução */
  cFinNFe?: string;
  /** Natureza da operação */
  cNaturezaOperacao?: string;
  /** Itens (linhas) da nota */
  det: OmieNotaEntradaDet[];
}

/** Resposta do Omie para IncluirNota */
export interface OmieIncluirNotaResponse {
  /** Código interno gerado pelo Omie para a nota */
  nCodNota: number;
  /** Número da NF conforme enviado */
  cNumNF: string;
  /** Código de status: "0" = sucesso */
  cStatus: string;
  /** Descrição legível do status */
  cDescStatus: string;
}

// ── Tipos: Consulta NF Entrada ────────────────────────────────────────────────

export interface OmieNFEntradaCabecalho {
  nCodNF:            number;
  cNumNF:            string;
  cSerie:            string;
  dDtEmissao:        string;   // DD/MM/YYYY
  nCodFornecedor:    number;
  cCNPJFornecedor?:  string;
  cRazaoSocial?:     string;
  nValTotalNF:       number;
  cChaveNFe?:        string;   // 44 dígitos (NF-e); ausente em NF papel
}

export interface OmieNFEntradaProduto {
  cCodProd:     string;
  cDescricao:   string;
  nQtde:        number;
  nValUnit:     number;
  nValTotal:    number;
  cUnid:        string;
  cFamProd?:    string;  // família de produto no Omie (pré-fill do dropdown)
}

export interface OmieNFEntradaDet {
  nItem:   number;
  produto: OmieNFEntradaProduto;
}

export interface OmieNFEntradaResponse {
  cabecalho: OmieNFEntradaCabecalho;
  det:       OmieNFEntradaDet[];
}

/**
 * Consulta uma Nota Fiscal de Entrada no Omie pelo número.
 * Endpoint: /produtos/notaentrada/ — call: ConsultarNota
 *
 * Referência: https://app.omie.com.br/api/v1/produtos/notaentrada/
 */
export async function consultarNFEntrada(
  creds: OmieCredentials,
  numero: string,
): Promise<OmieNFEntradaResponse> {
  return omiePost<{ nCodNF: number; cNumNF: string }, OmieNFEntradaResponse>(
    "/produtos/notaentrada/",
    "ConsultarNota",
    creds,
    { nCodNF: 0, cNumNF: numero },
  );
}

/**
 * Inclui uma nota de entrada no Omie ERP.
 * Endpoint: /produtos/notaentrada/ — call: IncluirNota
 *
 * Referência: https://app.omie.com.br/api/v1/produtos/notaentrada/
 */
export async function incluirNotaEntrada(
  creds: OmieCredentials,
  param: OmieIncluirNotaParam,
): Promise<OmieIncluirNotaResponse> {
  return omiePost<OmieIncluirNotaParam, OmieIncluirNotaResponse>(
    "/produtos/notaentrada/",
    "IncluirNota",
    creds,
    param,
  );
}

// ── Tipos: Pedido de Compra ────────────────────────────────────────────────────

export interface OmiePedidoCompraCabecalho {
  /** Número do pedido no sistema LHG (ex: "PED-2026-0001") */
  numero_pedido:    string;
  /** Código do fornecedor no Omie (omie_codigo da tabela fornecedores) */
  codigo_parceiro:  number;
  /** Data de previsão de entrega (DD/MM/YYYY) */
  data_previsao?:   string;
  /** Observações livres */
  obs_venda?:       string;
  /**
   * Etapa do pedido:
   *   "10" = Digitação (padrão)
   *   "20" = Aguardando confirmação do fornecedor
   */
  etapa?:           string;
}

export interface OmiePedidoCompraDet {
  ide:     { codigo_item_integracao: string };
  produto: {
    /** Código do produto no Omie (omie_codigo da tabela produtos) */
    codigo_produto:  number;
    /**
     * CFOP de compra para uso/consumo:
     *   "1556" = compra dentro do estado
     *   "2556" = compra fora do estado
     */
    cfop?:           string;
    quantidade:      number;
    valor_unitario:  number;
  };
}

export interface OmiePedidoCompraParam {
  cabecalho:               OmiePedidoCompraCabecalho;
  det:                     OmiePedidoCompraDet[];
  informacoes_adicionais?: {
    enviar_email?:     "S" | "N";
    consumidor_final?: "S" | "N";
    obs_venda?:        string;
  };
}

export interface OmiePedidoCompraResponse {
  numero_pedido:    string;
  codigo_status:    string;   // "0" = OK
  descricao_status: string;
  /** Código interno gerado pelo Omie para o pedido */
  codigo_pedido?:   number;
}

/**
 * Cria um Pedido de Compra no Omie ERP.
 * Endpoint: /compras/pedidocompras/ — call: IncluirPedidoCompra
 *
 * ⚠️  Requer o módulo de Compras habilitado na conta Omie.
 *     Se o plano contratado não incluir esse módulo, o Omie retornará um
 *     faultstring — nesse caso, omie_status ficará como "erro" e a mensagem
 *     será gravada em omie_erro para diagnóstico.
 *
 * Referência: https://app.omie.com.br/api/v1/compras/pedidocompras/
 */
export async function criarPedidoCompra(
  creds: OmieCredentials,
  param: OmiePedidoCompraParam,
): Promise<OmiePedidoCompraResponse> {
  return omiePost<OmiePedidoCompraParam, OmiePedidoCompraResponse>(
    "/compras/pedidocompras/",
    "IncluirPedidoCompra",
    creds,
    param,
  );
}
