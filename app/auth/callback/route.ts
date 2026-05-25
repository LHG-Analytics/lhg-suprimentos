/**
 * app/auth/callback/route.ts
 * Route Handler para o callback PKCE do Supabase Auth.
 * Supabase redireciona para esta rota após Magic Link / OAuth com ?code=xxx.
 * Troca o code por uma sessão JWT e grava nos cookies.
 *
 * Segurança:
 * - Somente usuários com perfil em `user_profiles` conseguem entrar.
 * - Exceção: usuários com convite válido na tabela `invites` — o perfil é criado
 *   automaticamente com o role do convite.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Strip BOM (U+FEFF) — mesmo fix do lib/supabase/server.ts
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/^﻿/, "");
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.replace(/^﻿/, "");

export async function GET(request: NextRequest) {
  const { origin } = request.nextUrl;
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const cookieStore = await cookies();

  // Route Handler: setAll SEM try-catch — aqui cookies são graváveis
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] exchangeCodeForSession error:", error.message);
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // ── Verificação de acesso ─────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile) {
      // Verificar se existe convite válido para o email do usuário
      const email = user.email?.toLowerCase().trim();

      const { data: invite } = email
        ? await supabase
            .from("invites")
            .select("id, role")
            .eq("email", email)
            .is("used_at", null)
            .gte("expires_at", new Date().toISOString())
            .maybeSingle()
        : { data: null };

      if (invite) {
        // Criar perfil com o role do convite
        const nomeFromGoogle =
          user.user_metadata?.full_name ??
          user.user_metadata?.name ??
          email?.split("@")[0] ??
          "Usuário";

        const { error: insertError } = await supabase
          .from("user_profiles")
          .insert({
            id:    user.id,
            nome:  nomeFromGoogle,
            email: user.email!,
            role:  invite.role,
          });

        if (insertError) {
          console.error("[auth/callback] Erro ao criar perfil:", insertError.message);
          await supabase.auth.signOut();
          return NextResponse.redirect(`${origin}/login?error=profile_error`);
        }

        // Marcar convite como usado
        await supabase
          .from("invites")
          .update({ used_at: new Date().toISOString() })
          .eq("id", invite.id);

        console.log(`[auth/callback] Novo usuário ${email} criado via convite (role: ${invite.role})`);
      } else {
        // Sem perfil e sem convite → negar acesso
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=not_invited`);
      }
    }
  }

  // ── Redirecionar ──────────────────────────────────────────────────────────
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";

  if (isLocalEnv) {
    return NextResponse.redirect(`${origin}${next}`);
  } else if (forwardedHost) {
    return NextResponse.redirect(`https://${forwardedHost}${next}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
