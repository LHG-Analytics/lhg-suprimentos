/**
 * app/(app)/pedidos/page.tsx — LHG-214/215
 * Página de Pedidos de Compra.
 * Inclui aba "Pedidos Omie" com pedidos sincronizados do ERP (migration 0016).
 * Pedidos Omie filtrados pela unidade ativa (cookie lhg-unidade-slug).
 *
 * Enriquecimento de fornecedor_nome:
 *   PesquisarPedCompra só retorna nCodFor (código numérico, sem nome).
 *   Server-side, buscamos os nomes na tabela local "fornecedores" por omie_codigo.
 *
 * ⚠️ itens (produtos_consulta) requer migration: ALTER TABLE omie_pedidos_compra
 *    ADD COLUMN IF NOT EXISTS itens jsonb;
 *    Após rodar a migration, o select inclui "itens" e os dados ficam disponíveis.
 */
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { PedidosClient } from "./_components/pedidos-client";

// Sempre exibe apenas pedidos aguardando entrega (filtro_omie = 'pendentes')
type FiltroOmie = "pendentes";

// Tipo explícito para o row de omie_pedidos_compra após a migration de `itens`
interface OmieRow {
  id: string;
  omie_codigo: number;
  numero: number | null;
  data_pedido: string | null;
  data_previsao: string | null;
  fornecedor_codigo: number | null;
  fornecedor_nome: string | null;
  itens: Array<{ descricao: string; valor_total: number }> | null;
  valor_total: number | null;
  situacao: string | null;
  situacao_aprovacao: string | null;
  etapa: string | null;
  numero_pedido_forn: string | null;
  filtro_omie: string | null;
  omie_sincronizado_em: string;
  unidade_id: string;
  unidades: { nome: string; slug: string } | null;
}

export default async function PedidosPage() {
  const filtroAtivo: FiltroOmie = "pendentes";

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Lê a unidade ativa do cookie definido pelo UnidadeContext client-side
  const cookieStore = await cookies();
  const slug = cookieStore.get("lhg-unidade-slug")?.value ?? "todas";

  // Resolve UUID da unidade quando não é "todas"
  let unidadeId: string | null = null;
  if (slug && slug !== "todas") {
    const { data: unidade } = await supabase
      .from("unidades")
      .select("id")
      .eq("slug", slug)
      .single();
    unidadeId = unidade?.id ?? null;
  }

  // Pré-filtra IDs de pedidos pertencentes à unidade ativa
  let pedidoIdsParaUnidade: string[] | null = null;
  if (unidadeId) {
    const { data: pedUnidades } = await supabase
      .from("pedido_unidades")
      .select("pedido_id")
      .eq("unidade_id", unidadeId);
    pedidoIdsParaUnidade = (pedUnidades ?? []).map((p) => p.pedido_id);
  }

  // Query de omie_pedidos filtrada pela unidade ativa E pelo filtro de status
  // Nota: filtro_omie foi adicionado pela migration 0017 e ainda não está nos
  // tipos gerados pelo Supabase — chamamos .eq() depois da atribuição any
  // para evitar erro de TypeScript no build.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let omieQuery: any = supabase
    .from("omie_pedidos_compra")
    .select(`
      id, omie_codigo, numero, data_pedido, data_previsao,
      fornecedor_codigo, fornecedor_nome, itens, valor_total, situacao, situacao_aprovacao,
      etapa, numero_pedido_forn, filtro_omie, omie_sincronizado_em, unidade_id,
      unidades(nome, slug)
    `)
    .order("numero", { ascending: false });

  // filtro_omie: chamado sobre `any` para contornar tipos desatualizados
  omieQuery = omieQuery.eq("filtro_omie", filtroAtivo);
  if (unidadeId) omieQuery = omieQuery.eq("unidade_id", unidadeId);

  const [{ data: pedidos }, omieResult, fornecedores, produtos] = await Promise.all([
    (() => {
      let q = supabase
        .from("pedidos")
        .select(`
          id, numero, status, valor_total, condicao_pgto, entrega_prev,
          fornecedor_id, created_at, email_enviado_em, omie_status, omie_codigo,
          comprador:user_profiles!comprador_id(nome, avatar_url),
          aprovador:user_profiles!aprovador_id(nome),
          fornecedores(id, razao_social, nome_fantasia, email, rating, pontualidade_pct),
          cotacoes(id, numero, titulo),
          pedido_itens(
            id, quantidade, preco_unitario, valor_total,
            produtos(id, nome, codigo, unidade_med, categoria)
          ),
          pedido_eventos(
            id, tipo, texto, created_at, autor_nome,
            autor:user_profiles!autor_id(nome, avatar_url)
          )
        `)
        .order("created_at", { ascending: false });
      // Aplica filtro por unidade quando selecionada
      if (pedidoIdsParaUnidade !== null) {
        q = pedidoIdsParaUnidade.length > 0
          ? q.in("id", pedidoIdsParaUnidade)
          : q.in("id", ["00000000-0000-0000-0000-000000000000"]); // nenhum resultado
      }
      return q;
    })(),

    omieQuery,

    // fetchAllRows: PostgREST trava em 1000 linhas (max-rows) — garante a lista completa
    fetchAllRows((from, to) =>
      supabase
        .from("fornecedores")
        .select("id, razao_social, nome_fantasia")
        .eq("ativo", true)
        .order("razao_social")
        .order("id")
        .range(from, to),
    ),

    // Catálogo de produtos para "Adicionar item" no modal de edição.
    // fetchAllRows: PostgREST trava em 1000 linhas (max-rows) — catálogo tem 1240+
    fetchAllRows((from, to) =>
      unidadeId
        ? supabase
            .from("produtos")
            .select("id, nome, codigo, unidade_med, categoria")
            .eq("ativo", true)
            .eq("omie_unidade_id", unidadeId)
            .order("nome")
            .order("id")
            .range(from, to)
        : supabase
            .from("produtos")
            .select("id, nome, codigo, unidade_med, categoria")
            .eq("ativo", true)
            .order("nome")
            .order("id")
            .range(from, to),
    ),
  ]);

  // ── Enriquecer fornecedor_nome ────────────────────────────────────────────────
  // PesquisarPedCompra devolve apenas nCodFor (número inteiro) — o nome fica null.
  // Buscamos os nomes na tabela local por omie_codigo, deduplizando os códigos.
  const omie_raw: OmieRow[] = (omieResult.data ?? []) as OmieRow[];

  const codigoSet = new Set<string>();
  for (const p of omie_raw) {
    if (!p.fornecedor_nome && p.fornecedor_codigo) {
      codigoSet.add(String(p.fornecedor_codigo));
    }
  }

  const fornMap = new Map<string, string>();
  if (codigoSet.size > 0) {
    const { data: fornLookup } = await supabase
      .from("fornecedores")
      .select("omie_codigo, razao_social, nome_fantasia")
      .in("omie_codigo", [...codigoSet]);

    for (const f of fornLookup ?? []) {
      if (f.omie_codigo) {
        fornMap.set(f.omie_codigo, f.nome_fantasia || f.razao_social);
      }
    }
  }

  const omie_pedidos = omie_raw.map(p => ({
    ...p,
    fornecedor_nome: p.fornecedor_nome ??
      (p.fornecedor_codigo ? (fornMap.get(String(p.fornecedor_codigo)) ?? null) : null),
  }));

  return (
    <PedidosClient
      pedidos={pedidos ?? []}
      omie_pedidos={omie_pedidos}
      filtroAtivo={filtroAtivo}
      fornecedores={fornecedores}
      produtos={produtos ?? []}
    />
  );
}
