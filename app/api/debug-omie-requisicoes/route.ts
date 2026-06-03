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
  const hoje = new Date();
  const dtHoje = `${String(hoje.getDate()).padStart(2,"0")}/${String(hoje.getMonth()+1).padStart(2,"0")}/${hoje.getFullYear()}`;
  const shortId   = testId.replace(/-/g, "").slice(0, 20);
  const shortItem = ("i" + testId).replace(/-/g, "").slice(0, 20);

  // Passo 1: buscar categorias de DESPESA ativas (não transferência)
  // Varremos até 5 páginas procurando conta_despesa=S, conta_inativa=N, transferencia=N
  let primeiraCateg = "";
  for (let pg = 1; pg <= 5 && !primeiraCateg; pg++) {
    const categRes = await omieRaw(key, secret, "/geral/categorias/", "ListarCategorias", {
      pagina: pg, registros_por_pagina: 50,
    });
    if (categRes.httpStatus !== 200) break;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cats = (categRes.body as any)?.categoria_cadastro ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const despesa = cats.find((c: any) =>
      c.conta_despesa === "S" &&
      c.conta_inativa === "N" &&
      c.transferencia === "N" &&
      c.totalizadora === "N"
    );
    if (despesa) {
      primeiraCateg = despesa.codigo;
      results.push({ info: `Categoria despesa encontrada na página ${pg}: "${despesa.codigo}" - ${despesa.descricao}` } as object);
    }
    if (pg === categRes.body && cats.length < 50) break;
  }

  if (!primeiraCateg) {
    results.push({ info: "Nenhuma categoria de despesa ativa encontrada nas primeiras 5 páginas" } as object);
  }

  results.push({
    info: `Primeira categoria disponível: "${primeiraCateg}"`,
  } as object);

  if (primeiraCateg) {
    // Passo 2: criar requisição COM codCateg válido
    const criarRes = await omieRaw(key, secret, "/produtos/requisicaocompra/", "IncluirReq", {
      rcCadastro: {
        codCateg:        primeiraCateg,
        codIntReqCompra: shortId,
        dtSugestao:      dtHoje,
        obsReqCompra:    "Teste LHG Suprimentos",
        ItensReqCompra:  [{
          codIntItem: shortItem,
          codProd,
          qtde:       1,
          precoUnit:  0,
        }],
      },
    });
    results.push(criarRes);

    // Passo 3: confirmar que criou
    results.push(await omieRaw(key, secret, "/produtos/requisicaocompra/", "ConsultarReq", {
      codIntReqCompra: shortId,
      codReqCompra:    0,
    }));
  }

  return NextResponse.json({
    unidade: nome,
    produto_usado: prodOmie ?? "nenhum",
    testId,
    results,
  });
}
