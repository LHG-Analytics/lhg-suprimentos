/**
 * lib/estoque/saidas-ciclo.ts — saídas do ciclo de contagem com baixa por ficha
 *
 * Ponte entre a importação de saídas da tela de contagem (que trabalha por
 * LINHA do ciclo, `estoque_ciclo_itens.id`) e as fichas técnicas (que apontam
 * para `estoque_itens.id`).
 *
 * Contrato:
 * - Local SEM ficha (Lapa, Altana, Andar de Cima): resultado byte a byte igual ao
 *   `converterSaidas` de sempre — sem avisos. Teste garante.
 * - Local COM ficha (Lush Ipiranga): `converterSaidasComFichas` soma o caminho
 *   1:1 com a explosão das fichas; os avisos da lib são classificados por tipo e
 *   os ids trocados por nomes, para a tela mostrar sem bloquear a importação.
 * - Insumo de ficha que ainda não está no ciclo (cadastrado depois da abertura)
 *   não tem linha para gravar: vira aviso `fora_do_ciclo`, e a tela já oferece
 *   "Trazer para a contagem" (`sincronizarItensDoCiclo`).
 *
 * Função pura, sem Supabase nem `pg`.
 */

import { converterSaidas, type SaidaAutomo } from "@/lib/estoque/saidas";
import { converterSaidasComFichas, type Ficha } from "@/lib/estoque/fichas";

export interface LinhaCiclo {
  /** estoque_ciclo_itens.id — é nela que o UPDATE de `saidas` roda. */
  ciclo_item_id: string;
  /** estoque_itens.id — é o que as fichas referenciam. */
  estoque_item_id: string;
  automo_produto_id: number | null;
  fator_conversao: number;
  /** produtos.unidade_med do item ("KG", "UN", "LT"...). */
  unidade_med: string;
}

export type TipoAviso = "insumo_pendente" | "unidade_incompativel" | "sub_preparo_sem_receita" | "fora_do_ciclo" | "outro";

export interface AvisoSaida {
  tipo: TipoAviso;
  texto: string;
}

export interface ResultadoSaidasCiclo {
  /** ciclo_item_id → saídas convertidas (unidade de compra, 3 casas). */
  porLinha: Map<string, number>;
  avisos: AvisoSaida[];
  /** Produtos do Automo com venda no mês que não têm vínculo 1:1 nem ficha. */
  produtosIgnorados: number;
  /** Nomes dos insumos com baixa por ficha que não estão no ciclo. */
  itensForaDoCiclo: string[];
}

/** Classifica um aviso textual de `lib/estoque/fichas.ts` (o vocabulário é nosso). */
export function classificarAviso(texto: string): TipoAviso {
  if (/insumo pendente/.test(texto)) return "insumo_pendente";
  if (/não converte para a unidade de compra|mas o rendimento está em/.test(texto)) return "unidade_incompativel";
  if (/sem receita/.test(texto)) return "sub_preparo_sem_receita";
  return "outro";
}

/** Troca cada id conhecido pelo nome, do id mais longo para o mais curto (evita substituição parcial). */
function tornarLegivel(texto: string, nomes: Map<string, string>): string {
  let saida = texto;
  for (const [id, nome] of [...nomes.entries()].sort((a, b) => b[0].length - a[0].length)) {
    if (saida.includes(id)) saida = saida.split(id).join(nome);
  }
  return saida;
}

