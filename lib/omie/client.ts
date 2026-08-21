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
  codigo_cliente:      number;   // campo principal
  codigo_cliente_omie?: number;  // campo alternativo em algumas versões da API
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
  /**
   * Campo de status que o Omie realmente retorna no ListarClientes.
   * O campo "ativo" (S/N) não é retornado — o status ativo/inativo é
   * controlado pelo campo "inativo": "N" = ativo, "S" = inativo.
   */
  inativo?: "S" | "N";
  /** @deprecated Omie não retorna este campo no ListarClientes. Use `inativo`. */
  ativo?: "S" | "N";
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
  valor_custo?: number;       // preço de custo (custo de aquisição) — campo correto para "Últ. Custo"
  valor_unitario?: number;   // preço de venda (lista) — fallback quando valor_custo não existe
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
        // Timeout de 60s por request (Omie pode ser lento em criar registros)
        signal: AbortSignal.timeout(60_000),
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

        // REDUNDANT nunca deve ser retentado — o retry faz mais chamadas dentro
        // do janela de 60s do Omie e piora o problema exponencialmente
        const isRedundant =
          fs.includes("redundante") || fs.toUpperCase().includes("REDUNDANT");

        // Outros erros: retentáveis (SOAP-ENV / 5xx) ou definitivos
        const retryable =
          !isEmpty && !isRedundant && (fc.startsWith("SOAP-ENV") || fc.startsWith("5"));
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
 * Consulta um cliente/fornecedor específico no Omie pelo código interno.
 * Endpoint: /geral/clientes/ — call: ConsultarCliente
 *
 * Usado como fallback quando buildClienteNomeMap não encontra um fornecedor
 * referenciado em pedidos de compra (ex: fornecedores sem tag "Fornecedor").
 */
export async function consultarCliente(
  creds: OmieCredentials,
  codigoOmie: number,
): Promise<{ nome: string | null }> {
  try {
    const res = await omiePost<
      { codigo_cliente_omie: number; codigo_cliente_integracao: string },
      { razao_social: string; nome_fantasia?: string }
    >(
      "/geral/clientes/",
      "ConsultarCliente",
      creds,
      { codigo_cliente_omie: codigoOmie, codigo_cliente_integracao: "" },
    );
    const nome = (res.nome_fantasia?.trim()) || res.razao_social || null;
    return { nome };
  } catch {
    return { nome: null };
  }
}

/**
 * Busca todos os clientes Omie (sem filtro de tag ou inativo) e retorna um Map
 * codigo_cliente → nome para uso durante sync de pedidos.
 *
 * PesquisarPedCompra retorna apenas nCodFor (código numérico) sem nome.
 * Este lookup resolve os nomes sem depender da tag "Fornecedor".
 *
 * ⚠️ Conforme suporte Omie: a API não tem filtro direto de ativo/inativo.
 *    Deve-se buscar todos e filtrar client-side pelo campo "inativo" da resposta.
 *    apenas_importado_api: "N" inclui cadastros inseridos manualmente.
 */
export async function buildClienteNomeMap(
  creds: OmieCredentials,
): Promise<Map<string, string>> {
  // Map<string, string> — chaves como string para evitar discrepâncias de tipo
  // (a API Omie às vezes retorna IDs como numbers, às vezes como strings no JSON).
  const map = new Map<string, string>();
  let pagina = 1;
  let totalPaginas = 1;

  do {
    let res: OmieListaClientesResponse;
    try {
      res = await omiePost<OmieClienteParam, OmieListaClientesResponse>(
        "/geral/clientes/",
        "ListarClientes",
        creds,
        {
          pagina,
          registros_por_pagina: 50, // 100/pág causa razao_social vazia na resposta Omie
          apenas_importado_api: "N", // inclui cadastros manuais
        },
      );
    } catch (err) {
      // Sem registros = mapa parcial mas não é erro fatal
      if (err instanceof OmieError) {
        const msg = err.message.toLowerCase();
        const isEmpty =
          msg.includes("não existem registros") ||
          msg.includes("nao existem registros") ||
          msg.includes("nenhum registro");
        if (isEmpty) break;
      }
      throw err;
    }
    totalPaginas = res.total_de_paginas;
    for (const c of res.clientes_cadastro) {
      const nome = c.nome_fantasia?.trim() || c.razao_social;
      // Sempre usa String() como chave para garantir consistência de tipo
      if (nome) map.set(String(c.codigo_cliente), nome);
    }
    console.log(`[omie/client] buildClienteNomeMap página ${pagina}/${totalPaginas}: ${res.clientes_cadastro.length} clientes`);
    pagina++;
  } while (pagina <= totalPaginas);

  return map;
}

