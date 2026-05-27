/**
 * omie-resumo-section.tsx
 * Async Server Component — busca o resumo de compras do Omie e renderiza
 * o OmieResumoWidget.
 *
 * Separado do page.tsx para ser envolto em <Suspense>, assim o dashboard
 * carrega KPIs/gráfico imediatamente enquanto este componente busca do Omie.
 *
 * Período: 1º de janeiro do ano corrente até hoje (visão anual).
 * Unidade: respeita o cookie lhg-unidade-slug; se "todas", usa a primeira
 *          unidade ativa com credenciais Omie.
 */
import { cookies } from "next/headers";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { obterResumoCompras, formatOmieDate, type OmieCredentials } from "@/lib/omie/client";
import { OmieResumoWidget } from "./omie-resumo-widget";

// ── Cache: 10 min por unidade+período ─────────────────────────────────────────
// Evita chamar Omie a cada pageview; revalida automaticamente a cada 10 min.
const getCachedResumo = unstable_cache(
  async (appKey: string, appSecret: string, dInicio: string, dFim: string) => {
    const creds: OmieCredentials = { appKey, appSecret };
    return obterResumoCompras(creds, dInicio, dFim);
  },
  ["omie-resumo-compras"],
  { revalidate: 600 }, // 10 minutos
);

// ── Componente ─────────────────────────────────────────────────────────────────

export async function OmieResumoSection() {
  // Período: 01/01/ano_atual → hoje
  const hoje      = new Date();
  const anoInicio = new Date(hoje.getFullYear(), 0, 1);
  const dInicio   = formatOmieDate(anoInicio);
  const dFim      = formatOmieDate(hoje);

  // Unidade ativa (mesmo cookie que o UnidadeContext usa)
  const cookieStore  = await cookies();
  const unidadeSlug  = cookieStore.get("lhg-unidade-slug")?.value ?? "todas";

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
      unidades.omie_app_key  as string,
      unidades.omie_app_secret as string,
      dInicio,
      dFim,
    );

    // Período formatado em pt-BR para exibição
    const periodoLabel = `${anoInicio.toLocaleDateString("pt-BR", {
      day: "2-digit", month: "short", year: "numeric",
    })} – ${hoje.toLocaleDateString("pt-BR", {
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
