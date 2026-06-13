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
  listProdutosPage,
  listAllPedidosCompra,
  buildClienteNomeMap,
  consultarCliente,
  consultarPosicaoEstoque,
  extractCMC,
  isOmieEmptyError,
  isOmieRedundantError,
  isOmieBlockedError,
  formatOmieDate,
  OmieError,
  type OmieCredentials,
  type OmieClienteItem,
  type OmieProdutoItem,
  type OmiePedidoCompraListItem,
  type OmiePedidoFiltro,
} from "./client";
import { categoriaParaFamilia } from "./familia-map";
import {
  listAllRequisicoes,
  type OmieRequisicaoItem,
} from "./requisicao";

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
    // CNPJ limpo (só dígitos) para match com registros criados manualmente
    cnpj: item.cnpj_cpf?.replace(/\D/g, "") ?? null,
    email: item.email ?? null,
    telefone: telefone,
    contato: item.contato ?? null,
    cep: item.cep ?? null,
    endereco: item.endereco ?? null,
    cidade: item.cidade ?? null,
    uf: item.estado ?? null,
    // codigo_cliente ou codigo_cliente_omie dependendo da versão da API Omie
    omie_codigo: (item.codigo_cliente || item.codigo_cliente_omie)
      ? String(item.codigo_cliente ?? item.codigo_cliente_omie)
      : null,
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
    nome:                  item.descricao,
    codigo:                item.codigo ?? `OMIE-${item.codigo_produto}`,
    unidade_med:           item.unidade ?? "un",
    categoria:             categoriaParaFamilia(familiaOmie),
    familia_omie:          familiaOmie,
    codigo_familia_omie:   item.codigo_familia ?? null,
    omie_codigo:           String(item.codigo_produto),
    omie_unidade_id:       unidadeId,
    omie_descricao:        descDetalhada,
    ncm:                   item.ncm ?? null,
    ean:                   item.ean ?? null,
    // Omie retorna valor_custo = preço de aquisição; valor_unitario = preço de venda.
    // Prioriza custo real; cai em valor_unitario apenas se custo não vier na resposta.
    preco_custo:           item.valor_custo ?? item.valor_unitario ?? null,
    omie_sincronizado_em:  new Date().toISOString(),
    ativo:                 item.inativo !== "S",
  };
}

/**
 * Mapper para upsert de catálogo: idêntico a mapProduto mas sem preco_custo.
 *
 * Por que excluir preco_custo?
 * O upsert do catálogo roda com ignoreDuplicates: false — em conflito ele faz
 * UPDATE de todos os campos presentes no payload. Se incluirmos preco_custo,
 * o valor_custo do cadastro Omie (menos preciso) sobrescreveria o CMC real
 * calculado por syncCMCProdutos a cada re-sincronização.
 *
 * Para produtos NOVOS (INSERT): preco_custo fica null → preenchido em minutos
 * pelo syncCMCProdutos que roda logo após em after().
 * Para produtos EXISTENTES (UPDATE): preco_custo preservado — o Supabase
 * não atualiza colunas ausentes do payload no ON CONFLICT DO UPDATE.
 *
 * Exportado para uso em importarProdutoOmie (server action).
 */
export function mapProdutoUpsert(item: OmieProdutoItem, unidadeId: string) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { preco_custo: _, ...rest } = mapProduto(item, unidadeId);
  return rest;
}

/**
 * Verifica se o catálogo Omie está desatualizado comparando total de registros
 * com o count do banco. Usa apenas 1 chamada à API (página 1, 1 item).
 * Retorna true se há divergência (sync necessário).
 */
