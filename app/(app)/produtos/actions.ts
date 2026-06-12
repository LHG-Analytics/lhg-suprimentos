"use server";

/**
 * app/(app)/produtos/actions.ts — LHG-230
 * Server Action para edição de produto com sync bidirecional ao Omie.
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  alterarProduto,
  incluirProduto,
  listFamiliasProduto,
  buscarProdutoPorCodigo,
  isOmieRedundantError,
  OmieError,
} from "@/lib/omie/client";
import { FAMILIA_TO_CATEGORIA } from "@/lib/omie/familia-map";

export interface EditarProdutoInput {
  nome:           string;
  preco_custo:    number;
  familia_omie:   string;
  familia_codigo?: number;  // código numérico da família (preferido pelo Omie)
}

export async function editarProduto(
  produtoId: string,
  dados: EditarProdutoInput,
): Promise<{ ok: true } | { erro: string }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Validações básicas
  if (!dados.nome?.trim())        return { erro: "Nome é obrigatório" };
  if (dados.preco_custo <= 0)     return { erro: "Preço deve ser maior que zero" };
  if (!dados.familia_omie?.trim()) return { erro: "Família é obrigatória" };

  // Busca produto + credenciais Omie da unidade (inclui unidade_med e ncm — obrigatórios na API)
  const { data: produto, error: fetchErr } = await supabase
    .from("produtos")
    .select("id, omie_codigo, omie_unidade_id, unidade_med, ncm, unidades(omie_app_key, omie_app_secret)")
    .eq("id", produtoId)
    .single();

  if (fetchErr || !produto) return { erro: "Produto não encontrado" };
  if (!produto.omie_codigo)  return { erro: "Produto não sincronizado com o Omie — execute o Sync primeiro" };

  const unidade = produto.unidades as { omie_app_key: string; omie_app_secret: string } | null;
  if (!unidade?.omie_app_key || !unidade?.omie_app_secret) {
    return { erro: "Credenciais Omie não configuradas para esta unidade" };
  }

  // Campos extras necessários pela API Omie (unidade obrigatória, ncm opcional mas recomendado)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const produtoExtra = produto as any;
  const unidadeMed = (produtoExtra.unidade_med as string | null) ?? "UN";
  const ncm        = (produtoExtra.ncm as string | null) ?? undefined;

  // Chama AlterarProduto no Omie
  try {
    await alterarProduto(
      { appKey: unidade.omie_app_key, appSecret: unidade.omie_app_secret },
      {
        omie_codigo:    produto.omie_codigo,
        nome:           dados.nome.trim(),
        preco_custo:    dados.preco_custo,
        familia_omie:   dados.familia_omie.trim(),
        familia_codigo: dados.familia_codigo,
        unidade:        unidadeMed,
        ncm,
      },
    );
  } catch (err) {
    return { erro: err instanceof Error ? err.message : "Erro ao comunicar com o Omie" };
  }

  // Atualiza Supabase (recalcula categoria)
  const novaCategoria = FAMILIA_TO_CATEGORIA[dados.familia_omie.toUpperCase()] ?? "Outros";

  await supabase
    .from("produtos")
    .update({
      nome:                dados.nome.trim(),
      preco_custo:         dados.preco_custo,
      familia_omie:        dados.familia_omie.trim(),
      categoria:           novaCategoria,
      omie_sincronizado_em: new Date().toISOString(),
    })
    .eq("id", produtoId);

  revalidatePath("/produtos");
  return { ok: true };
}

// ── listarFamiliasOmieParaProduto ──────────────────────────────────────────────

export interface FamiliaProdutoOmie { codigo: number; descricao: string; }

/**
 * Busca famílias de produto do Omie usando as credenciais da unidade do produto.
 * Usado no modal de edição para popular o select com codigo_familia correto.
 */
