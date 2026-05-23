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
