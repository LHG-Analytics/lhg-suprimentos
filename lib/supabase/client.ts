/**
 * lib/supabase/client.ts
 * Cliente Supabase para uso em Client Components (browser).
 * Usa @supabase/ssr createBrowserClient — persiste sessão em cookies automaticamente.
 */
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
