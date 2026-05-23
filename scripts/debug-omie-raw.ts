/**
 * scripts/debug-omie-raw.ts
 * Descobre o método correto para listar produtos no Omie.
 */
import { createClient } from "@supabase/supabase-js";

async function post(appKey: string, appSecret: string, endpoint: string, call: string, param = {}) {
  const body = { app_key: appKey, app_secret: appSecret, call, param: [{ pagina: 1, registros_por_pagina: 2, ...param }] };
  const res = await fetch(`https://app.omie.com.br/api/v1${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text.slice(0, 300) };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: u } = await supabase.from("unidades").select("omie_app_key, omie_app_secret").eq("slug", "lush-ipiranga").single();
  const appKey = u!.omie_app_key as string;
  const appSecret = u!.omie_app_secret as string;

  const tests = [
    // Endpoint geral/produtos — métodos conhecidos
    { e: "/geral/produtos/",  c: "ListarProdutos" },
    { e: "/geral/produtos/",  c: "ListarCadProdutos" },
    { e: "/geral/produtos/",  c: "PesquisarProdutos" },
    { e: "/geral/produtos/",  c: "ObterProduto" },
    { e: "/geral/produtos/",  c: "UpsertProduto" },
    // Endpoint estoque
    { e: "/estoque/produtos/", c: "ListarProdutos" },
    { e: "/estoque/produtos/", c: "ListarCadProdutos" },
    // Produto sem 's' (singular)
    { e: "/geral/produto/",   c: "ListarProdutos" },
    { e: "/geral/produto/",   c: "ListarCadProdutos" },
    // Módulo cadastro
    { e: "/cadastros/produtos/", c: "ListarProdutos" },
    { e: "/cadastros/produtos/", c: "ListarCadProdutos" },
    // Módulo servicos (motéis podem usar)
    { e: "/geral/servicos/",  c: "ListarServicos" },
    { e: "/geral/servicos/",  c: "ListarCadServicos" },
  ];

  for (const { e, c } of tests) {
    const { status, body } = await post(appKey, appSecret, e, c);
    const isMethodError = body.includes("not exists") || body.includes("não existe");
    const isNotFound = status === 404;
    const isRedundant = body.toUpperCase().includes("REDUNDANT");
    const icon = isMethodError || isNotFound ? "❌" : isRedundant ? "⏳" : "✅";
    console.log(`${icon}  ${e.padEnd(22)} ${c.padEnd(22)} → HTTP ${status}  ${body.slice(0, 80)}`);
    await new Promise(r => setTimeout(r, 300));
  }
}

main().catch(console.error);
