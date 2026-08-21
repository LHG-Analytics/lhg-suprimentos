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

  // Delete de verdade: no bloco 1 não há movimento gravado ainda. Quando o ledger
  // existir (bloco 3), isto vira `ativo = false` para não perder histórico.
  const { error } = await supabase.from("estoque_itens").delete().eq("id", id);
  if (error) return { erro: error.message };

  revalidatePath("/estoque");
  return { ok: true };
}
