/**
 * scripts/test-omie-sync.ts
 * Testa a integração Omie diretamente (sem servidor HTTP).
 * Uso: npx dotenv -e .env.local -- npx tsx scripts/test-omie-sync.ts
 */
import { createClient } from "@supabase/supabase-js";
import { syncFornecedores, syncProdutos } from "../lib/omie/sync";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("❌  NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não definidos.");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Busca Lush Ipiranga
  const { data: unidade, error } = await supabase
    .from("unidades")
    .select("id, nome, omie_app_key, omie_app_secret")
    .eq("slug", "lush-ipiranga")
    .single();

  if (error || !unidade?.omie_app_key) {
    console.error("❌  Unidade lush-ipiranga não encontrada ou sem credenciais:", error?.message);
    process.exit(1);
  }

  console.log(`\n🚀  Iniciando sync para: ${unidade.nome}\n`);

  const creds = {
    appKey: unidade.omie_app_key as string,
    appSecret: unidade.omie_app_secret as string,
  };

  // ── Fornecedores ──────────────────────────────────────────────────────────
  console.log("📋  Sincronizando fornecedores...");
  const resForn = await syncFornecedores(supabase, creds, unidade.id);
  console.log(`   Status : ${resForn.status}`);
  console.log(`   Total  : ${resForn.total} fornecedores`);
  console.log(`   Upserts: ${resForn.novos}`);
  console.log(`   Erros  : ${resForn.erros}`);
  console.log(`   Tempo  : ${resForn.duracaoMs}ms`);
  if (resForn.detalhe) console.log("   Detalhe:", resForn.detalhe);

  // ── Produtos ──────────────────────────────────────────────────────────────
  console.log("\n📦  Sincronizando produtos...");
  const resProd = await syncProdutos(supabase, creds, unidade.id);
  console.log(`   Status : ${resProd.status}`);
  console.log(`   Total  : ${resProd.total} produtos`);
  console.log(`   Upserts: ${resProd.novos}`);
  console.log(`   Erros  : ${resProd.erros}`);
  console.log(`   Tempo  : ${resProd.duracaoMs}ms`);
  if (resProd.detalhe) console.log("   Detalhe:", resProd.detalhe);

  console.log("\n✅  Sync concluído!\n");
}

main().catch((err) => {
  console.error("❌  Erro inesperado:", err);
  process.exit(1);
});
