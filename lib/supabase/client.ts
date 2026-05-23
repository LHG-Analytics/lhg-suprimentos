/**
 * lib/supabase/client.ts
 * Cliente Supabase para uso em Client Components (browser).
 * Usa @supabase/ssr createBrowserClient — persiste sessão em cookies automaticamente.
 */
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";

// Strip BOM (U+FEFF) invisível que pode entrar em env vars copiadas de editores Windows
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/^﻿/, "");
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.replace(/^﻿/, "");

export function createClient() {
  return createBrowserClient<Database>(supabaseUrl, supabaseKey);
}
