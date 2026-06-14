/**
 * lib/cotacao/formas-pagamento.ts
 * Formas de pagamento padronizadas da cotação. A condição final é guardada
 * como string legível em cotacao_matriz.condicao_pagamento (ex: "Boleto 30/60",
 * "Cartão 3x", "PIX"). Estas constantes alimentam o select da matriz e o parse
 * de valores já salvos.
 */

export const FORMAS_PAGAMENTO = ["PIX", "Dinheiro", "Boleto", "Cartão de crédito"] as const;
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];

// Prazos sugeridos para boleto (texto livre também é aceito via "Outro")
export const PRAZOS_BOLETO = [
  "À vista", "7 dias", "15 dias", "21 dias", "28 dias",
  "30 dias", "30/60", "30/60/90", "45 dias", "60 dias",
];

// Parcelas sugeridas para cartão de crédito
export const PARCELAS_CARTAO = ["1x", "2x", "3x", "4x", "5x", "6x", "8x", "10x", "12x"];

export interface PagamentoEstruturado {
  forma: FormaPagamento | "";
  detalhe: string; // prazo do boleto ou parcelas do cartão; vazio p/ PIX/Dinheiro
}

/** Compõe a string final salva no banco a partir da forma + detalhe. */
export function comporPagamento({ forma, detalhe }: PagamentoEstruturado): string {
  if (!forma) return "";
  if (forma === "PIX" || forma === "Dinheiro") return forma;
  const d = detalhe.trim();
  if (forma === "Boleto") return d ? `Boleto ${d}` : "Boleto";
  // Cartão de crédito → "Cartão 3x"
  return d ? `Cartão ${d}` : "Cartão de crédito";
}

/** Faz o parse de um valor salvo de volta para forma + detalhe (best-effort). */
export function parsePagamento(valor: string | null | undefined): PagamentoEstruturado {
  const v = (valor ?? "").trim();
  if (!v) return { forma: "", detalhe: "" };
  if (/^pix$/i.test(v)) return { forma: "PIX", detalhe: "" };
  if (/^dinheiro$/i.test(v)) return { forma: "Dinheiro", detalhe: "" };
  if (/^boleto/i.test(v)) return { forma: "Boleto", detalhe: v.replace(/^boleto\s*/i, "").trim() };
  if (/^cart[aã]o/i.test(v)) return { forma: "Cartão de crédito", detalhe: v.replace(/^cart[aã]o(\s+de\s+cr[eé]dito)?\s*/i, "").trim() };
  // Legado: valores antigos de texto livre (ex: "30", "30/60") → assume boleto
  return { forma: "Boleto", detalhe: v };
}
