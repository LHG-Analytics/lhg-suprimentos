"use server";

/**
 * app/(app)/perfil/actions.ts — LHG-230
 * Server Actions para edição de perfil do usuário logado.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ── Atualizar nome + avatar URL ───────────────────────────────────────────────

export async function atualizarPerfil(dados: {
  nome: string;
  avatarUrl: string | null;
}): Promise<{ ok: true } | { erro: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { erro: "Não autenticado" };

    const nome = dados.nome.trim();
    if (!nome) return { erro: "O nome não pode estar vazio." };
    if (nome.length < 2) return { erro: "O nome deve ter pelo menos 2 caracteres." };

    const { error } = await supabase
      .from("user_profiles")
      .update({
        nome,
        avatar_url: dados.avatarUrl ?? null,
      })
      .eq("id", user.id);

    if (error) return { erro: error.message };

    // Revalidar layout (re-fetch do UserInfo na sidebar)
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { erro: err instanceof Error ? err.message : "Erro desconhecido" };
  }
}
