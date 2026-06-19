/**
 * app/(app)/layout.tsx — LHG-202
 * Layout autenticado (Server Component).
 * 1. Valida sessão via getUser() — redireciona para /login se não autenticado.
 * 2. Busca perfil do usuário em user_profiles.
 * 3. Busca contagem de cotações abertas para badge dinâmico na sidebar.
 * 4. Passa dados serializáveis para ShellClient (Client Component).
 */
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
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

  // ── Unidade ativa (cookie) — o badge de cotações segue o seletor ────────────
  const cookieStore = await cookies();
  const slug = cookieStore.get("lhg-unidade-slug")?.value ?? "todas";
  let unidadeId: string | null = null;
  if (slug && slug !== "todas") {
    const { data: u } = await supabase.from("unidades").select("id").eq("slug", slug).single();
    unidadeId = u?.id ?? null;
  }

  // IDs das cotações da unidade ativa (null = todas as unidades, sem filtro)
  let cotIds: string[] | null = null;
  if (unidadeId) {
    const { data: cu } = await supabase
      .from("cotacao_unidades")
      .select("cotacao_id")
      .eq("unidade_id", unidadeId);
    cotIds = (cu ?? []).map((r) => r.cotacao_id);
  }

  // ── Busca perfil e badge em paralelo ───────────────────────────────────────
  const [
    { data: profile },
    { count: cotacoesBadge },
  ] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("nome, email, role, avatar_url")
      .eq("id", user.id)
      .single(),
    (() => {
      // Unidade específica sem nenhuma cotação → badge 0 (sem consulta extra)
      if (cotIds !== null && cotIds.length === 0) {
        return Promise.resolve({ count: 0 });
      }
      let q = supabase
        .from("cotacoes")
        .select("*", { count: "exact", head: true })
        .in("status", ["rascunho", "cotacao", "pendente"])
        .is("deleted_at", null);
      if (cotIds !== null) q = q.in("id", cotIds);
      return q;
    })(),
  ]);

  // Fallback caso perfil ainda não exista (primeiro acesso)
  const userInfo = {
    nome:      profile?.nome      ?? user.email?.split("@")[0] ?? "Usuário",
    email:     profile?.email     ?? user.email ?? "",
    role:      profile?.role      ?? "solicitante",
    avatarUrl: profile?.avatar_url ?? null,
  };

  return (
    <ShellClient user={userInfo} cotacoesBadge={cotacoesBadge ?? 0}>
      {children}
    </ShellClient>
  );
}
