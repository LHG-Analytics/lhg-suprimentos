"use server";

/**
 * app/(app)/fornecedores/actions.ts — LHG-230
 * Server Action para edição de fornecedor com sync bidirecional ao Omie.
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { alterarFornecedor } from "@/lib/omie/client";

export interface EditarFornecedorInput {
  razao_social:  string;
  nome_fantasia: string;
  email:         string;
  telefone:      string;
  contato:       string;
  endereco:      string;
  cep:           string;
  cidade:        string;
  uf:            string;
}

export async function editarFornecedor(
  fornecedorId: string,
  dados: EditarFornecedorInput,
): Promise<{ ok: true } | { erro: string }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Validações básicas
  if (!dados.razao_social?.trim()) return { erro: "Razão social é obrigatória" };
  if (dados.uf && dados.uf.trim().length !== 2) return { erro: "UF inválida (deve ter 2 letras)" };

  // Busca fornecedor + credenciais Omie da unidade
  const { data: fornecedor, error: fetchErr } = await supabase
    .from("fornecedores")
    .select("id, omie_codigo, omie_unidade_id, unidades(omie_app_key, omie_app_secret)")
    .eq("id", fornecedorId)
    .single();

  if (fetchErr || !fornecedor) return { erro: "Fornecedor não encontrado" };
  if (!fornecedor.omie_codigo)  return { erro: "Fornecedor não sincronizado com o Omie — execute o Sync primeiro" };

  const unidade = fornecedor.unidades as { omie_app_key: string; omie_app_secret: string } | null;
  if (!unidade?.omie_app_key || !unidade?.omie_app_secret) {
    return { erro: "Credenciais Omie não configuradas para esta unidade" };
  }

  // Chama AlterarCliente no Omie
  try {
    await alterarFornecedor(
      { appKey: unidade.omie_app_key, appSecret: unidade.omie_app_secret },
      {
        omie_codigo:   fornecedor.omie_codigo,
        razao_social:  dados.razao_social.trim(),
        nome_fantasia: dados.nome_fantasia?.trim() ?? "",
        email:         dados.email?.trim() ?? "",
        telefone:      dados.telefone?.trim() ?? "",
        contato:       dados.contato?.trim() ?? "",
        endereco:      dados.endereco?.trim() ?? "",
        cep:           dados.cep?.replace(/\D/g, "") ?? "",
        cidade:        dados.cidade?.trim() ?? "",
        uf:            dados.uf?.trim() ?? "",
      },
    );
  } catch (err) {
    return { erro: err instanceof Error ? err.message : "Erro ao comunicar com o Omie" };
  }

  // Atualiza Supabase
  await supabase
    .from("fornecedores")
    .update({
      razao_social:        dados.razao_social.trim(),
      nome_fantasia:       dados.nome_fantasia?.trim() || null,
      email:               dados.email?.trim() || null,
      telefone:            dados.telefone?.trim() || null,
      contato:             dados.contato?.trim() || null,
      endereco:            dados.endereco?.trim() || null,
      cep:                 dados.cep?.replace(/\D/g, "") || null,
      cidade:              dados.cidade?.trim() || null,
      uf:                  dados.uf?.trim() || null,
      omie_sincronizado_em: new Date().toISOString(),
    })
    .eq("id", fornecedorId);

  revalidatePath("/fornecedores");
  return { ok: true };
}
