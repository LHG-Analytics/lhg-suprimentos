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

  const [{ data: itens }, produtos] = await Promise.all([
    supabase
      .from("estoque_itens")
      .select(
        "id, produto_id, automo_produto_id, fator_conversao, estoque_ideal, ativo, produtos(nome, codigo, unidade_med, categoria)",
      )
      .eq("local_id", local.id)
      .order("id"),

    fetchAllRows<ProdutoLhg>((from, to) =>
      supabase
        .from("produtos")
        .select("id, codigo, nome, unidade_med, categoria")
        .eq("ativo", true)
        .order("nome")
        .order("id")
        .range(from, to),
    ),
  ]);

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
