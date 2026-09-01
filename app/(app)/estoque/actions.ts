"use server";

/**
 * actions.ts — módulo de Estoque (bloco 1)
 * CRUD da lista curada de itens controlados.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const ItemSchema = z.object({
  local_id:          z.string().uuid(),
  produto_id:        z.string().uuid(),
  automo_produto_id: z.number().int().positive().nullable(),
  fator_conversao:   z.number().positive("Fator deve ser maior que zero"),
  estoque_ideal:     z.number().min(0, "Estoque ideal não pode ser negativo"),
});

export async function adicionarItemEstoque(
  input: z.infer<typeof ItemSchema>,
): Promise<{ ok: true } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: "Não autenticado" };

  const parsed = ItemSchema.safeParse(input);
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const { error } = await supabase.from("estoque_itens").insert(parsed.data);
  // 23505 = unique_violation: o par (local, produto) já está na lista
  if (error) {
    return {
      erro: error.code === "23505"
        ? "Este produto já está na lista de itens controlados deste local."
        : error.message,
    };
  }

  revalidatePath("/estoque");
  return { ok: true };
}

const AtualizarSchema = z.object({
  automo_produto_id: z.number().int().positive().nullable().optional(),
  fator_conversao:   z.number().positive().optional(),
  estoque_ideal:     z.number().min(0).optional(),
  ativo:             z.boolean().optional(),
});

export async function atualizarItemEstoque(
  id: string,
  input: z.infer<typeof AtualizarSchema>,
): Promise<{ ok: true } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: "Não autenticado" };

  const parsed = AtualizarSchema.safeParse(input);
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  if (Object.keys(parsed.data).length === 0) return { erro: "Nada para atualizar" };

  const { error } = await supabase.from("estoque_itens").update(parsed.data).eq("id", id);
  if (error) return { erro: error.message };

  revalidatePath("/estoque");
  return { ok: true };
}

export async function removerItemEstoque(
  id: string,
): Promise<{ ok: true } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: "Não autenticado" };

  /*
   * Desativa, não apaga.
   *
   * `estoque_ciclo_itens.estoque_item_id` tem ON DELETE CASCADE, então um delete
   * de verdade levaria embora a contagem daquele item em TODOS os ciclos —
   * inclusive nos já fechados, destruindo histórico sem aviso. Também foi o que
   * esvaziou o ciclo de agosto do Lush Ipiranga: item cadastrado, ciclo aberto,
   * item removido, e a linha da contagem sumiu por cascata.
   *
   * Com `ativo = false` o item sai do cadastro e das próximas contagens, mas o
   * que já foi contado continua de pé.
   */
  const { error } = await supabase
    .from("estoque_itens")
    .update({ ativo: false })
    .eq("id", id);
  if (error) return { erro: error.message };

  revalidatePath("/estoque");
  return { ok: true };
}
