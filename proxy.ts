/**
 * proxy.ts — Next.js 16 (antigo middleware.ts)
 * Responsabilidades:
 *  1. Refresh do JWT do Supabase em cada request (obrigatório com @supabase/ssr)
 *  2. Redireciona rotas protegidas para /login se não autenticado
 *  3. Redireciona /login para /dashboard se já autenticado
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Strip BOM (U+FEFF) das env vars — evita ByteString error no Edge Runtime
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/^﻿/, "");
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.replace(/^﻿/, "");

// Rotas que exigem autenticação (prefixos)
const PROTECTED_PREFIXES = ["/dashboard", "/cotacoes", "/pedidos", "/admin"];

// Rotas públicas (nunca redirecionar)
const PUBLIC_PATHS = ["/login", "/auth/callback", "/auth/confirm"];

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Propagar cookies no request de saída
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANTE: getUser() é a forma correta de validar a sessão no servidor.
  // Não usar getSession() — não valida o JWT contra o servidor Supabase.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Se autenticado e tentando acessar /login → redirecionar para dashboard
  if (user && PUBLIC_PATHS.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Se não autenticado e tentando acessar rota protegida → redirecionar para login
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const proxyConfig = {
  matcher: [
    /*
     * Executa em todas as rotas EXCETO:
     * - _next/static (arquivos estáticos)
     * - _next/image (otimização de imagem)
     * - favicon e arquivos de imagem
     */
    "/((?!_next/static|_next/image|favicon|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