/**
 * Busca uma página de fornecedores no Omie.
 * Filtra pela tag "Fornecedor" para excluir registros que são apenas clientes.
 * No Omie o cadastro é unificado (cliente + fornecedor na mesma tabela),
 * então a tag é a forma correta de distinguir fornecedores.
 *
 * ⚠️ Conforme suporte Omie: a API NÃO tem filtro direto de ativo/inativo.
 *    Buscamos TODOS (ativos + inativos) e determinamos o status pelo campo
 *    "inativo" da resposta ("N" = ativo, "S" = inativo).
 *    apenas_importado_api: "N" garante inclusão de cadastros manuais.
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
      apenas_importado_api: "N", // inclui cadastros manuais (não só via API)
      clientesFiltro: {
        // SEM inativo — conforme suporte Omie: não existe filtro de ativo/inativo.
        // O status é determinado pelo campo "inativo" na resposta.
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

export function isOmieEmptyError(err: unknown): boolean {
  if (!(err instanceof OmieError)) return false;
  const msg = err.message.toLowerCase();
  return OMIE_EMPTY_MSGS.some((m) => msg.includes(m));
}

/** Detecta REDUNDANT: mesmo endpoint+params chamado nos últimos 60s. Seguro pular. */
export function isOmieRedundantError(err: unknown): boolean {
  if (!(err instanceof OmieError)) return false;
  return err.message.toUpperCase().includes("REDUNDANT");
}

/** Detecta BLOQUEADA: chave inteira bloqueada por ~30 min após uso indevido. Abortar loop. */
export function isOmieBlockedError(err: unknown): boolean {
  if (!(err instanceof OmieError)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes("bloqueada") || msg.includes("bloqueado") || msg.includes("consumo indevido");
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
  produtosFiltro?: { inativo?: "S" | "N"; codigo?: string; descricao?: string },
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
      ...(produtosFiltro ? { produtosFiltro } : {}),
    },
  );
}

/**
 * Busca um produto específico no Omie pelo código interno (ex: "CONS00662").
 *
 * Usa ConsultarProduto com produto_servico_cadastro_chave — consulta direta
 * por código, sem paginação e sem colidir com o REDUNDANT do ListarProdutos
 * usado pelo sync. Retorna o cadastro completo do produto.
 * Doc: https://app.omie.com.br/api/v1/geral/produtos/ → ConsultarProduto
 */
