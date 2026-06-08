"use server";

/**
 * actions.ts — LHG-210/211/212/220
 * Server Actions para o módulo de Cotações.
 *   LHG-212: enviarEmailCotacao — solicita cotação por email via Resend
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { incluirPedCompra } from "@/lib/omie/pedidos";

// ── deletarCotacao ────────────────────────────────────────────────────────────

export async function deletarCotacao(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: cot, error: fetchErr } = await supabase
    .from("cotacoes")
    .select("id, status, numero")
    .eq("id", id)
    .single();

  if (fetchErr || !cot) throw new Error("Cotação não encontrada");

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
  condicao_pagamento: z.string().nullable().optional(),
  observacao:         z.string().nullable().optional(),
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
): Promise<{ ok: true; numeroPedidos: number; pedidoIds: string[] } | { erro: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { erro: "Não autenticado" };

    // Guarda contra chamadas duplicadas: se já existem pedidos desta cotação, aborta
    const { count: jaExistem } = await supabase
      .from("pedidos")
      .select("id", { count: "exact", head: true })
      .eq("cotacao_id", cotacaoId);
    if (jaExistem && jaExistem > 0) {
      return { erro: `Esta cotação já gerou ${jaExistem} pedido(s). Acesse a tela de Pedidos.` };
    }

    // Buscar prazo da cotação (fallback quando prazo_entrega_dias não preenchido na matriz)
    const { data: cotacaoPrazo } = await supabase
      .from("cotacoes")
      .select("prazo")
      .eq("id", cotacaoId)
      .maybeSingle();
    const cotacaoPrazoDate = cotacaoPrazo?.prazo ?? null;

    // Buscar unidades da cotação para vincular ao pedido
    const { data: cotacaoUnidades } = await supabase
      .from("cotacao_unidades")
      .select("unidade_id")
      .eq("cotacao_id", cotacaoId);
    const unidadeIds = (cotacaoUnidades ?? []).map(cu => cu.unidade_id);

    // Buscar itens com células da matriz
    const { data: itens, error: itensErr } = await supabase
      .from("cotacao_itens")
      .select("id, quantidade, produto_id, cotacao_matriz(fornecedor_id, preco_unitario, condicao_pagamento, prazo_entrega_dias)")
      .eq("cotacao_id", cotacaoId);

    if (itensErr || !itens) {
      console.error("[gerarPedidos] itens error:", itensErr);
      return { erro: itensErr?.message ?? "Erro ao buscar itens" };
    }

    // Agrupar por fornecedor
    const grupos = new Map<string, {
      preco_unitario: number; quantidade: number; produto_id: string;
      condicao_pgto: string | null; prazo_entrega_dias: number | null;
    }[]>();

    for (const item of itens) {
      const fornId = selecoes[item.id];
      if (!fornId) continue;
      const cell = item.cotacao_matriz.find(c => c.fornecedor_id === fornId);
      if (!cell || !cell.preco_unitario) continue;
      if (!grupos.has(fornId)) grupos.set(fornId, []);
      grupos.get(fornId)!.push({
        preco_unitario:     cell.preco_unitario,
        quantidade:         item.quantidade,
        produto_id:         item.produto_id,
        condicao_pgto:      cell.condicao_pagamento,
        prazo_entrega_dias: cell.prazo_entrega_dias ?? null,
      });
    }

    if (grupos.size === 0) return { erro: "Nenhum item selecionado" };
    const pedidoIds: string[] = [];

    // Número sequencial PED-YYYY-NNNN
    const year = new Date().getFullYear();
    const { data: lastPed } = await supabase
      .from("pedidos")
      .select("numero")
      .like("numero", `PED-${year}-%`)
      .order("numero", { ascending: false })
      .limit(1)
      .maybeSingle();

    let lastNum = lastPed ? parseInt(lastPed.numero.split("-")[2] ?? "0", 10) : 0;

    for (const [fornId, linhas] of grupos) {
      lastNum++;
      const numero      = `PED-${year}-${String(lastNum).padStart(4, "0")}`;
      const valor_total = linhas.reduce((acc, l) => acc + l.preco_unitario * l.quantidade, 0);
      const condicao    = linhas[0]?.condicao_pgto ?? null;

      const maxPrazo = linhas.reduce<number | null>((max, l) => {
        if (l.prazo_entrega_dias == null) return max;
        return max == null ? l.prazo_entrega_dias : Math.max(max, l.prazo_entrega_dias);
      }, null);
      // Prioridade: prazo_entrega_dias da matriz → prazo da cotação → null
      const entrega_prev = maxPrazo != null
        ? new Date(Date.now() + maxPrazo * 86_400_000).toISOString().slice(0, 10)
        : cotacaoPrazoDate ?? null;

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
          entrega_prev,
        })
        .select("id")
        .single();

      if (pedErr || !pedido) {
        console.error("[gerarPedidos] pedido insert error:", pedErr);
        return { erro: pedErr?.message ?? "Erro ao criar pedido" };
      }
      pedidoIds.push(pedido.id);

      const { error: itensInsErr } = await supabase
        .from("pedido_itens")
        .insert(
          linhas.map(l => ({
            pedido_id:      pedido.id,
            produto_id:     l.produto_id,
            quantidade:     l.quantidade,
            preco_unitario: l.preco_unitario,
            // valor_total é GENERATED ALWAYS AS (quantidade * preco_unitario) — não inserir
          })),
        );

      if (itensInsErr) {
        console.error("[gerarPedidos] pedido_itens insert error:", itensInsErr);
        return { erro: itensInsErr.message };
      }

      // Vincular unidades (necessário para pushPedidoOmie encontrar credenciais Omie)
      if (unidadeIds.length > 0) {
        const { error: unidErr } = await supabase.from("pedido_unidades").insert(
          unidadeIds.map(uid => ({ pedido_id: pedido.id, unidade_id: uid })),
        );
        if (unidErr) console.error("[gerarPedidos] pedido_unidades insert error:", unidErr);
      }
    }

    await supabase
      .from("cotacoes")
      .update({ status: "aprovado" })
      .eq("id", cotacaoId);

    revalidatePath("/cotacoes");
    revalidatePath("/pedidos");
    return { ok: true, numeroPedidos: grupos.size, pedidoIds };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro inesperado ao gerar pedidos";
    console.error("[gerarPedidos] unexpected error:", err);
    return { erro: msg };
  }
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
    .select("id, status")
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

  const fromEmail = "Compras LHG Motéis <compras@lhgmoteis.com.br>";

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
            <td style="padding:6px 12px;border-bottom:1px solid #27272a;text-align:right;font-size:13px;color:#71717a">___________</td>
            <td style="padding:6px 12px;border-bottom:1px solid #27272a;text-align:right;font-size:13px;color:#71717a">___________</td>
            <td style="padding:6px 12px;border-bottom:1px solid #27272a;text-align:right;font-size:13px;color:#71717a">___________</td>
            <td style="padding:6px 12px;border-bottom:1px solid #27272a;text-align:right;font-size:13px;color:#71717a">___________</td>
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
            <th style="padding:8px 12px;text-align:right;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.08em">Valor Total</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.08em">Prazo Entrega</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.08em">Prazo Pagamento</th>
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

        const { error: resendErr } = await resend.emails.send({
          from:    fromEmail,
          to:      [forn.email],
          subject: `Solicitação de Cotação ${cotacao.numero} — LHG Motéis`,
          html:    htmlBody,
        });

        if (resendErr) {
          erros.push(`${fornNome}: ${resendErr.message}`);
          continue;
        }

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

// ── aprovarCotacao ─────────────────────────────────────────────────────────────

export interface PedidoCriado {
  id:          string;
  numero:      string;
  fornecedor:  string;
  omieOk:      boolean;
  omieErro?:   string;
}

/**
 * Aprova uma cotação:
 * 1. Valida que todos os itens têm fornecedor vencedor (selecionado_forn)
 * 2. Agrupa itens por fornecedor
 * 3. Para cada grupo: cria pedido + tenta enviar ao Omie
 * 4. Muda status da cotação para "aprovado"
 */
