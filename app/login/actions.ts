"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";

/**
 * Inicia o fluxo OAuth com Google.
 * Redireciona para o provider — após autenticar, o Supabase retorna
 * para /auth/callback?code=xxx que troca por sessão.
 */
export async function signInWithGoogle() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${SITE_URL}/auth/callback`,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  redirect(data.url);
}

/**
 * Envia Magic Link por email.
 * Retorna void em sucesso; lança erro em falha.
 */
export async function sendMagicLink(email: string): Promise<void> {
  if (!email || !email.includes("@")) {
    throw new Error("Email inválido.");
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      emailRedirectTo: `${SITE_URL}/auth/callback`,
      shouldCreateUser: false, // Apenas usuários já cadastrados pelo admin
    },
  });

  if (error) {
    // Mensagem amigável para erros comuns
    if (error.message.includes("Email not confirmed")) {
      throw new Error("Email não encontrado. Verifique com o administrador do sistema.");
    }
    if (error.message.includes("rate limit")) {
      throw new Error("Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.");
    }
    throw new Error(error.message);
  }
}
