/**
 * app/(app)/estoque/contagem/page.tsx — módulo de Estoque (bloco 2)
 * Contagem mensal, feita andando pelo estoque com o celular na mão.
 *
 * O local ativo vem do cookie de unidade da sidebar, resolvido do mesmo jeito
 * que /estoque: a unidade fiscal escolhida aponta para o local físico via
 * `local_unidade`.
 */
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ContagemClient } from "./_components/contagem-client";
import type { CicloView, CicloItemView } from "./_components/tipos";

export const metadata = { title: "Contagem" };

export default async function ContagemPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const slug = (await cookies()).get("lhg-unidade-slug")?.value ?? "todas";

  const { data: locais } = await supabase
    .from("locais_estoque")
    .select("id, nome, slug, local_unidade(unidade_id, unidades(slug, nome))")
    .eq("ativo", true)
    .order("nome");

  type LocalRow = NonNullable<typeof locais>[number];
  const todos = (locais ?? []) as LocalRow[];

  const local =
    slug === "todas"
      ? todos[0]
      : todos.find((l) => l.local_unidade.some((lu) => lu.unidades?.slug === slug)) ?? todos[0];

  if (!local) {
    return (
      <div className="max-w-3xl mx-auto py-10 px-4">
        <p className="text-sm text-muted-foreground">
          Nenhum local de estoque cadastrado. Rode a migration 0026.
        </p>
      </div>
    );
  }

  const { count: totalItensAtivos } = await supabase
    .from("estoque_itens")
    .select("id", { count: "exact", head: true })
    .eq("local_id", local.id)
    .eq("ativo", true);

  const { data: cicloAberto } = await supabase
    .from("estoque_ciclos")
    .select("id, mes")
    .eq("local_id", local.id)
    .eq("status", "aberto")
    .maybeSingle();

  let itens: CicloItemView[] = [];
  if (cicloAberto) {
    const { data: itensCiclo } = await supabase
      .from("estoque_ciclo_itens")
      .select("id, contagem_anterior, entradas, saidas, contagem_atual, contado_em, estoque_itens(estoque_ideal, produtos(nome, unidade_med)), user_profiles(nome)")
      .eq("ciclo_id", cicloAberto.id);

    type ItemCicloRow = NonNullable<typeof itensCiclo>[number];

    itens = ((itensCiclo ?? []) as ItemCicloRow[])
      .map((row) => ({
        id: row.id,
        produtoNome: row.estoque_itens?.produtos?.nome ?? "—",
        produtoUnidadeMed: row.estoque_itens?.produtos?.unidade_med ?? "",
        estoqueIdeal: row.estoque_itens?.estoque_ideal ?? 0,
        contagemAnterior: row.contagem_anterior,
        entradas: row.entradas,
        saidas: row.saidas,
        contagemAtual: row.contagem_atual,
        contadoPorNome: row.user_profiles?.nome ?? null,
        contadoEm: row.contado_em,
      }))
      .sort((a, b) => a.produtoNome.localeCompare(b.produtoNome, "pt-BR"));
  }

  return (
    <ContagemClient
      local={{ id: local.id, nome: local.nome }}
      temItensControlados={(totalItensAtivos ?? 0) > 0}
      ciclo={cicloAberto ? ({ id: cicloAberto.id, mes: cicloAberto.mes } satisfies CicloView) : null}
      itens={itens}
    />
  );
}
