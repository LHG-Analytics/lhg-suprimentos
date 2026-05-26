/**
 * lib/omie/sync.ts — LHG-208
 * Sincroniza fornecedores e produtos do Omie para o banco local.
 *
 * Usa upsert por omie_codigo para ser idempotente (re-run seguro).
 * Registra resultado em integracao_logs.
 *
 * Requer cliente Supabase com service_role (bypass de RLS).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listAllFornecedores,
  listAllProdutos,
  listAllPedidosCompra,
  buildClienteNomeMap,
  OmieError,
  type OmieCredentials,
  type OmieClienteItem,
  type OmieProdutoItem,
  type OmiePedidoCompraListItem,
} from "./client";
import { categoriaParaFamilia } from "./familia-map";

// ── Tipos internos ─────────────────────────────────────────────────────────────

export interface SyncResult {
  entidade: string;
  status: "ok" | "erro" | "parcial";
  total: number;
  novos: number;
  erros: number;
  duracaoMs: number;
  detalhe?: Record<string, unknown>;
}

// ── Helper: log de integração ──────────────────────────────────────────────────

async function registrarLog(
  supabase: SupabaseClient,
  unidadeId: string | null,
  result: SyncResult & { operacao: string },
) {
  const { error } = await supabase.from("integracao_logs").insert({
    unidade_id: unidadeId,
    entidade: result.entidade,
    operacao: result.operacao,
    status: result.status,
    total: result.total,
    novos: result.novos,
    erros: result.erros,
    duracao_ms: result.duracaoMs,
    detalhe: result.detalhe ?? null,
  });
  if (error) {
    console.error("[omie/sync] Falha ao registrar log:", error.message);
  }
}

// ── Mappers ────────────────────────────────────────────────────────────────────

function mapFornecedor(item: OmieClienteItem, unidadeId: string) {
  const telefone = item.telefone1_numero
    ? `(${item.telefone1_ddd ?? ""}) ${item.telefone1_numero}`
    : null;

  return {
    razao_social: item.razao_social,
    nome_fantasia: item.nome_fantasia ?? null,
    cnpj: item.cnpj_cpf,
    email: item.email ?? null,
    telefone: telefone,
    contato: item.contato ?? null,
    cep: item.cep ?? null,
    endereco: item.endereco ?? null,
    cidade: item.cidade ?? null,
    uf: item.estado ?? null,
    omie_codigo: String(item.codigo_cliente),
    omie_unidade_id: unidadeId,
    omie_sincronizado_em: new Date().toISOString(),
    // Omie usa "inativo" como campo de status real no ListarClientes.
    // "ativo" não é retornado pela API — ativo = inativo !== "S"
    ativo: (item.inativo ?? "N") !== "S",
  };
}

function mapProduto(item: OmieProdutoItem, unidadeId: string) {
  // A API Omie retorna o nome da família em "descricao_familia".
  // "familia_produto" não existe na resposta real — mantido como fallback por segurança.
  const familiaOmie: string | null =
    (typeof item.descricao_familia === "string" && item.descricao_familia.trim())
      ? item.descricao_familia.trim().toUpperCase()
    : (typeof item.familia_produto === "string" && item.familia_produto.trim())
      ? item.familia_produto.trim().toUpperCase()
    : null;

  // A API retorna "descr_detalhada" (não "descricao_detalhada")
  const descDetalhada = item.descr_detalhada ?? item.descricao_detalhada ?? null;

  return {
    nome:                 item.descricao,
    codigo:               item.codigo ?? `OMIE-${item.codigo_produto}`,
    unidade_med:          item.unidade ?? "un",
    categoria:            categoriaParaFamilia(familiaOmie),
    familia_omie:         familiaOmie,
    omie_codigo:          String(item.codigo_produto),
    omie_unidade_id:      unidadeId,
    omie_descricao:       descDetalhada,
    ncm:                  item.ncm ?? null,
    ean:                  item.ean ?? null,
    preco_custo:          item.valor_unitario ?? null,
    omie_sincronizado_em: new Date().toISOString(),
    ativo:                item.inativo !== "S",
  };
}

// ── Sync: Fornecedores ─────────────────────────────────────────────────────────

export async function syncFornecedores(
  supabase: SupabaseClient,
  creds: OmieCredentials,
  unidadeId: string,
): Promise<SyncResult> {
  const inicio = Date.now();
  let total = 0;
  let novos = 0;
  let erros = 0;

  try {
    const items = await listAllFornecedores(creds, (page, totalPages) => {
      console.log(
        `[omie/sync] Fornecedores unidade=${unidadeId} página ${page}/${totalPages}`,
      );
    });

    total = items.length;

    // Filtro por tag "Fornecedor" já é feito no cliente Omie.
    // Filtra registros sem CNPJ — o upsert usa onConflict: "cnpj" e a coluna
    // tem constraint NOT NULL. Sem CNPJ o upsert falha para o batch inteiro.
    const semCnpj = items.filter(item => !item.cnpj_cpf?.trim());
    if (semCnpj.length > 0) {
      console.warn(
        `[omie/sync] ${semCnpj.length} fornecedor(es) sem CNPJ — pulados:`,
        semCnpj.map(i => `${i.codigo_cliente} (${i.razao_social})`).join(", "),
      );
    }

    const mappedItems = items
      .filter(item => !!item.cnpj_cpf?.trim())
      .map((item) => mapFornecedor(item, unidadeId));

    // Ajusta total para refletir apenas os registros elegíveis (com CNPJ)
    total = mappedItems.length;
    const BATCH = 50;

    for (let i = 0; i < mappedItems.length; i += BATCH) {
      const batch = mappedItems.slice(i, i + BATCH);

      const { error } = await supabase
        .from("fornecedores")
        .upsert(batch, { onConflict: "cnpj", ignoreDuplicates: false });

      if (error) {
        console.error("[omie/sync] Erro upsert fornecedores:", error.message);
        erros += batch.length;
      } else {
        novos += batch.length;
      }
    }

    const result: SyncResult = {
      entidade: "fornecedores",
      status: erros === 0 ? "ok" : erros < total ? "parcial" : "erro",
      total,
      novos,
      erros,
      duracaoMs: Date.now() - inicio,
      detalhe: semCnpj.length > 0
        ? { sem_cnpj: semCnpj.length, total_omie: items.length }
        : undefined,
    };

    await registrarLog(supabase, unidadeId, { ...result, operacao: "sync_full" });
    return result;
  } catch (err) {
    const msg = err instanceof OmieError ? err.message : String(err);
    const result: SyncResult = {
      entidade: "fornecedores",
      status: "erro",
      total,
      novos,
      erros: 1,
      duracaoMs: Date.now() - inicio,
      detalhe: { erro: msg },
    };
    await registrarLog(supabase, unidadeId, { ...result, operacao: "sync_full" });
    return result;
  }
}

// ── Sync: Produtos ─────────────────────────────────────────────────────────────

/**
 * Sincroniza produtos de UMA unidade específica via Omie.
 * Cada unidade tem seu próprio catálogo de produtos (onConflict por omie_codigo + omie_unidade_id).
 */
