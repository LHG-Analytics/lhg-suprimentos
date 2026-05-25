"use server";

/**
 * app/(app)/produtos/actions.ts — LHG-230
 * Server Action para edição de produto com sync bidirecional ao Omie.
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { alterarProduto } from "@/lib/omie/client";
import { FAMILIA_TO_CATEGORIA } from "@/lib/omie/familia-map";

export interface EditarProdutoInput {
  nome:         string;
  preco_custo:  number;
  familia_omie: string;
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

  // Busca produto + credenciais Omie da unidade
  const { data: produto, error: fetchErr } = await supabase
    .from("produtos")
    .select("id, omie_codigo, omie_unidade_id, unidades(omie_app_key, omie_app_secret)")
    .eq("id", produtoId)
    .single();

  if (fetchErr || !produto) return { erro: "Produto não encontrado" };
  if (!produto.omie_codigo)  return { erro: "Produto não sincronizado com o Omie — execute o Sync primeiro" };

  const unidade = produto.unidades as { omie_app_key: string; omie_app_secret: string } | null;
  if (!unidade?.omie_app_key || !unidade?.omie_app_secret) {
    return { erro: "Credenciais Omie não configuradas para esta unidade" };
  }

  // Chama AlterarProduto no Omie
  try {
    await alterarProduto(
      { appKey: unidade.omie_app_key, appSecret: unidade.omie_app_secret },
      {
        omie_codigo:  produto.omie_codigo,
        nome:         dados.nome.trim(),
        preco_custo:  dados.preco_custo,
        familia_omie: dados.familia_omie.trim(),
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
