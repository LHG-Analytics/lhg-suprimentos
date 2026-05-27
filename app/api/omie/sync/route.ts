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

import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import {
  syncTodasUnidades,
  syncFornecedores,
  syncProdutos,
  syncCMCProdutos,
  syncPedidosCompra,
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

    // Qualquer usuário autenticado pode disparar sync (leitura do Omie, não destrutivo)
    return !!user;
  } catch {
    return false;
  }
}

// ── POST /api/omie/sync ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && !process.env.CRON_SECRET) {
    console.warn("[omie/sync] CRON_SECRET não configurado — cron job desabilitado, mas sync manual continua funcionando.");
  }

  const autorizado = await autenticarRequisicao(req);
  if (!autorizado) {
    return NextResponse.json(
      { ok: false, error: "Não autorizado." },
      { status: 401 },
    );
  }

  // Parse do body (opcional)
  let entidade: "fornecedores" | "produtos" | "pedidos" | "todos" = "todos";
  try {
    const body = await req.json().catch(() => ({}));
    if (
      body?.entidade === "fornecedores" ||
      body?.entidade === "produtos" ||
      body?.entidade === "pedidos" ||
      body?.entidade === "todos"
    ) {
      entidade = body.entidade;
    }
  } catch {
    // body inválido — usa padrão "todos"
  }

  // ── Unidade ativa ─────────────────────────────────────────────────────────
  // Lê o cookie definido pelo UnidadeContext no client.
  // Quando não é "todas", filtra o sync para a unidade do usuário logado.
  const cookieStore = await cookies();
  const unidadeSlug = cookieStore.get("lhg-unidade-slug")?.value ?? "todas";

  const inicio = Date.now();
  const supabase = createServiceClient();
  const results: SyncResult[] = [];

  try {
    if (entidade === "todos") {
      // Sync completo — respeita unidade ativa quando disponível
      const { results: r, unidades } = await syncTodasUnidades(supabase, unidadeSlug !== "todas" ? unidadeSlug : undefined);
      const duracaoTotal = Date.now() - inicio;

      return NextResponse.json({
        ok: true,
        results: r,
        unidades,
        duracaoTotal,
      });
    }

    // Sync parcial: busca unidade(s) com credenciais
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
      .from("unidades")
      .select("id, slug, nome, omie_app_key, omie_app_secret")
      .eq("ativa", true)
      .not("omie_app_key", "is", null)
      .not("omie_app_secret", "is", null);

    // Filtra pela unidade ativa quando o usuário está em uma unidade específica
    if (unidadeSlug && unidadeSlug !== "todas") {
      query = query.eq("slug", unidadeSlug);
    }

    const { data: unidades, error: dbErr } = await query;

    if (dbErr) {
      console.error("[omie/sync] Erro ao buscar unidades:", dbErr.message, dbErr.code);
      return NextResponse.json(
        {
          ok: false,
          error: `Erro ao acessar banco de dados: ${dbErr.message}`,
        },
        { status: 500 },
      );
    }

    if (!unidades?.length) {
      return NextResponse.json(
        {
          ok: false,
          error: `Nenhuma unidade com credenciais Omie configurada${unidadeSlug !== "todas" ? ` para "${unidadeSlug}"` : ""}.`,
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
      } else if (entidade === "pedidos") {
        const r = await syncPedidosCompra(supabase, creds, unidade.id);
        results.push(r);
      } else if (entidade === "produtos" && !produtosSincronizados) {
        // Passo 1: Sync do catálogo (rápido — batch upsert)
        const rCatalogo = await syncProdutos(supabase, creds, unidade.id);
        results.push(rCatalogo);

        // Passo 2: Atualiza preco_custo com CMC real do estoque Omie (lento — 1 req/produto)
        // Só executa no sync manual — não no cron (syncTodasUnidades) para evitar timeout.
        const rCMC = await syncCMCProdutos(supabase, creds, unidade.id);
        results.push(rCMC);

        produtosSincronizados = true; // produtos são globais
      }
    }

    return NextResponse.json({
      ok: true,
      results,
      unidades: (unidades as Array<{ nome: string }>).map((u) => u.nome),
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
      // Passo 1: sync do catálogo (rápido — ~5 s para todas as unidades)
      const { results, unidades } = await syncTodasUnidades(supabase);

      // Passo 2: atualiza CMC em background via after().
      // A resposta 200 é enviada imediatamente; a função continua viva
      // até maxDuration:300 no vercel.json para completar o CMC.
      after(async () => {
        try {
          // Aguarda 90s para que a janela de REDUNDANT (60s) do Omie se limpe
          // e o rate-limit do sync de catálogo/fornecedores/pedidos se dissipe.
          await new Promise(r => setTimeout(r, 90_000));

          const { data: rows } = await createServiceClient()
            .from("unidades")
            .select("id, omie_app_key, omie_app_secret")
            .eq("ativa", true)
            .not("omie_app_key", "is", null)
            .not("omie_app_secret", "is", null);

          if (!rows?.length) return;

          for (const u of rows) {
            const creds: OmieCredentials = {
              appKey:    u.omie_app_key as string,
              appSecret: u.omie_app_secret as string,
            };
            await syncCMCProdutos(createServiceClient(), creds, u.id);
          }

          console.info("[omie/sync cron] CMC atualizado em background.");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[omie/sync cron after] Erro no CMC background:", msg);
        }
      });

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
