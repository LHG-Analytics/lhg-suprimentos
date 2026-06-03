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

  // 1. Listar requisições existentes
  results.push(await omieRaw(key, secret, "/produtos/requisicaocompra/", "ListarReq", {
    pagina: 1,
    registros_por_pagina: 3,
    filtrar_situacao: "Aberta",
  }));

  // 2. Tentar IncluirReq (chamada original)
  results.push(await omieRaw(key, secret, "/produtos/requisicaocompra/", "IncluirReq", {
    requisicaoCadastro: {
      codIntReqCompra: testId,
      obsReqCompra:    "Teste debug LHG",
      ItensReqCompra:  [
        {
          codIntItem: `${testId}-item1`,
          codProd:    prodOmie?.omie_codigo ? Number(prodOmie.omie_codigo) : undefined,
          qtde:       1,
          precoUnit:  0,
        },
      ],
    },
  }));

  // 3. Tentar UpsertReq com o mesmo ID
  results.push(await omieRaw(key, secret, "/produtos/requisicaocompra/", "UpsertReq", {
    requisicaoCadastro: {
      codIntReqCompra: testId,
      obsReqCompra:    "Teste debug LHG (upsert)",
      ItensReqCompra:  [
        {
          codIntItem: `${testId}-item1`,
          codProd:    prodOmie?.omie_codigo ? Number(prodOmie.omie_codigo) : undefined,
          qtde:       1,
          precoUnit:  0,
        },
      ],
    },
  }));

  return NextResponse.json({
    unidade: nome,
    produto_usado: prodOmie ?? "nenhum",
    testId,
    results,
  });
}
