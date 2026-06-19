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
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { after } from "next/server";
import { syncPedidosCompra, syncItensPedidosOmie } from "@/lib/omie/sync";
import { countPedidosCompra } from "@/lib/omie/client";
import type { OmieCredentials, OmiePedidoFiltro } from "@/lib/omie/client";
import type { SyncResult } from "@/lib/omie/sync";

const FILTROS_VALIDOS: OmiePedidoFiltro[] = [
  "todos", "pendentes", "faturados", "recebidos",
  "cancelados", "encerrados", "rec_parciais", "fat_parciais",
];

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

/**
 * Valida que o usuário autenticado tem acesso ao slug de unidade solicitado.
 * Compradores e admins têm acesso a todas as unidades.
 * Outros papéis (aprovador, solicitante) precisam estar em user_unidades.
 * Retorna null se acesso permitido, ou mensagem de erro genérica.
 */
async function validarAcessoUnidade(
  supabase: Awaited<ReturnType<typeof createClient>>,
  slug: string,
): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "Não autorizado.";

    // Busca role + unidade em paralelo
    const [{ data: profile }, { data: unidade }] = await Promise.all([
      supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .single(),
      supabase
        .from("unidades")
        .select("id")
        .eq("slug", slug)
        .eq("ativa", true)
        .single(),
    ]);

    // Unidade precisa existir e estar ativa
    if (!unidade) {
      console.warn(`[validarAcessoUnidade] Unidade '${slug}' não encontrada ou inativa.`);
      return "Acesso negado.";
    }

    // Comprador e admin têm acesso universal
    const role = profile?.role ?? "solicitante";
    if (role === "admin" || role === "comprador") return null;

    // Outros papéis: verificar pivot user_unidades
    const { data: acesso } = await supabase
      .from("user_unidades")
      .select("unidade_id")
      .eq("user_id", user.id)
      .eq("unidade_id", unidade.id)
      .maybeSingle();

    if (!acesso) {
      console.warn(`[validarAcessoUnidade] Usuário não pertence à unidade '${slug}'.`);
      return "Acesso negado.";
    }

    return null; // acesso permitido
  } catch {
    return "Erro ao validar acesso à unidade.";
  }
}

// ── GET — disparado pelo cron Vercel ──────────────────────────────────────────

export async function GET(req: NextRequest) {
  const tag = "[sync-pedidos GET]";
  if (!await autenticar(req)) {
    console.warn(`${tag} Requisição não autorizada — ip=${req.headers.get("x-forwarded-for") ?? "?"}`);
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }
  // Cron sempre sincroniza TODAS as unidades
  console.log(`${tag} Cron iniciado — sincronizando todas as unidades`);
  return runSync(tag, null);
}

// ── POST — disparo manual pelo usuário ───────────────────────────────────────