export async function buscarProdutoPorCodigo(
  creds: OmieCredentials,
  codigo: string,
): Promise<OmieProdutoItem | null> {
  try {
    // maxRetries=1: "não cadastrado" vem com faultcode SOAP-ENV (retryável
    // pelo omiePost) — sem isso, um código inexistente seria retentado 3x.
    return await omiePost<{ codigo: string }, OmieProdutoItem>(
      "/geral/produtos/",
      "ConsultarProduto",
      creds,
      { codigo },
      1,
    );
  } catch (err) {
    if (err instanceof OmieError) {
      const msg = err.message.toLowerCase();
      const naoEncontrado =
        msg.includes("não cadastrado") ||
        msg.includes("nao cadastrado") ||
        msg.includes("não encontrado") ||
        msg.includes("nao encontrado") ||
        isOmieEmptyError(err);
      if (naoEncontrado) return null;
    }
    throw err;
  }
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

// ── Tipos: Pesquisa de Pedidos de Compra (PesquisarPedCompra) ─────────────────
//
// ⚠️ PesquisarPedCompra usa nomes de parâmetros DIFERENTES de outros endpoints Omie:
//   - nPagina (não "pagina")
//   - nRegsPorPagina (não "registros_por_pagina"), máximo 100
//   - lApenasImportadoApi: "N" → inclui TODOS (não só importados via API)

/** Filtros de status para PesquisarPedCompra. "todos" = todos os lExibir* = "T". */
export type OmiePedidoFiltro =
  | "todos"
  | "pendentes"
  | "faturados"
  | "recebidos"
  | "cancelados"
  | "encerrados"
  | "rec_parciais"
  | "fat_parciais";

export const OMIE_PEDIDO_FILTROS: { key: OmiePedidoFiltro; label: string }[] = [
  { key: "pendentes",    label: "Pendentes"    },
  { key: "faturados",    label: "Faturados"    },
  { key: "recebidos",    label: "Recebidos"    },
  { key: "cancelados",   label: "Cancelados"   },
  { key: "encerrados",   label: "Encerrados"   },
  { key: "rec_parciais", label: "Rec. Parciais" },
  { key: "fat_parciais", label: "Fat. Parciais" },
];

// Mapeia chave do filtro → nome do campo lExibir* na API
const FILTRO_CAMPO: Record<Exclude<OmiePedidoFiltro, "todos">, string> = {
  pendentes:    "lExibirPedidosPendentes",
  faturados:    "lExibirPedidosFaturados",
  recebidos:    "lExibirPedidosRecebidos",
  cancelados:   "lExibirPedidosCancelados",
  encerrados:   "lExibirPedidosEncerrados",
  rec_parciais: "lExibirPedidosRecParciais",
  fat_parciais: "lExibirPedidosFatParciais",
};

export interface OmiePesquisarPedCompraParam {
  nPagina: number;
  nRegsPorPagina: number;
  // Filtros de status — "F"=não/falso; "T"=todos/sim
  lApenasImportadoApi?:        "S" | "N" | "F" | "T";
  lExibirPedidosPendentes?:    "S" | "N" | "T" | "F";
  lExibirPedidosFaturados?:    "S" | "N" | "T" | "F";
  lExibirPedidosRecebidos?:    "S" | "N" | "T" | "F";
  lExibirPedidosCancelados?:   "S" | "N" | "T" | "F";
  lExibirPedidosEncerrados?:   "S" | "N" | "T" | "F";
  lExibirPedidosRecParciais?:  "S" | "N" | "T" | "F";
  lExibirPedidosFatParciais?:  "S" | "N" | "T" | "F";
  lApenasAlterados?:           "S" | "N" | "F" | "T";
  // Filtro por período (DD/MM/YYYY) — obrigatório para retornar registros
  dDataInicial?: string;
  dDataFinal?:   string;
}

// Formato antigo (IncluirPedidoCompra / ListarPedCompra)
export interface OmiePedidoCompraListItem {
  cabecalho?: {
    nCodPedido?:      number;
    nNumPedido?:      number;
    dDtPedido?:       string;
    dDtPrevisao?:     string;
    nCodFornecedor?:  number;
    cEtapa?:          string;
    nValTotalPedido?: number;
    nValorTotal?:     number;
  };
  informacoes_adicionais?: {
    cSitPedido?:    string;
    cSitAprovacao?: string;
    cNumPedFornec?: string;
    cRazaoSocial?:  string;
    cNomeFantasia?: string;
  };
  faturamento?: { nValTotalPedido?: number };
  // ── Formato PesquisarPedCompra (pedidos_pesquisa) ──────────────────────────
  cabecalho_consulta?: {
    nCodPed?:          number;   // ID interno Omie
    cNumero?:          string;   // número sequencial como string
    dIncData?:         string;   // DD/MM/YYYY — data de criação
    dDtPrevisao?:      string;   // DD/MM/YYYY — previsão (pode variar: entrega ou faturamento)
    dDtPrevEntrega?:   string;   // DD/MM/YYYY — previsão de entrega (campo alternativo Omie)
    dDtEntrega?:       string;   // DD/MM/YYYY — data real de entrega
    dDtPrevFaturam?:   string;   // DD/MM/YYYY — previsão de faturamento
    nCodFor?:          number;   // código do fornecedor
    cNomeFornecedor?:  string;   // nome do fornecedor (nem sempre presente)
    cEtapa?:           string;
  };
  parcelas_consulta?: Array<{
    nValor?:   number;
    nParcela?: number;
    dVencto?:  string;   // DD/MM/YYYY — data de vencimento = previsão real de entrega/pagamento
    nDias?:    number;
    nPercent?: number;
  }>;
  produtos_consulta?: Array<{ nValTot?: number; cDescricao?: string }>;
}

// Resposta de PesquisarPedCompra
export interface OmieListarPedidosResponse {
  // Paginação — formato PesquisarPedCompra real (nTotalPaginas com "al")
  nTotalPaginas?:   number;
  nTotalRegistros?: number;
  // Paginação — variações (nTot, total_de)
  nTotPaginas?:        number;
  nTotRegistros?:      number;
  pagina?:             number;
  total_de_paginas?:   number;
  total_de_registros?: number;
  registros?:          number;
  // Itens — PesquisarPedCompra retorna em "pedidos_pesquisa"
  pedidos_pesquisa?:     OmiePedidoCompraListItem[];
  // Variações de campo para outros formatos de listagem
  pedidos_compra?:       OmiePedidoCompraListItem[];
  lista_pedidos_compra?: OmiePedidoCompraListItem[];
  pedido_compra?:        OmiePedidoCompraListItem[];
  pedidos?:              OmiePedidoCompraListItem[];
  lista_pedidos?:        OmiePedidoCompraListItem[];
  pedido?:               OmiePedidoCompraListItem[];
}

/** Formata uma Date em DD/MM/YYYY (formato Omie). */
export function formatOmieDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Busca uma página de pedidos de compra no Omie.
 *
 * Endpoint: /produtos/pedidocompra/ — call: PesquisarPedCompra
 * Usa janela de 2 anos (dDataInicial/dDataFinal) para trazer TODOS os pedidos históricos.
 *
 * ⚠️ NÃO usar /compras/pedidocompras/ — requer módulo Compras (plano pago separado).
 */
export async function listPedidosCompraPage(
  creds: OmieCredentials,
  pagina: number,
  registrosPorPagina = 50,
  filtro: OmiePedidoFiltro = "todos",
): Promise<OmieListarPedidosResponse> {
  const hoje   = new Date();
  const inicio = new Date(hoje);
  inicio.setFullYear(hoje.getFullYear() - 5);

  // Monta flags lExibir* conforme o filtro:
  //   "todos"   → todos "T"
  //   específico → só o campo correspondente "T", demais "F"
  const ALL_CAMPOS = Object.values(FILTRO_CAMPO);
  const exibirFlags: Record<string, "T" | "F"> = {};
  if (filtro === "todos") {
    for (const campo of ALL_CAMPOS) exibirFlags[campo] = "T";
  } else {
    for (const campo of ALL_CAMPOS) exibirFlags[campo] = "F";
    exibirFlags[FILTRO_CAMPO[filtro]] = "T";
  }

  return omiePost<OmiePesquisarPedCompraParam, OmieListarPedidosResponse>(
    "/produtos/pedidocompra/",
    "PesquisarPedCompra",
    creds,
    {
      nPagina:             pagina,
      nRegsPorPagina:      Math.min(registrosPorPagina, 50),
      lApenasImportadoApi: "N",
      ...exibirFlags,
      dDataInicial:        formatOmieDate(inicio),
      dDataFinal:          formatOmieDate(hoje),
    } as OmiePesquisarPedCompraParam,
  );
}

/**
 * Retorna apenas a contagem total de pedidos do Omie para um filtro.
 * Faz UMA única chamada à API (página 1, 1 registro) e lê nTotalRegistros.
 * Muito mais rápido que iterar todas as páginas — use para diagnóstico.
 */
export async function countPedidosCompra(
  creds: OmieCredentials,
  filtro: OmiePedidoFiltro = "todos",
): Promise<number> {
  const res = await listPedidosCompraPage(creds, 1, 1, filtro);
  return (
    res.nTotalRegistros ??
    res.nTotRegistros ??
    res.total_de_registros ??
    0
  );
}

/**
 * Itera todas as páginas de pedidos de compra do Omie.
 */
export async function listAllPedidosCompra(
  creds: OmieCredentials,
  onPage?: (page: number, total: number) => void,
  filtro: OmiePedidoFiltro = "todos",
): Promise<{ items: OmiePedidoCompraListItem[]; totalRegistrosOmie: number }> {
  const all: OmiePedidoCompraListItem[] = [];
  let pagina = 1;
  let totalPaginas = 1;
  let totalRegistrosOmie = 0;

  do {
    let res: OmieListarPedidosResponse;
    try {
      res = await listPedidosCompraPage(creds, pagina, 50, filtro);
    } catch (err) {
      if (isOmieEmptyError(err)) {
        // Omie devolveu "Não existem registros" — conta não tem pedidos com esses filtros
        console.warn(`[omie/client] PesquisarPedCompra página ${pagina}: resposta "sem registros" — encerrando paginação. Mensagem: ${err instanceof OmieError ? err.message : String(err)}`);
        break;
      }
      // REDUNDANT: Omie bloqueia chamadas < 60s. Aguarda e tenta de novo (1x).
      if (err instanceof OmieError && err.message.toUpperCase().includes("REDUNDANT")) {
        console.warn("[omie/client] REDUNDANT detectado — aguardando 65s antes de tentar de novo…");
        await new Promise(r => setTimeout(r, 65_000));
        try {
          res = await listPedidosCompraPage(creds, pagina, 50, filtro);
        } catch (err2) {
          console.error("[omie/client] Retry após REDUNDANT também falhou:", err2 instanceof Error ? err2.message : String(err2));
          throw err2;
        }
      } else {
        console.error(`[omie/client] PesquisarPedCompra erro inesperado página ${pagina}:`, err instanceof Error ? err.message : String(err));
        throw err;
      }
    }

    // Paginação: PesquisarPedCompra retorna nTotalPaginas (com "al"), não nTotPaginas
    totalPaginas =
      res.nTotalPaginas ??   // formato real: PesquisarPedCompra
      res.nTotPaginas ??     // variação
      res.total_de_paginas ?? // legado
      1;
    const totalRegistros =
      res.nTotalRegistros ??
      res.nTotRegistros ??
      res.total_de_registros ??
      0;

    // Captura o total da API na primeira página (valor canônico do Omie)
    if (pagina === 1) totalRegistrosOmie = totalRegistros;

    const resRaw = res as unknown as Record<string, unknown>;
    console.log(
      `[omie/client] PesquisarPedCompra[${filtro}] página ${pagina}/${totalPaginas}:` +
      ` totalRegistros=${totalRegistros}` +
      ` chaves=${Object.keys(resRaw).join(",")}`,
    );

    // PesquisarPedCompra retorna itens em "pedidos_pesquisa"
    let items: OmiePedidoCompraListItem[] =
      res.pedidos_pesquisa ??    // formato PesquisarPedCompra (real)
      res.pedidos_compra ??
      res.lista_pedidos_compra ??
      res.pedido_compra ??
      res.pedidos ??
      res.lista_pedidos ??
      res.pedido ??
      [];

    // Fallback dinâmico: varre todos os campos buscando array de objetos
    if (items.length === 0 && totalRegistros > 0) {
      for (const [key, val] of Object.entries(resRaw)) {
        if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object" && val[0] !== null) {
          console.log(`[omie/client] PesquisarPedCompra: itens em campo "${key}" (${val.length})`);
          items = val as OmiePedidoCompraListItem[];
          break;
        }
      }
      if (items.length === 0) {
        console.warn(
          `[omie/client] PesquisarPedCompra: ${totalRegistros} registros mas nenhum array encontrado.` +
          ` Chaves: ${Object.keys(resRaw).join(", ")}`,
        );
      }
    }

    all.push(...items);
    onPage?.(pagina, totalPaginas);
    pagina++;
  } while (pagina <= totalPaginas);

  return { items: all, totalRegistrosOmie };
}

