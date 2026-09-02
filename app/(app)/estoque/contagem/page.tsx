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

  // Verdadeiro só quando não existe nenhum ciclo deste local com `mes` menor
  // que o do ciclo aberto — ou seja, este é o primeiro ciclo do local, o
  // único que pode ter itens sem saldo de abertura ainda. Sozinho isso não
  // basta: ver `faltaSaldoAbertura` mais abaixo, depois que os itens são
  // carregados.
  let ehPrimeiroCiclo = false;
  if (cicloAberto) {
    const { count: ciclosAnteriores } = await supabase
      .from("estoque_ciclos")
      .select("id", { count: "exact", head: true })
      .eq("local_id", local.id)
      .lt("mes", cicloAberto.mes);
    ehPrimeiroCiclo = (ciclosAnteriores ?? 0) === 0;
  }

  // Nomes das unidades fiscais (CNPJs) do local, indexados por unidade_id —
  // usado só para rotular o rateio de entradas por CNPJ (bloco 5).
  const nomePorUnidade = new Map<string, string>(
    local.local_unidade
      .map((lu) => [lu.unidade_id, lu.unidades?.nome ?? null] as const)
      .filter((par): par is [string, string] => par[1] != null),
  );
  const temMultiplasUnidadesFiscais = local.local_unidade.length > 1;

  let itens: CicloItemView[] = [];
  if (cicloAberto) {
    const { data: itensCiclo } = await supabase
      .from("estoque_ciclo_itens")
      .select(
        "id, contagem_anterior, entradas, saidas, contagem_atual, contado_em, estoque_itens(estoque_ideal, produtos(nome, unidade_med)), user_profiles(nome), estoque_ciclo_item_entradas(unidade_id, quantidade)",
      )
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
        entradasDetalhe: (row.estoque_ciclo_item_entradas ?? [])
          .map((d) => ({
            unidadeNome: nomePorUnidade.get(d.unidade_id) ?? "—",
            quantidade: d.quantidade,
          }))
          .sort((a, b) => a.unidadeNome.localeCompare(b.unidadeNome, "pt-BR")),
      }))
      .sort((a, b) => a.produtoNome.localeCompare(b.produtoNome, "pt-BR"));
  }

  // O modo "saldo de abertura" depende do que falta preencher, não de qual
  // ciclo é: só faz sentido enquanto sobra item sem contagem_anterior. Assim
  // que o último saldo de abertura é registrado, este flag vira false por
  // conta própria (sem condição de data) e a tela passa para o fechamento
  // normal — inclusive dentro do primeiro ciclo, no mesmo mês.
  const faltaSaldoAbertura = ehPrimeiroCiclo && itens.some((item) => item.contagemAnterior == null);

  /*
   * Itens controlados que ficaram fora do ciclo aberto.
   *
   * `abrirCiclo` materializa as linhas no momento da abertura, então item
   * cadastrado depois não entra sozinho. Sem esse aviso ele simplesmente não
   * aparecia na contagem — foi o que aconteceu com a COCA COLA cadastrada três
   * dias depois de o ciclo de agosto abrir vazio.
   */
  const itensForaDoCiclo = cicloAberto
    ? Math.max(0, (totalItensAtivos ?? 0) - itens.length)
    : 0;

  return (
    <ContagemClient
      local={{ id: local.id, nome: local.nome }}
      temItensControlados={(totalItensAtivos ?? 0) > 0}
      ciclo={cicloAberto ? ({ id: cicloAberto.id, mes: cicloAberto.mes } satisfies CicloView) : null}
      itens={itens}
      itensForaDoCiclo={itensForaDoCiclo}
      ehPrimeiroCiclo={ehPrimeiroCiclo}
      faltaSaldoAbertura={faltaSaldoAbertura}
      temMultiplasUnidadesFiscais={temMultiplasUnidadesFiscais}
      unidadesFiscais={Array.from(nomePorUnidade.values()).sort((a, b) => a.localeCompare(b, "pt-BR"))}
    />
  );
}
