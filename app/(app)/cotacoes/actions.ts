"use server";

/**
 * actions.ts — LHG-210/211/212/220
 * Server Actions para o módulo de Cotações.
 *   LHG-212: enviarEmailCotacao — solicita cotação por email via Resend
 *   LHG-220: editarCotacao + Omie Requisição de Compra sync
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { incluirReq, upsertReq, excluirReq, type OmieReqParam } from "@/lib/omie/requisicao";
import { OmieError } from "@/lib/omie/client";

// ── Helper: monta payload da Requisição Omie a partir dos dados da cotação ──────

interface CotacaoParaReqOmie {
  id:     string;
  prazo:  string | null;
  cotacao_itens: Array<{
    id:         string;
    quantidade: number;
    produtos:   { omie_codigo: string | null } | null;
    cotacao_matriz: Array<{ preco_unitario: number | null }>;
  }>;
  cotacao_fornecedores: Array<{
    fornecedores: { nome_fantasia: string | null; razao_social: string } | null;
  }>;
}

function buildReqOmieParam(cot: CotacaoParaReqOmie): OmieReqParam {
  const fornName = cot.cotacao_fornecedores[0]?.fornecedores?.nome_fantasia
    ?? cot.cotacao_fornecedores[0]?.fornecedores?.razao_social
    ?? "";

  let dtSugestao: string | undefined;
  if (cot.prazo) {
    const d = new Date(cot.prazo.includes("T") ? cot.prazo : `${cot.prazo}T12:00:00`);
    if (!isNaN(d.getTime())) {
      dtSugestao = [
        String(d.getDate()).padStart(2, "0"),
        String(d.getMonth() + 1).padStart(2, "0"),
        d.getFullYear(),
      ].join("/");
    }
  }

  const itens = cot.cotacao_itens.map((item) => {
    const preco = item.cotacao_matriz[0]?.preco_unitario ?? 0;
    const codProduto = item.produtos?.omie_codigo
      ? { codProd: Number(item.produtos.omie_codigo) }
      : {};
    return {
      codIntItem: item.id,
      ...codProduto,
      qtde:      item.quantidade,
      precoUnit: preco,
    };
  });

  return {
    // TODO Fase 2: este sync cotação→Omie será removido. codCateg placeholder.
    codCateg:        "",
    codIntReqCompra: cot.id,
    dtSugestao,
    obsReqCompra: fornName ? `Fornecedor: ${fornName}` : undefined,
    ItensReqCompra: itens,
  };
}

// ── deletarCotacao ────────────────────────────────────────────────────────────

export async function deletarCotacao(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: cot, error: fetchErr } = await supabase
    .from("cotacoes")
    .select("id, status, numero, omie_codigo, cotacao_unidades(unidades(omie_app_key, omie_app_secret))")
    .eq("id", id)
    .single();

  if (fetchErr || !cot) throw new Error("Cotação não encontrada");

  if (cot.status === "aprovado") {
    throw new Error("Não é possível excluir uma cotação já aprovada (pedidos já foram gerados).");
  }

  // Tentar ExcluirReq no Omie antes de deletar (não bloqueia se falhar)
  type UnidRow = { unidades: { omie_app_key: string | null; omie_app_secret: string | null } | null };
  const unids = cot.cotacao_unidades as UnidRow[] | null;
  const unid  = unids?.[0]?.unidades;

  if (cot.omie_codigo && unid?.omie_app_key && unid?.omie_app_secret) {
    try {
      await excluirReq(
        { appKey: unid.omie_app_key, appSecret: unid.omie_app_secret },
        cot.id,
      );
    } catch (err) {
      console.warn("[deletarCotacao] ExcluirReq Omie falhou (não bloqueia):", err instanceof Error ? err.message : err);
    }
  }

  // Remove filhos na ordem correta (FK: matriz → itens → fornecedores → unidades → cotação)
  const { data: itens } = await supabase
    .from("cotacao_itens")
    .select("id")
    .eq("cotacao_id", id);

  if (itens?.length) {
    await supabase
      .from("cotacao_matriz")
      .delete()
      .in("cotacao_item_id", itens.map(i => i.id));
  }

  await supabase.from("cotacao_itens").delete().eq("cotacao_id", id);
  await supabase.from("cotacao_fornecedores").delete().eq("cotacao_id", id);
  await supabase.from("cotacao_unidades").delete().eq("cotacao_id", id);

  const { error: deleteErr } = await supabase
    .from("cotacoes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (deleteErr) throw new Error(`Erro ao excluir cotação: ${(deleteErr as { message: string }).message}`);

  revalidatePath("/cotacoes");
  return { numero: cot.numero };
}

// ── criarCotacao ──────────────────────────────────────────────────────────────

const NovaCotacaoSchema = z.object({
  titulo:        z.string().min(3),
  requisicao_id: z.string().uuid().optional(),
  urgente:       z.boolean().optional(),
});

export async function criarCotacao(input: z.infer<typeof NovaCotacaoSchema>) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = NovaCotacaoSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos");

  const { titulo, requisicao_id, urgente } = parsed.data;

  // Gerar número sequencial
  const year = new Date().getFullYear();
  const { data: lastCot } = await supabase
    .from("cotacoes")
    .select("numero")
    .like("numero", `COT-${year}-%`)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastNum = lastCot ? parseInt(lastCot.numero.split("-")[2] ?? "0", 10) : 0;
  const numero  = `COT-${year}-${String(lastNum + 1).padStart(4, "0")}`;

  const { data: cot, error } = await supabase
    .from("cotacoes")
    .insert({
      numero,
      titulo,
      requisicao_id: requisicao_id || null,
      comprador_id:  user.id,
      urgente:       urgente ?? false,
      status:        "rascunho",
    })
    .select()
    .single();

  if (error || !cot) throw new Error(error?.message ?? "Erro ao criar cotação");

  // Se veio de requisição, copiar itens e unidades
  if (requisicao_id) {
    const [{ data: reqItens }, { data: reqUnidades }] = await Promise.all([
      supabase
        .from("requisicao_itens")
        .select("produto_id, quantidade, observacao")
        .eq("requisicao_id", requisicao_id),
      supabase
        .from("requisicao_unidades")
        .select("unidade_id")
        .eq("requisicao_id", requisicao_id),
    ]);

    if (reqItens?.length) {
      const itensComProduto = reqItens.filter((i): i is typeof i & { produto_id: string } => i.produto_id != null);
      if (itensComProduto.length) {
        await supabase.from("cotacao_itens").insert(
          itensComProduto.map(i => ({
            cotacao_id: cot.id,
            produto_id: i.produto_id,
            quantidade: i.quantidade,
          })),
        );
      }
    }

    if (reqUnidades?.length) {
      await supabase.from("cotacao_unidades").insert(
        reqUnidades.map(u => ({ cotacao_id: cot.id, unidade_id: u.unidade_id })),
      );
    }

    // Atualizar status da requisição para 'cotacao'
    await supabase
      .from("requisicoes")
      .update({ status: "cotacao" })
      .eq("id", requisicao_id);
  }

  // ── Sync Omie: IncluirReq (não bloqueia se falhar) ────────────────────────
  if (requisicao_id) {
    try {
      const { data: unidRows } = await supabase
        .from("cotacao_unidades")
        .select("unidades(omie_app_key, omie_app_secret)")
        .eq("cotacao_id", cot.id)
        .limit(1);

      type UnidRow = { unidades: { omie_app_key: string | null; omie_app_secret: string | null } | null };
      const unid = (unidRows as UnidRow[] | null)?.[0]?.unidades;

      if (unid?.omie_app_key && unid?.omie_app_secret) {
        const { data: cotItens } = await supabase
          .from("cotacao_itens")
          .select("id, quantidade, produtos(omie_codigo), cotacao_matriz(preco_unitario)")
          .eq("cotacao_id", cot.id);

        const { data: cotForns } = await supabase
          .from("cotacao_fornecedores")
          .select("fornecedores(nome_fantasia, razao_social)")
          .eq("cotacao_id", cot.id);

        type CotItemRow = { id: string; quantidade: number; produtos: { omie_codigo: string | null } | null; cotacao_matriz: Array<{ preco_unitario: number | null }> };
        type CotFornRow = { fornecedores: { nome_fantasia: string | null; razao_social: string } | null };

        const param = buildReqOmieParam({
          id: cot.id,
          prazo: null,
          cotacao_itens: (cotItens as CotItemRow[] | null) ?? [],
          cotacao_fornecedores: (cotForns as CotFornRow[] | null) ?? [],
        });

        const nCodReq = await incluirReq(
          { appKey: unid.omie_app_key, appSecret: unid.omie_app_secret },
          param,
        );

        if (nCodReq) {
          await supabase
            .from("cotacoes")
            .update({ omie_codigo: String(nCodReq), omie_sincronizado_em: new Date().toISOString() })
            .eq("id", cot.id);
        }
      }
    } catch (err) {
      console.warn("[criarCotacao] IncluirReq Omie falhou (não bloqueia):", err instanceof Error ? err.message : err);
    }
  }

  revalidatePath("/cotacoes");
  return { id: cot.id, numero: cot.numero };
}

// ── selecionarFornecedorItem ──────────────────────────────────────────────────

export async function selecionarFornecedorItem(
  cotacaoItemId: string,
  fornecedorId: string | null,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("cotacao_itens")
    .update({ selecionado_forn: fornecedorId })
    .eq("id", cotacaoItemId);

  if (error) throw new Error(error.message);
  revalidatePath("/cotacoes");
}

// ── upsertMatrizCell ──────────────────────────────────────────────────────────

const MatrizCellSchema = z.object({
  cotacao_item_id:    z.string().uuid(),
  fornecedor_id:      z.string().uuid(),
  preco_unitario:     z.number().positive().nullable(),
  prazo_entrega_dias: z.number().int().min(0).nullable().optional(),
  condicao_pagamento: z.string().optional(),
});

export async function upsertMatrizCell(input: z.infer<typeof MatrizCellSchema>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = MatrizCellSchema.safeParse(input);
  if (!parsed.success) throw new Error("Dados inválidos");

  const { error } = await supabase
    .from("cotacao_matriz")
    .upsert({
      ...parsed.data,
      cotado_em: new Date().toISOString(),
    }, { onConflict: "cotacao_item_id,fornecedor_id" });

  if (error) throw new Error(error.message);
  revalidatePath("/cotacoes");
}

// ── adicionarFornecedorCotacao ────────────────────────────────────────────────

export async function adicionarFornecedorCotacao(
  cotacaoId: string,
  fornecedorIds: string[],
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!fornecedorIds.length) return;

  const { error } = await supabase
    .from("cotacao_fornecedores")
    .upsert(
      fornecedorIds.map(id => ({ cotacao_id: cotacaoId, fornecedor_id: id })),
      { onConflict: "cotacao_id,fornecedor_id" },
    );

  if (error) throw new Error(error.message);
  revalidatePath(`/cotacoes/${cotacaoId}`);
}

// ── gerarPedidosDeCotacao ─────────────────────────────────────────────────────

export async function gerarPedidosDeCotacao(
  cotacaoId: string,
  selecoes: Record<string, string | null>,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Buscar itens da cotação com células da matriz
  const { data: itens, error: itensErr } = await supabase
    .from("cotacao_itens")
    .select("id, quantidade, produto_id, cotacao_matriz(fornecedor_id, preco_unitario, condicao_pagamento)")
    .eq("cotacao_id", cotacaoId);

  if (itensErr || !itens) throw new Error(itensErr?.message ?? "Erro ao buscar itens");

  // Agrupar por fornecedor
  const grupos = new Map<string, { preco_unitario: number; quantidade: number; produto_id: string; condicao_pgto: string | null }[]>();

  for (const item of itens) {
    const fornId = selecoes[item.id];
    if (!fornId) continue;

    const cell = item.cotacao_matriz.find(c => c.fornecedor_id === fornId);
    if (!cell || !cell.preco_unitario) continue;

    if (!grupos.has(fornId)) grupos.set(fornId, []);
    grupos.get(fornId)!.push({
      preco_unitario: cell.preco_unitario,
      quantidade:     item.quantidade,
      produto_id:     item.produto_id,
      condicao_pgto:  cell.condicao_pagamento,
    });
  }

  if (grupos.size === 0) throw new Error("Nenhum item selecionado");

  // Gerar número sequencial PED-YYYY-NNNN
  const year = new Date().getFullYear();
  const { data: lastPed } = await supabase
    .from("pedidos")
    .select("numero")
    .like("numero", `PED-${year}-%`)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();

  let lastNum = lastPed ? parseInt(lastPed.numero.split("-")[2] ?? "0", 10) : 0;

  // Criar um pedido por fornecedor
  for (const [fornId, linhas] of grupos) {
    lastNum++;
    const numero      = `PED-${year}-${String(lastNum).padStart(4, "0")}`;
    const valor_total = linhas.reduce((acc, l) => acc + l.preco_unitario * l.quantidade, 0);
    const condicao    = linhas[0]?.condicao_pgto ?? null;

    const { data: pedido, error: pedErr } = await supabase
      .from("pedidos")
      .insert({
        numero,
        cotacao_id:    cotacaoId,
        fornecedor_id: fornId,
        comprador_id:  user.id,
        status:        "aguardando_aprovacao",
        valor_total,
        condicao_pgto: condicao,
      })
      .select("id")
      .single();

    if (pedErr || !pedido) throw new Error(pedErr?.message ?? "Erro ao criar pedido");

    // Criar itens do pedido
    const { error: itensInsErr } = await supabase
      .from("pedido_itens")
      .insert(
        linhas.map(l => ({
          pedido_id:      pedido.id,
          produto_id:     l.produto_id,
          quantidade:     l.quantidade,
          preco_unitario: l.preco_unitario,
          valor_total:    l.preco_unitario * l.quantidade,
        })),
      );

    if (itensInsErr) throw new Error(itensInsErr.message);
  }

  // Atualizar status da cotação para "aprovado" (pedidos gerados)
  await supabase
    .from("cotacoes")
    .update({ status: "aprovado" })
    .eq("id", cotacaoId);

  revalidatePath("/cotacoes");
  revalidatePath("/pedidos");
}

// ── editarCotacao ─────────────────────────────────────────────────────────────

const EditarCotacaoSchema = z.object({
  titulo:  z.string().min(3),
  urgente: z.boolean().optional(),
  prazo:   z.string().nullable().optional(),
});

export async function editarCotacao(
  id: string,
  input: z.infer<typeof EditarCotacaoSchema>,
): Promise<{ ok: true } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = EditarCotacaoSchema.safeParse(input);
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const { data: cot, error: fetchErr } = await supabase
    .from("cotacoes")
    .select(`
      id, status, omie_codigo, prazo,
      cotacao_unidades(unidades(omie_app_key, omie_app_secret)),
      cotacao_itens(
        id, quantidade,
        produtos(omie_codigo),
        cotacao_matriz(preco_unitario)
      ),
      cotacao_fornecedores(fornecedores(nome_fantasia, razao_social))
    `)
    .eq("id", id)
    .single();

  if (fetchErr || !cot) return { erro: "Cotação não encontrada" };
  if (!["rascunho", "cotacao"].includes(cot.status)) {
    return { erro: "Apenas cotações em rascunho ou em cotação podem ser editadas" };
  }

  const { error: updateErr } = await supabase
    .from("cotacoes")
    .update({
      titulo:  parsed.data.titulo.trim(),
      urgente: parsed.data.urgente ?? false,
      prazo:   parsed.data.prazo ?? null,
    })
    .eq("id", id);

  if (updateErr) return { erro: updateErr.message };

  // UpsertReq no Omie (não bloqueia)
  type UnidRow = { unidades: { omie_app_key: string | null; omie_app_secret: string | null } | null };
  const unid = (cot.cotacao_unidades as UnidRow[])?.[0]?.unidades;

  if (unid?.omie_app_key && unid?.omie_app_secret) {
    try {
      type CotItemRow = { id: string; quantidade: number; produtos: { omie_codigo: string | null } | null; cotacao_matriz: Array<{ preco_unitario: number | null }> };
      type CotFornRow = { fornecedores: { nome_fantasia: string | null; razao_social: string } | null };

      const param = buildReqOmieParam({
        id: cot.id,
        prazo: parsed.data.prazo ?? cot.prazo ?? null,
        cotacao_itens: (cot.cotacao_itens as CotItemRow[]) ?? [],
        cotacao_fornecedores: (cot.cotacao_fornecedores as CotFornRow[]) ?? [],
      });

      await upsertReq(
        { appKey: unid.omie_app_key, appSecret: unid.omie_app_secret },
        param,
      );

      await supabase
        .from("cotacoes")
        .update({ omie_sincronizado_em: new Date().toISOString() })
        .eq("id", id);
    } catch (err) {
      console.warn("[editarCotacao] UpsertReq Omie falhou (não bloqueia):", err instanceof OmieError ? err.message : err);
    }
  }

  revalidatePath("/cotacoes");
  return { ok: true };
}

// ── enviarEmailCotacao (LHG-212) ──────────────────────────────────────────────

/**
 * Envia email de solicitação de cotação aos fornecedores via Resend.
 * Pode enviar a todos os fornecedores da cotação ou apenas a um específico.
 * Rastreia envio em cotacao_fornecedores.email_enviado_em.
 */