// ── PosicaoEstoque ─────────────────────────────────────────────────────────────

/**
 * Resposta real do endpoint PosicaoEstoque (documentação oficial Omie):
 * POST /estoque/consulta/ — call: PosicaoEstoque
 *
 * O CMC vem diretamente na raiz da resposta, não em um array aninhado.
 * Fonte: https://app.omie.com.br/api/v1/estoque/consulta/
 */
export interface OmiePosicaoEstoqueResponse {
  codigo_status?:       string;   // "0" = ok, outro = erro
  descricao_status?:    string;
  saldo?:               number;   // saldo disponível
  cmc?:                 number;   // Custo Médio Contábil ← campo real
  pendente?:            number;
  estoque_minimo?:      number;
  reservado?:           number;
  fisico?:              number;   // estoque físico total
  codigo_local_estoque?: number;
  [key: string]: unknown;
}

/**
 * Consulta a posição de estoque (CMC) de um produto via PosicaoEstoque.
 * Endpoint: POST /estoque/consulta/ — call: PosicaoEstoque
 *
 * Parâmetro de data: "data" (não "dData") conforme documentação oficial.
 * Parâmetro codigo_local_estoque: ID do local de estoque (0 = padrão do Omie).
 * ⚠️ Cada local de estoque tem seu próprio CMC — sempre especifique o local correto.
 */
