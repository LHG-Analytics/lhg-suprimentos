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
  cCodIntPed:   string;
  nCodFor:      number;
  dDtPrevisao?: string;
  cCodParc?:    string;
  nQtdeParc?:   number;
  cCodIntFor?:  string;
  cCodCateg?:   string;
  nCodCompr?:   number;
  cContato?:    string;
  cContrato?:   string;
  nCodCC?:      number;
  nCodIntCC?:   number;
  nCodProj?:    number;
  cNumPedido?:  string;
  cObs?:        string;
  cObsInt?:     string;
  nCodReq?:     number;   // código da Requisição no Omie — avança a req para pedido de compra
}

export interface OmiePedFreteIncluir {
  nCodTransp?:    number;
  cCodIntTransp?: string;
  cTpFrete?:      string;
  nQtdVol?:       number;
  nPesoLiq?:      number;
  nPesoBruto?:    number;
  nValFrete?:     number;
  nValSeguro?:    number;
  nValOutras?:    number;
}

export interface OmiePedParamIncluir {
  cabecalho_incluir: OmiePedCabecalhoIncluir;
  frete_incluir?:    OmiePedFreteIncluir;
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

// ── UpsertPedCompra — estrutura DIFERENTE do Incluir ──────────────────────────
// Documentação: cabecalho_upsert / frete_upsert / produtos_upsert

export interface OmiePedParamUpsert {
  cabecalho_upsert: Omit<OmiePedCabecalhoIncluir, never>;  // mesmos campos, nome diferente
  frete_upsert?:   OmiePedFreteIncluir;
  produtos_upsert: OmiePedItemIncluir[];
}

/**
 * Cria ou atualiza um Pedido de Compra no Omie (idempotente por cCodIntPed).
 * ATENÇÃO: usa cabecalho_upsert / frete_upsert / produtos_upsert (não _incluir).
 */
export async function upsertPedCompra(
  creds: OmieCredentials,
  param: OmiePedParamIncluir,
): Promise<number> {
  // Converte do formato "incluir" para o formato "upsert" que a API exige
  const upsertParam: OmiePedParamUpsert = {
    cabecalho_upsert: param.cabecalho_incluir,
    frete_upsert:     param.frete_incluir,
    produtos_upsert:  param.produtos_incluir,
  };
  // maxRetries=1: sem retry automático — cada retry reseta o timer REDUNDANT do Omie
  // causando loop infinito de REDUNDANT. Deixa o usuário controlar via countdown.
  const res = await omiePost<OmiePedParamUpsert, IncluirPedCompraResponse>(
    "/produtos/pedidocompra/",
    "UpsertPedCompra",
    creds,
    upsertParam,
    1,
  );
  return res.nCodPed ?? 0;
}

// ── consultarPedCompraItens ────────────────────────────────────────────────────
// Busca os itens (produtos) de um pedido de compra específico no Omie.
// PesquisarPedCompra só traz o cabeçalho; os itens vêm via ConsultarPedCompra.

export interface OmiePedItemConsulta {
  nCodProd?:   number;
  cDescricao?: string;
  nQtde?:      number;
  nValTot?:    number;   // valor total do item
}

interface ConsultarPedCompraResponse {
  produtos_consulta?: OmiePedItemConsulta[];
}

export async function consultarPedCompraItens(
  creds: OmieCredentials,
  nCodPed: number,
): Promise<OmiePedItemConsulta[]> {
  // maxRetries=2: "não cadastrado" (pedido excluído no Omie) cai no catch do chamador
  const res = await omiePost<{ nCodPed: number }, ConsultarPedCompraResponse>(
    "/produtos/pedidocompra/",
    "ConsultarPedCompra",
    creds,
    { nCodPed },
    2,
  );
  return res.produtos_consulta ?? [];
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

// ── recuperarPedCompraPorFornecedor ───────────────────────────────────────────

/**
 * Busca pedidos de compra recentes (últimos 7 dias) de um fornecedor específico.
 * Útil para recuperar o nCodPed quando REDUNDANT indica que o pedido já existe
 * mas a resposta foi perdida.
 * Retorna o nCodPed mais recente desse fornecedor, ou null se não encontrado.
 */
/**
 * Busca pedido pelo cCodIntPed original — acesso direto sem paginação.
 * Retorna nCodPed ou null.
 */
export async function consultarPedCompraPorCodIntPed(
  creds: OmieCredentials,
  cCodIntPed: string,
): Promise<number | null> {
  try {
    const res = await omiePost<
      { cCodIntPed: string },
      { nCodPed?: number; cabecalho?: { nCodPedido?: number } }
    >(
      "/produtos/pedidocompra/",
      "ConsultarPedCompra",
      creds,
      { cCodIntPed },
    );
    return res.nCodPed ?? res.cabecalho?.nCodPedido ?? null;
  } catch (e) {
    console.log(`[consultarPedCompraPorCodIntPed] cCodIntPed=${cCodIntPed} não encontrado:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Busca pedido por nCodFor paginando TODAS as páginas (até 5 = 250 pedidos).
 * Usa múltiplos filtros de status para cobrir pendentes, faturados e encerrados.
 */
export async function recuperarPedCompraPorFornecedor(
  creds: OmieCredentials,
  nCodFor: number,
): Promise<number | null> {
  const fmt = (d: Date) => {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
  };
  const hoje       = new Date();
  const trintaDias = new Date(hoje.getTime() - 30 * 86_400_000);

  const filtros = [
    { lExibirPedidosPendentes: "T" as const },
    { lExibirPedidosFaturados: "T" as const },
    { lExibirPedidosEncerrados: "T" as const },
  ];

  for (const filtro of filtros) {
    let pagina = 1;
    let totalPaginas = 1;

    do {
      try {
        const res = await omiePost<
          Record<string, unknown>,
          {
            nTotalPaginas?: number;
            total_de_paginas?: number;
            pedidos_pesquisa?: Array<{ cabecalho_consulta?: { nCodPed?: number | string; nCodFor?: number | string } }>;
          }
        >(
          "/produtos/pedidocompra/",
          "PesquisarPedCompra",
          creds,
          {
            nPagina: pagina,
            nRegsPorPagina: 50,
            lApenasImportadoApi: "N",
            ...filtro,
            dDataInicial: fmt(trintaDias),
            dDataFinal:   fmt(hoje),
          },
        );

        totalPaginas = res.nTotalPaginas ?? res.total_de_paginas ?? 1;
        const pedidos = res.pedidos_pesquisa ?? [];
        console.log(`[recuperarPedCompra] filtro=${JSON.stringify(filtro)} pág=${pagina}/${totalPaginas} registros=${pedidos.length}`);

        const match = pedidos.find(p => String(p.cabecalho_consulta?.nCodFor) === String(nCodFor));
        if (match?.cabecalho_consulta?.nCodPed) {
          console.log(`[recuperarPedCompra] ENCONTRADO nCodPed=${match.cabecalho_consulta.nCodPed}`);
          return Number(match.cabecalho_consulta.nCodPed);
        }
        pagina++;
      } catch (e) {
        console.log(`[recuperarPedCompra] filtro=${JSON.stringify(filtro)} pág=${pagina} erro:`, e instanceof Error ? e.message : e);
        break;
      }
    } while (pagina <= Math.min(totalPaginas, 5)); // máx 5 páginas = 250 pedidos
  }
  return null;
}