export async function enviarEmailCotacao(
  cotacaoId: string,
  opcoes?: { fornecedorId?: string; mensagem?: string },
): Promise<{ enviados: number; erros: string[] }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Buscar cotação com itens e fornecedores
  const { data: cotacao, error: cotErr } = await supabase
    .from("cotacoes")
    .select(`
      numero, titulo, prazo, urgente,
      cotacao_itens (
        quantidade,
        produtos ( nome, unidade_med, codigo )
      ),
      cotacao_fornecedores (
        fornecedor_id,
        fornecedores ( razao_social, nome_fantasia, email )
      )
    `)
    .eq("id", cotacaoId)
    .single();

  if (cotErr || !cotacao) throw new Error(cotErr?.message ?? "Cotação não encontrada");

  // Filtrar fornecedores-alvo
  type FornRow = {
    fornecedor_id: string;
    fornecedores: { razao_social: string; nome_fantasia: string | null; email: string | null } | null;
  };
  const fornRows = cotacao.cotacao_fornecedores as FornRow[];
  const alvos = opcoes?.fornecedorId
    ? fornRows.filter((f) => f.fornecedor_id === opcoes.fornecedorId)
    : fornRows;

  if (alvos.length === 0) throw new Error("Nenhum fornecedor para envio");

  type ItemRow = { quantidade: number; produtos: { nome: string; unidade_med: string; codigo: string } | null };
  const itens = cotacao.cotacao_itens as ItemRow[];

  const prazoLabel = cotacao.prazo
    ? new Date(cotacao.prazo).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
    : null;

  const resendKey = process.env.RESEND_API_KEY;
  const enviados: string[] = [];
  const erros: string[] = [];

  for (const row of alvos) {
    const forn = row.fornecedores;
    if (!forn?.email) {
      erros.push(`${forn?.razao_social ?? "Fornecedor"}: sem e-mail cadastrado`);
      continue;
    }

    const fornNome = forn.nome_fantasia ?? forn.razao_social;

    const itensLinhas = itens
      .map(
        (i) =>
          `<tr>
            <td style="padding:6px 12px;border-bottom:1px solid #27272a;font-size:13px;color:#e4e4e7">${i.produtos?.nome ?? "Produto"}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #27272a;text-align:center;font-size:13px;color:#a1a1aa">${i.produtos?.codigo ?? ""}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #27272a;text-align:center;font-size:13px;color:#a1a1aa">${i.quantidade}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #27272a;text-align:center;font-size:13px;color:#a1a1aa">${i.produtos?.unidade_med ?? "UN"}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #27272a;text-align:right;font-size:13px;color:#71717a">__________</td>
          </tr>`,
      )
      .join("");

    const htmlBody = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#09090b;font-family:Arial,sans-serif">
  <div style="max-width:640px;margin:40px auto;background:#18181b;border:1px solid #27272a;border-radius:12px;overflow:hidden">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#10b981,#059669);padding:24px 32px">
      <p style="margin:0;font-size:11px;color:#d1fae5;letter-spacing:0.12em;text-transform:uppercase">LHG Motéis · Departamento de Compras</p>
      <h1 style="margin:6px 0 0;font-size:20px;color:#fff;font-weight:700">Solicitação de Cotação</h1>
      <p style="margin:4px 0 0;font-size:13px;color:#a7f3d0">${cotacao.numero}${cotacao.urgente ? " · <strong>URGENTE</strong>" : ""}</p>
    </div>
    <!-- Body -->
    <div style="padding:28px 32px">
      <p style="margin:0 0 16px;font-size:14px;color:#a1a1aa">
        Prezado(a) <strong style="color:#e4e4e7">${fornNome}</strong>,
      </p>
      <p style="margin:0 0 20px;font-size:14px;color:#a1a1aa;line-height:1.6">
        Solicitamos sua melhor cotação para os itens listados abaixo referente a:
        <strong style="color:#e4e4e7"> ${cotacao.titulo}</strong>.
      </p>
      ${
        opcoes?.mensagem
          ? `<div style="background:#27272a;border-left:3px solid #10b981;border-radius:4px;padding:12px 16px;margin-bottom:20px">
               <p style="margin:0;font-size:13px;color:#d4d4d8">${opcoes.mensagem}</p>
             </div>`
          : ""
      }
      <!-- Tabela de itens -->
      <table style="width:100%;border-collapse:collapse;background:#09090b;border-radius:8px;overflow:hidden;border:1px solid #27272a;margin-bottom:20px">
        <thead>
          <tr style="background:#27272a">
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.08em">Produto</th>
            <th style="padding:8px 12px;text-align:center;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.08em">Código</th>
            <th style="padding:8px 12px;text-align:center;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.08em">Qtd</th>
            <th style="padding:8px 12px;text-align:center;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.08em">Un.</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.08em">Preço Unit.</th>
          </tr>
        </thead>
        <tbody>${itensLinhas}</tbody>
      </table>
      <!-- Prazo e instruções -->
      ${
        prazoLabel
          ? `<div style="background:#27272a;border-radius:8px;padding:14px 16px;margin-bottom:16px">
               <p style="margin:0;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.08em">Prazo para resposta</p>
               <p style="margin:4px 0 0;font-size:15px;font-weight:700;color:#f59e0b">${prazoLabel}</p>
             </div>`
          : ""
      }
      <p style="margin:0;font-size:13px;color:#71717a;line-height:1.6">
        Por favor, responda com o preço unitário de cada item, prazo de entrega e condições de pagamento.
        Para dúvidas, entre em contato com o setor de compras.
      </p>
    </div>
    <!-- Footer -->
    <div style="padding:16px 32px;border-top:1px solid #27272a;text-align:center">
      <p style="margin:0;font-size:11px;color:#52525b">
        Departamento de Compras — LHG Motéis · compras@lhgmoteis.com.br
      </p>
    </div>
  </div>
</body>
</html>`;

    if (resendKey) {
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(resendKey);

        await resend.emails.send({
          from:    "Compras LHG Motéis <compras@lhgmoteis.com.br>",
          to:      [forn.email],
          subject: `Solicitação de Cotação ${cotacao.numero} — LHG Motéis`,
          html:    htmlBody,
        });

        enviados.push(forn.email);
      } catch (err) {
        erros.push(`${fornNome}: ${err instanceof Error ? err.message : "Erro desconhecido"}`);
        continue;
      }
    } else {
      // Modo simulado — registra sem enviar
      enviados.push(`${forn.email} (simulado)`);
    }

    // Atualizar timestamp de envio no banco
    await supabase
      .from("cotacao_fornecedores")
      .update({ email_enviado_em: new Date().toISOString() })
      .eq("cotacao_id", cotacaoId)
      .eq("fornecedor_id", row.fornecedor_id);
  }

  revalidatePath(`/cotacoes/${cotacaoId}`);
  return { enviados: enviados.length, erros };
}

// ── atribuirFornecedorVencedor ─────────────────────────────────────────────────

/**
 * Marca o fornecedor vencedor para uma lista de itens da cotação.
 * Usado pelo painel de seleção em massa.
 */
export async function atribuirFornecedorVencedor(
  itemIds: string[],
  fornecedorId: string | null,
): Promise<{ ok: true } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (itemIds.length === 0) return { erro: "Nenhum item selecionado" };

  const { error } = await supabase
    .from("cotacao_itens")
    .update({ selecionado_forn: fornecedorId })
    .in("id", itemIds);

  if (error) return { erro: error.message };

  // Busca o cotacao_id de qualquer item para revalidar a rota
  const { data: item } = await supabase
    .from("cotacao_itens")
    .select("cotacao_id")
    .eq("id", itemIds[0])
    .single();

  if (item?.cotacao_id) revalidatePath(`/cotacoes/${item.cotacao_id}`);

  return { ok: true };
}