export async function listarFamiliasOmieParaProduto(
  produtoId: string,
): Promise<{ familias: FamiliaProdutoOmie[] } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: "Não autorizado" };

  const { data: produto } = await supabase
    .from("produtos")
    .select("omie_unidade_id, unidades(omie_app_key, omie_app_secret)")
    .eq("id", produtoId)
    .single();

  const unidade = produto?.unidades as { omie_app_key: string; omie_app_secret: string } | null;
  if (!unidade?.omie_app_key) return { erro: "Unidade sem credenciais Omie" };

  try {
    const familias = await listFamiliasProduto({
      appKey:    unidade.omie_app_key.replace(/^﻿/, ""),
      appSecret: unidade.omie_app_secret.replace(/^﻿/, ""),
    });
    return { familias: familias.map(f => ({ codigo: f.codigo, descricao: f.descricao })) };
  } catch (err) {
    return { erro: `Falhou no Omie: ${(err as Error).message}` };
  }
}

// ── importarProdutoOmie ────────────────────────────────────────────────────────

/**
 * Importa um único produto do Omie pelo código interno (ex: "INS00123").
 * Usa a unidade ativa do cookie lhg-unidade-slug.
 * Muito mais rápido que um sync completo — faz 1 chamada à API Omie.
 */
export async function importarProdutoOmie(
  codigoProduto: string,
): Promise<
  | { produto: { id: string; nome: string; codigo: string } }
  | { erro: string }
  | { redundante: true; aguardarSegundos: number }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!codigoProduto?.trim()) return { erro: "Código do produto é obrigatório" };

  const cookieStore = await cookies();
  const unidadeSlug = cookieStore.get("lhg-unidade-slug")?.value;
  if (!unidadeSlug || unidadeSlug === "todas") {
    return { erro: "Selecione uma unidade específica antes de importar" };
  }

  const { data: unidade } = await supabase
    .from("unidades")
    .select("id, omie_app_key, omie_app_secret")
    .eq("slug", unidadeSlug)
    .single();

  if (!unidade) return { erro: "Unidade não encontrada" };
  if (!unidade.omie_app_key || !unidade.omie_app_secret) {
    return { erro: "Unidade sem credenciais Omie configuradas" };
  }

  const creds = {
    appKey:    unidade.omie_app_key.replace(/^﻿/, ""),
    appSecret: unidade.omie_app_secret.replace(/^﻿/, ""),
  };

  let item;
  try {
    item = await buscarProdutoPorCodigo(creds, codigoProduto.trim().toUpperCase());
  } catch (err) {
    if (isOmieRedundantError(err)) {
      // Extrai segundos restantes da mensagem do Omie: "Aguarde X segundos para tentar novamente"
      const match = err instanceof Error ? err.message.match(/Aguarde (\d+) segundo/) : null;
      const segundos = match ? parseInt(match[1], 10) + 2 : 62;
      return { redundante: true, aguardarSegundos: segundos };
    }
    return { erro: `Erro ao buscar no Omie: ${err instanceof Error ? err.message : "Erro desconhecido"}` };
  }

  if (!item) {
    return { erro: `Produto "${codigoProduto.trim()}" não encontrado no Omie` };
  }

  const familiaOmie: string | null =
    (typeof item.descricao_familia === "string" && item.descricao_familia.trim())
      ? item.descricao_familia.trim().toUpperCase()
      : null;

  const payload = {
    nome:                 item.descricao,
    codigo:               item.codigo ?? `OMIE-${item.codigo_produto}`,
    unidade_med:          item.unidade ?? "un",
    categoria:            FAMILIA_TO_CATEGORIA[familiaOmie ?? ""] ?? "Outros",
    familia_omie:         familiaOmie,
    omie_codigo:          String(item.codigo_produto),
    omie_unidade_id:      unidade.id,
    omie_descricao:       (item.descr_detalhada ?? item.descricao_detalhada) ?? null,
    ncm:                  item.ncm ?? null,
    ean:                  item.ean ?? null,
    omie_sincronizado_em: new Date().toISOString(),
    ativo:                item.inativo !== "S",
  };

  const { data: produto, error } = await supabase
    .from("produtos")
    .upsert(payload, { onConflict: "omie_codigo,omie_unidade_id", ignoreDuplicates: false })
    .select("id, nome, codigo")
    .single();

  if (error) return { erro: `Erro ao salvar: ${error.message}` };

  revalidatePath("/produtos");
  return { produto: { id: produto.id, nome: produto.nome, codigo: produto.codigo ?? "" } };
}

