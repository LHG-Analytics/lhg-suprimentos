/**
 * app/(app)/admin/usuarios/page.tsx — LHG-203
 * Gestão de usuários (admin only) — Server Component.
 */
import { redirect } from "next/navigation";
import { Users, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { InviteDialog } from "./_components/invite-dialog";
import { UserRowActions } from "./_components/user-row-actions";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Usuários" };

// ── Avatar com iniciais ────────────────────────────────────────────────────────
function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div
      className="shrink-0 rounded-full bg-lhg-800 text-foreground flex items-center justify-center font-mono font-semibold select-none"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}

// ── Página ─────────────────────────────────────────────────────────────────────
export default async function UsuariosPage() {
  const supabase = await createClient();

  // Auth
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verifica papel admin
  const { data: myProfile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (myProfile?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center gap-4">
        <ShieldAlert size={40} className="text-muted-foreground/40" />
        <div>
          <p className="text-foreground font-medium">Acesso restrito</p>
          <p className="text-muted-foreground text-sm mt-1">
            Apenas administradores podem acessar esta página.
          </p>
        </div>
      </div>
    );
  }

  // Busca com service client para ter acesso total mesmo com RLS
  const service = createServiceClient();

  const [{ data: profiles }, { data: unidades }, { data: { users: authUsers } }] = await Promise.all([
    service
      .from("user_profiles")
      .select("id, nome, email, role, created_at")
      .order("created_at", { ascending: false }),
    service
      .from("unidades")
      .select("id, nome")
      .eq("ativa", true)
      .order("nome"),
    service.auth.admin.listUsers({ perPage: 100 }),
  ]);

  // Mapa de status de ban por userId
  const banMap = new Map<string, boolean>(
    (authUsers ?? []).map((u) => [u.id, !!u.banned_until]),
  );

  const users = profiles ?? [];
  const unidadeList = (unidades ?? []).map((u) => ({ id: u.id, nome: u.nome }));

  return (
    <div className="max-w-[1200px] mx-auto pb-8 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-2">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
            Usuários
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {users.length} usuário{users.length !== 1 ? "s" : ""} cadastrado{users.length !== 1 ? "s" : ""}
          </p>
        </div>
        <InviteDialog unidades={unidadeList} />
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-border/80 bg-muted/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr>
                {["Usuário", "Papel / Ações", "Membro desde"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 h-10 text-[11px] uppercase tracking-wider text-muted-foreground font-medium"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === user.id;
                const banned = banMap.get(u.id) ?? false;

                return (
                  <tr
                    key={u.id}
                    className="border-t border-border/60 hover:bg-muted/40 transition-colors"
                  >
                    {/* Usuário */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Avatar name={u.nome} size={32} />
                          {/* Indicador suspenso */}
                          {banned && (
                            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background bg-red-500" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-foreground font-medium text-sm leading-tight truncate">
                            {u.nome}
                            {isSelf && (
                              <span className="ml-1.5 text-[10px] text-muted-foreground">(você)</span>
                            )}
                          </div>
                          <div className="text-muted-foreground text-xs leading-tight truncate">
                            {u.email}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Papel + ações */}
                    <td className="px-4 py-2.5">
                      <UserRowActions
                        userId={u.id}
                        currentRole={u.role as "admin" | "comprador" | "aprovador" | "solicitante"}
                        banned={banned}
                        isSelf={isSelf}
                      />
                    </td>

                    {/* Membro desde */}
                    <td className="px-4 py-2.5 text-muted-foreground text-xs font-mono">
                      {u.created_at ? formatDate(u.created_at, "dd/MM/yyyy") : "—"}
                    </td>
                  </tr>
                );
              })}

              {users.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-10 text-center text-muted-foreground/60 text-sm border-t border-border/60"
                  >
                    <Users size={24} className="mx-auto mb-2 opacity-40" />
                    Nenhum usuário cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legenda de papéis */}
      <div className="rounded-xl border border-border/80 bg-muted/20 px-5 py-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground/60 mb-3">
          Papéis e permissões
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { role: "Solicitante", color: "text-muted-foreground",  bg: "bg-muted",          desc: "Abre requisições e confere NF da sua unidade" },
            { role: "Comprador",   color: "text-sky-400",           bg: "bg-sky-500/15",      desc: "Gerencia cotações e pedidos de todas as unidades" },
            { role: "Aprovador",   color: "text-amber-400",         bg: "bg-amber-500/15",    desc: "Acesso completo a cotações e pedidos, com alçada de aprovação" },
            { role: "Admin",       color: "text-lhg-400",           bg: "bg-lhg-500/15",      desc: "Acesso total: usuários, configs e relatórios" },
          ].map((r) => (
            <div key={r.role} className="flex items-start gap-2.5">
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded shrink-0 ${r.bg} ${r.color}`}>
                {r.role}
              </span>
              <span className="text-[11px] text-muted-foreground leading-snug">{r.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
