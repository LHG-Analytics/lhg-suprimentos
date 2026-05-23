/**
 * app/api/omie/sync/route.ts — LHG-208
 * Route Handler para sync manual e cron de dados do Omie.
 *
 * Autenticação (escolha uma):
 *  1. Cron job (Vercel): cabeçalho Authorization: Bearer <CRON_SECRET>
 *  2. Admin logado: sessão Supabase válida com role = 'admin'
 *
 * POST /api/omie/sync
 *  Body (opcional): { "entidade": "fornecedores" | "produtos" | "todos" }
 *  Padrão: "todos"
 *
 * Resposta: { ok: true, results: SyncResult[], unidades: string[], duracaoTotal: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import {
  syncTodasUnidades,
  syncFornecedores,
  syncProdutos,
  type SyncResult,
} from "@/lib/omie/sync";
import type { OmieCredentials } from "@/lib/omie/client";

// ── Autenticação ───────────────────────────────────────────────────────────────

async function autenticarRequisicao(req: NextRequest): Promise<boolean> {
  // 1. Cron/job: Bearer token
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  // 2. Sessão admin
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return false;

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    return profile?.role === "admin";
  } catch {
    return false;
  }
}

// ── POST /api/omie/sync ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Guard: CRON_SECRET obrigatório em produção
  if (
    process.env.NODE_ENV === "production" &&
    !process.env.CRON_SECRET
  ) {
    console.error("[omie/sync] CRON_SECRET não configurado em produção!");
    return NextResponse.json(
      { ok: false, error: "Configuração inválida do servidor." },
      { status: 500 },
    );
  }

  const autorizado = await autenticarRequisicao(req);
  if (!autorizado) {
    return NextResponse.json(
      { ok: false, error: "Não autorizado." },
      { status: 401 },
    );
  }

  // Parse do body (opcional)
  let entidade: "fornecedores" | "produtos" | "todos" = "todos";
  try {
    const body = await req.json().catch(() => ({}));
    if (
      body?.entidade === "fornecedores" ||
      body?.entidade === "produtos" ||
      body?.entidade === "todos"
    ) {
      entidade = body.entidade;
    }
  } catch {
    // body inválido — usa padrão "todos"
  }

  const inicio = Date.now();
  const supabase = createServiceClient();
  const results: SyncResult[] = [];

  try {
    if (entidade === "todos") {
      // Sync completo: todas as unidades
      const { results: r, unidades } = await syncTodasUnidades(supabase);
      const duracaoTotal = Date.now() - inicio;

      return NextResponse.json({
        ok: true,
        results: r,
        unidades,
        duracaoTotal,
      });
    }

    // Sync parcial: busca unidades com credenciais
    const { data: unidades, error: dbErr } = await supabase
      .from("unidades")
      .select("id, slug, nome, omie_app_key, omie_app_secret")
      .eq("ativa", true)
      .not("omie_app_key", "is", null)
      .not("omie_app_secret", "is", null);

    if (dbErr || !unidades?.length) {
      return NextResponse.json(
        {
          ok: false,
          error: "Nenhuma unidade com credenciais Omie configurada.",
        },
        { status: 400 },
      );
    }

    let produtosSincronizados = false;

    for (const unidade of unidades) {
      const creds: OmieCredentials = {
        appKey: unidade.omie_app_key as string,
        appSecret: unidade.omie_app_secret as string,
      };

      if (entidade === "fornecedores") {
        const r = await syncFornecedores(supabase, creds, unidade.id);
        results.push(r);
      } else if (entidade === "produtos" && !produtosSincronizados) {
        const r = await syncProdutos(supabase, creds, unidade.id);
        results.push(r);
        produtosSincronizados = true; // produtos são globais
      }
    }

    return NextResponse.json({
      ok: true,
      results,
      unidades: unidades.map((u) => u.nome),
      duracaoTotal: Date.now() - inicio,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[omie/sync] Erro não tratado:", msg);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 },
    );
  }
}

// ── GET /api/omie/sync ────────────────────────────────────────────────────────
// Vercel Cron Jobs disparam GET com Authorization: Bearer <CRON_SECRET>.
// Se for cron → executa sync completo.
// Se for admin → retorna logs recentes.

export async function GET(req: NextRequest) {
  const autorizado = await autenticarRequisicao(req);
  if (!autorizado) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  // Detecta se é chamada de cron (Bearer token) → executa sync
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (isCron) {
    const inicio = Date.now();
    const supabase = createServiceClient();

    try {
      const { results, unidades } = await syncTodasUnidades(supabase);
      return NextResponse.json({
        ok: true,
        results,
        unidades,
        duracaoTotal: Date.now() - inicio,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[omie/sync cron] Erro:", msg);
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
  }

  // Chamada admin: retorna logs recentes
  const supabase = createServiceClient();
  const { data: logs } = await supabase
    .from("integracao_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({ ok: true, logs: logs ?? [] });
}