async function checkProdutosOutOfSync(
  supabase: SupabaseClient,
  creds: OmieCredentials,
  unidadeId: string,
): Promise<boolean> {
  try {
    // Usa 3/pág — valor incomum que não colide com sync (50) nem busca (20),
    // minimizando risco de REDUNDANT quando todas as funções rodam próximas.
    const res = await listProdutosPage(creds, 1, 3);
    const omieTotal = res.total_de_registros;
    const { count: dbCount } = await supabase
      .from("produtos")
      .select("*", { count: "exact", head: true })
      .eq("omie_unidade_id", unidadeId);
    const desatualizado = omieTotal !== (dbCount ?? 0);
    console.log(
      `[omie/sync] checkProdutosOutOfSync: omie=${omieTotal} db=${dbCount ?? 0}` +
      ` → ${desatualizado ? "desatualizado" : "em dia"}`,
    );
    return desatualizado;
  } catch {
    return true; // erro → assume desatualizado e roda sync completo
  }
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

      // 1. Upsert global fornecedores (sem sobrescrever omie_codigo global)
      const { error } = await supabase
        .from("fornecedores")
        .upsert(batch, { onConflict: "cnpj", ignoreDuplicates: false });

      if (error) {
        console.error("[omie/sync] Erro upsert fornecedores:", error.message);
        erros += batch.length;
        continue;
      }

      novos += batch.length;

      // 2. Upsert fornecedor_unidade: salva omie_codigo por unidade (evita sobrescrever outra unidade)
      const cnpjs = batch.map(b => b.cnpj).filter(Boolean) as string[];
      if (cnpjs.length > 0) {
        const { data: fornIds } = await supabase
          .from("fornecedores")
          .select("id, cnpj")
          .in("cnpj", cnpjs);

        if (fornIds?.length) {
          const cnpjToCode = new Map(batch.map(b => [b.cnpj, b.omie_codigo]));
          const fornUnidadeRows = fornIds
            .filter(f => f.cnpj && cnpjToCode.get(f.cnpj))
            .map(f => ({
              fornecedor_id: f.id as string,
              unidade_id: unidadeId,
              omie_codigo: cnpjToCode.get(f.cnpj!)!,
              omie_sincronizado_em: new Date().toISOString(),
            }));

          if (fornUnidadeRows.length > 0) {
            const { error: fuErr } = await supabase
              .from("fornecedor_unidade")
              .upsert(fornUnidadeRows, { onConflict: "fornecedor_id,unidade_id" });

            if (fuErr) {
              console.error("[omie/sync] Erro upsert fornecedor_unidade:", fuErr.message);
            }
          }
        }
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
  modo: "full" | "inteligente" = "full",
): Promise<SyncResult> {
  const inicio = Date.now();
  let total = 0;
  let novos = 0;
  let erros = 0;

  // Modo inteligente: compara count Omie vs DB antes de baixar tudo.
  // 1 chamada API (vs N páginas) — skip se catálogo já está em dia.
  if (modo === "inteligente") {
    const desatualizado = await checkProdutosOutOfSync(supabase, creds, unidadeId);
    if (!desatualizado) {
      return {
        entidade: "produtos",
        status: "ok",
        total: 0,
        novos: 0,
        erros: 0,
        duracaoMs: Date.now() - inicio,
        detalhe: { info: "Catálogo já atualizado — nenhuma alteração detectada no Omie" },
      };
    }
  }

  try {
    const items = await listAllProdutos(creds, (page, totalPages) => {
      console.log(
        `[omie/sync] Produtos unidade=${unidadeId} página ${page}/${totalPages}`,
      );
    });

    total = items.length;
    const BATCH = 50;

    for (let i = 0; i < items.length; i += BATCH) {
      // mapProdutoUpsert exclui preco_custo → preserva o CMC em produtos existentes
      // e deixa null em novos (preenchido pelo syncCMCProdutos em after()).
      const batch = items.slice(i, i + BATCH).map((item) => mapProdutoUpsert(item, unidadeId));

      // Upsert em batch: INSERT em novos, UPDATE de metadados em existentes.
      // ignoreDuplicates: false → atualiza todos os campos do payload em conflito.
      // preco_custo ausente do payload → não é tocado pelo ON CONFLICT DO UPDATE.
      const { error } = await supabase
        .from("produtos")
        .upsert(batch, {
          onConflict: "omie_codigo,omie_unidade_id",
          ignoreDuplicates: false,
        });

      if (error) {
        console.error("[omie/sync] Erro upsert produtos:", error.message);
        erros += batch.length;
      } else {
        novos += batch.length;
      }
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

// ── Sync: CMC de Produtos ──────────────────────────────────────────────────────

/**
 * Atualiza preco_custo dos produtos usando o CMC do Omie (PosicaoEstoque).
 *
 * O CMC (Custo Médio Contábil) é calculado pelo Omie a partir dos movimentos
 * reais de compra — mais preciso que valor_custo/valor_unitario do cadastro.
 *
 * Processo: para cada produto com omie_codigo, chama PosicaoEstoque e atualiza
 * preco_custo quando CMC > 0. Erros individuais são logados mas não bloqueiam
 * os demais produtos.
 *
 * ⚠️ LENTO: ~280ms por produto (rate limit Omie). Não usar no cron — apenas
 *    no sync manual acionado pelo usuário.
 *
 * @returns SyncResult com novos = quantidade de produtos com CMC atualizado.
 */
// Budget de tempo (ms) para o loop de CMC dentro do after().
//
// ⚠️  O budget do after() NÃO é independente — ele faz parte do maxDuration da
//     função (300s total). O catalog sync leva ~15s com o upsert em batch;
//     sobram ~285s para o CMC. Usamos 200s para ter 85s de folga.
//
// Com short-circuit (~1.5 calls/produto × 280ms ≈ 420ms/produto):
//   200_000ms / 420ms ≈ 476 produtos — suficiente para cobrir catálogos de até ~500.
//   Acima disso, o cron diário cobre o restante na próxima rodada.
const CMC_TIME_BUDGET_MS = 200_000;

export async function syncCMCProdutos(
  supabase: SupabaseClient,
  creds: OmieCredentials,
  unidadeId: string,
): Promise<SyncResult> {
  const inicio = Date.now();
  let total      = 0;
  let atualizados = 0;
  let erros       = 0;

  try {
    // Busca TODOS os produtos desta unidade ordenados pelo cmc_updated_at mais antigo.
    // NULL vem primeiro (nunca sincronizados), depois os mais desatualizados.
    // O loop usa time budget em vez de limite de quantidade: processa o máximo possível
    // dentro de CMC_TIME_BUDGET_MS e a fila auto-avança pelo cmc_updated_at.
    const { data: produtos, error: fetchErr } = await supabase
      .from("produtos")
      .select("id, omie_codigo, nome, cmc_updated_at")
      .eq("omie_unidade_id", unidadeId)
      .not("omie_codigo", "is", null)
      .order("cmc_updated_at", { ascending: true, nullsFirst: true });

    if (fetchErr) throw fetchErr;
    if (!produtos?.length) {
      return {
        entidade: "cmc_produtos",
        status: "ok",
        total: 0,
        novos: 0,
        erros: 0,
        duracaoMs: Date.now() - inicio,
      };
    }

    total = produtos.length;
    const dHoje = formatOmieDate(new Date());

    // Busca os locais de estoque configurados para esta unidade.
    // Se não configurado (array vazio), usa 0 (padrão Omie = estoque principal).
    // Cada local tem seu próprio CMC — percorremos em ordem até achar CMC > 0.
    const { data: unidadeInfo } = await supabase
      .from("unidades")
      .select("omie_locais_estoque")
      .eq("id", unidadeId)
      .maybeSingle();

    const locaisEstoque: number[] =
      Array.isArray(unidadeInfo?.omie_locais_estoque) && unidadeInfo.omie_locais_estoque.length > 0
        ? (unidadeInfo.omie_locais_estoque as number[])
        : [0]; // fallback: padrão Omie

    console.log(
      `[omie/sync] CMC: iniciando ${total} produto(s) — unidade=${unidadeId}`,
      `(mais antigo: ${(produtos[0].cmc_updated_at as string | null) ?? "nunca"})`,
      `| locais: [${locaisEstoque.join(", ")}]`,
      `| budget: ${CMC_TIME_BUDGET_MS / 1000}s`,
    );

    let bloqueado   = false;
    const loopStart = Date.now();
    let processados = 0;

    for (const produto of produtos) {
      if (bloqueado) break;

      // Para o loop se o budget de tempo foi atingido (60s de margem antes do hard-limit)
      const elapsed = Date.now() - loopStart;
      if (elapsed > CMC_TIME_BUDGET_MS) {
        console.log(
          `[omie/sync] CMC: budget atingido (${Math.round(elapsed / 1000)}s) após ${processados}/${total} produtos — continuará no próximo sync`,
        );
        break;
      }

      const omieId = Number(produto.omie_codigo);
      if (!omieId) continue;

      try {
        // Tenta cada local de estoque em ordem até encontrar CMC > 0 (short-circuit).
        // Ex: [3803913699, 3907756447, 3907756524] → para no primeiro com CMC real.
        let bestCmc: number | null = null;

        for (const localId of locaisEstoque) {
          try {
            const pos = await consultarPosicaoEstoque(creds, omieId, dHoje, localId);
            const cmc = extractCMC(pos);

            if (cmc !== null && cmc > 0) {
              bestCmc = cmc;
              break; // short-circuit: encontrou CMC neste local
            }
          } catch (locErr) {
            // REDUNDANT neste local → tenta o próximo
            if (isOmieRedundantError(locErr)) continue;

            // BLOQUEADA → abortar tudo imediatamente
            if (isOmieBlockedError(locErr)) {
              bloqueado = true;
              console.error(
                `[omie/sync] CMC: API BLOQUEADA após ${atualizados} atualizados — abortando.`,
                locErr instanceof Error ? locErr.message : String(locErr),
              );
              break;
            }

            // "Sem registros" neste local → tenta o próximo
            if (isOmieEmptyError(locErr)) continue;

            // Outro erro neste local → log e tenta próximo local
            console.warn(
              `[omie/sync] CMC produto=${omieId} local=${localId}:`,
              locErr instanceof Error ? locErr.message : String(locErr),
            );
          }
        }

        if (bloqueado) break;

        // Sempre atualiza cmc_updated_at para avançar a fila, mesmo sem CMC.
        // Se encontrou CMC > 0 em algum local, atualiza também o preco_custo.
        const updatePayload: Record<string, unknown> = {
          cmc_updated_at: new Date().toISOString(),
        };
        if (bestCmc !== null) {
          updatePayload.preco_custo = bestCmc;
        }

        const { error: updateErr } = await supabase
          .from("produtos")
          .update(updatePayload)
          .eq("id", produto.id);

        if (updateErr) {
          console.warn(`[omie/sync] CMC update falhou produto=${omieId}:`, updateErr.message);
          erros++;
        } else if (bestCmc !== null) {
          atualizados++;
        }
        processados++;
      } catch (err) {
        // "Sem registros" globais → avança a fila sem penalizar
        if (isOmieEmptyError(err)) {
          await supabase
            .from("produtos")
            .update({ cmc_updated_at: new Date().toISOString() })
            .eq("id", produto.id);
          processados++;
          continue;
        }

        // BLOQUEADA no nível externo (improvável, mas defensivo)
        if (isOmieBlockedError(err)) {
          bloqueado = true;
          console.error(
            `[omie/sync] CMC: API BLOQUEADA após ${atualizados} atualizados — abortando.`,
            err instanceof Error ? err.message : String(err),
          );
          break;
        }

        console.warn(
          `[omie/sync] CMC falhou produto=${omieId} (${produto.nome as string}):`,
          err instanceof Error ? err.message : String(err),
        );
        erros++;
      }
    }

    console.log(`[omie/sync] CMC: ${atualizados}/${total} com custo atualizado, ${processados} verificados, ${erros} erros — unidade=${unidadeId}`);

    const result: SyncResult = {
      entidade: "cmc_produtos",
      status: erros === 0 ? "ok" : erros === total ? "erro" : "parcial",
      total,           // total de produtos no catálogo
      novos: atualizados,
      erros,
      duracaoMs: Date.now() - inicio,
      // processados: quantos produtos foram efetivamente consultados no Omie nesta rodada.
      // Pode ser menor que total quando o time budget foi atingido.
      detalhe: processados < total ? { processados } : undefined,
    };

    await registrarLog(supabase, unidadeId, { ...result, operacao: "sync_cmc" });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[omie/sync] syncCMCProdutos erro geral:", msg);

    const result: SyncResult = {
      entidade: "cmc_produtos",
      status: "erro",
      total,
      novos: atualizados ?? 0,
      erros: 1,
      duracaoMs: Date.now() - inicio,
      detalhe: { erro: msg },
    };

    await registrarLog(supabase, unidadeId, { ...result, operacao: "sync_cmc" });
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
  filtro: OmiePedidoFiltro = "pendentes",
) {
  // PesquisarPedCompra retorna "cabecalho_consulta"; outros formatos retornam "cabecalho"
  const cab  = item.cabecalho;
  const cab2 = item.cabecalho_consulta;
  const info = item.informacoes_adicionais ?? {};

  // IDs e datas — suporte a ambos os formatos
  const nCodPedido    = cab?.nCodPedido    ?? cab2?.nCodPed    ?? 0;
  const nNumPedido    = cab?.nNumPedido    ?? (cab2?.cNumero ? parseInt(cab2.cNumero, 10) || null : null);
  const dDtPedido     = cab?.dDtPedido     ?? cab2?.dIncData;
  // Previsão de entrega: campo dDtPrevisao do Omie (campo canônico conforme suporte).
  const dDtPrevisao   =
    cab2?.dDtPrevisao ??     // PesquisarPedCompra (campo principal)
    cab?.dDtPrevisao ??      // formato antigo (IncluirPedidoCompra)
    cab2?.dDtPrevEntrega ??
    cab2?.dDtEntrega;
  const nCodFornecedor = cab?.nCodFornecedor ?? cab2?.nCodFor ?? null;
  const cEtapa        = cab?.cEtapa        ?? cab2?.cEtapa;

  // Valor total: formato antigo → cabecalho; formato pesquisa → soma das parcelas
  const valorTotal =
    cab?.nValTotalPedido ??
    cab?.nValorTotal ??
    item.faturamento?.nValTotalPedido ??
    (item.parcelas_consulta?.reduce((s, p) => s + (p.nValor ?? 0), 0) ?? 0);

  // Nome do fornecedor — tenta todas as fontes em ordem:
  //   1. informacoes_adicionais (formato antigo — nem sempre presente no PesquisarPedCompra)
  //   2. cabecalho_consulta.cNomeFornecedor (campo direto do PesquisarPedCompra quando disponível)
  //   3. clienteNomeMap: lookup previamente construído com bulk + fallback individual
  //   Chave sempre como String() para evitar discrepâncias number vs string em runtime.
  const fornecedorNome =
    info.cNomeFantasia?.trim() ||
    info.cRazaoSocial?.trim() ||
    cab2?.cNomeFornecedor?.trim() ||
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
    filtro_omie:          filtro,
    omie_sincronizado_em: new Date().toISOString(),
  };
}

export async function syncPedidosCompra(
  supabase: SupabaseClient,
  creds: OmieCredentials,
  unidadeId: string,
  filtro: OmiePedidoFiltro = "todos",
): Promise<SyncResult> {
  const inicio = Date.now();
  let total = 0;
  let novos = 0;
  let erros = 0;

  try {
    // ── Passo 1: Busca todos os pedidos de compra ─────────────────────────────
    console.log(`[omie/sync] Iniciando listAllPedidosCompra filtro=${filtro} unidade=${unidadeId}`);
    const { items, totalRegistrosOmie } = await listAllPedidosCompra(
      creds,
      (page, totalPages) => {
        console.log(`[omie/sync] Pedidos[${filtro}] unidade=${unidadeId} página ${page}/${totalPages}`);
      },
      filtro,
    );
    console.log(`[omie/sync] listAllPedidosCompra[${filtro}] retornou ${items.length} itens (totalOmie=${totalRegistrosOmie}) unidade=${unidadeId}`);

    // Log de diagnóstico: campos do primeiro pedido para entender o formato de datas
    if (items.length > 0) {
      const first = items[0];
      const cab  = first.cabecalho;
      const cab2 = first.cabecalho_consulta;
      console.log(`[omie/sync] DIAGNÓSTICO pedido[0] cab=`, JSON.stringify(cab));
      console.log(`[omie/sync] DIAGNÓSTICO pedido[0] cab2=`, JSON.stringify(cab2));
      console.log(`[omie/sync] DIAGNÓSTICO pedido[0] info=`, JSON.stringify(first.informacoes_adicionais));
      console.log(`[omie/sync] DIAGNÓSTICO pedido[0] parcelas=`, JSON.stringify(first.parcelas_consulta?.slice(0, 2)));
    }

    // ── Passo 2: Coleta IDs únicos de fornecedores ────────────────────────────
    // Extrai todos os nCodFor distintos dos pedidos para fazer lookup de nomes.
    const codigosFornecedor = new Set<number>();
    for (const item of items) {
      const cab  = item.cabecalho;
      const cab2 = item.cabecalho_consulta;
      const cod  = cab?.nCodFornecedor ?? cab2?.nCodFor;
      if (cod) codigosFornecedor.add(Number(cod));
    }
    console.log(`[omie/sync] ${codigosFornecedor.size} fornecedor(es) único(s) referenciados nos pedidos`);

    // ── Passo 3: Mapa bulk (ListarClientes sem filtro de tag) ─────────────────
    // Tenta buscar todos os clientes Omie de uma vez; cobre a maioria dos casos.
    let clienteNomeMap: Map<string, string> = new Map();
    try {
      clienteNomeMap = await buildClienteNomeMap(creds);
      console.log(`[omie/sync] clienteNomeMap bulk: ${clienteNomeMap.size} entradas`);
    } catch (err) {
      console.warn("[omie/sync] Falha no buildClienteNomeMap (bulk) — tentando lookup individual:", err instanceof Error ? err.message : String(err));
    }

    // ── Passo 4: Lookup individual para fornecedores não encontrados no bulk ───
    // Itera apenas os códigos que ainda estão ausentes no mapa.
    // Usa ConsultarCliente (um call por código) como fallback garantido.
    const codigosFaltantes = [...codigosFornecedor].filter(
      cod => !clienteNomeMap.has(String(cod))
    );
    if (codigosFaltantes.length > 0) {
      console.log(`[omie/sync] Buscando ${codigosFaltantes.length} fornecedor(es) via ConsultarCliente...`);
      for (const cod of codigosFaltantes) {
        const { nome } = await consultarCliente(creds, cod);
        if (nome) {
          clienteNomeMap.set(String(cod), nome);
          console.log(`[omie/sync] ConsultarCliente ${cod} → "${nome}"`);
        } else {
          console.warn(`[omie/sync] ConsultarCliente ${cod} → não encontrado`);
        }
      }
    }

    console.log(`[omie/sync] mapa final: ${clienteNomeMap.size} fornecedor(es) com nome`);

    total = items.length;
    const BATCH = 50;

    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH).map((item) => mapPedidoCompra(item, unidadeId, clienteNomeMap, filtro));

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
      detalhe: { filtro, totalRegistrosOmie },
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

// ── syncRequisicoes ─────────────────────────────────────────────────────────────

/**
 * Pull bidirecional: busca Requisições de Compra abertas no Omie
 * e upserta em omie_requisicoes. Para cada requisição do Omie sem
 * correspondente local, cria um registro em requisicoes com origem='omie'.
 *
 * Requer service client (bypass de RLS).
 */
export async function syncRequisicoes(
  supabase: SupabaseClient,
  creds: OmieCredentials,
  unidadeId: string,
): Promise<SyncResult> {
  const start = Date.now();
  let total = 0, novos = 0, erros = 0, removidas = 0;

  try {
    const itens = await listAllRequisicoes(creds);
    total = itens.length;

    for (const item of itens) {
      try {
        // 1. Upsert na tabela espelho
        const { data: espelho, error: espErr } = await supabase
          .from("omie_requisicoes")
          .upsert(
            {
              unidade_id:           unidadeId,
              omie_codigo:          item.codReqCompra,
              numero:               item.codIntReqCompra ?? null,
              data_requisicao:      omieDataParaISO(item.dtSugestao),
              data_necessidade:     null,
              observacao:           item.obsReqCompra ?? null,
              situacao:             item.cSituacao ?? null,
              departamento:         null,
              solicitante_nome:     null,
              itens:                item.ItensReqCompra ?? null,
              omie_sincronizado_em: new Date().toISOString(),
            },
            { onConflict: "omie_codigo,unidade_id", ignoreDuplicates: false },
          )
          .select("id, requisicao_id")
          .single();

        if (espErr) {
          console.error("[sync/req] upsert espelho:", espErr.message);
          erros++;
          continue;
        }

        novos++; // conta todo registro upsertado com sucesso no espelho

        // 2. Se ainda não tem requisicao_id local, criar requisição interna
        if (!espelho?.requisicao_id) {
          // Verificar se cCodIntReqCompra aponta para uma requisição nossa
          let reqId: string | null = null;

          if (item.codIntReqCompra) {
            const { data: existing } = await supabase
              .from("requisicoes")
              .select("id")
              .eq("id", item.codIntReqCompra)
              .maybeSingle();
            reqId = existing?.id ?? null;
          }

          if (!reqId) {
            // Criar requisição interna originada do Omie
            const year = new Date().getFullYear();
            const { data: last } = await supabase
              .from("requisicoes")
              .select("numero")
              .like("numero", `REQ-${year}-%`)
              .order("numero", { ascending: false })
              .limit(1)
              .maybeSingle();

            const lastNum = last
              ? parseInt(last.numero.split("-")[2] ?? "0", 10)
              : 0;
            const numero = `REQ-${year}-${String(lastNum + 1).padStart(4, "0")}`;

            const { data: req, error: reqErr } = await supabase
              .from("requisicoes")
              .insert({
                numero,
                titulo:               item.obsReqCompra ?? `Requisição Omie ${item.codIntReqCompra ?? item.codReqCompra}`,
                urgencia:             "normal",
                status:               "aguardando_cotacao",
                origem:               "omie",
                omie_codigo:          item.codReqCompra,
                omie_unidade_id:      unidadeId,
                omie_sincronizado_em: new Date().toISOString(),
                // Requisições importadas do Omie não têm solicitante interno
                solicitante_id:       null,
              } as Parameters<typeof supabase.from>[0] extends "requisicoes" ? never : never)
              .select("id")
              .single();

            if (reqErr || !req) {
              console.error("[sync/req] criar req local:", reqErr?.message, reqErr?.code);
              erros++;
              continue;
            }

            reqId = req.id;

            // Vincular à unidade (necessário para o filtro da página por unidade)
            await supabase
              .from("requisicao_unidades")
              .insert({ requisicao_id: reqId, unidade_id: unidadeId })
              .throwOnError();

            // Criar itens da requisição
            if (item.ItensReqCompra?.length) {
              const itensMapped = await Promise.all(
                item.ItensReqCompra.map(async (d) => {
                  let produtoId: string | null = null;
                  if (d.codProd) {
                    const { data: prod } = await supabase
                      .from("produtos")
                      .select("id")
                      .eq("omie_codigo", String(d.codProd))
                      .eq("omie_unidade_id", unidadeId)
                      .maybeSingle();
                    produtoId = prod?.id ?? null;
                  }

                  return {
                    requisicao_id:       reqId,
                    produto_id:          produtoId,
                    produto_nome_livre:  produtoId ? null : (d.obsItem ?? "Produto Omie"),
                    produto_unidade_med: null,
                    produto_novo:        !produtoId,
                    quantidade:          d.qtde,
                    observacao:          d.obsItem ?? null,
                  };
                }),
              );

              const { error: itensErr } = await supabase.from("requisicao_itens").insert(itensMapped);
              if (itensErr) {
                console.error("[sync/req] inserir itens:", itensErr.message);
              }

              const temProdutoNovo = itensMapped.some((i) => i.produto_novo);
              if (temProdutoNovo) {
                await supabase
                  .from("requisicoes")
                  .update({ status: "pendente_produto" })
                  .eq("id", reqId);
              }
            }

          }

          // Vincular espelho à requisição
          await supabase
            .from("omie_requisicoes")
            .update({ requisicao_id: reqId })
            .eq("id", espelho!.id);
        }
      } catch (err) {
        console.error("[sync/req] item:", (err as Error).message);
        erros++;
      }
    }

    // 3. Limpeza de órfãs: requisições origem='omie' desta unidade que não
    //    existem mais no Omie (excluídas lá). Guarda-chuvas:
    //    - só roda se o Omie retornou ao menos 1 requisição (evita apagar tudo
    //      por uma resposta vazia transitória da API);
    //    - preserva requisições em cotação/aprovadas ou com cotação vinculada.
    if (itens.length > 0) {
      const codigosOmie = new Set(itens.map((i) => i.codReqCompra).filter(Boolean));

      const { data: locais } = await supabase
        .from("requisicoes")
        .select("id, numero, status, omie_codigo")
        .eq("origem", "omie")
        .eq("omie_unidade_id", unidadeId)
        .not("omie_codigo", "is", null);

      for (const r of locais ?? []) {
        if (codigosOmie.has(Number(r.omie_codigo))) continue;
        if (r.status === "cotacao" || r.status === "aprovado") continue;

        const { count: cotacoesVinculadas } = await supabase
          .from("cotacoes")
          .select("*", { count: "exact", head: true })
          .eq("requisicao_id", r.id);
        if ((cotacoesVinculadas ?? 0) > 0) continue;

        await supabase.from("omie_requisicoes").delete().eq("requisicao_id", r.id);
        await supabase.from("requisicao_itens").delete().eq("requisicao_id", r.id);
        await supabase.from("requisicao_unidades").delete().eq("requisicao_id", r.id);
        const { error: delErr } = await supabase.from("requisicoes").delete().eq("id", r.id);

        if (delErr) {
          console.error(`[sync/req] remover órfã ${r.numero}:`, delErr.message);
          erros++;
        } else {
          removidas++;
          console.info(`[sync/req] requisição ${r.numero} removida — não existe mais no Omie (#${r.omie_codigo})`);
        }
      }

      // Espelhos órfãos sem requisição local vinculada
      const { data: espelhos } = await supabase
        .from("omie_requisicoes")
        .select("id, omie_codigo")
        .eq("unidade_id", unidadeId)
        .is("requisicao_id", null);

      for (const e of espelhos ?? []) {
        if (codigosOmie.has(Number(e.omie_codigo))) continue;
        await supabase.from("omie_requisicoes").delete().eq("id", e.id);
      }
    }
  } catch (err) {
    const msg = (err as Error).message;
    const result: SyncResult = {
      entidade: "requisicoes",
      status: "erro",
      total: 0,
      novos: 0,
      erros: 1,
      duracaoMs: Date.now() - start,
      detalhe: { erro: msg },
    };
    await registrarLog(supabase, unidadeId, { ...result, operacao: "sync" });
    return result;
  }

  const result: SyncResult = {
    entidade: "requisicoes",
    status: erros > 0 && novos === 0 ? "erro" : erros > 0 ? "parcial" : "ok",
    total,
    novos,
    erros,
    duracaoMs: Date.now() - start,
    ...(removidas > 0 ? { detalhe: { removidas } } : {}),
  };

  await registrarLog(supabase, unidadeId, { ...result, operacao: "sync" });
  return result;
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

    // Sincroniza requisições de compra por unidade
    const resReq = await syncRequisicoes(supabase, creds, unidade.id);
    results.push(resReq);
  }

  return {
    results,
    unidades: (unidades as UnidadeComCreds[]).map((u) => u.nome),
  };
}
