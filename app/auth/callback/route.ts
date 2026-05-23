/**
 * app/auth/callback/route.ts
 * Route Handler para o callback PKCE do Supabase Auth.
 * Supabase redireciona para esta rota após Magic Link / OAuth com ?code=xxx.
 * Troca o code por uma sessão JWT e grava nos cookies.
 *
 * Segurança: somente usuários com perfil em `user_profiles` conseguem entrar.
 * Isso garante que apenas quem recebeu convite explícito via inviteUserByEmail
 * tem acesso — novos logins Google sem convite são bloqueados aqui.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  // Route Handler: request.nextUrl é síncrono (Web API).
  // O prop async do Next.js 16 só existe em page.tsx/layout.tsx, não aqui.
  const { origin } = request.nextUrl;
  const code = request.nextUrl.searchParams.get("code");
  // Rota para redirecionar após login (salva pelo proxy.ts como ?next=...)
  const next = request.nextUrl.searchParams.get("next") ?? "/dashboard";

  if (!code) {
    // Sem code → redirecionar para login com erro
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] exchangeCodeForSession error:", error.message);
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // ── Verificação de acesso: somente usuários convidados ─────────────────────
  // Após trocar o code, checamos se existe um perfil em user_profiles.
  // Usuários que chegaram pelo Google sem convite NÃO terão perfil — são barrados.
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile) {
      // Não tem perfil → não foi convidado → encerrar sessão e bloquear
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=not_invited`);
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

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
