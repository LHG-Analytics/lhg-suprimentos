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
    const email = user.email?.toLowerCase().trim();

    // Verificar convite válido SEMPRE — antes de checar o perfil.
    // O trigger trg_on_auth_user_created cria o perfil automaticamente com
    // role='solicitante' ao criar auth.users. Se o usuário tem convite com outro
    // role, precisamos aplicá-lo mesmo que o perfil já exista.
    const { data: invite } = email
      ? await supabase
          .from("invites")
          .select("id, role")
          .eq("email", email)
          .is("used_at", null)
          .gte("expires_at", new Date().toISOString())
          .maybeSingle()
      : { data: null };

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (invite) {
      const nomeFromGoogle =
        user.user_metadata?.full_name ??
        user.user_metadata?.name ??
        email?.split("@")[0] ??
        "Usuário";

      if (profile) {
        // Perfil já existe (criado pelo trigger com role='solicitante') —
        // atualizar para o role correto do convite.
        const { error: updateError } = await supabase
          .from("user_profiles")
          .update({ role: invite.role, nome: nomeFromGoogle })
          .eq("id", user.id);

        if (updateError) {
          console.error("[auth/callback] Erro ao atualizar role via convite:", updateError.message);
        }
      } else {
        // Perfil não existe — criar com o role do convite.
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
      }

      // Marcar convite como usado
      await supabase
        .from("invites")
        .update({ used_at: new Date().toISOString() })
        .eq("id", invite.id);

      console.log(`[auth/callback] Usuário ${email} com role '${invite.role}' via convite`);
    } else if (!profile) {
      // Sem perfil e sem convite → negar acesso
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=not_invited`);
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
