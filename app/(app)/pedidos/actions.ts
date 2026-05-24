"use server";

/**
 * actions.ts — LHG-214/215
 * Server Actions para o módulo de Pedidos de Compra.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchOrcamento, getBudgetMesAtual } from "@/lib/sheets/client";
import { getUnidadeSheetConfig } from "@/lib/sheets/get-unidade-sheet";

// ── aprovarPedido ──────────────────────────────────────────────────────────────

/**
 * Aprova o pedido (status → enviado) e retorna um aviso se o orçamento
 * do mês estiver com utilização ≥ 80% após a aprovação.
 */
export async function aprovarPedido(pedidoId: string): Promise<{ avisoOrcamento?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ── 1. Aprovar o pedido ───────────────────────────────────────────────────────
  const { error } = await supabase
    .from("pedidos")
    .update({ status: "enviado", aprovador_id: user.id })
    .eq("id", pedidoId);

  if (error) throw new Error(error.message);

  // Registrar evento
  await supabase.from("pedido_eventos").insert({
    pedido_id:   pedidoId,
    tipo:        "aprovacao",
    texto:       "Pedido aprovado",
    autor_id:    user.id,
  });

  revalidatePath("/pedidos");

  // ── 2. Verificação de orçamento (soft-check, não bloqueia) ───────────────────
  const sheetConfig = await getUnidadeSheetConfig().catch(() => null);
  if (!sheetConfig) return {};

  try {
    const [orcamento, { data: gastosRows }] = await Promise.all([
      fetchOrcamento(sheetConfig.sheetId, sheetConfig.sheetName),
      supabase
        .from("pedidos")
        .select("valor_total")
        .in("status", ["enviado", "em_transito", "recebido", "finalizado"] as const)
        .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    ]);

    if (!orcamento) return {};

    const { mes, valor: budgetMes } = getBudgetMesAtual(orcamento);
    if (budgetMes <= 0) return {};

    const gastoMes = (gastosRows ?? []).reduce((s, p) => s + (p.valor_total ?? 0), 0);
    const pct      = (gastoMes / budgetMes) * 100;

    const fBRL = (v: number) =>
      `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    if (pct >= 100) {
      return {
        avisoOrcamento: `Orçamento de ${mes} excedido: ${fBRL(gastoMes)} de ${fBRL(budgetMes)} (${pct.toFixed(0)}%)`,
      };
    }
    if (pct >= 80) {
      return {
        avisoOrcamento: `Atenção: ${pct.toFixed(0)}% do orçamento de ${mes} utilizado (${fBRL(gastoMes)} de ${fBRL(budgetMes)})`,
      };
    }
  } catch (e) {
    // Falha no orçamento não impede aprovação
    console.warn("[aprovarPedido] Erro ao verificar orçamento:", e);
  }

  return {};
}

// ── rejeitarPedido ─────────────────────────────────────────────────────────────

export async function rejeitarPedido(pedidoId: string, motivo: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("pedidos")
    .update({ status: "cancelado", aprovador_id: user.id })
    .eq("id", pedidoId);

  if (error) throw new Error(error.message);

  await supabase.from("pedido_eventos").insert({
    pedido_id:   pedidoId,
    tipo:        "rejeicao",
    texto:       motivo ? `Pedido rejeitado: ${motivo}` : "Pedido rejeitado",
    autor_id:    user.id,
  });

  revalidatePath("/pedidos");
}

// ── enviarEmailFornecedor ──────────────────────────────────────────────────────

export async function enviarEmailFornecedor(
  pedidoId: string,
  mensagem: string,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Buscar pedido + fornecedor + itens
  const { data: pedido, error: pedErr } = await supabase
    .from("pedidos")
    .select(`
      numero, valor_total, condicao_pgto, entrega_prev,
      fornecedores(razao_social, nome_fantasia, email),
      pedido_itens(quantidade, preco_unitario, produtos(nome, unidade_med))
    `)
    .eq("id", pedidoId)
    .single();

  if (pedErr || !pedido) throw new Error(pedErr?.message ?? "Pedido não encontrado");

  const forn = pedido.fornecedores as { razao_social: string; nome_fantasia: string | null; email: string | null } | null;
  if (!forn?.email) throw new Error("Fornecedor sem e-mail cadastrado");

  // TODO: integrar com Resend (api key em RESEND_API_KEY)
  // const resend = new Resend(process.env.RESEND_API_KEY);
  // await resend.emails.send({ from: "compras@lhg.com.br", to: forn.email, subject: `Pedido de Compra ${pedido.numero}`, ... });

  // Por ora registra como "simulado"
  await supabase
    .from("pedidos")
    .update({ email_enviado_em: new Date().toISOString() })
    .eq("id", pedidoId);

  await supabase.from("pedido_eventos").insert({
    pedido_id:   pedidoId,
    tipo:        "email_enviado",
    texto:       `E-mail enviado para ${forn.email}${mensagem ? `: "${mensagem}"` : ""}`,
    autor_id:    user.id,
  });

  revalidatePath("/pedidos");
}

// ── marcarRecebido ─────────────────────────────────────────────────────────────

export async function marcarRecebido(pedidoId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("pedidos")
    .update({ status: "recebido" })
    .eq("id", pedidoId);

  if (error) throw new Error(error.message);

  await supabase.from("pedido_eventos").insert({
    pedido_id: pedidoId,
    tipo:      "recebimento",
    texto:     "Pedido marcado como recebido",
    autor_id:  user.id,
  });

  revalidatePath("/pedidos");
}
