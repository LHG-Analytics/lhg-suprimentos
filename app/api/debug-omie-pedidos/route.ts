/**
 * app/api/debug-omie-pedidos/route.ts — TEMPORÁRIO
 * Inspeciona a resposta BRUTA do Omie para pedidos de compra (primeira página).
 * Usado para diagnosticar qual campo contém os pedidos e qual call name funciona.
 * REMOVER após diagnóstico confirmado.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { omiePost } from "@/lib/omie/client";
import type { OmieCredentials } from "@/lib/omie/client";

export async function GET(_req: NextRequest) {
  // Auth: precisa estar logado
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const svcClient = createServiceClient();

  const { data: unidade, error } = await svcClient
    .from("unidades")
    .select("id, slug, nome, omie_app_key, omie_app_secret")
    .eq("ativa", true)
    .not("omie_app_key", "is", null)
    .not("omie_app_secret", "is", null)
    .limit(1)
    .single();

  if (error || !unidade) {
    return NextResponse.json({ ok: false, error: "Nenhuma unidade com credenciais Omie." }, { status: 400 });
  }

  const creds: OmieCredentials = {
    appKey:    unidade.omie_app_key as string,
    appSecret: unidade.omie_app_secret as string,
  };

  // Tenta os endpoints e call names corretos
  const tentativas = [
    { endpoint: "/produtos/pedidocompra/", call: "PesquisarPedCompra" },
    { endpoint: "/compras/pedidocompras/", call: "ListarPedidoCompras" },
    { endpoint: "/compras/pedidocompras/", call: "ListarPedidosCompras" },
  ];
  const resultados: Record<string, unknown> = {};

  for (const { endpoint, call: callName } of tentativas) {
    const key = `${endpoint} → ${callName}`;
    try {
      const raw = await omiePost<Record<string, unknown>, Record<string, unknown>>(
        endpoint,
        callName,
        creds,
        { pagina: 1, registros_por_pagina: 3 } as Record<string, unknown>,
      );

      // Mapeia chaves → tipo/tamanho para diagnóstico
      const keysInfo = Object.entries(raw).reduce<Record<string, unknown>>((acc, [k, v]) => {
        acc[k] = Array.isArray(v) ? `Array(${(v as unknown[]).length})` : typeof v === "object" ? "object" : v;
        return acc;
      }, {});

      // Tenta encontrar os itens nos campos mais comuns
      const pedidos     = (raw.pedidos     as unknown[] | undefined);
      const lista       = (raw.lista_pedidos as unknown[] | undefined);
      const pedido      = (raw.pedido      as unknown[] | undefined);
      const itensEncontrados = pedidos ?? lista ?? pedido ?? null;

      resultados[key] = {
        ok: true,
        total_de_paginas:  raw.total_de_paginas,
        total_de_registros: raw.total_de_registros,
        todas_as_chaves: keysInfo,
        campo_pedidos: pedidos   ? "pedidos"      : null,
        campo_lista:   lista     ? "lista_pedidos": null,
        campo_pedido:  pedido    ? "pedido"        : null,
        // Primeiro item encontrado (para ver estrutura de cabecalho/informacoes_adicionais)
        primeiro_item: itensEncontrados?.[0] ?? null,
      };
    } catch (err) {
      resultados[key] = {
        ok: false,
        erro: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return NextResponse.json({
    unidade: { id: unidade.id, nome: unidade.nome },
    resultados,
    instrucoes: "Verifique 'todas_as_chaves' para encontrar o campo correto dos pedidos.",
  });
}
