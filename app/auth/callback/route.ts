/**
 * app/auth/callback/route.ts
 * Route Handler para o callback PKCE do Supabase Auth.
 * Supabase redireciona para esta rota após Magic Link / OAuth com ?code=xxx.
 * Troca o code por uma sessão JWT e grava nos cookies.
 *
 * Segurança: somente usuários com perfil em `user_profiles` conseguem entrar.
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
  // (o try-catch do createClient() em server.ts é só para Server Components read-only)
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

  // ── Verificação de acesso: somente usuários convidados ─────────────────────
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile) {
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=not_invited`);
    }
  }

  // Redirecionar para a rota original ou dashboard
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";

  if (isLocalEnv) {
    return NextResponse.redirect(`${origin}${next}`);
  } else if (forwardedHost) {
    return NextResponse.redirect(`https://${forwardedHost}${next}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
