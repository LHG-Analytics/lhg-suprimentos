/**
 * app/(app)/admin/page.tsx — LHG-230
 * Página de configurações para admins: usuários + convites.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminClient } from "./_components/admin-client";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verificar se é admin
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/dashboard");

  // Carregar usuários e convites em paralelo
  const [{ data: usuarios }, { data: convites }] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("id, nome, email, role, created_at, avatar_url")
      .order("created_at", { ascending: false }),

    supabase
      .from("invites")
      .select("id, email, role, expires_at, used_at, created_at")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <AdminClient
      usuarios={usuarios ?? []}
      convites={convites ?? []}
      myUserId={user.id}
    />
  );
}
