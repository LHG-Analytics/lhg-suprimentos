"use server";

/**
 * app/(app)/estoque/contagem/actions.ts — módulo de Estoque (bloco 2)
 * Abertura/fechamento do ciclo mensal e registro item a item da contagem.
 *
 * A equipe conta andando pelo estoque com o celular na mão: cada item é salvo
 * sozinho (`registrarContagem`) em vez de um "salvar tudo" no fim — um sinal
 * ruim no meio do corredor não pode custar a contagem inteira.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

function mesAtualIso(): string {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  return `${ano}-${mes}-01`;
}

export async function abrirCiclo(
  localId: string,
): Promise<{ ok: true; cicloId: string } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: "Não autenticado" };

  const mes = mesAtualIso();

  // Idempotente: se já existe ciclo deste local neste mês, devolve o mesmo id
  // em vez de deixar a constraint UNIQUE(local_id, mes) estourar um erro cru.
  const { data: existente, error: errExistente } = await supabase
    .from("estoque_ciclos")
    .select("id")
    .eq("local_id", localId)
    .eq("mes", mes)
    .maybeSingle();
  if (errExistente) return { erro: errExistente.message };
  if (existente) return { ok: true, cicloId: existente.id };

  // Itens ativos do local — sem eles não há o que contar.
  const { data: itens, error: errItens } = await supabase
    .from("estoque_itens")
    .select("id")
    .eq("local_id", localId)
    .eq("ativo", true);
  if (errItens) return { erro: errItens.message };
  if (!itens || itens.length === 0) {
    return { erro: "Nenhum item controlado neste local. Cadastre os itens antes de abrir a contagem." };
  }

  // O índice parcial só permite um ciclo 'aberto' por local — fecha qualquer
  // um esquecido de um mês anterior antes de criar o deste mês.
  const { error: errFechar } = await supabase
    .from("estoque_ciclos")
    .update({ status: "fechado", fechado_em: new Date().toISOString(), fechado_por: user.id })
    .eq("local_id", localId)
    .eq("status", "aberto");
  if (errFechar) return { erro: errFechar.message };

  const { data: novoCiclo, error: errCiclo } = await supabase
    .from("estoque_ciclos")
    .insert({ local_id: localId, mes, aberto_por: user.id })
    .select("id")
    .single();
  if (errCiclo || !novoCiclo) return { erro: errCiclo?.message ?? "Falha ao abrir o ciclo" };

  // contagem_anterior = a última contagem_atual não nula de cada item, olhando
  // todo o histórico do local (não só o ciclo imediatamente anterior — o item
  // pode ter ficado sem contagem em algum mês no meio do caminho).
  const { data: ciclosAnteriores, error: errCiclosAnt } = await supabase
    .from("estoque_ciclos")
    .select("id, mes")
    .eq("local_id", localId)
    .order("mes", { ascending: false });
  if (errCiclosAnt) return { erro: errCiclosAnt.message };

  const ordemCiclo = new Map((ciclosAnteriores ?? []).map((c, idx) => [c.id, idx]));
  const cicloIdsAnteriores = (ciclosAnteriores ?? [])
    .map((c) => c.id)
    .filter((id) => id !== novoCiclo.id);

  const contagensAnteriores = new Map<string, number>();
  if (cicloIdsAnteriores.length > 0) {
    const { data: itensAnteriores, error: errItensAnt } = await supabase
      .from("estoque_ciclo_itens")
      .select("estoque_item_id, contagem_atual, ciclo_id")
      .in("ciclo_id", cicloIdsAnteriores)
      .not("contagem_atual", "is", null);
    if (errItensAnt) return { erro: errItensAnt.message };

    const ordenados = (itensAnteriores ?? [])
      .slice()
      .sort((a, b) => (ordemCiclo.get(a.ciclo_id) ?? 0) - (ordemCiclo.get(b.ciclo_id) ?? 0));
    for (const row of ordenados) {
      if (!contagensAnteriores.has(row.estoque_item_id) && row.contagem_atual != null) {
        contagensAnteriores.set(row.estoque_item_id, row.contagem_atual);
      }
    }
  }

  const linhas = itens.map((item) => ({
    ciclo_id: novoCiclo.id,
    estoque_item_id: item.id,
    contagem_anterior: contagensAnteriores.get(item.id) ?? null,
  }));

  const { error: errInsertItens } = await supabase.from("estoque_ciclo_itens").insert(linhas);
  if (errInsertItens) return { erro: errInsertItens.message };

  revalidatePath("/estoque/contagem");
  return { ok: true, cicloId: novoCiclo.id };
}

const RegistrarContagemSchema = z.object({
  cicloItemId: z.string().uuid(),
  quantidade: z.number().min(0, "Quantidade não pode ser negativa"),
});

export async function registrarContagem(
  input: z.infer<typeof RegistrarContagemSchema>,
): Promise<{ ok: true } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: "Não autenticado" };

  const parsed = RegistrarContagemSchema.safeParse(input);
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const { error } = await supabase
    .from("estoque_ciclo_itens")
    .update({
      contagem_atual: parsed.data.quantidade,
      contado_por: user.id,
      contado_em: new Date().toISOString(),
    })
    .eq("id", parsed.data.cicloItemId);
  if (error) return { erro: error.message };

  revalidatePath("/estoque/contagem");
  return { ok: true };
}

export async function fecharCiclo(
  cicloId: string,
): Promise<{ ok: true } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: "Não autenticado" };

  const { count, error: errCount } = await supabase
    .from("estoque_ciclo_itens")
    .select("id", { count: "exact", head: true })
    .eq("ciclo_id", cicloId)
    .is("contagem_atual", null);
  if (errCount) return { erro: errCount.message };
  if (count && count > 0) {
    return { erro: `Faltam ${count} ${count === 1 ? "item" : "itens"} para contar antes de fechar o ciclo.` };
  }

  const { error } = await supabase
    .from("estoque_ciclos")
    .update({ status: "fechado", fechado_em: new Date().toISOString(), fechado_por: user.id })
    .eq("id", cicloId);
  if (error) return { erro: error.message };

  revalidatePath("/estoque/contagem");
  return { ok: true };
}
