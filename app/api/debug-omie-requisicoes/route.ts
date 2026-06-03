/**
 * app/api/debug-omie-requisicoes/route.ts — TEMPORÁRIO (remover após diagnóstico)
 * Testa o endpoint de Requisição de Compra do Omie e retorna a resposta bruta.
 * Testa: ListarReq, IncluirReq e UpsertReq para identificar calls válidas.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

const OMIE_BASE = "https://app.omie.com.br/api/v1";

async function omieRaw(appKey: string, appSecret: string, endpoint: string, call: string, param: object) {
  const res = await fetch(`${OMIE_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_key: appKey, app_secret: appSecret, call, param: [param] }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json();
  return { httpStatus: res.status, call, endpoint, body };
}

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svcClient = createServiceClient();
  const { data: unidades, error } = await svcClient
    .from("unidades")
    .select("id, slug, nome, omie_app_key, omie_app_secret")
    .eq("ativa", true)
    .not("omie_app_key", "is", null)
    .not("omie_app_secret", "is", null)
    .limit(1);

  if (error || !unidades?.length) {
    return NextResponse.json({ ok: false, error: "Nenhuma unidade com credenciais Omie." }, { status: 400 });
  }

  const { omie_app_key: appKey, omie_app_secret: appSecret, nome } = unidades[0];
  const key = (appKey as string).replace(/^﻿/, "");
  const secret = (appSecret as string).replace(/^﻿/, "");

  // Busca um produto real do DB para usar no teste
  const { data: produtos } = await svcClient
    .from("produtos")
    .select("omie_codigo, nome")
    .eq("ativo", true)
    .not("omie_codigo", "is", null)
    .limit(1);

  const prodOmie = produtos?.[0];
  const testId = `debug-req-${Date.now()}`;

  const results: object[] = [];

  const codProd = prodOmie?.omie_codigo ? Number(prodOmie.omie_codigo) : undefined;
  // IDs de 20 chars (exatamente como toOmieId faz)
  const shortId     = testId.replace(/-/g, "").slice(0, 20);
  const shortItemId = (testId + "item1").replace(/-/g, "").slice(0, 20);

  // Teste 1: UpsertReq com a estrutura que implementamos (deve funcionar)
  results.push(await omieRaw(key, secret, "/produtos/requisicaocompra/", "UpsertReq", {
    rcCadastro: {
      codIntReqCompra: shortId,
      obsReqCompra:    "Teste debug LHG - UpsertReq",
      ItensReqCompra:  [{ codIntItem: shortItemId, codProd, qtde: 1, precoUnit: 0 }],
    },
  }));

  // Teste 2: PesquisarReq — verifica se criou
  results.push(await omieRaw(key, secret, "/produtos/requisicaocompra/", "PesquisarReq", {
    rcListarRequest: { nPagina: 1, nRegPorPagina: 3 },
  }));

  // Teste 3: ConsultarReq pelo código de integração
  results.push(await omieRaw(key, secret, "/produtos/requisicaocompra/", "ConsultarReq", {
    rcChave: { codIntReqCompra: shortId },
  }));

  return NextResponse.json({
    unidade: nome,
    produto_usado: prodOmie ?? "nenhum",
    testId,
    results,
  });
}