export async function consultarPosicaoEstoque(
  creds:                OmieCredentials,
  id_prod:              number,
  data?:                string,
  codigo_local_estoque: number = 0,
): Promise<OmiePosicaoEstoqueResponse> {
  const dData = data ?? formatOmieDate(new Date());
  return omiePost<
    { id_prod: number; data: string; codigo_local_estoque: number },
    OmiePosicaoEstoqueResponse
  >(
    "/estoque/consulta/",
    "PosicaoEstoque",
    creds,
    { id_prod, data: dData, codigo_local_estoque },
  );
}

/**
 * Extrai o CMC de uma resposta PosicaoEstoque.
 * O campo "cmc" fica na raiz da resposta (não em array aninhado).
 */
export function extractCMC(pos: OmiePosicaoEstoqueResponse): number | null {
  const cmc = Number(pos.cmc ?? 0);
  return cmc > 0 ? cmc : null;
}

// ── ListarMovimentos (estoque) ─────────────────────────────────────────────────

/**
 * Resposta real do ListarMovimentos, confirmada contra a API de produção em
 * 20/08/2026 (Lush Ipiranga RCC: 138 registros em 3 páginas).
 * Endpoint: POST /estoque/movestoque/ — call: ListarMovimentos
 */
export interface OmieMovimentoDia {
  dDataMovimento: string;   // dd/mm/aaaa
  nQtdeEntradas:  number;
  nQtdeSaidas:    number;
}

export interface OmieMovimentoProduto {
  nCodProd:    number;
  cCodigo:     string;
  cDescricao:  string;
  cCodIntProd: string;
  movimentos:  OmieMovimentoDia[];
}

export interface OmieListarMovimentosResponse {
  pagina:             number;
  total_de_paginas:   number;
  registros:          number;
  total_de_registros: number;
  cadastros:          OmieMovimentoProduto[];
}

/**
 * Lista os movimentos de estoque de um período, paginado.
 *
 * `codigo_local_estoque` é omitido de propósito: queremos o agregado de todos os
 * locais do Omie. O estoque é do LHG e não espelha a estrutura deles.
 *
 * As datas vão no formato do Omie (dd/mm/aaaa).
 */
export async function listarMovimentosEstoque(
  creds: OmieCredentials,
  dataInicial: string,
  dataFinal: string,
  pagina = 1,
  registrosPorPagina = 100,
): Promise<OmieListarMovimentosResponse> {
  return omiePost<
    { pagina: number; registros_por_pagina: number; data_inicial: string; data_final: string },
    OmieListarMovimentosResponse
  >(
    "/estoque/movestoque/",
    "ListarMovimentos",
    creds,
    { pagina, registros_por_pagina: registrosPorPagina, data_inicial: dataInicial, data_final: dataFinal },
  );
}

