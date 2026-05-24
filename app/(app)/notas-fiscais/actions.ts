"use server";

/**
 * actions.ts — LHG-216/217
 * Server Actions para o módulo de Entrada de Notas Fiscais.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  incluirNotaEntrada,
  OmieError,
  type OmieCredentials,
  type OmieNotaEntradaDet,
} from "@/lib/omie/client";

// ── registrarNF ────────────────────────────────────────────────────────────────

const NfItemInputSchema = z.object({
  produto_id:    z.string().uuid().optional().nullable(),
  qtd_nf:        z.number().nullable(),
  preco_nf:      z.number().nullable(),
  qtd_pedido:    z.number().nullable(),
  preco_pedido:  z.number().nullable(),
  divergencia:   z.enum(["ok", "preco", "qtd", "extra", "faltante"]),
});

const RegistrarNFSchema = z.object({
  pedido_id:    z.string().uuid(),
  chave_acesso: z.string().min(44).max(44),
  numero:       z.string().optional(),
  serie:        z.string().optional(),
  emissao:      z.string().optional(),
  valor_total:  z.number().positive().optional(),
  xml_url:      z.string().optional(),
  itens:        z.array(NfItemInputSchema),
});

export async function registrarNF(input: z.infer<typeof RegistrarNFSchema>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = RegistrarNFSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos");

  const { pedido_id, chave_acesso, numero, serie, emissao, valor_total, xml_url, itens } = parsed.data;

  // Verificar se já existe NF com essa chave
  const { data: existente } = await supabase
    .from("notas_fiscais")
    .select("id")
    .eq("chave_acesso", chave_acesso)
    .maybeSingle();

  if (existente) throw new Error("NF com essa chave de acesso já registrada");

  // Inserir NF
  const { data: nf, error: nfErr } = await supabase
    .from("notas_fiscais")
    .insert({
      pedido_id,
      chave_acesso,
      numero:      numero ?? null,
      serie:       serie ?? null,
      emissao:     emissao ?? null,
      valor_total: valor_total ?? null,
      xml_url:     xml_url ?? null,
      status:      "conferencia",
    })
    .select("id")
    .single();

  if (nfErr || !nf) throw new Error(nfErr?.message ?? "Erro ao registrar NF");

  // Inserir itens com divergências
  if (itens.length > 0) {
    const { error: itensErr } = await supabase
      .from("nf_itens")
      .insert(itens.map(i => ({ nf_id: nf.id, ...i })));

    if (itensErr) throw new Error(itensErr.message);
  }

  // Atualizar pedido para em_transito se estava enviado
  await supabase
    .from("pedidos")
    .update({ status: "em_transito" })
    .eq("id", pedido_id)
    .eq("status", "enviado");

  revalidatePath("/notas-fiscais");
  revalidatePath("/pedidos");

  return { id: nf.id };
}

// ── lancarNFOmie ───────────────────────────────────────────────────────────────

/**
 * Converte uma string de data para o formato DD/MM/YYYY exigido pelo Omie.
 * Aceita ISO 8601 (com ou sem timezone) e DD/MM/YYYY.
 */
function toOmieDate(dateStr: string | null | undefined): string {
  const today = () => {
    const d = new Date();
    return [
      String(d.getDate()).padStart(2, "0"),
      String(d.getMonth() + 1).padStart(2, "0"),
      d.getFullYear(),
    ].join("/");
  };

  if (!dateStr) return today();

  // Já está no formato DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr;

  // ISO 8601 ou YYYY-MM-DD
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return [
        String(d.getDate()).padStart(2, "0"),
        String(d.getMonth() + 1).padStart(2, "0"),
        d.getFullYear(),
      ].join("/");
    }
  } catch {
    // ignora — cai no fallback
  }

  return today();
}

