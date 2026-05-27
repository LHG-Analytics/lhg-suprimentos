/**
 * lib/omie/recebimento.ts
 * Gerencia vínculo NF → Pedido e conclusão do recebimento no Omie.
 * Endpoint: /produtos/recebimento/
 *
 * ATENÇÃO: Verificar parâmetros exatos na doc Omie antes de chamar em prod.
 * Os campos nCodNota, nIdReceb, nCodPed foram confirmados no suporte Omie.
 */
import { omiePost, OmieCredentials } from "./client";

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface ListarRecebimentosParam {
  nCodNota: number;   // ID da nota no Omie (retornado por IncluirNota)
}

interface OmieRecebimento {
  nIdReceb:  number;
  nCodNota:  number;
  nCodPed?:  number;
  cStatus?:  string;
}

interface ListarRecebimentosResponse {
  recebimentos?: OmieRecebimento[];
  lista_recebimentos?: OmieRecebimento[];
}

// ── listarRecebimentos ─────────────────────────────────────────────────────────

/**
 * Lista os recebimentos associados a uma nota fiscal pelo nCodNota.
 * Retorna o nIdReceb necessário para associar pedido e concluir.
 */
export async function listarRecebimentos(
  creds: OmieCredentials,
  nCodNota: number,
): Promise<OmieRecebimento[]> {
  const res = await omiePost<ListarRecebimentosParam, ListarRecebimentosResponse>(
    "/produtos/recebimento/",
    "ListarRecebimentos",
    creds,
    { nCodNota },
  );
  return res.recebimentos ?? res.lista_recebimentos ?? [];
}

// ── associarPedidoRecebimento ──────────────────────────────────────────────────

/**
 * Associa um Pedido de Compra a um recebimento (vínculo NF → Pedido).
 * Chama AlterarRecebimento com a ação ASSOCIAR-PEDIDO.
 */
export async function associarPedidoRecebimento(
  creds: OmieCredentials,
  nIdReceb: number,
  nCodPed: number,
): Promise<void> {
  await omiePost<
    { nIdReceb: number; nCodPed: number; cAcao: string },
    Record<string, unknown>
  >(
    "/produtos/recebimento/",
    "AlterarRecebimento",
    creds,
    { nIdReceb, nCodPed, cAcao: "ASSOCIAR-PEDIDO" },
  );
}

// ── concluirRecebimento ────────────────────────────────────────────────────────

/**
 * Conclui o recebimento no Omie (finaliza o fluxo de compra).
 */
export async function concluirRecebimento(
  creds: OmieCredentials,
  nIdReceb: number,
): Promise<void> {
  await omiePost<{ nIdReceb: number }, Record<string, unknown>>(
    "/produtos/recebimento/",
    "ConcluirRecebimento",
    creds,
    { nIdReceb },
  );
}
