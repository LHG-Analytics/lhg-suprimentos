"use server";

/**
 * app/(app)/admin/actions.ts — LHG-230
 * Server Actions para gestão de usuários e convites (admin only).
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Role = "solicitante" | "comprador" | "aprovador" | "admin";

// ── Guard: verifica se o usuário logado é admin ──────────────────────────────

async function assertAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") throw new Error("Acesso negado");
  return supabase;
}

// ── Criar convite ─────────────────────────────────────────────────────────────

export async function criarConvite(
  email: string,
  role: Role,
): Promise<{ ok: true; link: string; emailEnviado: boolean } | { erro: string }> {
  try {
    const supabase = await assertAdmin();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lhg-suprimentos.vercel.app";

    // Verificar se já existe convite pendente para este email
    const { data: existente } = await supabase
      .from("invites")
      .select("id")
      .eq("email", email.toLowerCase().trim())
      .is("used_at", null)
      .maybeSingle();

    if (existente) {
      return { erro: "Já existe um convite pendente para este e-mail." };
    }

    // Criar convite
    const { data: invite, error } = await supabase
      .from("invites")
      .insert({
        email: email.toLowerCase().trim(),
        role,
      })
      .select("token")
      .single();

    if (error || !invite) {
      return { erro: "Erro ao criar convite: " + (error?.message ?? "desconhecido") };
    }

    const link = `${siteUrl}/login`;

    // Tentar enviar email via Resend
    let emailEnviado = false;
    const resendKey = process.env.RESEND_API_KEY;

    if (resendKey) {
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(resendKey);

        await resend.emails.send({
          from:    "LHG Suprimentos <no-reply@lhgsuprimentos.com.br>",
          to:      [email],
          subject: "Você foi convidado para o LHG Suprimentos",
          html: `
            <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; color: #1a1a1a;">
              <div style="background: linear-gradient(135deg, #10b981, #0ea5e9); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 22px;">LHG Suprimentos</h1>
                <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0;">Sistema de Gestão de Compras</p>
              </div>
              <div style="background: #f9f9f9; padding: 32px; border-radius: 0 0 12px 12px; border: 1px solid #e5e5e5; border-top: none;">
                <h2 style="font-size: 18px; margin-bottom: 12px;">Você foi convidado! 🎉</h2>
                <p style="color: #555; line-height: 1.6;">
                  Você recebeu acesso ao <strong>LHG Suprimentos</strong> com o perfil de
                  <strong style="color: #10b981;">${role}</strong>.
                </p>
                <p style="color: #555; line-height: 1.6;">
                  Acesse usando a <strong>mesma conta Google</strong> cadastrada neste e-mail
                  (<strong>${email}</strong>).
                </p>
                <div style="text-align: center; margin: 28px 0;">
                  <a href="${link}" style="
                    display: inline-block;
                    background: #10b981;
                    color: white;
                    padding: 14px 32px;
                    border-radius: 8px;
                    text-decoration: none;
                    font-weight: 600;
                    font-size: 15px;
                  ">Acessar o sistema</a>
                </div>
                <p style="color: #999; font-size: 12px; text-align: center; margin-bottom: 0;">
                  Este convite expira em 7 dias. Se não era para você, ignore este e-mail.
                </p>
              </div>
            </div>
          `,
        });

        emailEnviado = true;
      } catch (resendErr) {
        console.error("[admin] Falha ao enviar email Resend:", resendErr);
        // Não falhar a operação; retornar o link manual
      }
    }

    revalidatePath("/admin");
    return { ok: true, link, emailEnviado };
  } catch (err) {
    return { erro: err instanceof Error ? err.message : "Erro desconhecido" };
  }
}

// ── Revogar convite ────────────────────────────────────────────────────────────

export async function revogarConvite(
  inviteId: string,
): Promise<{ ok: true } | { erro: string }> {
  try {
    const supabase = await assertAdmin();

    const { error } = await supabase
      .from("invites")
      .delete()
      .eq("id", inviteId)
      .is("used_at", null); // Só revoga convites não usados

    if (error) return { erro: error.message };

    revalidatePath("/admin");
    return { ok: true };
  } catch (err) {
    return { erro: err instanceof Error ? err.message : "Erro desconhecido" };
  }
}

// ── Alterar role de usuário ───────────────────────────────────────────────────

export async function alterarRoleUsuario(
  userId: string,
  role: Role,
): Promise<{ ok: true } | { erro: string }> {
  try {
    const supabase = await assertAdmin();
    const { data: { user } } = await supabase.auth.getUser();

    // Não pode alterar o próprio role
    if (user?.id === userId) {
      return { erro: "Você não pode alterar seu próprio perfil de acesso." };
    }

    const { error } = await supabase
      .from("user_profiles")
      .update({ role })
      .eq("id", userId);

    if (error) return { erro: error.message };

    revalidatePath("/admin");
    return { ok: true };
  } catch (err) {
    return { erro: err instanceof Error ? err.message : "Erro desconhecido" };
  }
}

// ── Remover usuário ───────────────────────────────────────────────────────────

export async function removerUsuario(
  userId: string,
): Promise<{ ok: true } | { erro: string }> {
  try {
    const supabase = await assertAdmin();
    const { data: { user } } = await supabase.auth.getUser();

    if (user?.id === userId) {
      return { erro: "Você não pode remover sua própria conta." };
    }

    // Usar service client para deletar da auth.users (cascade deleta user_profiles)
    const service = createServiceClient();
    const { error } = await service.auth.admin.deleteUser(userId);

    if (error) return { erro: error.message };

    revalidatePath("/admin");
    return { ok: true };
  } catch (err) {
    return { erro: err instanceof Error ? err.message : "Erro desconhecido" };
  }
}
