/**
 * app/(app)/perfil/page.tsx — LHG-230
 * Página de edição de perfil: nome + foto.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PerfilForm } from "./_components/perfil-form";

export default async function PerfilPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("nome, email, role, avatar_url")
    .eq("id", user.id)
    .single();

  return (
    <PerfilForm
      userId={user.id}
      nome={profile?.nome ?? ""}
      email={profile?.email ?? user.email ?? ""}
      role={profile?.role ?? "solicitante"}
      avatarUrl={profile?.avatar_url ?? null}
    />
  );
}
