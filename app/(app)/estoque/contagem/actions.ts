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
import { somarSaidasPorProduto, AutomoIndisponivelError } from "@/lib/automo/client";
import { converterSaidas, type ItemMapeado } from "@/lib/estoque/saidas";

function mesAtualIso(): string {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  return `${ano}-${mes}-01`;
}

/**
 * Primeiro dia do mês seguinte a `mesIso` ("YYYY-MM-01"), em string — sem
 * passar por `Date`, que interpretaria a data como UTC meia-noite e correria
 * risco de voltar um dia em fuso negativo. `somarSaidasPorProduto` trata o
 * fim do período como exclusivo, então este é o valor certo para `fimIso`.
 */
function proximoMesIso(mesIso: string): string {
  const [anoStr, mesStr] = mesIso.split("-");
  let ano = Number(anoStr);
  let mes = Number(mesStr) + 1;
  if (mes > 12) {
    mes = 1;
    ano += 1;
  }
  return `${ano}-${String(mes).padStart(2, "0")}-01`;
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

/**
 * Importa as saídas do Automo do mês do ciclo e grava em `estoque_ciclo_itens.saidas`.
 *
 * Idempotente por natureza: `converterSaidas` recalcula do zero a partir do
 * período, então reimportar sobrescreve em vez de somar em cima do que já
 * estava lá.
 */
export async function importarSaidasDoAutomo(
  cicloId: string,
): Promise<{ ok: true; itensAtualizados: number; produtosIgnorados: number } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: "Não autenticado" };

  const { data: ciclo, error: errCiclo } = await supabase
    .from("estoque_ciclos")
    .select("id, local_id, mes, status, locais_estoque(automo_conn_key)")
    .eq("id", cicloId)
    .maybeSingle();
  if (errCiclo) return { erro: errCiclo.message };
  if (!ciclo) return { erro: "Ciclo não encontrado" };
  if (ciclo.status === "fechado") {
    return { erro: "Ciclo já fechado — não é possível reimportar." };
  }

  const connKey = ciclo.locais_estoque?.automo_conn_key;
  if (!connKey) return { erro: "Este local não tem banco do Automo configurado." };

  const inicioIso = ciclo.mes;
  const fimIso = proximoMesIso(ciclo.mes);

  let saidasAutomo;
  try {
    saidasAutomo = await somarSaidasPorProduto(connKey, inicioIso, fimIso);
  } catch (err) {
    if (err instanceof AutomoIndisponivelError) {
      return {
        erro:
          "Banco do Automo desta unidade está indisponível agora (o do Andar de Cima cai com frequência) — tente novamente em alguns minutos.",
      };
    }
    return { erro: "Erro inesperado ao importar saídas do Automo." };
  }

  const { data: cicloItens, error: errItens } = await supabase
    .from("estoque_ciclo_itens")
    .select("id, estoque_itens(id, automo_produto_id, fator_conversao)")
    .eq("ciclo_id", cicloId);
  if (errItens) return { erro: errItens.message };

  type CicloItemRow = NonNullable<typeof cicloItens>[number];
  const linhas = (cicloItens ?? []) as CicloItemRow[];

  // Chave do mapa é o id da própria linha de estoque_ciclo_itens — é nela
  // que o UPDATE roda, e evita um segundo lookup por estoque_item_id.
  const itensMapeados: ItemMapeado[] = linhas
    .filter((linha) => linha.estoque_itens != null)
    .map((linha) => ({
      estoque_item_id: linha.id,
      automo_produto_id: linha.estoque_itens!.automo_produto_id,
      fator_conversao: linha.estoque_itens!.fator_conversao,
    }));

  const mapa = converterSaidas(itensMapeados, saidasAutomo);

  const automoIdsMapeados = new Set(
    itensMapeados
      .map((item) => item.automo_produto_id)
      .filter((id): id is number => id != null),
  );
  const produtosIgnorados = new Set(
    saidasAutomo
      .map((s) => s.automo_produto_id)
      .filter((id) => !automoIdsMapeados.has(id)),
  ).size;

  const resultados = await Promise.all(
    linhas.map(async (linha) => {
      const quantidade = mapa.get(linha.id);
      if (quantidade === undefined) return { atualizado: false, ok: true as const };

      const { error } = await supabase
        .from("estoque_ciclo_itens")
        .update({ saidas: quantidade })
        .eq("id", linha.id);
      return { atualizado: true, ok: !error, erro: error?.message };
    }),
  );

  const sucessos = resultados.filter((r) => r.atualizado && r.ok).length;
  const falhas = resultados.filter((r) => r.atualizado && !r.ok);
  if (falhas.length > 0) {
    return {
      erro:
        `Falha ao salvar ${falhas.length} ${falhas.length === 1 ? "item" : "itens"} ` +
        `(${sucessos} atualizados antes da falha): ${falhas[0]?.erro ?? "erro desconhecido"}`,
    };
  }

  revalidatePath("/estoque/contagem");
  return { ok: true, itensAtualizados: sucessos, produtosIgnorados };
}
