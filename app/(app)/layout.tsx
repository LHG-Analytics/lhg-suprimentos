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

  /*
   * Este layout roda antes de QUALQUER página do app, então cada ida ao banco
   * aqui é latência somada a toda navegação que precise revalidá-lo. Antes eram
   * 4 idas EM SÉRIE: getUser → unidades → cotacao_unidades → (perfil ‖ badge).
   * Agora são 2, em duas rodadas paralelas.
   */
  const slug = (await cookies()).get("lhg-unidade-slug")?.value ?? "todas";

  // ── Rodada 1: autenticação e unidade ativa, em paralelo ────────────────────
  // A consulta de unidade não depende do usuário, então esperar o `getUser()`
  // para começá-la era desperdício. Ela roda sob RLS com a sessão do próprio
  // usuário — sem sessão válida não retorna nada, e o redirect abaixo corta o
  // fluxo antes de qualquer coisa chegar ao cliente.
  const [
    { data: { user } },
    { data: unidade },
  ] = await Promise.all([
    supabase.auth.getUser(),
    slug && slug !== "todas"
      ? supabase.from("unidades").select("id").eq("slug", slug).maybeSingle()
      : Promise.resolve({ data: null as { id: string } | null }),
  ]);

  if (!user) redirect("/login");

  const unidadeId = unidade?.id ?? null;

  // ── Rodada 2: perfil e badge, em paralelo ──────────────────────────────────
  const [
    { data: profile },
    { count: cotacoesBadge },
  ] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("nome, email, role, avatar_url")
      .eq("id", user.id)
      .single(),
    /*
     * Badge em UMA consulta, com join embutido, em vez de buscar os ids das
     * cotações da unidade e depois contá-los. Conferido contra a abordagem
     * antiga nas 6 unidades (via supabase-js, no banco de produção): contagens
     * idênticas. O filtro por unidade continua sendo o do seletor.
     *
     * `unidadeId` nulo (unidade "todas", ou slug de cookie que não existe) conta
     * o consolidado — mesmo comportamento de antes, preservado de propósito para
     * esta mudança ser só de latência.
     */
    (() => {
      if (unidadeId == null) {
        return supabase
          .from("cotacoes")
          .select("*", { count: "exact", head: true })
          .in("status", ["rascunho", "cotacao", "pendente"])
          .is("deleted_at", null);
      }
      return supabase
        .from("cotacoes")
        .select("id, cotacao_unidades!inner(unidade_id)", { count: "exact", head: true })
        .in("status", ["rascunho", "cotacao", "pendente"])
        .is("deleted_at", null)
        .eq("cotacao_unidades.unidade_id", unidadeId);
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