export async function syncProdutos(
  supabase: SupabaseClient,
  creds: OmieCredentials,
  unidadeId: string,
): Promise<SyncResult> {
  const inicio = Date.now();
  let total = 0;
  let novos = 0;
  let erros = 0;

  try {
    const items = await listAllProdutos(creds, (page, totalPages) => {
      console.log(
        `[omie/sync] Produtos unidade=${unidadeId} página ${page}/${totalPages}`,
      );
    });

    total = items.length;
    const BATCH = 50;

    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH).map((item) => mapProduto(item, unidadeId));

      // ── Estratégia de upsert em 2 passos ─────────────────────────────────────
      //
      // Passo 1 — INSERT novos produtos para esta unidade (ignora duplicatas
      //           por omie_codigo + omie_unidade_id).
      const { error: insertErr } = await supabase
        .from("produtos")
        .upsert(batch, {
          onConflict: "omie_codigo,omie_unidade_id",
          ignoreDuplicates: true,
        });

      if (insertErr) {
        console.error("[omie/sync] Erro insert produtos:", insertErr.message);
        erros += batch.length;
        continue;
      }

      // Passo 2 — UPDATE dos campos de metadados Omie em produtos EXISTENTES desta unidade.
      //
      // Política de categoria no re-sync:
      //   - sempre atualiza categoria derivada de familia_omie.
      //   - se familia_omie for null, categoria fica "Outros" (fallback).
      for (const p of batch) {
        const { error: updateErr } = await supabase
          .from("produtos")
          .update({
            nome:                 p.nome,
            unidade_med:          p.unidade_med,
            familia_omie:         p.familia_omie,
            categoria:            categoriaParaFamilia(p.familia_omie),
            ncm:                  p.ncm,
            ean:                  p.ean,
            preco_custo:          p.preco_custo,
            omie_descricao:       p.omie_descricao,
            omie_sincronizado_em: p.omie_sincronizado_em,
            ativo:                p.ativo,
          })
          .eq("omie_codigo", p.omie_codigo)
          .eq("omie_unidade_id", unidadeId);

        if (updateErr) {
          console.error("[omie/sync] Erro update produto:", updateErr.message);
          erros++;
        }
      }

      novos += batch.length;
    }

    const result: SyncResult = {
      entidade: "produtos",
      status: erros === 0 ? "ok" : erros < total ? "parcial" : "erro",
      total,
      novos,
      erros,
      duracaoMs: Date.now() - inicio,
    };

    await registrarLog(supabase, unidadeId, { ...result, operacao: "sync_full" });
    return result;
  } catch (err) {
    const msg = err instanceof OmieError ? err.message : String(err);
    const result: SyncResult = {
      entidade: "produtos",
      status: "erro",
      total,
      novos,
      erros: 1,
      duracaoMs: Date.now() - inicio,
      detalhe: { erro: msg },
    };
    await registrarLog(supabase, unidadeId, { ...result, operacao: "sync_full" });
    return result;
  }
}

