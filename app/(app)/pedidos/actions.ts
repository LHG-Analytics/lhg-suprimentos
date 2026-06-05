"use server";

/**
 * actions.ts — LHG-213/214/215
 * Server Actions para o módulo de Pedidos de Compra.
 *   - aprovarPedido    — com verificação de alçada (LHG-213)
 *   - rejeitarPedido
 *   - pushPedidoOmie   — envia pedido ao Omie ERP (LHG-214)
 *   - enviarEmailFornecedor — email via Resend (LHG-215)
 *   - marcarRecebido
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchOrcamento, getBudgetMesAtual } from "@/lib/sheets/client";
import { getUnidadeSheetConfig } from "@/lib/sheets/get-unidade-sheet";
import { OmieError } from "@/lib/omie/client";
import { incluirPedCompra, alterarPedCompra, excluirPedCompra } from "@/lib/omie/pedidos";

// ── aprovarPedido ──────────────────────────────────────────────────────────────

/**
 * Aprova o pedido (status → enviado).
 * Verifica alçada do usuário antes de aprovar (LHG-213).
 * Retorna aviso soft se o orçamento do mês estiver com utilização ≥ 80%.
 */
export async function aprovarPedido(pedidoId: string): Promise<{ avisoOrcamento?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ── 1. Verificação de alçada (LHG-213) ───────────────────────────────────────
  const [{ data: profile }, { data: pedidoCheck }] = await Promise.all([
    supabase.from("user_profiles").select("role, alcada_valor").eq("id", user.id).single(),
    supabase.from("pedidos").select("valor_total, status").eq("id", pedidoId).single(),
  ]);

  if (pedidoCheck?.status !== "aguardando_aprovacao") {
    throw new Error("Pedido não está aguardando aprovação.");
  }

  const isAdmin     = profile?.role === "admin";
  const alcada      = profile?.alcada_valor ?? 50_000;
  const valorPedido = pedidoCheck?.valor_total ?? 0;

  if (!isAdmin && alcada !== null && valorPedido > alcada) {
    const fBRL = (v: number) =>
      `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    throw new Error(
      `Valor do pedido (${fBRL(valorPedido)}) excede sua alçada de aprovação (${fBRL(Number(alcada))}). Solicite aprovação ao administrador.`,
    );
  }

  // ── 2. Aprovar o pedido ───────────────────────────────────────────────────────
  const { error } = await supabase
    .from("pedidos")
    .update({ status: "enviado", aprovador_id: user.id })
    .eq("id", pedidoId);

  if (error) throw new Error(error.message);

  await supabase.from("pedido_eventos").insert({
    pedido_id: pedidoId,
    tipo:      "aprovacao",
    texto:     "Pedido aprovado",
    autor_id:  user.id,
  });

  revalidatePath("/pedidos");

  // ── 3. Verificação de orçamento (soft-check, não bloqueia) ───────────────────
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
    pedido_id: pedidoId,
    tipo:      "rejeicao",
    texto:     motivo ? `Pedido rejeitado: ${motivo}` : "Pedido rejeitado",
    autor_id:  user.id,
  });

  revalidatePath("/pedidos");
}

// ── pushPedidoOmie (LHG-214) — FIXED: /produtos/pedidocompra/ ─────────────────

export async function pushPedidoOmie(
  pedidoId: string,
): Promise<{ omie_codigo?: string; erro?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: pedido, error: pedErr } = await supabase
    .from("pedidos")
    .select(`
      id, numero, valor_total, condicao_pgto, entrega_prev,
      fornecedores ( omie_codigo, razao_social, nome_fantasia ),
      pedido_itens (
        id, quantidade, preco_unitario,
        produtos ( omie_codigo, nome, unidade_med )
      ),
      pedido_unidades (
        unidades ( omie_app_key, omie_app_secret, omie_conta_corrente )
      )
    `)
    .eq("id", pedidoId)
    .single();

  if (pedErr || !pedido) {
    return { erro: pedErr?.message ?? "Pedido não encontrado" };
  }

  type PedidoUnidade = { unidades: { omie_app_key: string | null; omie_app_secret: string | null; omie_conta_corrente?: number | null } | null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pus     = pedido.pedido_unidades as any as PedidoUnidade[] | null;
  const unidade = pus?.[0]?.unidades;

  if (!unidade?.omie_app_key || !unidade?.omie_app_secret) {
    const msg = "Unidade sem credenciais Omie configuradas.";
    await supabase.from("pedidos").update({ omie_status: "erro", omie_erro: msg }).eq("id", pedidoId);
    revalidatePath("/pedidos");
    return { erro: msg };
  }

  const creds = { appKey: unidade.omie_app_key, appSecret: unidade.omie_app_secret };

  const forn = pedido.fornecedores as { omie_codigo: string | null; razao_social: string; nome_fantasia: string | null } | null;
  if (!forn?.omie_codigo) {
    const msg = "Fornecedor sem código Omie. Sincronize os fornecedores primeiro.";
    await supabase.from("pedidos").update({ omie_status: "erro", omie_erro: msg }).eq("id", pedidoId);
    revalidatePath("/pedidos");
    return { erro: msg };
  }

  type PedidoItemRaw = {
    id: string;
    quantidade: number;
    preco_unitario: number;
    produtos: { omie_codigo: string | null; nome: string; unidade_med: string } | null;
  };
  const itens = pedido.pedido_itens as PedidoItemRaw[] | null;

  const produtosIncluir = (itens ?? [])
    .filter((item) => item.produtos?.omie_codigo)
    .map((item, i) => ({
      cCodIntItem: `${pedidoId.slice(0, 8)}-${i + 1}`,
      nCodProd:    Number(item.produtos!.omie_codigo!),
      nQtde:       item.quantidade,
      nValUnit:    item.preco_unitario,
    }));

  if (produtosIncluir.length === 0) {
    const msg = "Nenhum item com código Omie. Sincronize os produtos primeiro.";
    await supabase.from("pedidos").update({ omie_status: "erro", omie_erro: msg }).eq("id", pedidoId);
    revalidatePath("/pedidos");
    return { erro: msg };
  }

  const dataPrevisao = pedido.entrega_prev
    ? new Date(pedido.entrega_prev).toLocaleDateString("pt-BR")
    : new Date(Date.now() + 7 * 86_400_000).toLocaleDateString("pt-BR");

  // Verifica se já houve tentativas anteriores (omie_erro contém "REDUNDANT" ou "duplicada")
  const { data: pedidoAtual } = await supabase
    .from("pedidos")
    .select("omie_erro, omie_codigo")
    .eq("id", pedidoId)
    .single();

  // Se já tem omie_codigo sincronizado (pode ter sido criado mas sem resposta salva), retorna
  if (pedidoAtual?.omie_codigo) {
    await supabase.from("pedidos").update({ omie_status: "sincronizado", omie_erro: null }).eq("id", pedidoId);
    revalidatePath("/pedidos");
    return { omie_codigo: pedidoAtual.omie_codigo };
  }

  // Em retentativas após REDUNDANT, usa sufixo de timestamp para garantir unicidade
  // (o Omie rejeita cCodIntPed já utilizado permanentemente, não apenas por 60s)
  const foiRedundant = pedidoAtual?.omie_erro?.includes("REDUNDANT") || pedidoAtual?.omie_erro?.includes("duplicada");
  const cCodIntPed   = foiRedundant
    ? `${pedidoId.slice(0, 18)}-${Date.now().toString(36)}`
    : pedidoId;

  const nCodCC = unidade.omie_conta_corrente ? Number(unidade.omie_conta_corrente) : undefined;

  try {
    const nCodPed = await incluirPedCompra(creds, {
      cabecalho_incluir: {
        cCodIntPed,
        nCodFor:     Number(forn.omie_codigo),
        dDtPrevisao: dataPrevisao,
        nCodCC,
        nQtdeParc:   1,
        cObs:        pedido.condicao_pgto
          ? `${pedido.condicao_pgto} — Pedido LHG Suprimentos ${pedido.numero}`
          : `Pedido gerado pelo sistema LHG Suprimentos — ${pedido.numero}`,
      },
      produtos_incluir: produtosIncluir,
    });

    const omieRef = String(nCodPed);

    await supabase
      .from("pedidos")
      .update({ omie_status: "sincronizado", omie_codigo: omieRef, omie_erro: null })
      .eq("id", pedidoId);

    await supabase.from("pedido_eventos").insert({
      pedido_id: pedidoId,
      tipo:      "omie",
      texto:     `Pedido enviado ao Omie (/produtos/pedidocompra/) — nCodPed: ${omieRef}`,
      autor_id:  user.id,
    });

    revalidatePath("/pedidos");
    return { omie_codigo: omieRef };
  } catch (err) {
    const rawMsg = err instanceof OmieError ? err.message : err instanceof Error ? err.message : "Erro desconhecido";
    // Preserva "REDUNDANT" no omie_erro para que a próxima tentativa use sufixo -r
    const msg = err instanceof OmieError ? `Omie: ${rawMsg}` : rawMsg;

    await supabase.from("pedidos").update({ omie_status: "erro", omie_erro: msg }).eq("id", pedidoId);
    revalidatePath("/pedidos");
    return { erro: msg };
  }
}

// ── enviarEmailFornecedor (LHG-215) ───────────────────────────────────────────

/**
 * Envia e-mail com os detalhes do pedido ao fornecedor via Resend.
 * Se RESEND_API_KEY não estiver configurado, registra como simulado.
 */
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
      fornecedores ( razao_social, nome_fantasia, email ),
      pedido_itens (
        quantidade, preco_unitario,
        produtos ( nome, unidade_med )
      )
    `)
    .eq("id", pedidoId)
    .single();

  if (pedErr || !pedido) throw new Error(pedErr?.message ?? "Pedido não encontrado");

  const forn = pedido.fornecedores as { razao_social: string; nome_fantasia: string | null; email: string | null } | null;
  if (!forn?.email) throw new Error("Fornecedor sem e-mail cadastrado");

  // Formata data de entrega
  const entregaLabel = pedido.entrega_prev
    ? new Date(pedido.entrega_prev).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
    : "A combinar";

  const fBRL = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  type ItemRaw = { quantidade: number; preco_unitario: number; produtos: { nome: string; unidade_med: string } | null };
  const itens = pedido.pedido_itens as ItemRaw[] | null ?? [];

  // ── Integração Resend ─────────────────────────────────────────────────────────
  const resendKey = process.env.RESEND_API_KEY;
  let emailEnviado = false;

  if (resendKey) {
    // Importação dinâmica para não quebrar o build quando Resend não está instalado
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(resendKey);

      // ── Renderiza o template React Email ──────────────────────────────────────
      const { render } = await import("@react-email/components");
      const { PedidoCompraFornecedorEmail } = await import(
        "@/emails/pedido-compra-fornecedor"
      );

      const emailItens = itens.map((i) => ({
        nome:          i.produtos?.nome ?? "Produto",
        unidade:       i.produtos?.unidade_med ?? "UN",
        quantidade:    i.quantidade,
        precoUnitario: i.preco_unitario,
      }));

      const htmlBody = await render(
        PedidoCompraFornecedorEmail({
          numero:       pedido.numero,
          fornNome:     forn.nome_fantasia ?? forn.razao_social,
          itens:        emailItens,
          valorTotal:   pedido.valor_total,
          entregaLabel,
          condicaoPgto: pedido.condicao_pgto ?? null,
          mensagem:     mensagem || null,
        }),
      );

      await resend.emails.send({
        from:    "Compras LHG Motéis <compras@lhgmoteis.com.br>",
        to:      [forn.email],
        subject: `Pedido de Compra ${pedido.numero} — LHG Motéis`,
        html:    htmlBody,
      });

      emailEnviado = true;
    } catch (resendErr) {
      // Falha no envio de e-mail — não silencia, relança para o cliente
      console.error("[enviarEmailFornecedor] Resend error:", resendErr);
      throw new Error(
        `Falha ao enviar e-mail: ${resendErr instanceof Error ? resendErr.message : "Erro desconhecido"}`,
      );
    }
  }

  // Registra no banco (real ou simulado)
  await supabase
    .from("pedidos")
    .update({ email_enviado_em: new Date().toISOString() })
    .eq("id", pedidoId);

  await supabase.from("pedido_eventos").insert({
    pedido_id: pedidoId,
    tipo:      "email_enviado",
    texto:     emailEnviado
      ? `E-mail enviado via Resend para ${forn.email}${mensagem ? `: "${mensagem}"` : ""}`
      : `E-mail registrado (simulado — RESEND_API_KEY não configurado) para ${forn.email}`,
    autor_id:  user.id,
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

// ── editarPedido ───────────────────────────────────────────────────────────────

export async function editarPedido(
  pedidoId: string,
  dados: { entrega_prev?: string | null; condicao_pgto?: string | null },
): Promise<{ ok: true } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: pedido, error: fetchErr } = await supabase
    .from("pedidos")
    .select(`
      id, omie_codigo, omie_status, status,
      pedido_itens(id, quantidade, preco_unitario, produtos(omie_codigo)),
      pedido_unidades(unidades(omie_app_key, omie_app_secret))
    `)
    .eq("id", pedidoId)
    .single();

  if (fetchErr || !pedido) return { erro: "Pedido não encontrado" };
  if (["recebido", "finalizado"].includes(pedido.status)) {
    return { erro: "Pedidos recebidos ou finalizados não podem ser editados" };
  }

  await supabase
    .from("pedidos")
    .update({
      entrega_prev:  dados.entrega_prev ?? null,
      condicao_pgto: dados.condicao_pgto ?? null,
    })
    .eq("id", pedidoId);

  if (pedido.omie_status === "sincronizado" && pedido.omie_codigo) {
    type PedUnid = { unidades: { omie_app_key: string | null; omie_app_secret: string | null } | null };
    const unid = (pedido.pedido_unidades as PedUnid[])?.[0]?.unidades;

    if (unid?.omie_app_key && unid?.omie_app_secret) {
      try {
        type ItemRaw = { id: string; quantidade: number; preco_unitario: number; produtos: { omie_codigo: string | null } | null };
        const produtosAlterar = (pedido.pedido_itens as ItemRaw[])
          .filter(i => i.produtos?.omie_codigo)
          .map((i, idx) => ({
            cCodIntItem: `${pedidoId.slice(0, 8)}-${idx + 1}`,
            nCodProd:    Number(i.produtos!.omie_codigo!),
            nQtde:       i.quantidade,
            nValUnit:    i.preco_unitario,
          }));

        const dataPrevisao = dados.entrega_prev
          ? new Date(dados.entrega_prev).toLocaleDateString("pt-BR")
          : undefined;

        await alterarPedCompra(
          { appKey: unid.omie_app_key, appSecret: unid.omie_app_secret },
          {
            cabecalho_alterar: {
              nCodPed:      Number(pedido.omie_codigo),
              dDtPrevisao:  dataPrevisao,
            },
            produtos_alterar: produtosAlterar,
          },
        );

        await supabase
          .from("pedidos")
          .update({ omie_status: "sincronizado" })
          .eq("id", pedidoId);
      } catch (err) {
        console.warn("[editarPedido] AlteraPedCompra falhou:", err instanceof Error ? err.message : err);
        await supabase
          .from("pedidos")
          .update({ omie_status: "erro", omie_erro: err instanceof Error ? err.message : "Erro Omie" })
          .eq("id", pedidoId);
      }
    }
  }

  revalidatePath("/pedidos");
  return { ok: true };
}

