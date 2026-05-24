"use server";

/**
 * actions.ts — LHG-210/211
 * Server Actions para o módulo de Cotações.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

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
      await supabase.from("cotacao_itens").insert(
        reqItens.map(i => ({
          cotacao_id: cot.id,
          produto_id: i.produto_id,
          quantidade: i.quantidade,
        })),
      );
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
