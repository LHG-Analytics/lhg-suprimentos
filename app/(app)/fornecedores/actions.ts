"use server";

/**
 * app/(app)/fornecedores/actions.ts — LHG-230
 * Server Action para edição de fornecedor com sync bidirecional ao Omie.
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { alterarFornecedor, incluirCliente } from "@/lib/omie/client";

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
): Promise<{ ok: true; omieAviso?: string } | { erro: string }> {
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

  const unidade = fornecedor.unidades as { omie_app_key: string; omie_app_secret: string } | null;

  // Só tenta sincronizar com Omie se o fornecedor tiver código Omie
  let omieAviso: string | undefined;
  if (fornecedor.omie_codigo && unidade?.omie_app_key) {
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
      // Falha no Omie não bloqueia salvar localmente
      omieAviso = err instanceof Error ? err.message : "Erro ao sincronizar com o Omie";
      console.error("[editarFornecedor] Omie:", omieAviso);
    }
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
  return { ok: true, omieAviso };
}

// ── criarFornecedor ────────────────────────────────────────────────────────────

export interface CriarFornecedorInput {
  razao_social:  string;
  cnpj_cpf:      string;
  nome_fantasia: string;
  email?:        string;
  telefone?:     string;
  contato?:      string;
  endereco?:     string;
  cep?:          string;
  cidade?:       string;
  uf?:           string;
  unidade_id:    string;
}

export async function criarFornecedor(
  dados: CriarFornecedorInput,
): Promise<{ ok: true; id: string } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!dados.razao_social?.trim())  return { erro: "Razão social é obrigatória" };
  if (!dados.cnpj_cpf?.trim())      return { erro: "CNPJ/CPF é obrigatório" };
  if (!dados.nome_fantasia?.trim()) return { erro: "Nome fantasia é obrigatório" };

  const cnpjLimpo = dados.cnpj_cpf.replace(/\D/g, "");
  if (cnpjLimpo.length !== 14 && cnpjLimpo.length !== 11) {
    return { erro: "CNPJ deve ter 14 dígitos ou CPF 11 dígitos" };
  }

  const { data: existente } = await supabase
    .from("fornecedores")
    .select("id")
    .eq("cnpj", cnpjLimpo)
    .maybeSingle();

  if (existente) return { erro: "Já existe um fornecedor com este CNPJ/CPF" };

  const { data: unidade, error: unidErr } = await supabase
    .from("unidades")
    .select("id, omie_app_key, omie_app_secret")
    .eq("id", dados.unidade_id)
    .single();

  if (unidErr || !unidade) return { erro: "Unidade não encontrada" };
  if (!unidade.omie_app_key || !unidade.omie_app_secret) {
    return { erro: "Unidade sem credenciais Omie configuradas" };
  }

  const creds = { appKey: unidade.omie_app_key, appSecret: unidade.omie_app_secret };

  let omieCodigoCli: number;
  try {
    omieCodigoCli = await incluirCliente(creds, {
      razao_social:  dados.razao_social.trim(),
      cnpj_cpf:      cnpjLimpo,
      nome_fantasia: dados.nome_fantasia.trim(),
      email:         dados.email?.trim(),
      telefone:      dados.telefone?.trim(),
      contato:       dados.contato?.trim(),
      endereco:      dados.endereco?.trim(),
      cep:           dados.cep?.replace(/\D/g, ""),
      cidade:        dados.cidade?.trim(),
      uf:            dados.uf?.trim(),
      codigo_integracao: `LHG-FORN-${Date.now()}`,
    });
  } catch (err) {
    return { erro: `Erro ao criar no Omie: ${err instanceof Error ? err.message : "Erro desconhecido"}` };
  }

  const { data: novoForn, error: insertErr } = await supabase
    .from("fornecedores")
    .insert({
      razao_social:         dados.razao_social.trim(),
      cnpj:                 cnpjLimpo,
      nome_fantasia:        dados.nome_fantasia.trim(),
      email:                dados.email?.trim() || null,
      telefone:             dados.telefone?.trim() || null,
      contato:              dados.contato?.trim() || null,
      endereco:             dados.endereco?.trim() || null,
      cep:                  dados.cep?.replace(/\D/g, "") || null,
      cidade:               dados.cidade?.trim() || null,
      uf:                   dados.uf?.trim() || null,
      omie_codigo:          String(omieCodigoCli),
      omie_sincronizado_em: new Date().toISOString(),
      omie_unidade_id:      dados.unidade_id,
    })
    .select("id")
    .single();

  if (insertErr || !novoForn) {
    console.error(`[criarFornecedor] Supabase insert falhou após Omie sucesso (omie_codigo=${omieCodigoCli}):`, insertErr?.message);
    return { erro: insertErr?.message ?? "Erro ao salvar no banco de dados" };
  }

  revalidatePath("/fornecedores");
  return { ok: true, id: novoForn.id };
}
