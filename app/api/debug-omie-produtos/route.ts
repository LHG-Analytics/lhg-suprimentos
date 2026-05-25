/**
 * app/api/debug-omie-produtos/route.ts — TEMPORÁRIO
 * Inspeciona resposta bruta do Omie para produtos (primeira página).
 * Usado para diagnosticar por que familia_produto está vindo null.
 * REMOVER após diagnóstico confirmado.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { listProdutosPage } from "@/lib/omie/client";
import type { OmieCredentials } from "@/lib/omie/client";

export async function GET(_req: NextRequest) {
  const supabase = createServiceClient();

  // Busca primeira unidade ativa com credenciais
  const { data: unidade, error } = await supabase
    .from("unidades")
    .select("id, slug, nome, omie_app_key, omie_app_secret")
    .eq("ativa", true)
    .not("omie_app_key", "is", null)
    .not("omie_app_secret", "is", null)
    .limit(1)
    .single();

  if (error || !unidade) {
    return NextResponse.json(
      { ok: false, error: "Nenhuma unidade com credenciais Omie." },
      { status: 400 },
    );
  }

  const creds: OmieCredentials = {
    appKey: unidade.omie_app_key as string,
    appSecret: unidade.omie_app_secret as string,
  };

  try {
    // Busca apenas a primeira página (50 produtos)
    const res = await listProdutosPage(creds, 1, 50);

    const items = res.produto_servico_cadastro ?? res.cadastros ?? [];

    // Retorna os primeiros 5 produtos completos (todos os campos) para diagnóstico
    const amostra = items.slice(0, 5);

    // Estatísticas de familia_produto
    const comFamilia = items.filter(
      (p) => p.familia_produto && p.familia_produto.trim() !== "",
    ).length;
    const semFamilia = items.length - comFamilia;
    const familiasUnicas = [
      ...new Set(
        items
          .map((p) => p.familia_produto)
          .filter((f): f is string => !!f && f.trim() !== ""),
      ),
    ];

    return NextResponse.json({
      ok: true,
      unidade: { id: unidade.id, nome: unidade.nome },
      paginacao: {
        pagina: res.pagina,
        total_paginas: res.total_de_paginas,
        total_registros: res.total_de_registros,
        registros_pagina: items.length,
      },
      diagnostico_familia: {
        nesta_pagina: {
          com_familia: comFamilia,
          sem_familia: semFamilia,
        },
        familias_unicas_encontradas: familiasUnicas,
      },
      // 5 primeiros produtos com TODOS os campos para ver estrutura real
      amostra_bruta: amostra,
      // Campos presentes no primeiro produto (para detectar nomes de campos)
      campos_do_primeiro_produto: items[0] ? Object.keys(items[0]) : [],
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
