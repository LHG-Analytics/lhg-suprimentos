/**
 * app/api/debug-omie-pedidos/route.ts — TEMPORÁRIO
 * Inspeciona a resposta BRUTA do Omie para pedidos de compra (primeira página).
 * Usa a unidade ativa do cookie lhg-unidade-slug (mesma da sidebar).
 *
 * ⚠️ REDUNDANT: Omie bloqueia chamadas repetidas em < 60s.
 * Aguarde 60s após qualquer sync antes de visitar este endpoint.
 * REMOVER após diagnóstico confirmado.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { omiePost } from "@/lib/omie/client";
import type { OmieCredentials } from "@/lib/omie/client";

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const cookieStore = await cookies();
  const slug = cookieStore.get("lhg-unidade-slug")?.value ?? "todas";

  const svcClient = createServiceClient();

  let query = svcClient
    .from("unidades")
    .select("id, slug, nome, omie_app_key, omie_app_secret")
    .eq("ativa", true)
    .not("omie_app_key", "is", null)
    .not("omie_app_secret", "is", null);

  if (slug && slug !== "todas") query = query.eq("slug", slug);

  const { data: unidades, error } = await query.limit(1);
  if (error || !unidades?.length) {
    return NextResponse.json({ ok: false, slug_cookie: slug, error: "Nenhuma unidade com credenciais Omie." }, { status: 400 });
  }

  const unidade = unidades[0];
  const creds: OmieCredentials = {
    appKey:    unidade.omie_app_key as string,
    appSecret: unidade.omie_app_secret as string,
  };

  try {
    const raw = await omiePost<Record<string, unknown>, Record<string, unknown>>(
      "/produtos/pedidocompra/",
      "PesquisarPedCompra",
      creds,
      // Parâmetros corretos do PesquisarPedCompra: nPagina, nRegsPorPagina, lApenasImportadoApi
      // Usa página 2 (max 2 registros) para evitar REDUNDANT com o sync (que usa página 1, 100 registros)
      { nPagina: 2, nRegsPorPagina: 2, lApenasImportadoApi: "N" } as Record<string, unknown>,
    );

    // Mapeia todas as chaves da resposta
    const keysInfo = Object.entries(raw).reduce<Record<string, unknown>>((acc, [k, v]) => {
      acc[k] = Array.isArray(v) ? `Array(${(v as unknown[]).length})` : v;
      return acc;
    }, {});

    // Detecta o campo que contém os pedidos (qualquer array de objetos)
    let campoDetectado = "NENHUM";
    let primeiroPedido: unknown = null;
    for (const [k, v] of Object.entries(raw)) {
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object") {
        campoDetectado = k;
        primeiroPedido = v[0];
        break;
      }
    }

    return NextResponse.json({
      ok: true,
      unidade: { nome: unidade.nome, slug: unidade.slug },
      slug_cookie: slug,
      paginacao: {
        total_de_paginas:   raw.total_de_paginas,
        total_de_registros: raw.total_de_registros,
        registros:          raw.registros,
      },
      campo_detectado: campoDetectado,
      todas_as_chaves: keysInfo,
      primeiro_item: primeiroPedido,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isRedundant = msg.toUpperCase().includes("REDUNDANT");
    return NextResponse.json({
      ok: false,
      unidade: { nome: unidade.nome, slug: unidade.slug },
      slug_cookie: slug,
      erro: msg,
      dica: isRedundant
        ? "REDUNDANT: Omie detectou chamada duplicada. Aguarde 60s SEM clicar em Sync e tente novamente."
        : "Verifique as credenciais Omie da unidade.",
    });
  }
}
