/**
 * app/api/debug-omie-pedidos/route.ts — TEMPORÁRIO (remover após diagnóstico)
 * Faz um POST direto para o Omie e retorna status HTTP + body completo sem filtros.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

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
  const appKey    = unidade.omie_app_key as string;
  const appSecret = unidade.omie_app_secret as string;

  // Calcula últimos 7 dias
  const hoje   = new Date();
  const inicio = new Date(hoje);
  inicio.setDate(hoje.getDate() - 7);
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;

  const body = {
    app_key:    appKey,
    app_secret: appSecret,
    call: "PesquisarPedCompra",
    param: [{
      nPagina:                   1,
      nRegsPorPagina:            5,
      lApenasImportadoApi:       "F",
      lApenasAlterados:          "F",
      lExibirPedidosPendentes:   "T",
      lExibirPedidosFaturados:   "T",
      lExibirPedidosRecebidos:   "T",
      lExibirPedidosCancelados:  "T",
      lExibirPedidosEncerrados:  "T",
      lExibirPedidosRecParciais: "T",
      lExibirPedidosFatParciais: "T",
      dDataInicial:              fmt(inicio),
      dDataFinal:                fmt(hoje),
    }],
  };

  const url = "https://app.omie.com.br/api/v1/produtos/pedidocompra/";
  let httpStatus: number;
  let rawBody: unknown;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    httpStatus = res.status;
    rawBody = await res.json();
  } catch (err) {
    return NextResponse.json({
      ok: false,
      erro_fetch: err instanceof Error ? err.message : String(err),
    });
  }

  // Retorna tudo sem mascarar — omite apenas as credenciais
  return NextResponse.json({
    unidade:      { nome: unidade.nome, slug: unidade.slug },
    slug_cookie:  slug,
    http_status:  httpStatus,
    param_enviado: {
      ...body.param[0],
      // confirma que app_key/app_secret ficam no ROOT (não dentro do param)
    },
    resposta_completa: rawBody,
  });
}
