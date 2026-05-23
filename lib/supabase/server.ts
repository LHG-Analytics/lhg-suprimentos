/**
 * lib/supabase/server.ts
 * Cliente Supabase para uso em Server Components, Server Actions e Route Handlers.
 * Lê e GRAVA os cookies de sessão via next/headers para manter JWT sincronizado.
 * NUNCA use este cliente em Client Components.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll é chamado em Server Components (read-only).
            // Pode ser ignorado com segurança — o proxy.ts cuida do refresh.
          }
        },
      },
    }
  );
}
