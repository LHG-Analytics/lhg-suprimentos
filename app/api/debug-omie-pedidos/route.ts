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

  // Testa DOIS cenários lado a lado para diagnóstico:
  // A) Sem filtros lExibir (comportamento antigo, página 3 para evitar REDUNDANT)
  // B) Com filtros lExibir "T" (comportamento novo, página 4)
  async function chamarOmie(nPagina: number, comFiltros: boolean) {
    const params: Record<string, unknown> = {
      nPagina,
      nRegsPorPagina: 3,
      lApenasImportadoApi: "F",
      lApenasAlterados:    "F",
    };
    if (comFiltros) {
      params.lExibirPedidosPendentes   = "T";
      params.lExibirPedidosFaturados   = "T";
      params.lExibirPedidosRecebidos   = "T";
      params.lExibirPedidosCancelados  = "T";
      params.lExibirPedidosEncerrados  = "T";
      params.lExibirPedidosRecParciais = "T";
      params.lExibirPedidosFatParciais = "T";
    }
    try {
      const raw = await omiePost<Record<string, unknown>, Record<string, unknown>>(
        "/produtos/pedidocompra/", "PesquisarPedCompra", creds, params,
      );
      const keysInfo = Object.entries(raw).reduce<Record<string, unknown>>((acc, [k, v]) => {
        acc[k] = Array.isArray(v) ? `Array(${(v as unknown[]).length})` : v;
        return acc;
      }, {});
      let campoDetectado = "NENHUM";
      let primeiroPedido: unknown = null;
      for (const [k, v] of Object.entries(raw)) {
        if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object") {
          campoDetectado = k; primeiroPedido = v[0]; break;
        }
      }
      return {
        ok: true,
        params_enviados: params,
        paginacao: {
          nPagina:         raw.nPagina,
          nTotPaginas:     raw.nTotPaginas,
          nTotRegistros:   raw.nTotRegistros,
          total_de_paginas:   raw.total_de_paginas,
          total_de_registros: raw.total_de_registros,
        },
        campo_detectado: campoDetectado,
        todas_as_chaves: keysInfo,
        primeiro_item: primeiroPedido,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, params_enviados: params, erro: msg };
    }
  }

  try {
    const [semFiltros, comFiltros] = await Promise.all([
      chamarOmie(3, false),
      chamarOmie(4, true),
    ]);

    return NextResponse.json({
      ok: true,
      unidade: { nome: unidade.nome, slug: unidade.slug },
      slug_cookie: slug,
      cenario_A_sem_filtros_lExibir: semFiltros,
      cenario_B_com_filtros_lExibir_T: comFiltros,
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
