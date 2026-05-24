"use server";

/**
 * actions.ts — LHG-216/217
 * Server Actions para o módulo de Entrada de Notas Fiscais.
 * v2: entrada via número da NF + consulta Omie + classificação por família.
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
  descricao_omie: z.string().optional().nullable(),
  familia_omie:   z.string().optional().nullable(),
  qtd_nf:         z.number().nullable(),
  preco_nf:       z.number().nullable(),
  // Campos legados (PC × NF) — opcionais no novo fluxo
  produto_id:     z.string().uuid().optional().nullable(),
  qtd_pedido:     z.number().nullable().optional(),
  preco_pedido:   z.number().nullable().optional(),
  divergencia:    z.enum(["ok", "preco", "qtd", "extra", "faltante"]).default("ok"),
});

const RegistrarNFSchema = z.object({
  // Pedido é opcional agora
  pedido_id:     z.string().uuid().optional().nullable(),
  fornecedor_id: z.string().uuid().optional().nullable(),
  unidade_id:    z.string().uuid().optional().nullable(),
  // Dados da NF
  chave_acesso:  z.string().min(44).max(44).optional().nullable(),
  numero:        z.string().optional(),
  omie_num_nf:   z.string().optional(),
  serie:         z.string().optional(),
  emissao:       z.string().optional(),
  valor_total:   z.number().positive().optional(),
  itens:         z.array(NfItemInputSchema),
});

export async function registrarNF(input: z.infer<typeof RegistrarNFSchema>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = RegistrarNFSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos");

  const {
    pedido_id, fornecedor_id, unidade_id,
    chave_acesso, numero, omie_num_nf, serie, emissao, valor_total,
    itens,
  } = parsed.data;

  // Verificar duplicidade por chave_acesso (quando disponível)
  if (chave_acesso) {
    const { data: existente } = await supabase
      .from("notas_fiscais")
      .select("id")
      .eq("chave_acesso", chave_acesso)
      .maybeSingle();
    if (existente) throw new Error("NF com essa chave de acesso já registrada");
  }

  // Verificar duplicidade por número + unidade
  if (omie_num_nf && unidade_id) {
    const { data: existente } = await supabase
      .from("notas_fiscais")
      .select("id")
      .eq("omie_num_nf", omie_num_nf)
      .eq("unidade_id", unidade_id)
      .maybeSingle();
    if (existente) throw new Error(`NF ${omie_num_nf} já registrada para esta unidade`);
  }

  // Inserir NF
  const { data: nf, error: nfErr } = await supabase
    .from("notas_fiscais")
    .insert({
      pedido_id:     pedido_id ?? null,
      fornecedor_id: fornecedor_id ?? null,
      unidade_id:    unidade_id ?? null,
      chave_acesso:  chave_acesso ?? null,
      numero:        numero ?? null,
      omie_num_nf:   omie_num_nf ?? null,
      serie:         serie ?? null,
      emissao:       emissao ?? null,
      valor_total:   valor_total ?? null,
      status:        "conferencia",
    })
    .select("id")
    .single();

  if (nfErr || !nf) throw new Error(nfErr?.message ?? "Erro ao registrar NF");

  // Inserir itens
  if (itens.length > 0) {
    const { error: itensErr } = await supabase
      .from("nf_itens")
      .insert(itens.map(i => ({
        nf_id:          nf.id,
        descricao_omie: i.descricao_omie ?? null,
        familia_omie:   i.familia_omie ?? null,
        qtd_nf:         i.qtd_nf,
        preco_nf:       i.preco_nf,
        produto_id:     i.produto_id ?? null,
        qtd_pedido:     i.qtd_pedido ?? null,
        preco_pedido:   i.preco_pedido ?? null,
        divergencia:    i.divergencia ?? "ok",
      })));
    if (itensErr) throw new Error(itensErr.message);
  }

  // Se tem pedido, atualizar para em_transito
  if (pedido_id) {
    await supabase
      .from("pedidos")
      .update({ status: "em_transito" })
      .eq("id", pedido_id)
      .eq("status", "enviado");
  }

  revalidatePath("/notas-fiscais");
  if (pedido_id) revalidatePath("/pedidos");

  return { id: nf.id };
}

// ── lancarNFOmie ───────────────────────────────────────────────────────────────

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
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr;
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return [
        String(d.getDate()).padStart(2, "0"),
        String(d.getMonth() + 1).padStart(2, "0"),
        d.getFullYear(),
      ].join("/");
    }
  } catch { /* ignora */ }
  return today();
}

