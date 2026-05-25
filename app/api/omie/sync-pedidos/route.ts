/**
 * app/api/omie/sync-pedidos/route.ts
 * Route Handler exclusivo para sync de Pedidos de Compra do Omie.
 *
 * Rodado pelo cron Vercel a cada 5 minutos (ver vercel.json).
 * Também pode ser disparado manualmente pelo admin via POST.
 *
 * Autenticação:
 *   - Cron Vercel: Authorization: Bearer <CRON_SECRET>
 *   - Admin logado: sessão Supabase válida
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { syncPedidosCompra } from "@/lib/omie/sync";
import type { OmieCredentials } from "@/lib/omie/client";
import type { SyncResult } from "@/lib/omie/sync";

// ── Autenticação ───────────────────────────────────────────────────────────────

async function autenticar(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return !!user;
  } catch {
    return false;
  }
}

// ── GET — disparado pelo cron Vercel ──────────────────────────────────────────

export async function GET(req: NextRequest) {
  const tag = "[sync-pedidos GET]";
  if (!await autenticar(req)) {
    console.warn(`${tag} Requisição não autorizada — ip=${req.headers.get("x-forwarded-for") ?? "?"}`);
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }
  console.log(`${tag} Cron iniciado`);
  return runSync(tag);
}

// ── POST — disparo manual pelo admin ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  const tag = "[sync-pedidos POST]";
  if (!await autenticar(req)) {
    console.warn(`${tag} Requisição não autorizada`);
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }
  console.log(`${tag} Sync manual iniciado`);
  return runSync(tag);
}

// ── Lógica de sync ────────────────────────────────────────────────────────────

async function runSync(tag: string) {
  const inicio = Date.now();
  const supabase = createServiceClient();

  const { data: unidades, error: dbErr } = await supabase
    .from("unidades")
    .select("id, nome, omie_app_key, omie_app_secret")
    .eq("ativa", true)
    .not("omie_app_key", "is", null)
    .not("omie_app_secret", "is", null);

  if (dbErr) {
    console.error(`${tag} Erro ao buscar unidades:`, dbErr.message, dbErr.code);
    return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 });
  }

  if (!unidades?.length) {
    console.warn(`${tag} Nenhuma unidade com credenciais Omie configurada.`);
    return NextResponse.json({ ok: false, error: "Nenhuma unidade com credenciais Omie." }, { status: 400 });
  }

  const results: SyncResult[] = [];

  for (const unidade of unidades) {
    const creds: OmieCredentials = {
      appKey:    unidade.omie_app_key as string,
      appSecret: unidade.omie_app_secret as string,
    };

    console.log(`${tag} Sincronizando pedidos de "${unidade.nome}"…`);
    try {
      const r = await syncPedidosCompra(supabase, creds, unidade.id);
      results.push(r);
      console.log(`${tag} "${unidade.nome}" — status=${r.status} total=${r.total} erros=${r.erros} (${r.duracaoMs}ms)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${tag} Erro inesperado em "${unidade.nome}":`, msg);
      results.push({ entidade: "pedidos_compra", status: "erro", total: 0, novos: 0, erros: 1, duracaoMs: 0, detalhe: { erro: msg } });
    }
  }

  const duracaoTotal = Date.now() - inicio;
  console.log(`${tag} Concluído em ${duracaoTotal}ms — ${results.length} resultado(s)`);

  return NextResponse.json({
    ok: true,
    results,
    unidades: unidades.map((u) => u.nome),
    duracaoTotal,
  });
}
