/**
 * lib/estoque/ciclo.ts — módulo de Estoque (bloco 2, contagem mensal)
 *
 * Regra central: `null` significa "não sei ainda" e PROPAGA. Um teórico
 * calculado com entradas/saídas desconhecidas produziria divergência
 * inventada — e divergência errada é pior que ausente: uma manda investigar
 * o nada, a outra só informa que falta dado.
 */
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface InsumosTeorico {
  contagem_anterior: number | null;
  entradas:          number | null;
  saidas:            number | null;
}

/**
 * Teórico = anterior + entradas - saídas.
 * Ausência de entradas/saídas (ainda não importadas) propaga null.
 * Contagem anterior ausente conta como zero — é o primeiro ciclo do item.
 */
export function calcularTeorico({ contagem_anterior, entradas, saidas }: InsumosTeorico): number | null {
  if (entradas == null || saidas == null) return null;
  return (contagem_anterior ?? 0) + entradas - saidas;
}

/** Divergência = contado - teórico. Propaga null se qualquer lado for desconhecido. */
export function calcularDivergencia(contagemAtual: number | null, teorico: number | null): number | null {
  if (contagemAtual == null || teorico == null) return null;
  return contagemAtual - teorico;
}

/**
 * A repor = ideal - contado, nunca negativo (sobra não é reposição).
 * Null enquanto o item não foi contado.
 */
export function calcularARepor(estoqueIdeal: number, contagemAtual: number | null): number | null {
  if (contagemAtual == null) return null;
  return Math.max(0, estoqueIdeal - contagemAtual);
}

/**
 * Rótulo do mês de referência em português, ex.: "agosto de 2026".
 *
 * Concatena T12:00:00 antes de criar o Date — `new Date("2026-08-01")` é UTC
 * meia-noite e em fuso negativo volta para 31/07, mostrando o mês errado.
 */
export function rotuloMes(mesIso: string): string {
  const data = new Date(`${mesIso}T12:00:00`);
  return format(data, "MMMM 'de' yyyy", { locale: ptBR });
}