// ── excluirPedidoOmie ──────────────────────────────────────────────────────────

export async function excluirPedidoOmie(
  pedidoId: string,
): Promise<{ ok: true } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: pedido, error: fetchErr } = await supabase
    .from("pedidos")
    .select(`
      id, omie_codigo, omie_status, status,
      pedido_unidades(unidades(omie_app_key, omie_app_secret))
    `)
    .eq("id", pedidoId)
    .single();

  if (fetchErr || !pedido) return { erro: "Pedido não encontrado" };
  if (!["enviado", "cancelado"].includes(pedido.status)) {
    return { erro: "Apenas pedidos enviados ou cancelados podem ser excluídos no Omie" };
  }
  if (pedido.omie_status !== "sincronizado" || !pedido.omie_codigo) {
    return { erro: "Pedido não está sincronizado com o Omie" };
  }

  type PedUnid = { unidades: { omie_app_key: string | null; omie_app_secret: string | null } | null };
  const unid = (pedido.pedido_unidades as PedUnid[])?.[0]?.unidades;
  if (!unid?.omie_app_key || !unid?.omie_app_secret) {
    return { erro: "Credenciais Omie não encontradas" };
  }

  try {
    await excluirPedCompra(
      { appKey: unid.omie_app_key, appSecret: unid.omie_app_secret },
      Number(pedido.omie_codigo),
    );
  } catch (err) {
    return { erro: err instanceof OmieError ? err.message : "Erro ao excluir no Omie" };
  }

  await supabase
    .from("pedidos")
    .update({ omie_status: "pendente", omie_erro: null })
    .eq("id", pedidoId);

  revalidatePath("/pedidos");
  return { ok: true };
}