/**
 * Percorre todas as páginas e devolve as entradas somadas por produto.
 *
 * Só entradas: no Omie não há venda (ela acontece no Automo), então
 * `nQtdeSaidas > 0` ali é ajuste de inventário — devolvido em separado para a
 * tela poder avisar, em vez de somar como se fosse compra.
 */
export async function somarEntradasOmie(
  creds: OmieCredentials,
  dataInicial: string,
  dataFinal: string,
): Promise<{
  entradas: Map<string, number>;   // omie_codigo (string) → quantidade
  ajustes:  Map<string, number>;   // omie_codigo → saídas lançadas no Omie
  produtos: number;
}> {
  const entradas = new Map<string, number>();
  const ajustes  = new Map<string, number>();
  let produtos = 0;

  for (let pagina = 1; ; pagina++) {
    const r = await listarMovimentosEstoque(creds, dataInicial, dataFinal, pagina);
    for (const p of r.cadastros ?? []) {
      produtos++;
      const chave = String(p.nCodProd);
      for (const m of p.movimentos ?? []) {
        if (m.nQtdeEntradas) entradas.set(chave, (entradas.get(chave) ?? 0) + m.nQtdeEntradas);
        if (m.nQtdeSaidas)   ajustes.set(chave,  (ajustes.get(chave)  ?? 0) + m.nQtdeSaidas);
      }
    }
    if (pagina >= (r.total_de_paginas ?? 1)) break;
  }

  return { entradas, ajustes, produtos };
}

// ── ObterResumoCompras ─────────────────────────────────────────────────────────

/**
 * Retorna um resumo agregado do painel de compras do Omie.
 * Endpoint: POST /produtos/compras-resumo/ — call: ObterResumoCompras
 *
 * Uma única chamada traz: pedidos em aberto, em aprovação, faturar hoje,
 * NFs recebidas e requisições abertas para o período informado.
 *
 * Ideal para widgets de dashboard — muito mais leve que listar todos os pedidos.
 */

export interface OmieResumoComprasResponse {
  pedidoCompra?: {
    emAberto?:    { nTotal: number; vTotal: number };
    emAprovacao?: { nTotal: number; vTotal: number };
    faturarHoje?: { nTotal: number; vTotal: number };
    compras?:     { nTotal: number; vTotal: number };
  };
  faturamentoResumo?: {
    nFaturadas?:  number;
    vFaturadas?:  number;
    nPendentes?:  number;
    vPendentes?:  number;
    nTotal?:      number;
    vTotal?:      number;
    nCanceladas?: number;
    nRejeitadas?: number;
  };
  requisicaoCompra?: {
    emAberto?: { nTotal: number; vTotal: number };
  };
  [key: string]: unknown;
}

export async function obterResumoCompras(
  creds:       OmieCredentials,
  dDataInicio: string,   // "DD/MM/YYYY"
  dDataFim:    string,   // "DD/MM/YYYY"
): Promise<OmieResumoComprasResponse> {
  return omiePost<
    { dDataInicio: string; dDataFim: string },
    OmieResumoComprasResponse
  >(
    "/produtos/compras-resumo/",
    "ObterResumoCompras",
    creds,
    { dDataInicio, dDataFim },
  );
}

// ── AlterarProduto ─────────────────────────────────────────────────────────────

interface AlterarProdutoParam {
  codigo_produto:     number;
  descricao:          string;
  /** Obrigatório pela API Omie — sem ele o Omie silencia o erro e não atualiza */
  unidade:            string;
  valor_unitario:     number;
  ncm?:               string;
  descricao_familia?: string;
  codigo_familia?:    number;
}

interface AlterarProdutoResponse {
  codigo_produto?:             number;
  codigo_produto_integracao?:  string;
  /** "0" = sucesso; qualquer outro valor = erro */
  codigo_status?:              string;
  descricao_status?:           string;
}

/**
 * Atualiza descrição, preço, unidade e família de um produto no Omie.
 * Endpoint: POST /geral/produtos/ — call: AlterarProduto
 *
 * ⚠️ `unidade` é obrigatório pela API Omie. Sem ele o Omie pode retornar
 *    `codigo_status: "error"` em vez de `faultstring`, silenciando o erro.
 * ⚠️ Verificamos `codigo_status` na resposta pois AlterarProduto usa esse
 *    campo para sinalizar falha — diferente de outros endpoints que usam faultstring.
 */
