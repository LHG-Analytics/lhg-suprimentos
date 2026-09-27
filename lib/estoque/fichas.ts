/**
 * lib/estoque/fichas.ts — módulo de Estoque (fichas técnicas, 1:N)
 *
 * Generaliza `converterSaidas` (lib/estoque/saidas.ts): lá 1 venda no Automo baixa
 * 1 item de estoque por `fator_conversao`; aqui 1 venda baixa N insumos conforme a
 * ficha técnica, com rendimento (porções por preparo), perda (% descartada antes
 * de chegar ao prato) e sub-preparo aninhado (ficha que usa outra ficha).
 *
 * Funções puras, sem Supabase nem `pg`: quem chama busca fichas, itens e vendas e
 * passa aqui dentro. Espelha as tabelas da migration 0029 (`fichas_tecnicas`,
 * `ficha_tecnica_itens`).
 *
 * Regras que o teste fixa:
 * - Consumo bruto = vendas / rendimento × quantidade / (1 − perda_pct/100).
 * - A quantidade da ficha (g/kg/ml/L/un) é convertida para a unidade de COMPRA
 *   do item de estoque (`produtos.unidade_med`). Dimensão diferente (g × UN) não
 *   é adivinhada: vira aviso e o item fica FORA do mapa — ausência é "não sei",
 *   zero seria "medi e deu zero" (mesmo princípio de `estoque_ciclo_itens.saidas`).
 * - Insumo de ficha sem venda no período entra com 0.
 * - Produto com ficha E vínculo 1:1 usa só a ficha (aviso), nunca conta duas vezes.
 * - Ciclo entre fichas é erro, não laço infinito.
 */

import { converterSaidas, type ItemMapeado, type SaidaAutomo } from "@/lib/estoque/saidas";

export type UnidadeFicha = "g" | "kg" | "ml" | "L" | "un";

export interface FichaItem {
  /** Insumo comprado (estoque_itens.id). Exclusivo com `ficha_filha_id`. */
  estoque_item_id?: string | null;
  /** Sub-preparo: outra ficha (fichas_tecnicas.id). Exclusivo com `estoque_item_id`. */
  ficha_filha_id?: string | null;
  /** Quantidade por RENDIMENTO da ficha, na unidade `unidade`. */
  quantidade: number;
  unidade: UnidadeFicha;
  /** % perdida antes de chegar ao prato (casca, aparas). 0–99,99. */
  perda_pct?: number | null;
}

export interface Ficha {
  id: string;
  /** Produto vendido no Automo. `null` = sub-preparo (só usado por outras fichas). */
  automo_produto_id: number | null;
  /** Prato: porções que a ficha rende (normalmente 1). Sub-preparo: quantidade produzida por lote. */
  rendimento: number;
  /** `un` para pratos; g/kg/ml/L para sub-preparos (a unidade do lote). */
  rendimento_unidade: UnidadeFicha;
  itens: FichaItem[];
}

export interface ResultadoExplosao {
  /** estoque_item_id → consumo na unidade de compra, 3 casas. */
  consumo: Map<string, number>;
  /** Itens/fichas que não puderam ser calculados e por quê. */
  avisos: string[];
}

type Dimensao = "massa" | "volume" | "contagem";
const DIMENSAO: Record<UnidadeFicha, Dimensao> = { g: "massa", kg: "massa", ml: "volume", L: "volume", un: "contagem" };
/** Fator para a unidade-base da dimensão (kg, L, un). */
const PARA_BASE: Record<UnidadeFicha, number> = { g: 0.001, kg: 1, ml: 0.001, L: 1, un: 1 };

/**
 * Traduz a unidade de compra do Omie (`produtos.unidade_med`: "KG", "UN", "LT"...)
 * para a unidade da ficha. `null` = desconhecida (CX, PCT, SC...) — sem conversão
 * confiável, e adivinhar "quantos por caixa" seria inventar número.
 */
export function normalizarUnidadeCompra(unidade: string): UnidadeFicha | null {
  const u = unidade.trim().toUpperCase().replace(/\.$/, "");
  if (["KG", "KILO", "QUILO"].includes(u)) return "kg";
  if (["G", "GR", "GRAMA", "GRAMAS"].includes(u)) return "g";
  if (["L", "LT", "LITRO", "LITROS"].includes(u)) return "L";
  if (u === "ML") return "ml";
  if (["UN", "UND", "UNID", "UNIDADE", "PC", "PÇ", "PCS"].includes(u)) return "un";
  return null;
}

/**
 * Converte `quantidade` da unidade da ficha para a unidade de compra.
 * `null` quando a dimensão não bate (g → UN) ou a unidade de compra é desconhecida.
 */
export function converterUnidade(quantidade: number, de: UnidadeFicha, unidadeCompra: string): number | null {
  const para = normalizarUnidadeCompra(unidadeCompra);
  if (!para || DIMENSAO[de] !== DIMENSAO[para]) return null;
  // arredonda em 9 casas para não vazar 0.18000000000000002 do ponto flutuante
  return Math.round((quantidade * PARA_BASE[de] / PARA_BASE[para]) * 1e9) / 1e9;
}

function converterEntreFicha(quantidade: number, de: UnidadeFicha, para: UnidadeFicha): number | null {
  if (DIMENSAO[de] !== DIMENSAO[para]) return null;
  return quantidade * PARA_BASE[de] / PARA_BASE[para];
}

