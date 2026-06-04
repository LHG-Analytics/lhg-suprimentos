"use server";

/**
 * actions.ts — Fase 1
 * Server Actions para o módulo de Requisições.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { incluirProduto, alterarProduto, isOmieRedundantError } from "@/lib/omie/client";
import { incluirReq, upsertReq, toOmieId } from "@/lib/omie/requisicao";
import type { OmieCredentials } from "@/lib/omie/client";

// ── Schemas ───────────────────────────────────────────────────────────────────

const ItemSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo:       z.literal("catalogo"),
    produto_id: z.string().uuid(),
    quantidade: z.number().positive(),
    observacao: z.string().optional(),
  }),
  z.object({
    tipo:               z.literal("livre"),
    produto_nome_livre: z.string().min(2, "Descreva o produto (mínimo 2 caracteres)"),
    produto_unidade_med: z.string().min(1, "Informe a unidade (ex: UN, KG)"),
    quantidade:         z.number().positive(),
    observacao:         z.string().optional(),
  }),
]);

const NovaRequisicaoSchema = z.object({
  titulo:        z.string().min(3, "Título obrigatório (mínimo 3 caracteres)"),
  urgencia:      z.enum(["normal", "urgente"]),
  justificativa: z.string().optional(),
  unidade_ids:   z.array(z.string().uuid()).min(1, "Selecione ao menos uma unidade"),
  itens:         z.array(ItemSchema).min(1, "Adicione ao menos um item"),
});

export type NovaRequisicaoInput = z.infer<typeof NovaRequisicaoSchema>;
export type ItemInput = z.infer<typeof ItemSchema>;

const ProdutoOmieSchema = z.object({
  nome:       z.string().min(2, "Nome obrigatório"),
  unidade:    z.string().min(1, "Unidade obrigatória (ex: UN, KG)"),
  familia:    z.string().optional(),
  valorCusto: z.number().optional(),
});

export type ProdutoOmieInput = z.infer<typeof ProdutoOmieSchema>;

// ── Helper: buscar credenciais Omie da unidade ────────────────────────────────

interface UnidadeCreds {
  creds:    OmieCredentials;
  codCateg: string;
}

async function getCredsUnidade(unidadeId: string): Promise<UnidadeCreds | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("unidades")
    .select("omie_app_key, omie_app_secret")
    .eq("id", unidadeId)
    .eq("ativa", true)
    .not("omie_app_key", "is", null)
    .not("omie_app_secret", "is", null)
    .maybeSingle();

  if (!data) return null;

  // Buscar omie_categoria_compras separado (campo adicionado na migration 0020)
  const supabase2 = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: extra } = await supabase2.from("unidades").select("omie_categoria_compras" as any).eq("id", unidadeId).maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const codCateg = ((extra as any)?.omie_categoria_compras as string | null) ?? "";

  return {
    creds: {
      appKey:    (data.omie_app_key as string).replace(/^﻿/, ""),
      appSecret: (data.omie_app_secret as string).replace(/^﻿/, ""),
    },
    codCateg,
  };
}

// ── criarRequisicao ───────────────────────────────────────────────────────────

export async function criarRequisicao(input: NovaRequisicaoInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = NovaRequisicaoSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos");
  }

  const { titulo, urgencia, justificativa, unidade_ids, itens } = parsed.data;
  const temProdutoNovo = itens.some((i) => i.tipo === "livre");

  // Número sequencial
  const year = new Date().getFullYear();
  const { data: lastReq } = await supabase
    .from("requisicoes")
    .select("numero")
    .like("numero", `REQ-${year}-%`)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastNum = lastReq ? parseInt(lastReq.numero.split("-")[2] ?? "0", 10) : 0;
  const numero = `REQ-${year}-${String(lastNum + 1).padStart(4, "0")}`;
  const status = temProdutoNovo ? "pendente_produto" : "aguardando_cotacao";

  // Inserir requisição
  const { data: req, error: reqErr } = await supabase
    .from("requisicoes")
    .insert({ numero, titulo, urgencia, justificativa: justificativa || null, solicitante_id: user.id, status, origem: "plataforma" })
    .select()
    .single();

  if (reqErr || !req) throw new Error(reqErr?.message ?? "Erro ao criar requisição");

  // Inserir unidades
  await supabase.from("requisicao_unidades").insert(
    unidade_ids.map((uid) => ({ requisicao_id: req.id, unidade_id: uid }))
  );

  // Inserir itens
  await supabase.from("requisicao_itens").insert(
    itens.map((item) =>
      item.tipo === "catalogo"
        ? { requisicao_id: req.id, produto_id: item.produto_id, produto_novo: false, quantidade: item.quantidade, observacao: item.observacao || null }
        : { requisicao_id: req.id, produto_id: null, produto_nome_livre: item.produto_nome_livre, produto_unidade_med: item.produto_unidade_med, produto_novo: true, quantidade: item.quantidade, observacao: item.observacao || null }
    )
  );

  // Enviar ao Omie quando não há produto novo
  let omieAviso: string | undefined;
  if (!temProdutoNovo) {
    try {
      const unidadeCreds = await getCredsUnidade(unidade_ids[0]);
      if (!unidadeCreds) {
        omieAviso = "Unidade sem credenciais Omie — requisição criada somente na plataforma";
      } else if (!unidadeCreds.codCateg) {
        omieAviso = "Configure 'omie_categoria_compras' na unidade para enviar ao Omie";
      } else {
        const { creds, codCateg } = unidadeCreds;
        const { data: itensReq } = await supabase
          .from("requisicao_itens")
          .select("id, produto_id, quantidade, produtos(omie_codigo)")
          .eq("requisicao_id", req.id);

        const omieItens = (itensReq ?? []).map((i) => {
          const prod = i.produtos as { omie_codigo: string | null } | null;
          return { codIntItem: toOmieId(i.id), codProd: prod?.omie_codigo ? Number(prod.omie_codigo) : undefined, qtde: i.quantidade, precoUnit: 0 };
        });

        const omieCode = await incluirReq(creds, { codCateg, codIntReqCompra: toOmieId(req.id), obsReqCompra: titulo, ItensReqCompra: omieItens });
        await supabase.from("requisicoes").update({ omie_codigo: omieCode, omie_sincronizado_em: new Date().toISOString() }).eq("id", req.id);
      }
    } catch (err) {
      const msg = (err as Error).message;
      console.error("[criarRequisicao] Omie sync:", msg);
      // REDUNDANT = omiePost retry enviou a mesma req duas vezes; Omie já registrou na 1ª tentativa
      if (isOmieRedundantError(err)) {
        console.info("[criarRequisicao] Omie REDUNDANT — requisição já registrada, ignorando");
      } else {
        omieAviso = `Criada na plataforma, mas falhou no Omie: ${msg}`;
      }
    }
  }

  revalidatePath("/requisicoes");
  return { id: req.id, numero: req.numero as string, omieAviso };
}

// ── aprovarRequisicao ─────────────────────────────────────────────────────────

export async function aprovarRequisicao(requisicaoId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { count } = await supabase
    .from("requisicao_itens")
    .select("*", { count: "exact", head: true })
    .eq("requisicao_id", requisicaoId)
    .eq("produto_novo", true);

  if ((count ?? 0) > 0) {
    throw new Error("Há produtos não cadastrados nesta requisição. Cadastre todos antes de aprovar.");
  }

  const { data: req } = await supabase
    .from("requisicoes")
    .select("id, titulo, omie_codigo, requisicao_unidades(unidade_id)")
    .eq("id", requisicaoId)
    .single();

  if (!req) throw new Error("Requisição não encontrada");

  // Enviar ao Omie se ainda não foi
  if (!req.omie_codigo) {
    try {
      const unidades = req.requisicao_unidades as Array<{ unidade_id: string }>;
      const unidadeCreds = await getCredsUnidade(unidades[0]?.unidade_id ?? "");
      if (unidadeCreds?.codCateg) {
        const { creds, codCateg } = unidadeCreds;
        const { data: itensReq } = await supabase
          .from("requisicao_itens")
          .select("id, produto_id, quantidade, produtos(omie_codigo)")
          .eq("requisicao_id", requisicaoId);

        const omieItens = (itensReq ?? []).map((i) => {
          const prod = i.produtos as { omie_codigo: string | null } | null;
          return { codIntItem: toOmieId(i.id), codProd: prod?.omie_codigo ? Number(prod.omie_codigo) : undefined, qtde: i.quantidade, precoUnit: 0 };
        });

        await upsertReq(creds, { codCateg, codIntReqCompra: toOmieId(requisicaoId), obsReqCompra: req.titulo as string, ItensReqCompra: omieItens });
      }
    } catch (err) {
      console.error("[aprovarRequisicao] Omie:", (err as Error).message);
    }
  }

  await supabase.from("requisicoes").update({ status: "aguardando_cotacao" }).eq("id", requisicaoId);

  revalidatePath("/requisicoes");
  revalidatePath(`/requisicoes/${requisicaoId}`);
}

// ── vincularProdutoItem ───────────────────────────────────────────────────────

export async function vincularProdutoItem(requisicaoItemId: string, produtoId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Buscar perfil do usuário para verificar role
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const { data: item } = await supabase
    .from("requisicao_itens")
    .select("id, requisicao_id, requisicoes(solicitante_id)")
    .eq("id", requisicaoItemId)
    .single();

  if (!item) throw new Error("Item não encontrado");

  // Solicitantes só podem vincular itens de suas próprias requisições
  const req = item.requisicoes as { solicitante_id: string } | null;
  const isSolicitante = profile?.role === "solicitante";
  if (isSolicitante && req?.solicitante_id !== user.id) {
    throw new Error("Sem permissão para modificar esta requisição");
  }

  await supabase
    .from("requisicao_itens")
    .update({ produto_id: produtoId, produto_novo: false, produto_nome_livre: null })
    .eq("id", requisicaoItemId);

  const { count: pendentes } = await supabase
    .from("requisicao_itens")
    .select("*", { count: "exact", head: true })
    .eq("requisicao_id", item.requisicao_id)
    .eq("produto_novo", true);

  if ((pendentes ?? 0) === 0) {
    await supabase
      .from("requisicoes")
      .update({ status: "aguardando_cotacao" })
      .eq("id", item.requisicao_id)
      .eq("status", "pendente_produto");
  }

  revalidatePath(`/requisicoes/${item.requisicao_id}`);
}

// ── criarProdutoOmie ──────────────────────────────────────────────────────────

export async function criarProdutoOmie(unidadeId: string, data: ProdutoOmieInput): Promise<{ produtoId: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verificar que o usuário tem acesso à unidade (comprador/admin: todas; solicitante: só as suas)
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "solicitante") {
    const { count } = await supabase
      .from("user_unidades")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("unidade_id", unidadeId);
    if ((count ?? 0) === 0) throw new Error("Sem permissão para esta unidade");
  }

  const parsed = ProdutoOmieSchema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos");

  const unidadeCreds = await getCredsUnidade(unidadeId);
  if (!unidadeCreds) throw new Error("Unidade sem credenciais Omie configuradas");
  const { creds } = unidadeCreds;

  const localId = crypto.randomUUID();
  const codigoIntegracao = `LHG-${localId.slice(0, 8)}`;

  // Criar no Omie
  const codigoProduto = await incluirProduto(creds, {
    nome:             parsed.data.nome,
    unidade:          parsed.data.unidade,
    familia_omie:     parsed.data.familia,
    valor_unitario:   parsed.data.valorCusto ?? 0,
    codigo_integracao: codigoIntegracao,
  });

  // Salvar localmente
  const serviceClient = createServiceClient();
  const { data: prod, error } = await serviceClient
    .from("produtos")
    .insert({
      id:              localId,
      nome:            parsed.data.nome,
      unidade_med:     parsed.data.unidade,
      codigo:          codigoIntegracao,
      categoria:       "livre",
      omie_codigo:     String(codigoProduto),
      omie_unidade_id: unidadeId,
      ativo:           true,
      preco_custo:     parsed.data.valorCusto ?? null,
    })
    .select("id")
    .single();

  if (error || !prod) throw new Error(error?.message ?? "Erro ao salvar produto localmente");

  revalidatePath("/produtos");
  return { produtoId: prod.id };
}

// ── atualizarProdutoOmie ──────────────────────────────────────────────────────

export async function atualizarProdutoOmie(produtoId: string, data: Partial<ProdutoOmieInput> & { inativo?: boolean }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Buscar produto atual para ter os campos obrigatórios da API Omie
  const { data: prod } = await supabase
    .from("produtos")
    .select("omie_codigo, omie_unidade_id, nome, unidade_med, familia_omie, preco_custo")
    .eq("id", produtoId)
    .single();

  if (!prod?.omie_codigo || !prod?.omie_unidade_id) {
    throw new Error("Produto sem código Omie — não pode ser atualizado no Omie");
  }

  const unidadeCreds = await getCredsUnidade(prod.omie_unidade_id as string);
  if (!unidadeCreds) throw new Error("Unidade sem credenciais Omie");
  const { creds } = unidadeCreds;

  await alterarProduto(creds, {
    omie_codigo:  prod.omie_codigo as string,
    nome:         data.nome        ?? (prod.nome as string),
    preco_custo:  data.valorCusto  ?? ((prod.preco_custo as number | null) ?? 0),
    familia_omie: data.familia     ?? ((prod.familia_omie as string | null) ?? ""),
    unidade:      data.unidade     ?? (prod.unidade_med as string),
  });

  // Atualizar localmente
  const serviceClient = createServiceClient();
  await serviceClient.from("produtos").update({
    nome:        data.nome      ?? undefined,
    unidade_med: data.unidade   ?? undefined,
    preco_custo: data.valorCusto ?? undefined,
    ativo:       data.inativo === true ? false : undefined,
  }).eq("id", produtoId);

  revalidatePath("/produtos");
}

// ── deletarRequisicao ─────────────────────────────────────────────────────────
// Retorna { erro } em vez de throw para que o cliente mostre a mensagem correta
// em produção (Server Actions que lançam throw mostram mensagem genérica no Next.js).

export async function deletarRequisicao(
  id: string,
): Promise<{ numero: string } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: req } = await supabase
    .from("requisicoes")
    .select("id, status, numero")
    .eq("id", id)
    .single();

  if (!req) return { erro: "Requisição não encontrada" };

  // Bloqueia exclusão de requisições que já foram aprovadas ou estão em cotação
  const bloqueado = ["aprovado", "cotacao", "pendente"].includes(req.status as string);
  if (bloqueado) {
    return { erro: `Não é possível excluir uma requisição com status "${req.status}". Cancele-a antes.` };
  }

  await supabase.from("requisicao_itens").delete().eq("requisicao_id", id);
  await supabase.from("requisicao_unidades").delete().eq("requisicao_id", id);

  const { error } = await supabase.from("requisicoes").delete().eq("id", id);
  if (error) return { erro: error.message };

  revalidatePath("/requisicoes");
  return { numero: req.numero as string };
}
