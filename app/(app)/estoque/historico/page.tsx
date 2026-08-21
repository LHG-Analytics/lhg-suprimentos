/**
 * app/(app)/estoque/historico/page.tsx — módulo de Estoque (bloco 6)
 * Histórico de ciclos fechados.
 *
 * A tela de Contagem só mostra o ciclo ABERTO de um local — fechar um ciclo
 * faz o resultado (inclusive a divergência que acabou de ser apurada)
 * desaparecer da tela. O objetivo do módulo é comparar perda ao longo do
 * tempo, então essa lacuna é séria: esta página é o arquivo desses ciclos.
 *
 * O local ativo vem do cookie de unidade da sidebar, resolvido do mesmo jeito
 * que /estoque e /estoque/contagem: a unidade fiscal escolhida aponta para o
 * local físico via `local_unidade`.
 */
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { calcularTeorico, calcularDivergencia } from "@/lib/estoque/ciclo";
import { HistoricoTabela } from "./_components/historico-tabela";
import type { CicloFechadoView } from "./_components/tipos";

export const metadata = { title: "Histórico de estoque" };

export default async function HistoricoEstoquePage() {
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

  const { data: ciclosFechados } = await supabase
    .from("estoque_ciclos")
    .select("id, mes, fechado_por, fechado_em")
    .eq("local_id", local.id)
    .eq("status", "fechado")
    .order("mes", { ascending: false });

  const ciclos = ciclosFechados ?? [];

  // `estoque_ciclos` tem DUAS FKs para user_profiles (aberto_por e
  // fechado_por) — embedar exigiria desambiguar a relação. Mais simples e
  // igualmente correto: resolver os nomes numa segunda query, à parte.
  const fechadoPorIds = Array.from(
    new Set(ciclos.map((c) => c.fechado_por).filter((id): id is string => id != null)),
  );
  const { data: perfis } =
    fechadoPorIds.length > 0
      ? await supabase.from("user_profiles").select("id, nome").in("id", fechadoPorIds)
      : { data: [] as { id: string; nome: string }[] };
  const nomePorUsuario = new Map((perfis ?? []).map((p) => [p.id, p.nome]));

  const cicloIds = ciclos.map((c) => c.id);
  const { data: todosItens } =
    cicloIds.length > 0
      ? await supabase
          .from("estoque_ciclo_itens")
          .select("ciclo_id, contagem_anterior, entradas, saidas, contagem_atual")
          .in("ciclo_id", cicloIds)
      : { data: [] as { ciclo_id: string; contagem_anterior: number | null; entradas: number | null; saidas: number | null; contagem_atual: number | null }[] };

  type ItemAgregadoRow = NonNullable<typeof todosItens>[number];
  const itensPorCiclo = new Map<string, ItemAgregadoRow[]>();
  for (const item of (todosItens ?? []) as ItemAgregadoRow[]) {
    const lista = itensPorCiclo.get(item.ciclo_id) ?? [];
    lista.push(item);
    itensPorCiclo.set(item.ciclo_id, lista);
  }

  const linhas: CicloFechadoView[] = ciclos.map((ciclo) => {
    const itens = itensPorCiclo.get(ciclo.id) ?? [];
    let perda = 0;
    let itensComDivergencia = 0;
    for (const item of itens) {
      const teorico = calcularTeorico({
        contagem_anterior: item.contagem_anterior,
        entradas: item.entradas,
        saidas: item.saidas,
      });
      const divergencia = calcularDivergencia(item.contagem_atual, teorico);
      if (divergencia == null || divergencia === 0) continue;
      itensComDivergencia++;
      if (divergencia < 0) perda += divergencia;
    }
    return {
      id: ciclo.id,
      mes: ciclo.mes,
      totalItens: itens.length,
      itensComDivergencia,
      perda,
      fechadoPorNome: ciclo.fechado_por ? nomePorUsuario.get(ciclo.fechado_por) ?? "—" : "—",
      fechadoEm: ciclo.fechado_em,
    };
  });

  return (
    <div className="space-y-4 pb-10">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Histórico de estoque</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{local.nome} · ciclos fechados</p>
      </div>
      <HistoricoTabela linhas={linhas} />
    </div>
  );
}
