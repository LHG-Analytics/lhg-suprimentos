/**
 * omie-resumo-section.tsx
 * Async Server Component — busca o resumo de compras do Omie e renderiza
 * o OmieResumoWidget.
 *
 * Separado do page.tsx para ser envolto em <Suspense>, assim o dashboard
 * carrega KPIs/gráfico imediatamente enquanto este componente busca do Omie.
 *
 * Período: recebido como props (ISO YYYY-MM-DD) do DashboardPage, que lê
 *          os searchParams ?from=...&to=... definidos pelo DashboardHeader.
 * Unidade: respeita o cookie lhg-unidade-slug; se "todas", usa a primeira
 *          unidade ativa com credenciais Omie.
 */
import { cookies } from "next/headers";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { obterResumoCompras, formatOmieDate, type OmieCredentials } from "@/lib/omie/client";
import { OmieResumoWidget } from "./omie-resumo-widget";

// ── Cache: 10 min por unidade+período ─────────────────────────────────────────
// Chave inclui appKey+appSecret+datas — períodos diferentes ficam em entradas
// distintas automaticamente (unstable_cache serializa os argumentos da função).
const getCachedResumo = unstable_cache(
  async (appKey: string, appSecret: string, dInicio: string, dFim: string) => {
    const creds: OmieCredentials = { appKey, appSecret };
    return obterResumoCompras(creds, dInicio, dFim);
  },
  ["omie-resumo-compras"],
  { revalidate: 600 }, // 10 minutos
);

// ── Props ─────────────────────────────────────────────────────────────────────

interface OmieResumoSectionProps {
  /** Data de início no formato ISO YYYY-MM-DD (vinda de searchParams) */
  from: string;
  /** Data de fim no formato ISO YYYY-MM-DD (vinda de searchParams) */
  to:   string;
}

// ── Componente ─────────────────────────────────────────────────────────────────

export async function OmieResumoSection({ from, to }: OmieResumoSectionProps) {
  // Converte ISO → formato Omie (DD/MM/YYYY)
  const fromDate = new Date(from + "T00:00:00");
  const toDate   = new Date(to   + "T00:00:00");
  const dInicio  = formatOmieDate(fromDate);
  const dFim     = formatOmieDate(toDate);

  // Unidade ativa (mesmo cookie que o UnidadeContext usa)
  const cookieStore = await cookies();
  const unidadeSlug = cookieStore.get("lhg-unidade-slug")?.value ?? "todas";

  // Busca credenciais no Supabase (service client — leitura segura server-side)
  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from("unidades")
    .select("slug, nome, omie_app_key, omie_app_secret")
    .eq("ativa", true)
    .not("omie_app_key",    "is", null)
    .not("omie_app_secret", "is", null);

  if (unidadeSlug !== "todas") {
    query = query.eq("slug", unidadeSlug);
  }

  const { data: unidades } = await query.limit(1).maybeSingle();

  // Sem unidade configurada → não renderiza o widget (sem quebrar o dashboard)
  if (!unidades) return null;

  try {
    const resumo = await getCachedResumo(
      unidades.omie_app_key   as string,
      unidades.omie_app_secret as string,
      dInicio,
      dFim,
    );

    // Rótulo de período legível em pt-BR
    const periodoLabel = `${fromDate.toLocaleDateString("pt-BR", {
      day: "2-digit", month: "short", year: "numeric",
    })} – ${toDate.toLocaleDateString("pt-BR", {
      day: "2-digit", month: "short",
    })}`;

    return (
      <OmieResumoWidget
        resumo={resumo}
        unidadeNome={unidades.nome as string}
        periodoLabel={periodoLabel}
      />
    );
  } catch {
    // Falha silenciosa — Omie fora do ar não deve quebrar o dashboard
    return null;
  }
}