export function calcularSaidasDoCiclo(
  linhas: LinhaCiclo[],
  saidasAutomo: SaidaAutomo[],
  fichas: Ficha[],
  /** id (ficha ou estoque_item) → nome legível, para os avisos. */
  nomes: Map<string, string> = new Map(),
  /**
   * estoque_item_id → unidade de compra dos itens do local que NÃO estão no ciclo
   * (cadastrados depois da abertura). Sem isso a lib não converte e acusaria
   * "unidade incompatível" em vez do motivo real, "fora do ciclo".
   */
  unidadesForaDoCiclo: Map<string, string> = new Map(),
): ResultadoSaidasCiclo {
  const itens1a1 = linhas.map((l) => ({ estoque_item_id: l.ciclo_item_id, automo_produto_id: l.automo_produto_id, fator_conversao: l.fator_conversao }));
  const automoCom1a1 = new Set(linhas.map((l) => l.automo_produto_id).filter((id): id is number => id != null));

  // ── sem ficha: exatamente o comportamento atual ──────────────────────────
  if (fichas.length === 0) {
    const porLinha = converterSaidas(itens1a1, saidasAutomo);
    const produtosIgnorados = new Set(saidasAutomo.map((s) => s.automo_produto_id).filter((id) => !automoCom1a1.has(id))).size;
    return { porLinha, avisos: [], produtosIgnorados, itensForaDoCiclo: [] };
  }

  // ── com ficha: soma 1:1 + explosão, chaveado por estoque_item_id ────────
  const itensPorEstoque = linhas.map((l) => ({ estoque_item_id: l.estoque_item_id, automo_produto_id: l.automo_produto_id, fator_conversao: l.fator_conversao }));
  const unidadesCompra = new Map(linhas.map((l) => [l.estoque_item_id, l.unidade_med]));
  for (const [id, unidade] of unidadesForaDoCiclo) if (!unidadesCompra.has(id)) unidadesCompra.set(id, unidade);

  const { consumo, avisos: textos } = converterSaidasComFichas(itensPorEstoque, saidasAutomo, fichas, unidadesCompra);

  const linhaPorEstoque = new Map(linhas.map((l) => [l.estoque_item_id, l.ciclo_item_id]));
  const porLinha = new Map<string, number>();
  const foraDoCiclo: string[] = [];
  for (const [estoqueItemId, valor] of consumo) {
    const cicloItemId = linhaPorEstoque.get(estoqueItemId);
    if (cicloItemId) porLinha.set(cicloItemId, valor);
    else foraDoCiclo.push(nomes.get(estoqueItemId) ?? estoqueItemId);
  }

  const avisos: AvisoSaida[] = textos.map((t) => ({ tipo: classificarAviso(t), texto: tornarLegivel(t, nomes) }));
  for (const nome of foraDoCiclo) avisos.push({ tipo: "fora_do_ciclo", texto: `${nome}: tem baixa por ficha mas não está neste ciclo — use "Trazer para a contagem"` });

  const automoComFicha = new Set(fichas.filter((f) => f.automo_produto_id != null).map((f) => f.automo_produto_id as number));
  const produtosIgnorados = new Set(saidasAutomo.map((s) => s.automo_produto_id).filter((id) => !automoCom1a1.has(id) && !automoComFicha.has(id))).size;

  return { porLinha, avisos, produtosIgnorados, itensForaDoCiclo: foraDoCiclo };
}

/** Resumo persistido em `estoque_ciclos.saidas_avisos` (migration 0030). */
export interface ResumoAvisosSaidas {
  gerado_em: string;
  total: number;
  por_tipo: Record<TipoAviso, number>;
  /** Lista limitada a `LIMITE_AVISOS_PERSISTIDOS` — o total real fica em `total`. */
  avisos: AvisoSaida[];
  produtos_ignorados: number;
  itens_fora_do_ciclo: number;
}

export const LIMITE_AVISOS_PERSISTIDOS = 400;

export function resumirAvisos(r: ResultadoSaidasCiclo, geradoEm: string): ResumoAvisosSaidas {
  const por_tipo: Record<TipoAviso, number> = { insumo_pendente: 0, unidade_incompativel: 0, sub_preparo_sem_receita: 0, fora_do_ciclo: 0, outro: 0 };
  for (const a of r.avisos) por_tipo[a.tipo]++;
  return {
    gerado_em: geradoEm,
    total: r.avisos.length,
    por_tipo,
    avisos: r.avisos.slice(0, LIMITE_AVISOS_PERSISTIDOS),
    produtos_ignorados: r.produtosIgnorados,
    itens_fora_do_ciclo: r.itensForaDoCiclo.length,
  };
}