// ── criarProduto ───────────────────────────────────────────────────────────────

export interface CriarProdutoInput {
  nome:           string;
  descricao?:     string;
  unidade:        string;
  ncm:            string;
  valor_unitario: number;
  familia_omie:   string;
  codigo?:        string;
  unidade_id:     string;
}

export async function criarProduto(
  dados: CriarProdutoInput,
): Promise<{ ok: true; id: string } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!dados.nome?.trim())         return { erro: "Nome é obrigatório" };
  if (!dados.unidade?.trim())      return { erro: "Unidade de medida é obrigatória" };
  if (!dados.ncm?.trim())          return { erro: "NCM é obrigatório (exigido pelo Omie)" };
  if (dados.valor_unitario <= 0)   return { erro: "Valor unitário deve ser maior que zero" };
  if (!dados.familia_omie?.trim()) return { erro: "Família é obrigatória" };

  const ncmLimpo = dados.ncm.replace(/\D/g, "");
  if (ncmLimpo.length !== 8) return { erro: "NCM deve ter exatamente 8 dígitos (ex: 84331110)" };

  const { data: unidade, error: unidErr } = await supabase
    .from("unidades")
    .select("id, omie_app_key, omie_app_secret")
    .eq("id", dados.unidade_id)
    .single();

  if (unidErr || !unidade) return { erro: "Unidade não encontrada" };
  if (!unidade.omie_app_key || !unidade.omie_app_secret) {
    return { erro: "Unidade sem credenciais Omie" };
  }

  const creds = { appKey: unidade.omie_app_key, appSecret: unidade.omie_app_secret };
  const newId = crypto.randomUUID();
  const codigoIntegracao = `LHG-${newId.slice(0, 8)}`;

  let omieCodigoProd: number;
  try {
    omieCodigoProd = await incluirProduto(creds, {
      nome:             dados.nome.trim(),
      unidade:          dados.unidade.trim().toUpperCase(),
      ncm:              ncmLimpo,
      valor_unitario:   dados.valor_unitario,
      familia_omie:     dados.familia_omie.trim(),
      codigo_interno:   dados.codigo?.trim(),
      codigo_integracao: codigoIntegracao,
    });
  } catch (err) {
    return { erro: `Erro ao criar no Omie: ${err instanceof Error ? err.message : "Erro desconhecido"}` };
  }

  const categoria = FAMILIA_TO_CATEGORIA[dados.familia_omie.toUpperCase()] ?? "Outros";

  const { data: novoProd, error: insertErr } = await supabase
    .from("produtos")
    .insert({
      id:                   newId,
      nome:                 dados.nome.trim(),
      unidade_med:          dados.unidade.trim().toUpperCase(),
      ncm:                  ncmLimpo,
      preco_custo:          dados.valor_unitario,
      familia_omie:         dados.familia_omie.trim(),
      categoria,
      codigo:               dados.codigo?.trim() ?? codigoIntegracao,
      omie_codigo:          String(omieCodigoProd),
      omie_descricao:       dados.descricao?.trim() ?? null,
      omie_sincronizado_em: new Date().toISOString(),
      omie_unidade_id:      dados.unidade_id,
    })
    .select("id")
    .single();

  if (insertErr || !novoProd) {
    console.error(`[criarProduto] Supabase insert falhou após Omie (omie_codigo=${omieCodigoProd}):`, insertErr?.message);
    return { erro: insertErr?.message ?? "Erro ao salvar no banco de dados" };
  }

  revalidatePath("/produtos");
  return { ok: true, id: novoProd.id };
}
