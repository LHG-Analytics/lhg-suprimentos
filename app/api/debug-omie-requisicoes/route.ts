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

  const hoje = new Date();
  const dtReq = `${String(hoje.getDate()).padStart(2,"0")}/${String(hoje.getMonth()+1).padStart(2,"0")}/${hoje.getFullYear()}`;

  // Estrutura rcCadastro conforme erro do Omie
  const rcCadastro = {
    cCodInt:  testId,
    dDtReq:   dtReq,
    cObsReq:  "Teste debug LHG",
    det: [
      {
        nCodProd: prodOmie?.omie_codigo ? Number(prodOmie.omie_codigo) : undefined,
        nQtde:    1,
        nValUnit: 0,
        cCodInt:  `${testId}-item1`,
      },
    ],
  };

  // 1. Listar — testar vários nomes de call
  for (const call of ["ListarRequisicaoCompra", "ListarReqCompra", "PesquisarReqCompra", "ObterReqCompra"]) {
    results.push(await omieRaw(key, secret, "/produtos/requisicaocompra/", call, {
      pagina: 1,
      registros_por_pagina: 3,
    }));
  }

  // 2. Criar — testar nomes de call com estrutura rcCadastro
  for (const call of ["IncluirRequisicaoCompra", "IncluirReqCompra", "IncluirReq"]) {
    results.push(await omieRaw(key, secret, "/produtos/requisicaocompra/", call, {
      rcCadastro,
    }));
  }

  // 3. Upsert — testar nomes de call
  for (const call of ["UpsertRequisicaoCompra", "UpsertReqCompra", "UpsertReq"]) {
    results.push(await omieRaw(key, secret, "/produtos/requisicaocompra/", call, {
      rcCadastro: { ...rcCadastro, cCodInt: testId + "-up" },
    }));
  }

  return NextResponse.json({
    unidade: nome,
    produto_usado: prodOmie ?? "nenhum",
    testId,
    results,
  });
}
