/**
 * app/api/debug-omie-pedidos/route.ts — TEMPORÁRIO
 * Inspeciona a resposta BRUTA do Omie para pedidos de compra (primeira página).
 * Usa a unidade ativa do cookie lhg-unidade-slug (mesma da sidebar).
 * REMOVER após diagnóstico confirmado.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { omiePost } from "@/lib/omie/client";
import type { OmieCredentials } from "@/lib/omie/client";

export async function GET(_req: NextRequest) {
  // Auth: precisa estar logado
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  // Lê o cookie da unidade ativa (mesma lógica da sidebar)
  const cookieStore = await cookies();
  const slug = cookieStore.get("lhg-unidade-slug")?.value ?? "todas";

  const svcClient = createServiceClient();

  // Busca a unidade correspondente ao slug do cookie
  let query = svcClient
    .from("unidades")
    .select("id, slug, nome, omie_app_key, omie_app_secret")
    .eq("ativa", true)
    .not("omie_app_key", "is", null)
    .not("omie_app_secret", "is", null);

  if (slug && slug !== "todas") {
    query = query.eq("slug", slug);
  }

  const { data: unidades, error } = await query.limit(1);

  if (error || !unidades?.length) {
    return NextResponse.json({
      ok: false,
      slug_cookie: slug,
      error: "Nenhuma unidade com credenciais Omie para este slug.",
    }, { status: 400 });
  }

  const unidade = unidades[0];
  const creds: OmieCredentials = {
    appKey:    unidade.omie_app_key as string,
    appSecret: unidade.omie_app_secret as string,
  };

  // Testa o endpoint correto com 3 registros apenas (diagnóstico rápido)
  try {
    const raw = await omiePost<Record<string, unknown>, Record<string, unknown>>(
      "/produtos/pedidocompra/",
      "PesquisarPedCompra",
      creds,
      { pagina: 1, registros_por_pagina: 3 } as Record<string, unknown>,
    );

    // Mapeia todas as chaves da resposta para diagnóstico
    const keysInfo = Object.entries(raw).reduce<Record<string, unknown>>((acc, [k, v]) => {
      acc[k] = Array.isArray(v) ? `Array(${(v as unknown[]).length})` : typeof v === "object" ? "object" : v;
      return acc;
    }, {});

    // Detecta qual campo contém os pedidos
    const camposCandidatos: Record<string, unknown[] | undefined> = {
      pedidos_compra:       raw.pedidos_compra       as unknown[] | undefined,
      lista_pedidos_compra: raw.lista_pedidos_compra as unknown[] | undefined,
      pedido_compra:        raw.pedido_compra        as unknown[] | undefined,
      pedidos:              raw.pedidos              as unknown[] | undefined,
      lista_pedidos:        raw.lista_pedidos        as unknown[] | undefined,
      pedido:               raw.pedido               as unknown[] | undefined,
    };

    const campoEncontrado = Object.entries(camposCandidatos).find(([, v]) => Array.isArray(v) && v.length > 0);
    const itens = campoEncontrado?.[1];

    return NextResponse.json({
      ok: true,
      unidade: { id: unidade.id, nome: unidade.nome, slug: unidade.slug },
      slug_cookie: slug,
      paginacao: {
        total_de_paginas:   raw.total_de_paginas,
        total_de_registros: raw.total_de_registros,
        registros:          raw.registros,
      },
      campo_detectado: campoEncontrado?.[0] ?? "NENHUM — veja todas_as_chaves",
      todas_as_chaves: keysInfo,
      todos_campos_candidatos: Object.fromEntries(
        Object.entries(camposCandidatos).map(([k, v]) => [k, v !== undefined ? `Array(${v.length})` : "ausente"]),
      ),
      primeiro_item: itens?.[0] ?? null,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      unidade: { nome: unidade.nome, slug: unidade.slug },
      slug_cookie: slug,
      erro: err instanceof Error ? err.message : String(err),
      dica: "Se for REDUNDANT, aguarde 60s e tente novamente. Se for outro erro, verifique as credenciais Omie.",
    });
  }
}
