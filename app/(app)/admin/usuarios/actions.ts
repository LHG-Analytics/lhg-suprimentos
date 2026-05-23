"use server";

/**
 * actions.ts — LHG-203
 * Server Actions para gestão de usuários (admin only).
 * Usa service role client para operações privilegiadas.
 */
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

// ── Guard: só admin ────────────────────────────────────────────────────────────
async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    throw new Error("Permissão insuficiente. Apenas admins podem gerenciar usuários.");
  }
}

// ── Convidar usuário ───────────────────────────────────────────────────────────
export async function inviteUser(formData: FormData): Promise<{ error?: string }> {
  try {
    await requireAdmin();

    const email    = (formData.get("email")    as string)?.trim().toLowerCase();
    const nome     = (formData.get("nome")     as string)?.trim();
    const role     = (formData.get("role")     as string) ?? "solicitante";
    const unidadeId = formData.get("unidade_id") as string | null;

    if (!email || !email.includes("@")) return { error: "Email inválido." };
    if (!nome)                           return { error: "Nome obrigatório." };

    const service = createServiceClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";

    // 1. Cria o usuário no Auth (envia email de convite)
    const { data: authData, error: authErr } = await service.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/auth/callback?next=/dashboard`,
      data: { nome, role },
    });

    if (authErr) {
      if (authErr.message.includes("already been registered")) {
        return { error: "Este email já está cadastrado." };
      }
      return { error: authErr.message };
    }

    // 2. Upsert do perfil (o trigger handle_new_user faz isso,
    //    mas garantimos aqui caso já exista ou o trigger falhe)
    if (authData.user) {
      await service
        .from("user_profiles")
        .upsert({
          id:    authData.user.id,
          email,
          nome,
          role:  role as "admin" | "comprador" | "aprovador" | "solicitante",
        });

      // 3. Se for solicitante com unidade, cria a associação em user_unidades
      if (role === "solicitante" && unidadeId) {
        await service
          .from("user_unidades")
          .upsert({ user_id: authData.user.id, unidade_id: unidadeId });
      }
    }

    revalidatePath("/admin/usuarios");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro inesperado." };
  }
}

// ── Atualizar papel do usuário ─────────────────────────────────────────────────
export async function updateUserRole(
  userId: string,
  role: "admin" | "comprador" | "aprovador" | "solicitante",
): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    const service = createServiceClient();

    const { error } = await service
      .from("user_profiles")
      .update({ role })
      .eq("id", userId);

    if (error) return { error: error.message };

    revalidatePath("/admin/usuarios");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro inesperado." };
  }
}

// ── Banir / desbanir usuário (substitui toggle active) ────────────────────────
// Usa supabase.auth.admin.updateUserById com ban_duration
export async function banUser(
  userId: string,
  ban: boolean,
): Promise<{ error?: string }> {
  try {
    await requireAdmin();
    const service = createServiceClient();

    const { error } = await service.auth.admin.updateUserById(userId, {
      ban_duration: ban ? "876600h" : "none", // ~100 anos de ban / remove ban
    });

    if (error) return { error: error.message };

    revalidatePath("/admin/usuarios");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro inesperado." };
  }
}
