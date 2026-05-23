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
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { origin } = request.nextUrl;
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  // Usa o createClient centralizado — já tem strip de BOM nas env vars
  const supabase = await createClient();

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
