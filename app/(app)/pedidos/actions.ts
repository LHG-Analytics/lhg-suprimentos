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
import { criarPedidoCompra, OmieError } from "@/lib/omie/client";

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

// ── pushPedidoOmie (LHG-214) ──────────────────────────────────────────────────

/**
 * Envia o pedido de compra ao Omie ERP.
 * Requer:
 *   - Unidade com credenciais Omie (omie_app_key / omie_app_secret)
 *   - Fornecedor com omie_codigo
 *   - Produtos com omie_codigo
 *
 * Atualiza omie_status e omie_codigo no banco após execução.
 */
export async function pushPedidoOmie(
  pedidoId: string,
): Promise<{ omie_codigo?: string; erro?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Busca pedido com todas as dependências
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
        unidades ( omie_app_key, omie_app_secret )
      )
    `)
    .eq("id", pedidoId)
    .single();

  if (pedErr || !pedido) {
    return { erro: pedErr?.message ?? "Pedido não encontrado" };
  }

  // Credenciais da unidade
  type PedidoUnidade = { unidades: { omie_app_key: string | null; omie_app_secret: string | null } | null };
  const pus     = pedido.pedido_unidades as PedidoUnidade[] | null;
  const unidade = pus?.[0]?.unidades;

  if (!unidade?.omie_app_key || !unidade?.omie_app_secret) {
    const msg = "Unidade sem credenciais Omie configuradas.";
    await supabase.from("pedidos").update({ omie_status: "erro", omie_erro: msg }).eq("id", pedidoId);
    revalidatePath("/pedidos");
    return { erro: msg };
  }

  const creds = { appKey: unidade.omie_app_key, appSecret: unidade.omie_app_secret };

  // Fornecedor
  const forn = pedido.fornecedores as { omie_codigo: string | null; razao_social: string; nome_fantasia: string | null } | null;
  if (!forn?.omie_codigo) {
    const msg = "Fornecedor sem código Omie. Sincronize os fornecedores primeiro.";
    await supabase.from("pedidos").update({ omie_status: "erro", omie_erro: msg }).eq("id", pedidoId);
    revalidatePath("/pedidos");
    return { erro: msg };
  }

  // Itens
  type PedidoItemRaw = {
    id: string;
    quantidade: number;
    preco_unitario: number;
    produtos: { omie_codigo: string | null; nome: string; unidade_med: string } | null;
  };
  const itens = pedido.pedido_itens as PedidoItemRaw[] | null;

  const det = (itens ?? [])
    .filter((item) => item.produtos?.omie_codigo)
    .map((item, i) => ({
      ide:     { codigo_item_integracao: `${pedidoId.slice(0, 8)}-${i + 1}` },
      produto: {
        codigo_produto: parseInt(item.produtos!.omie_codigo!, 10),
        cfop:           "1556",   // compra para uso/consumo (mesmo estado)
        quantidade:     item.quantidade,
        valor_unitario: item.preco_unitario,
      },
    }));

  if (det.length === 0) {
    const msg = "Nenhum item com código Omie encontrado. Sincronize os produtos primeiro.";
    await supabase.from("pedidos").update({ omie_status: "erro", omie_erro: msg }).eq("id", pedidoId);
    revalidatePath("/pedidos");
    return { erro: msg };
  }

  // Data de previsão de entrega (DD/MM/YYYY)
  const dataPrevisao = pedido.entrega_prev
    ? new Date(pedido.entrega_prev).toLocaleDateString("pt-BR")
    : new Date(Date.now() + 7 * 86_400_000).toLocaleDateString("pt-BR");

  try {
    const result = await criarPedidoCompra(creds, {
      cabecalho: {
        numero_pedido:   pedido.numero,
        codigo_parceiro: parseInt(forn.omie_codigo, 10),
        data_previsao:   dataPrevisao,
        obs_venda:       "Pedido gerado pelo sistema LHG Suprimentos",
        etapa:           "10",
      },
      det,
      informacoes_adicionais: { enviar_email: "N", consumidor_final: "N" },
    });

    const omieRef = result.codigo_pedido
      ? String(result.codigo_pedido)
      : result.numero_pedido;

    await supabase
      .from("pedidos")
      .update({ omie_status: "sincronizado", omie_codigo: omieRef, omie_erro: null })
      .eq("id", pedidoId);

    await supabase.from("pedido_eventos").insert({
      pedido_id: pedidoId,
      tipo:      "omie",
      texto:     `Pedido enviado ao Omie (ref: ${omieRef})`,
      autor_id:  user.id,
    });

    revalidatePath("/pedidos");
    return { omie_codigo: omieRef };
  } catch (err) {
    const msg = err instanceof OmieError
      ? `Omie: ${err.message}`
      : err instanceof Error
      ? err.message
      : "Erro desconhecido ao enviar ao Omie";

    await supabase
      .from("pedidos")
      .update({ omie_status: "erro", omie_erro: msg })
      .eq("id", pedidoId);

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

      const itensLinhas = itens
        .map(
          (i) =>
            `<tr>
              <td style="padding:6px 12px;border-bottom:1px solid #27272a;font-size:13px;color:#e4e4e7">${i.produtos?.nome ?? "Produto"} (${i.produtos?.unidade_med ?? "UN"})</td>
              <td style="padding:6px 12px;border-bottom:1px solid #27272a;text-align:center;font-size:13px;color:#a1a1aa">${i.quantidade}</td>
              <td style="padding:6px 12px;border-bottom:1px solid #27272a;text-align:right;font-size:13px;color:#a1a1aa">${fBRL(i.preco_unitario)}</td>
              <td style="padding:6px 12px;border-bottom:1px solid #27272a;text-align:right;font-size:13px;color:#e4e4e7;font-weight:600">${fBRL(i.quantidade * i.preco_unitario)}</td>
            </tr>`,
        )
        .join("");

      const htmlBody = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#09090b;font-family:Arial,sans-serif">
  <div style="max-width:600px;margin:40px auto;background:#18181b;border:1px solid #27272a;border-radius:12px;overflow:hidden">
    <!-- Header -->
    <div style="background:#10b981;padding:24px 32px">
      <p style="margin:0;font-size:12px;color:#d1fae5;letter-spacing:0.1em;text-transform:uppercase">LHG Motéis · Compras</p>
      <h1 style="margin:4px 0 0;font-size:22px;color:#fff;font-weight:700">Pedido de Compra ${pedido.numero}</h1>
    </div>
    <!-- Body -->
    <div style="padding:28px 32px">
      <p style="margin:0 0 16px;font-size:14px;color:#a1a1aa">
        Prezado(a) <strong style="color:#e4e4e7">${forn.nome_fantasia ?? forn.razao_social}</strong>,
      </p>
      ${
        mensagem
          ? `<div style="background:#27272a;border-left:3px solid #10b981;border-radius:4px;padding:12px 16px;margin-bottom:20px">
               <p style="margin:0;font-size:13px;color:#d4d4d8">${mensagem}</p>
             </div>`
          : ""
      }
      <p style="margin:0 0 20px;font-size:14px;color:#a1a1aa">
        Segue o pedido de compra para sua confirmação e atendimento.
      </p>
      <!-- Tabela de itens -->
      <table style="width:100%;border-collapse:collapse;background:#09090b;border-radius:8px;overflow:hidden;border:1px solid #27272a">
        <thead>
          <tr style="background:#27272a">
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.08em">Produto</th>
            <th style="padding:8px 12px;text-align:center;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.08em">Qtd</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.08em">Unit.</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.08em">Total</th>
          </tr>
        </thead>
        <tbody>${itensLinhas}</tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="padding:10px 12px;text-align:right;font-size:13px;color:#71717a;font-weight:600">TOTAL DO PEDIDO</td>
            <td style="padding:10px 12px;text-align:right;font-size:15px;color:#10b981;font-weight:700">${fBRL(pedido.valor_total)}</td>
          </tr>
        </tfoot>
      </table>
      <!-- Detalhes de entrega -->
      <div style="margin-top:20px;display:flex;gap:24px">
        <div>
          <p style="margin:0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.08em">Previsão de Entrega</p>
          <p style="margin:4px 0 0;font-size:14px;color:#e4e4e7;font-weight:600">${entregaLabel}</p>
        </div>
        ${pedido.condicao_pgto ? `<div>
          <p style="margin:0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.08em">Condição de Pagamento</p>
          <p style="margin:4px 0 0;font-size:14px;color:#e4e4e7;font-weight:600">${pedido.condicao_pgto}</p>
        </div>` : ""}
      </div>
    </div>
    <!-- Footer -->
    <div style="padding:16px 32px;border-top:1px solid #27272a;text-align:center">
      <p style="margin:0;font-size:11px;color:#52525b">
        Para dúvidas, entre em contato com o setor de compras da LHG Motéis.
      </p>
    </div>
  </div>
</body>
</html>`;

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
