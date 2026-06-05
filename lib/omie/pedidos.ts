/**
 * lib/omie/pedidos.ts
 * Operações Omie para Pedido de Compra.
 * Endpoint correto: /produtos/pedidocompra/ (não /compras/pedidocompras/).
 *
 * Este módulo substitui o uso de criarPedidoCompra() (legado) em pushPedidoOmie.
 * A função legada é mantida em client.ts para compatibilidade com código existente.
 */
import { omiePost, OmieCredentials } from "./client";

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface OmiePedItemIncluir {
  cCodIntItem: string;   // UUID do pedido_item
  nCodProd:    number;   // produto.omie_codigo
  nQtde:       number;
  nValUnit:    number;
}

export interface OmiePedCabecalhoIncluir {
  cCodIntPed:   string;   // pedido.id (ou variação no retry)
  nCodFor:      number;   // fornecedor.omie_codigo
  dDtPrevisao?: string;   // DD/MM/YYYY
  cObs?:        string;
  nCodCC?:      number;   // conta corrente (ex: Itaú)
  nQtdeParc?:   number;   // número de parcelas
  cCodParc?:    string;   // código da condição de pagamento Omie
}

export interface OmiePedParamIncluir {
  cabecalho_incluir: OmiePedCabecalhoIncluir;
  produtos_incluir:  OmiePedItemIncluir[];
}

interface IncluirPedCompraResponse {
  nCodPed?: number;
  cCodIntPed?: string;
}

// ── incluirPedCompra ───────────────────────────────────────────────────────────

/**
 * Cria um Pedido de Compra no Omie.
 * Endpoint: POST /produtos/pedidocompra/ — call: IncluirPedCompra
 * Retorna nCodPed (salvar em pedidos.omie_codigo).
 */
export async function incluirPedCompra(
  creds: OmieCredentials,
  param: OmiePedParamIncluir,
): Promise<number> {
  const res = await omiePost<OmiePedParamIncluir, IncluirPedCompraResponse>(
    "/produtos/pedidocompra/",
    "IncluirPedCompra",
    creds,
    param,
  );
  return res.nCodPed ?? 0;
}

// ── alterarPedCompra ───────────────────────────────────────────────────────────

export interface OmiePedCabecalhoAlterar {
  nCodPed:      number;   // pedidos.omie_codigo
  cCodIntPed?:  string;
  nCodFor?:     number;
  dDtPrevisao?: string;
  cObs?:        string;
}

export interface OmiePedParamAlterar {
  cabecalho_alterar: OmiePedCabecalhoAlterar;
  produtos_alterar:  OmiePedItemIncluir[];
}

/**
 * Altera um Pedido de Compra no Omie.
 * Endpoint: POST /produtos/pedidocompra/ — call: AlteraPedCompra
 */
export async function alterarPedCompra(
  creds: OmieCredentials,
  param: OmiePedParamAlterar,
): Promise<void> {
  await omiePost<OmiePedParamAlterar, Record<string, unknown>>(
    "/produtos/pedidocompra/",
    "AlteraPedCompra",
    creds,
    param,
  );
}

// ── excluirPedCompra ───────────────────────────────────────────────────────────

/**
 * Exclui um Pedido de Compra no Omie pelo nCodPed.
 * Endpoint: POST /produtos/pedidocompra/ — call: ExcluirPedCompra
 */
export async function excluirPedCompra(
  creds: OmieCredentials,
  nCodPed: number,
): Promise<void> {
  await omiePost<{ nCodPed: number }, Record<string, unknown>>(
    "/produtos/pedidocompra/",
    "ExcluirPedCompra",
    creds,
    { nCodPed },
  );
}

// ── consultarPedCompra ─────────────────────────────────────────────────────────

/**
 * Consulta um Pedido de Compra no Omie pelo nCodPed.
 */
export async function consultarPedCompra(
  creds: OmieCredentials,
  nCodPed: number,
): Promise<Record<string, unknown>> {
  return omiePost<{ nCodPed: number }, Record<string, unknown>>(
    "/produtos/pedidocompra/",
    "ConsultarPedCompra",
    creds,
    { nCodPed },
  );
}

// ── buscarPedCompraPorIntCod ───────────────────────────────────────────────────

/**
 * Consulta pelo código de integração (cCodIntPed = pedido.id do sistema).
 * Útil no retry após erro REDUNDANT: o Omie já criou o pedido mas a resposta
 * foi perdida. Retorna null se não encontrado.
 */
export async function buscarPedCompraPorIntCod(
  creds: OmieCredentials,
  cCodIntPed: string,
): Promise<number | null> {
  try {
    const res = await omiePost<
      { cCodIntPed: string },
      { cabecalho?: { nCodPed?: number } }
    >(
      "/produtos/pedidocompra/",
      "ConsultarPedCompra",
      creds,
      { cCodIntPed },
    );
    return res.cabecalho?.nCodPed ?? null;
  } catch {
    return null;
  }
}