export async function lancarNFOmie(nfId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: nf, error: nfErr } = await supabase
    .from("notas_fiscais")
    .select(`
      id, chave_acesso, numero, omie_num_nf, serie, emissao, valor_total, lancada_no_omie,
      fornecedores!notas_fiscais_fornecedor_id_fkey(cnpj, omie_codigo, razao_social),
      pedidos(
        id,
        fornecedores(cnpj, omie_codigo, razao_social),
        pedido_unidades(unidades(omie_app_key, omie_app_secret))
      ),
      unidades!notas_fiscais_unidade_id_fkey(omie_app_key, omie_app_secret),
      nf_itens(
        id, qtd_nf, preco_nf, divergencia, descricao_omie,
        produtos(id, codigo, nome, omie_codigo, ncm, unidade_med, ean)
      )
    `)
    .eq("id", nfId)
    .single();

  if (nfErr || !nf) throw new Error("NF não encontrada");
  if (nf.lancada_no_omie) throw new Error("NF já foi lançada no Omie");

  // ── Resolver credenciais Omie ─────────────────────────────────────────────────
  type UnitCreds = { omie_app_key: string | null; omie_app_secret: string | null } | null;
  type PedidoType = {
    fornecedores: { cnpj: string | null; omie_codigo: string | null; razao_social: string } | null;
    pedido_unidades: Array<{ unidades: UnitCreds }>;
  } | null;

  const unidadeDireta = nf.unidades as UnitCreds;
  const pedido = nf.pedidos as PedidoType;
  const unidadePedido = pedido?.pedido_unidades?.[0]?.unidades ?? null;
  const unidade = (unidadeDireta?.omie_app_key ? unidadeDireta : unidadePedido) as UnitCreds;

  if (!unidade?.omie_app_key || !unidade?.omie_app_secret) {
    throw new Error("Unidade sem credenciais Omie. Configure em Admin → Unidades.");
  }

  const creds: OmieCredentials = {
    appKey:    String(unidade.omie_app_key),
    appSecret: String(unidade.omie_app_secret),
  };

  // ── Resolver fornecedor ───────────────────────────────────────────────────────
  type FornType = { cnpj: string | null; omie_codigo: string | null; razao_social: string } | null;
  const fornDireto = nf.fornecedores as FornType;
  const fornPedido = (pedido?.fornecedores as FornType) ?? null;
  const fornecedor = fornDireto ?? fornPedido;

  if (!fornecedor) throw new Error("Fornecedor não encontrado para esta NF");

  // ── Montar itens ──────────────────────────────────────────────────────────────
  type NfItemType = {
    qtd_nf: number | null;
    preco_nf: number | null;
    divergencia: string;
    descricao_omie: string | null;
    produtos: {
      codigo: string; nome: string;
      omie_codigo: string | null; ncm: string | null;
      unidade_med: string; ean: string | null;
    } | null;
  };

  const nfItens = (nf.nf_itens as NfItemType[]) ?? [];
  const det: OmieNotaEntradaDet[] = nfItens
    .filter(i => i.divergencia !== "faltante" && i.qtd_nf && i.preco_nf)
    .map((item, idx) => {
      const qtd = item.qtd_nf!;
      const vu  = item.preco_nf!;
      const prod = item.produtos;
      return {
        nItem:      idx + 1,
        cCodProd:   prod?.omie_codigo ?? prod?.codigo ?? `ITEM-${idx + 1}`,
        cDescrProd: prod?.nome ?? item.descricao_omie ?? `Item ${idx + 1}`,
        cUnid:      prod?.unidade_med || "UN",
        nQtde:      qtd,
        nValUnit:   vu,
        nValTotal:  Math.round(qtd * vu * 100) / 100,
        ...(prod?.ncm ? { cCodNCM: prod.ncm } : {}),
        ...(prod?.ean ? { cEAN:    prod.ean } : {}),
      };
    });

  if (det.length === 0) throw new Error("NF sem itens válidos para lançar no Omie");

  const payload = {
    nCodNota:        0,
    cNumNF:          nf.numero ?? nf.omie_num_nf ?? "",
    cSerie:          nf.serie ?? "1",
    dDtEmissao:      toOmieDate(nf.emissao),
    dDtEntrada:      toOmieDate(null),
    cChaveNFe:       nf.chave_acesso ?? "",
    nValorTotalNota: nf.valor_total ?? 0,
    cFinNFe:         "1",
    det,
    ...(fornecedor.omie_codigo
      ? { nCodFornecedor: Number(fornecedor.omie_codigo) }
      : { cCNPJFornecedor: String(fornecedor.cnpj ?? "").replace(/\D/g, "") }
    ),
  };

  let omieNodNota: number;
  try {
    const resultado = await incluirNotaEntrada(creds, payload);
    omieNodNota = resultado.nCodNota;
  } catch (err) {
    const msg = err instanceof OmieError ? `Omie: ${err.message}` : "Erro ao lançar no Omie";
    await supabase.from("notas_fiscais").update({ status: "erro_omie" }).eq("id", nfId);
    throw new Error(msg);
  }

  await supabase
    .from("notas_fiscais")
    .update({ lancada_no_omie: true, lancada_em: new Date().toISOString(), status: "lancada" })
    .eq("id", nfId);

  revalidatePath("/notas-fiscais");
  return { ok: true, omieNodNota };
}

// ── atualizarDecisaoItem ───────────────────────────────────────────────────────

export async function atualizarDecisaoItem(itemId: string, decisao: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("nf_itens").update({ decisao }).eq("id", itemId);
  if (error) throw new Error(error.message);
  revalidatePath("/notas-fiscais");
}
