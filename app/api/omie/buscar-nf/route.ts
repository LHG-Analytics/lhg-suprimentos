/**
 * app/api/omie/buscar-nf/route.ts
 * Consulta uma NF de entrada no Omie pelo número.
 * GET /api/omie/buscar-nf?numero=12345&unidade_id=<uuid>
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { consultarNFEntrada, OmieError, type OmieCredentials } from "@/lib/omie/client";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const numero     = req.nextUrl.searchParams.get("numero")?.trim();
  const unidadeId  = req.nextUrl.searchParams.get("unidade_id")?.trim();

  if (!numero) {
    return NextResponse.json({ error: "Parâmetro 'numero' obrigatório" }, { status: 400 });
  }

  // ── Buscar credenciais Omie da unidade ────────────────────────────────────────
  const query = supabase
    .from("unidades")
    .select("id, nome, omie_app_key, omie_app_secret")
    .eq("ativa", true)
    .not("omie_app_key", "is", null)
    .not("omie_app_secret", "is", null);

  if (unidadeId) {
    query.eq("id", unidadeId);
  } else {
    query.limit(1);
  }

  const { data: unidades } = await query;
  const unidade = unidades?.[0];

  if (!unidade?.omie_app_key || !unidade?.omie_app_secret) {
    return NextResponse.json(
      { error: "Nenhuma unidade com credenciais Omie configurada" },
      { status: 422 },
    );
  }

  const creds: OmieCredentials = {
    appKey:    unidade.omie_app_key,
    appSecret: unidade.omie_app_secret,
  };

  // ── Consultar NF no Omie ──────────────────────────────────────────────────────
  try {
    const nf = await consultarNFEntrada(creds, numero);

    // Normalizar resposta para o frontend
    return NextResponse.json({
      unidade_id:   unidade.id,
      unidade_nome: unidade.nome,
      cabecalho: {
        omie_cod_nf:   nf.cabecalho.nCodNF,
        numero:        nf.cabecalho.cNumNF,
        serie:         nf.cabecalho.cSerie,
        data_emissao:  nf.cabecalho.dDtEmissao,
        fornecedor_id: nf.cabecalho.nCodFornecedor,
        razao_social:  nf.cabecalho.cRazaoSocial ?? null,
        cnpj:          nf.cabecalho.cCNPJFornecedor ?? null,
        valor_total:   nf.cabecalho.nValTotalNF,
        chave_acesso:  nf.cabecalho.cChaveNFe ?? null,
      },
      itens: nf.det.map(d => ({
        n_item:       d.nItem,
        codigo:       d.produto.cCodProd,
        descricao:    d.produto.cDescricao,
        unidade:      d.produto.cUnid,
        qtd:          d.produto.nQtde,
        preco_unit:   d.produto.nValUnit,
        valor_total:  d.produto.nValTotal,
        familia_omie: d.produto.cFamProd ?? null, // pré-fill se Omie tiver
      })),
    });
  } catch (err) {
    if (err instanceof OmieError) {
      const isNotFound =
        err.message.toLowerCase().includes("não encontr") ||
        err.message.toLowerCase().includes("nao encontr") ||
        err.message.toLowerCase().includes("não exist") ||
        err.message.toLowerCase().includes("nao exist");

      return NextResponse.json(
        { error: isNotFound ? `NF ${numero} não encontrada no Omie` : `Omie: ${err.message}` },
        { status: isNotFound ? 404 : 422 },
      );
    }
    console.error("[buscar-nf] Erro inesperado:", err);
    return NextResponse.json({ error: "Erro ao consultar Omie" }, { status: 500 });
  }
}