export async function alterarProduto(
  creds: OmieCredentials,
  params: {
    omie_codigo:   string;
    nome:          string;
    preco_custo:   number;
    familia_omie?: string;    // texto (fallback)
    familia_codigo?: number;  // código numérico (preferido)
    /** Unidade de medida (ex: "UN", "KG") — obrigatório na API Omie */
    unidade:       string;
    ncm?:          string;
  },
): Promise<void> {
  const res = await omiePost<AlterarProdutoParam, AlterarProdutoResponse>(
    "/geral/produtos/",
    "AlterarProduto",
    creds,
    {
      codigo_produto: Number(params.omie_codigo),
      descricao:      params.nome,
      unidade:        params.unidade || "UN",
      valor_unitario: params.preco_custo,
      ...(params.ncm ? { ncm: params.ncm } : {}),
      // Usa codigo_familia (integer) quando disponível — Omie prefere o código
      ...(params.familia_codigo
        ? { codigo_familia: params.familia_codigo }
        : params.familia_omie
          ? { descricao_familia: params.familia_omie }
          : {}),
    },
  );

  // AlterarProduto sinaliza falha via codigo_status em vez de faultstring.
  // Lançamos OmieError para que o chamador possa tratar e exibir ao usuário.
  if (res.codigo_status && res.codigo_status !== "0") {
    throw new OmieError(
      res.descricao_status ?? `AlterarProduto retornou codigo_status=${res.codigo_status}`,
      res.codigo_status,
    );
  }
}

// ── AlterarFornecedor ──────────────────────────────────────────────────────────

interface AlterarClienteParam {
  codigo_cliente_omie: number;
  razao_social:        string;
  nome_fantasia:       string;
  email:               string;
  telefone1_ddd:       string;
  telefone1_numero:    string;
  contato:             string;
  endereco:            string;
  cep:                 string;
  cidade:              string;
  estado:              string;
}

/**
 * Atualiza dados cadastrais de um fornecedor (cliente) no Omie.
 * Endpoint: POST /geral/clientes/ — call: AlterarCliente
 *
 * O campo local `telefone` é desmembrado: DDD = 2 primeiros dígitos quando
 * o número (sem máscara) tiver 10 ou 11 dígitos; caso contrário DDD fica vazio.
 */
export async function alterarFornecedor(
  creds: OmieCredentials,
  params: {
    omie_codigo:  string;
    razao_social:  string;
    nome_fantasia: string;
    email:         string;
    telefone:      string;
    contato:       string;
    endereco:      string;
    cep:           string;
    cidade:        string;
    uf:            string;
  },
): Promise<void> {
  const digits = params.telefone.replace(/\D/g, "");
  const ddd    = digits.length >= 10 ? digits.slice(0, 2) : "";
  const numero = digits.length >= 10 ? digits.slice(2)    : digits;

  await omiePost<AlterarClienteParam, Record<string, unknown>>(
    "/geral/clientes/",
    "AlterarCliente",
    creds,
    {
      codigo_cliente_omie: Number(params.omie_codigo),
      razao_social:        params.razao_social,
      nome_fantasia:       params.nome_fantasia,
      email:               params.email,
      telefone1_ddd:       ddd,
      telefone1_numero:    numero,
      contato:             params.contato,
      endereco:            params.endereco,
      cep:                 params.cep,
      cidade:              params.cidade,
      estado:              params.uf,
    },
  );
}

// ── IncluirCliente ─────────────────────────────────────────────────────────────

interface IncluirClienteParam {
  razao_social:   string;
  cnpj_cpf:       string;
  nome_fantasia:  string;
  email?:         string;
  telefone1_ddd?: string;
  telefone1_numero?: string;
  contato?:       string;
  endereco?:      string;
  cep?:           string;
  cidade?:        string;
  estado?:        string;
  tags?:          Array<{ tag: string }>;
  codigo_cliente_integracao?: string;
}

interface IncluirClienteResponse {
  codigo_cliente_omie: number;
  codigo_cliente_integracao?: string;
}

/**
 * Cria um novo cliente/fornecedor no Omie.
 * Sempre inclui tag "Fornecedor" para o sync reverso funcionar.
 * Endpoint: POST /geral/clientes/ — call: IncluirCliente
 * Retorna codigo_cliente_omie para salvar em fornecedores.omie_codigo.
 */
export async function incluirCliente(
  creds: OmieCredentials,
  params: {
    razao_social:   string;
    cnpj_cpf:       string;
    nome_fantasia:  string;
    email?:         string;
    telefone?:      string;
    contato?:       string;
    endereco?:      string;
    cep?:           string;
    cidade?:        string;
    uf?:            string;
    codigo_integracao?: string;
  },
): Promise<number> {
  const digits  = (params.telefone ?? "").replace(/\D/g, "");
  const ddd     = digits.length >= 10 ? digits.slice(0, 2) : "";
  const numero  = digits.length >= 10 ? digits.slice(2)    : digits;

  const res = await omiePost<IncluirClienteParam, IncluirClienteResponse>(
    "/geral/clientes/",
    "IncluirCliente",
    creds,
    {
      razao_social:              params.razao_social,
      cnpj_cpf:                  params.cnpj_cpf.replace(/\D/g, ""),
      nome_fantasia:             params.nome_fantasia,
      email:                     params.email ?? "",
      telefone1_ddd:             ddd,
      telefone1_numero:          numero,
      contato:                   params.contato ?? "",
      endereco:                  params.endereco ?? "",
      cep:                       (params.cep ?? "").replace(/\D/g, ""),
      cidade:                    params.cidade ?? "",
      estado:                    params.uf ?? "",
      tags:                      [{ tag: "Fornecedor" }],
      codigo_cliente_integracao: params.codigo_integracao ?? "",
    },
  );
  return res.codigo_cliente_omie;
}