export async function lancarNFOmie(nfId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ── 1. Buscar NF com todos os dados necessários para o Omie ──────────────────
  const { data: nf, error: nfErr } = await supabase
    .from("notas_fiscais")
    .select(`
      id, chave_acesso, numero, serie, emissao, valor_total, lancada_no_omie,
      pedidos(
        id,
        fornecedores(cnpj, omie_codigo, razao_social),
        pedido_unidades(unidades(omie_app_key, omie_app_secret))
      ),
      nf_itens(
        id, qtd_nf, preco_nf, divergencia,
        produtos(id, codigo, nome, omie_codigo, ncm, unidade_med, ean)
      )
    `)
    .eq("id", nfId)
    .single();

  if (nfErr || !nf) throw new Error("NF não encontrada");

  if (nf.lancada_no_omie) throw new Error("NF já foi lançada no Omie");

  // ── 2. Extrair pedido, fornecedor e unidade ───────────────────────────────────
  // Supabase retorna FK como objeto, reverse-FK como array
  const pedido = (nf.pedidos as typeof nf.pedidos extends unknown[] ? (typeof nf.pedidos)[0] : typeof nf.pedidos) ?? null;
  if (!pedido) throw new Error("Pedido associado não encontrado");

  // Fornecedor: FK direta de pedidos.fornecedor_id → fornecedores
  const fornecedor = (pedido.fornecedores as Record<string, unknown> | null);
  if (!fornecedor) throw new Error("Fornecedor do pedido não encontrado");

  // Unidade: via pedido_unidades (array), pega a primeira
  const pedidoUnidades = (pedido.pedido_unidades as Array<{ unidades: Record<string, unknown> | null }>) ?? [];
  const unidade = pedidoUnidades[0]?.unidades ?? null;

  if (!unidade || !unidade.omie_app_key || !unidade.omie_app_secret) {
    throw new Error("Unidade sem credenciais Omie configuradas. Acesse Configurações → Unidades para configurar.");
  }

  const creds: OmieCredentials = {
    appKey:    String(unidade.omie_app_key),
    appSecret: String(unidade.omie_app_secret),
  };

  // ── 3. Montar itens para o Omie (det) ─────────────────────────────────────────
  // Excluir itens "faltante" (estavam no pedido mas não vieram na NF)
  const nfItens = (nf.nf_itens as Array<{
    qtd_nf:      number | null;
    preco_nf:    number | null;
    divergencia: string;
    produtos:    {
      id: string; codigo: string; nome: string;
      omie_codigo: string | null; ncm: string | null;
      unidade_med: string; ean: string | null;
    } | null;
  }>) ?? [];

  const det: OmieNotaEntradaDet[] = nfItens
    .filter(i => i.divergencia !== "faltante" && i.qtd_nf && i.preco_nf && i.produtos)
    .map((item, idx) => {
      const prod = item.produtos!;
      const qtd  = item.qtd_nf!;
      const vu   = item.preco_nf!;
      return {
        nItem:      idx + 1,
        // Preferência: omie_codigo > código interno
        cCodProd:   prod.omie_codigo ?? prod.codigo,
        cDescrProd: prod.nome,
        cUnid:      prod.unidade_med || "UN",
        nQtde:      qtd,
        nValUnit:   vu,
        nValTotal:  Math.round(qtd * vu * 100) / 100,
        ...(prod.ncm ? { cCodNCM: prod.ncm }  : {}),
        ...(prod.ean ? { cEAN:    prod.ean }   : {}),
      };
    });

  // ── 4. Montar payload IncluirNota ─────────────────────────────────────────────
  const dtEmissao = toOmieDate(nf.emissao);
  const dtEntrada = toOmieDate(null); // data de hoje

  const payload = {
    nCodNota:          0,
    cNumNF:            nf.numero   ?? "",
    cSerie:            nf.serie    ?? "1",
    dDtEmissao:        dtEmissao,
    dDtEntrada:        dtEntrada,
    cChaveNFe:         nf.chave_acesso,
    nValorTotalNota:   nf.valor_total ?? 0,
    cFinNFe:           "1",                          // 1 = NF-e normal
    det,
    // Fornecedor: código Omie preferencial, CNPJ como fallback
    ...(fornecedor.omie_codigo
      ? { nCodFornecedor: Number(fornecedor.omie_codigo) }
      : { cCNPJFornecedor: String(fornecedor.cnpj).replace(/\D/g, "") }
    ),
  };

  // ── 5. Chamar API Omie ────────────────────────────────────────────────────────
  let omieNodNota: number;
  try {
    const resultado = await incluirNotaEntrada(creds, payload);
    omieNodNota = resultado.nCodNota;
  } catch (err) {
    const msg = err instanceof OmieError
      ? `Omie: ${err.message}`
      : "Erro desconhecido ao lançar no Omie";

    // Registrar falha na NF para o usuário visualizar
    await supabase
      .from("notas_fiscais")
      .update({ status: "erro_omie" })
      .eq("id", nfId);

    throw new Error(msg);
  }

  // ── 6. Marcar NF como lançada ─────────────────────────────────────────────────
  const { error: updateErr } = await supabase
    .from("notas_fiscais")
    .update({
      lancada_no_omie: true,
      lancada_em:      new Date().toISOString(),
      status:          "lancada",
    })
    .eq("id", nfId);

  if (updateErr) throw new Error(updateErr.message);

  revalidatePath("/notas-fiscais");
  revalidatePath("/pedidos");

  return { ok: true, omieNodNota };
}

// ── atualizarDecisaoItem ───────────────────────────────────────────────────────

export async function atualizarDecisaoItem(itemId: string, decisao: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("nf_itens")
    .update({ decisao })
    .eq("id", itemId);

  if (error) throw new Error(error.message);
  revalidatePath("/notas-fiscais");
}