export async function aprovarCotacao(
  cotacaoId: string,
): Promise<{ pedidos: PedidoCriado[] } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 1. Buscar dados completos da cotação
  const { data: cotacao, error: cotErr } = await supabase
    .from("cotacoes")
    .select(`
      id, numero, titulo, prazo,
      cotacao_unidades(unidade_id, unidades(omie_app_key, omie_app_secret)),
      cotacao_itens(
        id, quantidade, selecionado_forn,
        produtos(id, nome, omie_codigo, unidade_med),
        cotacao_matriz(fornecedor_id, preco_unitario, condicao_pagamento, prazo_entrega_dias)
      )
    `)
    .eq("id", cotacaoId)
    .single();

  if (cotErr || !cotacao) return { erro: "Cotação não encontrada" };

  // 2. Validar que todos os itens têm fornecedor selecionado
  type MatrizRaw = { fornecedor_id: string; preco_unitario: number; condicao_pagamento: string | null; prazo_entrega_dias: number | null };
  type ItemRaw = {
    id: string;
    quantidade: number;
    selecionado_forn: string | null;
    produtos: { id: string; nome: string; omie_codigo: string | null; unidade_med: string } | null;
    cotacao_matriz: MatrizRaw[];
  };

  const itens = cotacao.cotacao_itens as ItemRaw[];
  const semVencedor = itens.filter(i => !i.selecionado_forn);
  if (semVencedor.length > 0) {
    return { erro: `${semVencedor.length} item(ns) sem fornecedor vencedor atribuído` };
  }

  // 3. Agrupar itens por fornecedor vencedor
  const grupos = new Map<string, ItemRaw[]>();
  for (const item of itens) {
    const fId = item.selecionado_forn!;
    if (!grupos.has(fId)) grupos.set(fId, []);
    grupos.get(fId)!.push(item);
  }

  // 4. Buscar dados dos fornecedores vencedores
  const fornIds = Array.from(grupos.keys());
  const { data: fornecedores } = await supabase
    .from("fornecedores")
    .select("id, razao_social, nome_fantasia, omie_codigo, email")
    .in("id", fornIds);

  const fornMap = new Map((fornecedores ?? []).map(f => [f.id, f]));

  // 5. Buscar unidade para credenciais Omie
  type UnidadeRaw = { unidade_id: string; unidades: { omie_app_key: string | null; omie_app_secret: string | null } | null };
  const unidades = cotacao.cotacao_unidades as UnidadeRaw[];
  const unidade = unidades[0]?.unidades;

  // 6. Gerar número sequencial de pedido
  const year = new Date().getFullYear();
  const { data: lastPed } = await supabase
    .from("pedidos")
    .select("numero")
    .like("numero", `PED-${year}-%`)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextNum = lastPed ? parseInt(lastPed.numero.split("-")[2] ?? "0", 10) + 1 : 1;

  // 7. Criar pedidos
  const pedidosCriados: PedidoCriado[] = [];

  for (const [fornId, itensForn] of grupos) {
    const forn = fornMap.get(fornId);
    if (!forn) continue;

    const numero = `PED-${year}-${String(nextNum++).padStart(4, "0")}`;

    // Calcular valor total usando preço da matriz para este fornecedor
    const valorTotal = itensForn.reduce((acc, item) => {
      const entrada = item.cotacao_matriz.find(m => m.fornecedor_id === fornId);
      return acc + item.quantidade * (entrada?.preco_unitario ?? 0);
    }, 0);

    // Condição de pagamento (pega do primeiro item)
    const primeiraEntrada = itensForn[0].cotacao_matriz.find(m => m.fornecedor_id === fornId);
    const condicaoPgto = primeiraEntrada?.condicao_pagamento ?? null;

    // Data de previsão
    const dtPrevisao = cotacao.prazo
      ? new Date(cotacao.prazo + "T12:00:00").toLocaleDateString("pt-BR")
      : new Date(Date.now() + 7 * 86_400_000).toLocaleDateString("pt-BR");

    // Inserir pedido
    const { data: pedido, error: pedErr } = await supabase
      .from("pedidos")
      .insert({
        numero,
        cotacao_id:    cotacaoId,
        fornecedor_id: fornId,
        comprador_id:  user.id,
        status:        "enviado",
        omie_status:   "pendente",
        valor_total:   valorTotal,
        condicao_pgto: condicaoPgto,
        entrega_prev:  cotacao.prazo ?? null,
      })
      .select("id")
      .single();

    if (pedErr || !pedido) {
      pedidosCriados.push({
        id:         "",
        numero,
        fornecedor: forn.nome_fantasia ?? forn.razao_social,
        omieOk:     false,
        omieErro:   pedErr?.message ?? "Falha ao criar pedido no banco",
      });
      continue;
    }

    const pedidoId = pedido.id;

    // Inserir itens do pedido (apenas itens que têm produto vinculado)
    const pedidoItensPayload = itensForn
      .filter(item => item.produtos?.id)
      .map(item => {
        const entrada = item.cotacao_matriz.find(m => m.fornecedor_id === fornId);
        return {
          pedido_id:      pedidoId,
          produto_id:     item.produtos!.id,
          quantidade:     item.quantidade,
          preco_unitario: entrada?.preco_unitario ?? 0,
        };
      });
    if (pedidoItensPayload.length > 0) {
      await supabase.from("pedido_itens").insert(pedidoItensPayload);
    }

    // Inserir unidades do pedido
    if (unidades.length > 0) {
      await supabase.from("pedido_unidades").insert(
        unidades.map(u => ({ pedido_id: pedidoId, unidade_id: u.unidade_id }))
      );
    }

    // Pedido criado localmente — o envio ao Omie é feito manualmente via
    // "Tentar novamente" nos Pedidos de Compra (possui retry, cCodCateg, nCodCC, UpsertPedCompra etc.)
    await supabase.from("pedido_eventos").insert({
      pedido_id: pedidoId,
      tipo:      "criacao",
      texto:     `Pedido criado — use "Tentar novamente" nos Pedidos para enviar ao Omie`,
      autor_id:  user.id,
    });

    // Tentar enviar email ao fornecedor usando template React Email
    if (forn.email && process.env.RESEND_API_KEY) {
      try {
        const { Resend } = await import("resend");
        const { render } = await import("@react-email/components");
        const { PedidoCompraFornecedorEmail } = await import("@/emails/pedido-compra-fornecedor");

        const emailItens = itensForn
          .filter(i => i.produtos?.nome)
          .map(item => {
            const entrada = item.cotacao_matriz.find(m => m.fornecedor_id === fornId);
            return {
              nome:          item.produtos!.nome,
              unidade:       item.produtos!.unidade_med ?? "UN",
              quantidade:    item.quantidade,
              precoUnitario: entrada?.preco_unitario ?? 0,
            };
          });

        const htmlBody = await render(
          PedidoCompraFornecedorEmail({
            numero,
            fornNome:     forn.nome_fantasia ?? forn.razao_social,
            itens:        emailItens,
            valorTotal,
            entregaLabel: dtPrevisao,
            condicaoPgto: condicaoPgto ?? null,
            mensagem:     `Pedido de compra referente à cotação ${cotacao.titulo}.`,
          }),
        );

        const fromEmail = "Compras LHG Motéis <compras@lhgmoteis.com.br>";

        const resend = new Resend(process.env.RESEND_API_KEY);
        const { error: resendErr } = await resend.emails.send({
          from:    fromEmail,
          to:      forn.email,
          subject: `Pedido de Compra ${numero} — LHG Suprimentos`,
          html:    htmlBody,
        });
        if (resendErr) {
          console.error(`[pedido/email] Falha ao enviar para ${forn.email}:`, resendErr.message);
        }
      } catch (err) {
        console.error(`[pedido/email] Exceção ao enviar para ${forn.email}:`, err);
      }
    }

    pedidosCriados.push({
      id:         pedidoId,
      numero,
      fornecedor: forn.nome_fantasia ?? forn.razao_social,
      omieOk:     false,
      omieErro:   undefined,
    });
  }

  // 8. Atualizar status da cotação
  await supabase.from("cotacoes").update({ status: "aprovado" }).eq("id", cotacaoId);

  revalidatePath(`/cotacoes/${cotacaoId}`);
  revalidatePath("/cotacoes");
  revalidatePath("/pedidos");

  return { pedidos: pedidosCriados };
}