// ── IncluirProduto / UpsertProduto ─────────────────────────────────────────────

interface ProdutoParam {
  codigo_produto_integracao: string;
  descricao:                 string;
  unidade:                   string;
  valor_unitario:            number;
  codigo_familia?:           number;   // ID numérico da família (preferido)
  descricao_familia?:        string;   // fallback se não tiver codigo_familia
  codigo?:                   string;
  ncm?:                      string;   // opcional — não enviar se vazio
}

interface ProdutoResponse {
  codigo_produto:             number;
  codigo_produto_integracao?: string;
}

export interface IncluirProdutoParams {
  nome:               string;
  unidade:            string;
  ncm?:               string;
  valor_unitario:     number;
  familia_omie?:      string;   // fallback texto
  familia_codigo?:    number;   // preferido: código numérico
  codigo_interno?:    string;
  codigo_integracao:  string;
}

/**
 * Cria ou atualiza um produto no Omie via UpsertProduto (idempotente).
 * NCM é opcional — não enviado quando vazio para evitar rejeição.
 * Endpoint: POST /geral/produtos/ — call: UpsertProduto
 * Retorna codigo_produto para salvar em produtos.omie_codigo.
 */
export async function incluirProduto(
  creds: OmieCredentials,
  params: IncluirProdutoParams,
): Promise<number> {
  const ncm = params.ncm ? params.ncm.replace(/\D/g, "") : undefined;

  const body: ProdutoParam = {
    codigo_produto_integracao: params.codigo_integracao,
    descricao:                 params.nome,
    unidade:                   params.unidade,
    valor_unitario:            params.valor_unitario,
    // Usa código numérico quando disponível (mais confiável); senão usa texto
    ...(params.familia_codigo  ? { codigo_familia: params.familia_codigo } : {}),
    ...(params.familia_omie && !params.familia_codigo ? { descricao_familia: params.familia_omie } : {}),
    codigo:                    params.codigo_interno || undefined,
    ...(ncm ? { ncm } : {}),
  };

  const res = await omiePost<ProdutoParam, ProdutoResponse>(
    "/geral/produtos/",
    "UpsertProduto",
    creds,
    body,
    1, // sem retry para evitar REDUNDANT
  );
  return res.codigo_produto;
}

// ── ListarFamilias ─────────────────────────────────────────────────────────────

export interface OmieFamiliaProduto {
  codigo:    number;
  descricao: string;
}

interface FamCadastroItem {
  codigo:      number;   // Código da Família (BIGINT no Omie — ex: 2149433474)
  codInt?:     string;
  codFamilia?: string;
  nomeFamilia: string;
  inativo?:    string;   // "S" | "N"
}

interface FamListarResponse {
  pagina:             number;
  total_de_paginas:   number;
  registros:          number;
  total_de_registros: number;
  famCadastro:        FamCadastroItem[];
}

/**
 * Lista todas as famílias de produto cadastradas no Omie.
 * Endpoint: POST /geral/familiasproduto/ — call: PesquisarFamilias
 * Parâmetro: famListarRequest / Retorno: famListarResponse
 */
export async function listFamiliasProduto(
  creds: OmieCredentials,
): Promise<OmieFamiliaProduto[]> {
  const PER_PAGE = 50;
  const all: OmieFamiliaProduto[] = [];
  let page = 1;

  while (true) {
    try {
      const res = await omiePost<
        { pagina: number; registros_por_pagina: number },
        FamListarResponse
      >(
        "/geral/familias/",
        "PesquisarFamilias",
        creds,
        { pagina: page, registros_por_pagina: PER_PAGE },
      );

      const items: OmieFamiliaProduto[] = (res.famCadastro ?? [])
        .filter(f => f.inativo !== "S")
        .map(f => ({
          codigo:    f.codigo,
          descricao: f.nomeFamilia,
        }))
        .filter(f => f.codigo > 0 && f.descricao.length > 0);

      all.push(...items);

      if (page >= res.total_de_paginas || items.length === 0) break;
      page++;
    } catch (err) {
      if (isOmieEmptyError(err)) break;
      throw err;
    }
  }

  return all;
}
