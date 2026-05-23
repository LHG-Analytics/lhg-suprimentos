/**
 * scripts/debug-omie-raw.ts
 * Testa múltiplos endpoints/métodos do Omie para descobrir o correto para produtos.
 */
import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: unidade } = await supabase
    .from("unidades")
    .select("id, nome, omie_app_key, omie_app_secret")
    .eq("slug", "lush-ipiranga")
    .single();

  if (!unidade?.omie_app_key) {
    console.error("Sem credenciais");
    process.exit(1);
  }

  const combos = [
    { endpoint: "/geral/produto/",           call: "ListarProdutos" },
    { endpoint: "/geral/produto/",           call: "ListarCadProdutos" },
    { endpoint: "/estoque/produto/",         call: "ListarProdutos" },
    { endpoint: "/estoque/produto/",         call: "ListarCadProdutos" },
    { endpoint: "/produtos/produto/",        call: "ListarProdutos" },
    { endpoint: "/geral/produtos/",          call: "PesquisarProdutos" },
    { endpoint: "/geral/produtos/",          call: "ListarTodosProdutos" },
  ];

  for (const { endpoint, call } of combos) {
    const body = {
      app_key: unidade.omie_app_key,
      app_secret: unidade.omie_app_secret,
      call,
      param: [{ pagina: 1, registros_por_pagina: 2 }],
    };

    const res = await fetch(`https://app.omie.com.br/api/v1${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    const preview = text.slice(0, 200);
    const isError = preview.toLowerCase().includes("not exists") || preview.toLowerCase().includes("não existe");
    const isRedundant = preview.toLowerCase().includes("redundant");

    console.log(`${endpoint} | ${call}`);
    console.log(`  HTTP ${res.status} → ${preview}`);
    if (!isError && !isRedundant) {
      console.log("  ✅ FUNCIONOU!");
    }
    console.log();

    // Pequena pausa para não acumular REDUNDANT
    await new Promise(r => setTimeout(r, 500));
  }
}

main().catch(console.error);