export async function POST(req: NextRequest) {
  const tag = "[sync-pedidos POST]";
  if (!await autenticar(req)) {
    console.warn(`${tag} Requisição não autorizada`);
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  // Lê o filtro e flag contarApenas do body
  let filtro: OmiePedidoFiltro = "todos";
  let contarApenas = false;
  const body = await req.json().catch(() => ({})) as { filtro?: string; contarApenas?: boolean };
  const f = body?.filtro as string | undefined;
  if (f && FILTROS_VALIDOS.includes(f as OmiePedidoFiltro)) filtro = f as OmiePedidoFiltro;
  if (body?.contarApenas === true) contarApenas = true;

  // Respeita a unidade ativa na sidebar (cookie lhg-unidade-slug)
  const cookieStore = await cookies();
  const slug = cookieStore.get("lhg-unidade-slug")?.value ?? null;

  // Valida acesso à unidade específica (evita dupla criação de client: reutiliza abaixo)
  if (slug && slug !== "todas") {
    const supabaseForValidation = await createClient();
    const erroAcesso = await validarAcessoUnidade(supabaseForValidation, slug);
    if (erroAcesso) {
      console.warn(`${tag} Acesso negado à unidade slug="${slug}": ${erroAcesso}`);
      return NextResponse.json({ ok: false, error: erroAcesso }, { status: 403 });
    }
  }

  // Modo contarApenas: 1 chamada por unidade, sem sync no banco
  if (contarApenas) {
    return runCount(tag, slug && slug !== "todas" ? slug : null, filtro);
  }

  const filtroDesc = slug && slug !== "todas" ? `unidade="${slug}"` : "todas as unidades";
  console.log(`${tag} Sync manual iniciado — ${filtroDesc} filtro=${filtro}`);
  return runSync(tag, slug && slug !== "todas" ? slug : null, filtro);
}

// ── Lógica de contagem rápida (sem sync) ──────────────────────────────────────

async function runCount(tag: string, slug: string | null, filtro: OmiePedidoFiltro) {
  const supabase = createServiceClient();

  let query = supabase
    .from("unidades")
    .select("id, nome, slug, omie_app_key, omie_app_secret")
    .eq("ativa", true)
    .not("omie_app_key", "is", null)
    .not("omie_app_secret", "is", null);
  if (slug) query = query.eq("slug", slug);

  const { data: unidades, error } = await query;
  if (error || !unidades?.length) {
    return NextResponse.json({ ok: false, error: error?.message ?? "Nenhuma unidade." }, { status: 400 });
  }

  const counts: { unidade: string; filtro: string; total: number }[] = [];
  for (const unidade of unidades) {
    const creds: OmieCredentials = {
      appKey:    unidade.omie_app_key as string,
      appSecret: unidade.omie_app_secret as string,
    };
    try {
      const total = await countPedidosCompra(creds, filtro);
      counts.push({ unidade: unidade.nome, filtro, total });
      console.log(`${tag} contarApenas filtro=${filtro} unidade=${unidade.nome} total=${total}`);
    } catch (err) {
      counts.push({ unidade: unidade.nome, filtro, total: 0 });
      console.error(`${tag} Erro ao contar filtro=${filtro} unidade=${unidade.nome}:`, err instanceof Error ? err.message : String(err));
    }
  }

  return NextResponse.json({ ok: true, counts });
}

// ── Lógica de sync ────────────────────────────────────────────────────────────

/**
 * @param slug  slug da unidade ativa (cookie lhg-unidade-slug).
 *              null = sincroniza todas as unidades (modo cron).
 */
async function runSync(tag: string, slug: string | null, filtro: OmiePedidoFiltro = "todos") {
  const inicio = Date.now();
  const supabase = createServiceClient();

  // ⚠️ Supabase builder é imutável — cada .eq() retorna nova instância
  let query = supabase
    .from("unidades")
    .select("id, nome, slug, omie_app_key, omie_app_secret")
    .eq("ativa", true)
    .not("omie_app_key", "is", null)
    .not("omie_app_secret", "is", null);

  // Filtro por slug quando disparado manualmente (não é cron)
  if (slug) query = query.eq("slug", slug);

  const { data: unidades, error: dbErr } = await query;

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
      const r = await syncPedidosCompra(supabase, creds, unidade.id, filtro);
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

  // Em background: detalha os itens dos pedidos recém-sincronizados (lote por
  // unidade) para alimentar o "Realizado" do dashboard. Não bloqueia a resposta.
  const paraItens = unidades.map(u => ({
    id: u.id as string, nome: u.nome as string,
    appKey: u.omie_app_key as string, appSecret: u.omie_app_secret as string,
  }));
  after(async () => {
    for (const u of paraItens) {
      try {
        const r = await syncItensPedidosOmie(createServiceClient(), { appKey: u.appKey, appSecret: u.appSecret }, u.id, 60);
        if (r.processados > 0) console.log(`${tag} itens pedidos "${u.nome}": ${r.processados} pedidos, ${r.itens} itens`);
      } catch (err) {
        console.error(`${tag} itens pedidos erro "${u.nome}":`, err instanceof Error ? err.message : String(err));
      }
    }
  });

  return NextResponse.json({
    ok: true,
    results,
    unidades: unidades.map((u) => u.nome),
    duracaoTotal,
  });
}