const arredondar3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Explode as vendas do Automo em consumo de insumos via ficha técnica.
 *
 * @param fichas          todas as fichas do local (venda e sub-preparo)
 * @param saidas          vendas agregadas por produto do Automo no período
 * @param unidadesCompra  estoque_item_id → `produtos.unidade_med` do item
 */
export function explodirSaidasPorFicha(
  fichas: Ficha[],
  saidas: SaidaAutomo[],
  unidadesCompra: Map<string, string>,
): ResultadoExplosao {
  const porId = new Map(fichas.map((f) => [f.id, f]));
  const porAutomo = new Map<number, Ficha>();
  for (const f of fichas) if (f.automo_produto_id != null) porAutomo.set(f.automo_produto_id, f);

  const consumo = new Map<string, number>();
  const invalidos = new Set<string>();
  const avisos: string[] = [];

  // Insumos alcançáveis a partir das fichas de venda começam em 0 ("não vendeu nada").
  const semear = (ficha: Ficha, pilha: string[]) => {
    for (const item of ficha.itens) {
      if (item.estoque_item_id) { if (!consumo.has(item.estoque_item_id)) consumo.set(item.estoque_item_id, 0); continue; }
      if (!item.ficha_filha_id) continue;
      const filha = porId.get(item.ficha_filha_id);
      if (!filha) continue;
      if (pilha.includes(filha.id)) throw new Error(`ciclo de fichas técnicas: ${[...pilha, filha.id].join(" → ")}`);
      semear(filha, [...pilha, filha.id]);
    }
  };
  for (const f of porAutomo.values()) semear(f, [f.id]);

  const explodir = (ficha: Ficha, quantidade: number, unidade: UnidadeFicha, pilha: string[]) => {
    const emUnidadeDoRendimento = converterEntreFicha(quantidade, unidade, ficha.rendimento_unidade);
    if (emUnidadeDoRendimento == null) {
      avisos.push(`ficha ${ficha.id}: pedida em ${unidade}, mas o rendimento está em ${ficha.rendimento_unidade}`);
      return;
    }
    const lotes = emUnidadeDoRendimento / ficha.rendimento;
    for (const item of ficha.itens) {
      const perda = item.perda_pct ?? 0;
      const bruto = lotes * item.quantidade / (1 - perda / 100);
      if (item.estoque_item_id) {
        const id = item.estoque_item_id;
        const unidadeCompra = unidadesCompra.get(id);
        const convertido = unidadeCompra == null ? null : converterUnidade(bruto, item.unidade, unidadeCompra);
        if (convertido == null) {
          invalidos.add(id);
          avisos.push(`item ${id}: ${item.unidade} da ficha ${ficha.id} não converte para a unidade de compra ${unidadeCompra ?? "(desconhecida)"}`);
          continue;
        }
        consumo.set(id, (consumo.get(id) ?? 0) + convertido);
        continue;
      }
      if (!item.ficha_filha_id) continue;
      const filha = porId.get(item.ficha_filha_id);
      if (!filha) { avisos.push(`ficha ${ficha.id}: sub-preparo ${item.ficha_filha_id} não encontrado`); continue; }
      if (pilha.includes(filha.id)) throw new Error(`ciclo de fichas técnicas: ${[...pilha, filha.id].join(" → ")}`);
      explodir(filha, bruto, item.unidade, [...pilha, filha.id]);
    }
  };

  for (const saida of saidas) {
    const ficha = porAutomo.get(saida.automo_produto_id);
    if (!ficha) continue; // produto sem ficha: é do caminho 1:1 ou não é estoque
    explodir(ficha, saida.quantidade, "un", [ficha.id]);
  }

  for (const id of invalidos) consumo.delete(id);
  for (const [id, valor] of consumo) consumo.set(id, arredondar3(valor));
  return { consumo, avisos };
}

/**
 * Caminho completo: fichas (1:N) + fator 1:1 para o que não tem ficha, somados no
 * mesmo insumo (Coca vendida avulsa e dentro de combo).
 * Produto que tem ficha E item 1:1 usa só a ficha — o item sai do caminho 1:1 e
 * fica registrado em `avisos` para o vínculo ser limpo no cadastro.
 */
export function converterSaidasComFichas(
  itens: ItemMapeado[],
  saidas: SaidaAutomo[],
  fichas: Ficha[],
  unidadesCompra: Map<string, string>,
): ResultadoExplosao {
  const comFicha = new Set(fichas.filter((f) => f.automo_produto_id != null).map((f) => f.automo_produto_id as number));

  const itens1a1: ItemMapeado[] = [];
  const avisos: string[] = [];
  for (const item of itens) {
    if (item.automo_produto_id != null && comFicha.has(item.automo_produto_id)) {
      avisos.push(`produto Automo ${item.automo_produto_id} tem ficha técnica e vínculo 1:1 com ${item.estoque_item_id}; usada só a ficha`);
      continue;
    }
    itens1a1.push(item);
  }

  const porFator = converterSaidas(itens1a1, saidas.filter((s) => !comFicha.has(s.automo_produto_id)));
  const porFicha = explodirSaidasPorFicha(fichas, saidas, unidadesCompra);

  const consumo = new Map<string, number>(porFator);
  for (const [id, valor] of porFicha.consumo) consumo.set(id, arredondar3((consumo.get(id) ?? 0) + valor));
  return { consumo, avisos: [...avisos, ...porFicha.avisos] };
}
