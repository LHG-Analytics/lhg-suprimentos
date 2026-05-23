/**
 * app/(app)/layout.tsx — LHG-202
 * Layout autenticado (Server Component).
 * 1. Valida sessão via getUser() — redireciona para /login se não autenticado.
 * 2. Busca perfil do usuário em user_profiles.
 * 3. Passa dados serializáveis para ShellClient (Client Component).
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ShellClient } from "@/components/lhg/shell/shell-client";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // ── Valida autenticação ────────────────────────────────────────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // ── Busca perfil ───────────────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("nome, email, role, avatar_url")
    .eq("id", user.id)
    .single();

  // Fallback caso perfil ainda não exista (primeiro acesso)
  const userInfo = {
    nome:      profile?.nome      ?? user.email?.split("@")[0] ?? "Usuário",
    email:     profile?.email     ?? user.email ?? "",
    role:      profile?.role      ?? "solicitante",
    avatarUrl: profile?.avatar_url ?? null,
  };

  return <ShellClient user={userInfo}>{children}</ShellClient>;
}