// ── Sync: Pedidos de Compra (Omie → omie_pedidos_compra) ──────────────────────

/**
 * Converte DD/MM/YYYY (formato Omie) para YYYY-MM-DD (ISO, para o Supabase).
 * Retorna null se a string for inválida ou ausente.
 */
function omieDataParaISO(dData?: string): string | null {
  if (!dData) return null;
  const parts = dData.split("/");
  if (parts.length !== 3) return null;
  const [d, m, a] = parts;
  if (!d || !m || !a) return null;
  return `${a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function mapPedidoCompra(
  item: OmiePedidoCompraListItem,
  unidadeId: string,
  clienteNomeMap?: Map<string, string>,
) {
  // PesquisarPedCompra retorna "cabecalho_consulta"; outros formatos retornam "cabecalho"
  const cab  = item.cabecalho;
  const cab2 = item.cabecalho_consulta;
  const info = item.informacoes_adicionais ?? {};

  // IDs e datas — suporte a ambos os formatos
  const nCodPedido    = cab?.nCodPedido    ?? cab2?.nCodPed    ?? 0;
  const nNumPedido    = cab?.nNumPedido    ?? (cab2?.cNumero ? parseInt(cab2.cNumero, 10) || null : null);
  const dDtPedido     = cab?.dDtPedido     ?? cab2?.dIncData;
  const dDtPrevisao   = cab?.dDtPrevisao   ?? cab2?.dDtPrevisao;
  const nCodFornecedor = cab?.nCodFornecedor ?? cab2?.nCodFor ?? null;
  const cEtapa        = cab?.cEtapa        ?? cab2?.cEtapa;

  // Valor total: formato antigo → cabecalho; formato pesquisa → soma das parcelas
  const valorTotal =
    cab?.nValTotalPedido ??
    cab?.nValorTotal ??
    item.faturamento?.nValTotalPedido ??
    (item.parcelas_consulta?.reduce((s, p) => s + (p.nValor ?? 0), 0) ?? 0);

  // Nome do fornecedor:
  //   1. informacoes_adicionais (formato antigo — nem sempre presente no PesquisarPedCompra)
  //   2. clienteNomeMap: lookup de todos os clientes Omie por codigo_cliente
  //   Chave sempre como String() para evitar discrepâncias number vs string em runtime.
  const fornecedorNome =
    info.cNomeFantasia?.trim() ||
    info.cRazaoSocial?.trim() ||
    (nCodFornecedor != null && clienteNomeMap ? (clienteNomeMap.get(String(nCodFornecedor)) ?? null) : null) ||
    null;

  const ETAPAS: Record<string, string> = {
    "10": "Digitação",
    "15": "Pedido de Compra",   // etapa observada no PesquisarPedCompra
    "20": "Ag. Confirmação",
    "30": "Aprovação",
    "40": "Em Separação",
    "50": "Em Transporte",
    "60": "Entregue",
    "70": "Cancelado",
  };
  const etapa = cEtapa ? (ETAPAS[cEtapa] ?? cEtapa) : null;

  // produtos_consulta: array de itens do pedido com descrição e valor total por item.
  // PesquisarPedCompra não retorna quantidade — apenas cDescricao e nValTot.
  const itens = item.produtos_consulta?.length
    ? item.produtos_consulta.map(p => ({
        descricao:   p.cDescricao?.trim() ?? "",
        valor_total: p.nValTot ?? 0,
      }))
    : null;

  return {
    unidade_id:           unidadeId,
    omie_codigo:          nCodPedido,
    numero:               nNumPedido ?? null,
    data_pedido:          omieDataParaISO(dDtPedido),
    data_previsao:        omieDataParaISO(dDtPrevisao),
    fornecedor_codigo:    nCodFornecedor,
    fornecedor_nome:      fornecedorNome,
    valor_total:          valorTotal,
    situacao:             info.cSitPedido?.trim() || etapa || null,
    situacao_aprovacao:   info.cSitAprovacao?.trim() || null,
    etapa,
    numero_pedido_forn:   info.cNumPedFornec?.trim() || null,
    itens,
    omie_sincronizado_em: new Date().toISOString(),
  };
}

export async function syncPedidosCompra(
  supabase: SupabaseClient,
  creds: OmieCredentials,
  unidadeId: string,
): Promise<SyncResult> {
  const inicio = Date.now();
  let total = 0;
  let novos = 0;
  let erros = 0;

  try {
    // ── Lookup de nomes de clientes ───────────────────────────────────────────
    // PesquisarPedCompra só retorna nCodFor (código numérico) sem nome.
    // Buscamos TODOS os clientes Omie (sem filtro de tag) para enriquecer
    // fornecedor_nome na hora do upsert.
    // Chaves como string para evitar discrepâncias de tipo (JS Map é type-strict).
    let clienteNomeMap: Map<string, string> | undefined;
    try {
      clienteNomeMap = await buildClienteNomeMap(creds);
      console.log(`[omie/sync] clienteNomeMap construído com ${clienteNomeMap.size} entradas para unidade=${unidadeId}`);
    } catch (err) {
      console.warn("[omie/sync] Falha ao construir clienteNomeMap — fornecedor_nome ficará null:", err instanceof Error ? err.message : String(err));
    }

    console.log(`[omie/sync] Iniciando listAllPedidosCompra para unidade=${unidadeId}`);
    const items = await listAllPedidosCompra(creds, (page, totalPages) => {
      console.log(`[omie/sync] Pedidos unidade=${unidadeId} página ${page}/${totalPages}`);
    });
    console.log(`[omie/sync] listAllPedidosCompra retornou ${items.length} itens para unidade=${unidadeId}`);

    total = items.length;
    const BATCH = 50;

    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH).map((item) => mapPedidoCompra(item, unidadeId, clienteNomeMap));

      const { error } = await supabase
        .from("omie_pedidos_compra")
        .upsert(batch, {
          onConflict: "omie_codigo,unidade_id",
          ignoreDuplicates: false, // atualiza campos ao re-sync
        });

      if (error) {
        console.error("[omie/sync] Erro upsert pedidos:", error.message);
        erros += batch.length;
      } else {
        novos += batch.length;
      }
    }

    const result: SyncResult = {
      entidade: "pedidos_compra",
      status: erros === 0 ? "ok" : erros < total ? "parcial" : "erro",
      total,
      novos,
      erros,
      duracaoMs: Date.now() - inicio,
    };

    await registrarLog(supabase, unidadeId, { ...result, operacao: "sync_pedidos" });
    return result;
  } catch (err) {
    const msg = err instanceof OmieError ? err.message : String(err);
    const result: SyncResult = {
      entidade: "pedidos_compra",
      status: "erro",
      total,
      novos,
      erros: 1,
      duracaoMs: Date.now() - inicio,
      detalhe: { erro: msg },
    };
    await registrarLog(supabase, unidadeId, { ...result, operacao: "sync_pedidos" });
    return result;
  }
}

// ── Sync: Todas as unidades ────────────────────────────────────────────────────

export interface UnidadeComCreds {
  id: string;
  slug: string;
  nome: string;
  omie_app_key: string;
  omie_app_secret: string;
}

/**
 * Sincroniza fornecedores e produtos de TODAS as unidades ativas.
 * Cada unidade tem seu próprio catálogo de fornecedores e produtos.
 * Retorna um relatório por unidade/entidade.
 */
export async function syncTodasUnidades(
  supabase: SupabaseClient,
  /** Quando informado, restringe o sync à unidade com esse slug (ex.: "lush-ipiranga"). */
  slugFiltro?: string,
): Promise<{ results: SyncResult[]; unidades: string[] }> {
  // Busca unidades com credenciais Omie configuradas
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from("unidades")
    .select("id, slug, nome, omie_app_key, omie_app_secret")
    .eq("ativa", true)
    .not("omie_app_key", "is", null)
    .not("omie_app_secret", "is", null);

  if (slugFiltro) query = query.eq("slug", slugFiltro);

  const { data: unidades, error } = await query;

  if (error || !unidades?.length) {
    console.warn("[omie/sync] Nenhuma unidade com credenciais Omie configurada.");
    return { results: [], unidades: [] };
  }

  const results: SyncResult[] = [];

  for (const unidade of unidades as UnidadeComCreds[]) {
    const creds: OmieCredentials = {
      appKey: unidade.omie_app_key,
      appSecret: unidade.omie_app_secret,
    };

    console.log(`[omie/sync] Iniciando sync para: ${unidade.nome}`);

    // Sincroniza fornecedores por unidade
    const resForn = await syncFornecedores(supabase, creds, unidade.id);
    results.push(resForn);

    // Sincroniza produtos por unidade (cada unidade tem seu catálogo no Omie)
    const resProd = await syncProdutos(supabase, creds, unidade.id);
    results.push(resProd);

    // Sincroniza pedidos de compra por unidade
    const resPed = await syncPedidosCompra(supabase, creds, unidade.id);
    results.push(resPed);
  }

  return {
    results,
    unidades: (unidades as UnidadeComCreds[]).map((u) => u.nome),
  };
}
