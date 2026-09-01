/**
 * app/(app)/estoque/page.tsx — módulo de Estoque (bloco 1)
 * Cadastro dos itens controlados por local.
 *
 * O local ativo vem do cookie de unidade da sidebar: a unidade fiscal escolhida
 * resolve para o local físico via `local_unidade`. Assim RCC e CONCAVO caem no
 * mesmo local, que é a razão de a tabela existir.
 */
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { listarProdutosAutomo, AutomoIndisponivelError } from "@/lib/automo/client";
import { normalizarNome } from "@/lib/estoque/mapeamento";
import { EstoqueClient } from "./_components/estoque-client";
import type { ProdutoLhg, ItemEstoque } from "./_components/tipos";

export const metadata = { title: "Estoque" };

export default async function EstoquePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const slug = (await cookies()).get("lhg-unidade-slug")?.value ?? "todas";

  const { data: locais } = await supabase
    .from("locais_estoque")
    .select("id, nome, slug, automo_conn_key, local_unidade(unidade_id, unidades(slug, nome))")
    .eq("ativo", true)
    .order("nome");

  type LocalRow = NonNullable<typeof locais>[number];
  const todos = (locais ?? []) as LocalRow[];

  // Resolve o local pela unidade fiscal do cookie; "todas" cai no primeiro.
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

  // UUID sentinela força catálogo vazio em vez de trazer tudo, caso o local não
  // tenha unidade fiscal vinculada — `.in()` com array vazio no PostgREST não
  // filtra nada.
  const unidadeIdsDoLocal = local.local_unidade.length > 0
    ? local.local_unidade.map((lu) => lu.unidade_id)
    : ["00000000-0000-0000-0000-000000000000"];

  const [{ data: itens }, produtosBrutos] = await Promise.all([
    supabase
      .from("estoque_itens")
      .select(
        "id, produto_id, automo_produto_id, fator_conversao, estoque_ideal, ativo, produtos(nome, codigo, unidade_med, categoria)",
      )
      .eq("local_id", local.id)
      // Item desativado (removido do controle) sai do cadastro, mas a contagem
      // dele nos ciclos passados continua — ver removerItemEstoque.
      .eq("ativo", true)
      .order("id"),

    /*
     * Catálogo restrito às unidades fiscais DESTE local.
     *
     * Sem o filtro vinham os produtos de todas as unidades misturados (~3.400),
     * então a busca oferecia itens que não existem no Omie do local — e o vínculo
     * criado assim nunca casaria uma entrada.
     *
     * O Lush Ipiranga tem dois CNPJs, então o mesmo produto aparece duas vezes
     * (um `omie_codigo` por conta). A deduplicação por código + nome resolve:
     * qualquer das duas linhas serve, porque `resolverChavesOmie` encontra os
     * dois `omie_codigo` na hora de importar a entrada.
     */
    fetchAllRows<ProdutoLhg & { omie_unidade_id: string | null }>((from, to) =>
      supabase
        .from("produtos")
        .select("id, codigo, nome, unidade_med, categoria, omie_unidade_id")
        .eq("ativo", true)
        .in("omie_unidade_id", unidadeIdsDoLocal)
        .order("nome")
        .order("id")
        .range(from, to),
    ),
  ]);

  /*
   * Deduplica o catálogo por (código + nome normalizado).
   *
   * Num local com dois CNPJs o mesmo produto vem duas vezes, uma por conta Omie,
   * com `omie_codigo` diferente. Mostrar as duas faria a compradora escolher
   * entre duas COCA COLA idênticas sem saber a diferença — e não há diferença
   * que importe: `resolverChavesOmie` casa por código + nome e encontra os dois
   * `omie_codigo` na importação, qualquer que seja a linha escolhida.
   */
  const vistos = new Set<string>();
  const produtos: ProdutoLhg[] = [];
  for (const p of produtosBrutos) {
    const chave = `${p.codigo}|${normalizarNome(p.nome)}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    produtos.push({
      id: p.id, codigo: p.codigo, nome: p.nome,
      unidade_med: p.unidade_med, categoria: p.categoria,
    });
  }

  // O Automo cai com frequência (o banco do Andar de Cima em particular). Uma
  // falha aqui não pode derrubar a tela — ela degrada para cadastro sem sugestão.
  let produtosAutomo: Awaited<ReturnType<typeof listarProdutosAutomo>> = [];
  let automoErro: string | null = null;
  if (local.automo_conn_key) {
    try {
      produtosAutomo = await listarProdutosAutomo(local.automo_conn_key);
    } catch (err) {
      automoErro =
        err instanceof AutomoIndisponivelError
          ? "Banco do Automo indisponível — o cadastro funciona, mas sem sugestão de mapeamento."
          : "Erro inesperado ao ler o Automo.";
      console.error("[estoque] Automo:", err);
    }
  }

  return (
    <EstoqueClient
      local={{ id: local.id, nome: local.nome }}
      unidadesFiscais={local.local_unidade.map((lu) => lu.unidades?.nome ?? "—")}
      itens={(itens ?? []) as ItemEstoque[]}
      produtos={produtos}
      produtosAutomo={produtosAutomo}
      automoErro={automoErro}
    />
  );
}
