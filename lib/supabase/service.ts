/**
 * lib/supabase/service.ts
 * Cliente Supabase com service_role key — BYPASS de RLS.
 * Use APENAS em Route Handlers server-side (webhooks, jobs, admin tasks).
 * JAMAIS exponha este cliente ao browser ou inclua em Client Components.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "[supabase/service] NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios."
    );
  }

  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
