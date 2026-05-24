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
  OmieError,
  type OmieCredentials,
  type OmieClienteItem,
  type OmieProdutoItem,
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
    ativo: item.ativo === "S",
  };
}

function mapProduto(item: OmieProdutoItem) {
  const familiaOmie = item.familia_produto ?? null;
  return {
    nome:         item.descricao,
    codigo:       item.codigo ?? `OMIE-${item.codigo_produto}`,
    unidade_med:  item.unidade ?? "un",
    // categoria = categoria de orçamento mapeada automaticamente.
    // Produtos novos recebem a categoria do mapa familia → orçamento.
    // O upsert preserva edições manuais (estratégia INSERT-first + UPDATE seletivo).
    categoria:     categoriaParaFamilia(familiaOmie),
    // familia_omie = família bruta do Omie, sempre sobrescrita pelo sync.
    familia_omie:  familiaOmie,
    omie_codigo:   String(item.codigo_produto),
    omie_descricao: item.descricao_detalhada ?? null,
    ncm:           item.ncm ?? null,
    ean:           item.ean ?? null,
    preco_custo:   item.valor_unitario ?? null,
    omie_sincronizado_em: new Date().toISOString(),
    ativo:         item.inativo !== "S",
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

    // Filtro por tag "Fornecedor" já é feito no cliente Omie,
    // então todos os itens aqui são fornecedores legítimos.
    const mappedItems = items.map((item) => mapFornecedor(item, unidadeId));
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

export async function syncProdutos(
  supabase: SupabaseClient,
  creds: OmieCredentials,
  unidadeId: string | null = null, // produtos são globais (não por unidade)
): Promise<SyncResult> {
  const inicio = Date.now();
  let total = 0;
  let novos = 0;
  let erros = 0;

  try {
    const items = await listAllProdutos(creds, (page, totalPages) => {
      console.log(
        `[omie/sync] Produtos página ${page}/${totalPages}`,
      );
    });

    total = items.length;
    const BATCH = 50;

    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH).map(mapProduto);

      // ── Estratégia de upsert em 2 passos para preservar categoria manual ────
      //
      // Passo 1 — INSERT novos produtos (ignorando conflito de omie_codigo).
      //           Produtos novos recebem categoria = familia_omie como ponto de partida.
      const { error: insertErr } = await supabase
        .from("produtos")
        .upsert(batch, { onConflict: "omie_codigo", ignoreDuplicates: true });

      if (insertErr) {
        console.error("[omie/sync] Erro insert produtos:", insertErr.message);
        erros += batch.length;
        continue;
      }

      // Passo 2 — UPDATE dos campos de metadados do Omie em produtos EXISTENTES,
      //           preservando "categoria" (que pode ter sido editada pelo usuário).
      //           Nota: Supabase não expõe "ON CONFLICT DO UPDATE SET ..." parcial,
      //           então usamos um único UPDATE baseado em omie_codigo.
      for (const p of batch) {
        const { error: updateErr } = await supabase
          .from("produtos")
          .update({
            nome:                 p.nome,
            unidade_med:          p.unidade_med,
            familia_omie:         p.familia_omie,
            ncm:                  p.ncm,
            ean:                  p.ean,
            preco_custo:          p.preco_custo,
            omie_descricao:       p.omie_descricao,
            omie_sincronizado_em: p.omie_sincronizado_em,
            ativo:                p.ativo,
            // NÃO atualiza "categoria" para preservar edições manuais.
          })
          .eq("omie_codigo", p.omie_codigo);

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

// ── Sync: Todas as unidades ────────────────────────────────────────────────────

export interface UnidadeComCreds {
  id: string;
  slug: string;
  nome: string;
  omie_app_key: string;
  omie_app_secret: string;
}

/**
 * Sincroniza fornecedores de todas as unidades + produtos (via primeira unidade).
 * Retorna um relatório por unidade/entidade.
 */
export async function syncTodasUnidades(
  supabase: SupabaseClient,
): Promise<{ results: SyncResult[]; unidades: string[] }> {
  // Busca unidades com credenciais Omie configuradas
  const { data: unidades, error } = await supabase
    .from("unidades")
    .select("id, slug, nome, omie_app_key, omie_app_secret")
    .eq("ativa", true)
    .not("omie_app_key", "is", null)
    .not("omie_app_secret", "is", null);

  if (error || !unidades?.length) {
    console.warn("[omie/sync] Nenhuma unidade com credenciais Omie configurada.");
    return { results: [], unidades: [] };
  }

  const results: SyncResult[] = [];
  let produtosSincronizados = false;

  for (const unidade of unidades as UnidadeComCreds[]) {
    const creds: OmieCredentials = {
      appKey: unidade.omie_app_key,
      appSecret: unidade.omie_app_secret,
    };

    console.log(`[omie/sync] Iniciando sync para: ${unidade.nome}`);

    // Sincroniza fornecedores por unidade
    const resForn = await syncFornecedores(supabase, creds, unidade.id);
    results.push(resForn);

    // Produtos são sincronizados apenas uma vez (são globais entre unidades)
    if (!produtosSincronizados) {
      const resProd = await syncProdutos(supabase, creds, unidade.id);
      results.push(resProd);
      produtosSincronizados = true;
    }
  }

  return {
    results,
    unidades: (unidades as UnidadeComCreds[]).map((u) => u.nome),
  };
}
