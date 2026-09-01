/**
 * lib/estoque/mapeamento.ts
 * Sugestão de mapeamento entre o catálogo do Automo e o do LHG/Omie.
 *
 * Funções puras, sem Supabase, sem `pg` e sem React: a regra de semelhança é a
 * única lógica de negócio deste bloco e fica testável sem mock.
 *
 * Os dois catálogos escrevem o mesmo produto de formas diferentes
 * ("CERVEJA HEINEKEN LONG NECK" vs "Cerveja Heineken Long-Neck 330ml"), então
 * comparar string crua não serve.
 */

/** Minúsculas, sem acento, pontuação virando espaço, espaços colapsados. */
export function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Semelhança entre dois nomes: índice de Jaccard sobre o conjunto de palavras.
 *
 * Conjunto, não sequência, de propósito — os catálogos divergem na ordem e em
 * complementos ("330ml", "UN", "CX"), e Jaccard tolera isso sem penalizar por
 * posição. Retorna 0..1.
 */
export function pontuarSemelhanca(a: string, b: string): number {
  const pa = new Set(normalizarNome(a).split(" ").filter(Boolean));
  const pb = new Set(normalizarNome(b).split(" ").filter(Boolean));
  if (pa.size === 0 || pb.size === 0) return 0;

  let comuns = 0;
  for (const p of pa) if (pb.has(p)) comuns++;

  const uniao = pa.size + pb.size - comuns;
  return uniao === 0 ? 0 : comuns / uniao;
}

/** Conjunto de palavras de um nome, já normalizado. */
function palavrasDe(nome: string): Set<string> {
  return new Set(normalizarNome(nome).split(" ").filter(Boolean));
}

/** `a` está inteiramente contido em `b`, e `b` tem palavra a mais. */
function contidoEm(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || a.size >= b.size) return false;
  for (const p of a) if (!b.has(p)) return false;
  return true;
}

/**
 * Natureza da relação entre o nome comprado (LHG/Omie) e o nome vendido (Automo).
 *
 * - `identico`  nomes iguais depois de normalizar
 * - `contido`   o nome do Automo está contido no do LHG — o PDV usa o nome
 *               genérico e a compra carrega marca/tamanho
 * - `insumo`    o nome do LHG está contido no do Automo — o item do Automo é
 *               MAIOR: um prato ou combo que consome este insumo
 * - `parcial`   só compartilham palavras
 */
export type ClasseSugestao = "identico" | "contido" | "insumo" | "parcial";

/**
 * Classifica a relação entre os dois nomes.
 *
 * ⚠️ Isto não é enfeite de UI: medido no catálogo do Lush Ipiranga em
 * 01/09/2026, entre os candidatos com score ≥ 0,35 e não idênticos, a DIREÇÃO
 * da contenção previu o acerto melhor que o score.
 *
 *   Automo ⊂ LHG  → 9 casos, **9 corretos** (`COCA COLA PET 2L` → `COCA COLA`,
 *                   `CHA DE CAMOMILA TWININGS C/10` → `CHA DE CAMOMILA`)
 *   LHG ⊂ Automo  → 3 casos, **3 são a armadilha** (`MORANGO` →
 *                   `CAIPIROSKA MORANGO`, `FLOR DE SAL` → `SORVETE DE CARAMELO
 *                   COM FLOR DE SAL`)
 *   nenhum        → 29 casos, mistura — inclui erros plausíveis como
 *                   `TAPIOCA DE NUTELLA` → `TAPIOCA DE BRIGADEIRO` (67%) e
 *                   `COINTREAU - LICOR DE LARANJA` → `SUCO DE LARANJA` (40%)
 *
 * O caso `insumo` merece aviso próprio porque não é erro de pontuação: é o
 * limite do modelo de um-para-um. Vincular ali faz a baixa vir pelo prato
 * inteiro, e um `fator_conversao` único não representa um prato com vários
 * insumos — é a ficha técnica que o sistema ainda não tem.
 */
export function classificarSugestao(alvo: string, candidato: string): ClasseSugestao {
  const a = palavrasDe(alvo);
  const c = palavrasDe(candidato);

  if (a.size > 0 && c.size > 0 && normalizarNome(alvo) === normalizarNome(candidato)) {
    return "identico";
  }
  if (contidoEm(c, a)) return "contido";
  if (contidoEm(a, c)) return "insumo";
  return "parcial";
}

export interface CandidatoNome {
  id:   string;
  nome: string;
}

export interface Sugestao extends CandidatoNome {
  score: number;
  classe: ClasseSugestao;
}

interface OpcoesSugestao {
  limite?:      number;
  scoreMinimo?: number;
}

/**
 * Piso de semelhança abaixo do qual não vale sugerir nada.
 *
 * ⚠️ Era 0,15 e isso estava errado. Medido no Lush Ipiranga (1.439 produtos do
 * catálogo × 353 do Automo): a faixa 0,15–0,34 tem **330 produtos, 23% do
 * catálogo**, e o melhor palpite deles é ruído puro — `MIOLO DE ACEM` →
 * `COMPLEMENTO DE TARIFA` (20%), `ADAPTADOR SOLD CURTO 40X1.1/2 AMANCO` →
 * `FIT 2 - CALCINHA VIBRATORIA 2 EM 1` (18%).
 *
 * Eles apareciam no topo da lista com a mesma aparência dos 269 acertos por nome
 * idêntico. Vínculo errado aqui não dá erro: gera divergência de estoque errada
 * todo mês, em silêncio. Sem sugestão é melhor que sugestão ruim — a busca no
 * Automo continua disponível para esses casos.
 */
export const SCORE_MINIMO_SUGESTAO = 0.35;

/**
 * Ordena o catálogo pela semelhança com `alvo`.
 *
 * O desempate por nome existe para a ordem ser estável: sem ele, dois candidatos
 * de mesmo score sairiam em ordem imprevisível e a sugestão mudaria entre
 * carregamentos da tela.
 */
export function sugerirCandidatos(
  alvo: string,
  catalogo: CandidatoNome[],
  { limite = 5, scoreMinimo = SCORE_MINIMO_SUGESTAO }: OpcoesSugestao = {},
): Sugestao[] {
  return catalogo
    .map(c => ({
      ...c,
      score: pontuarSemelhanca(alvo, c.nome),
      classe: classificarSugestao(alvo, c.nome),
    }))
    .filter(c => c.score >= scoreMinimo)
    .sort((a, b) => (b.score - a.score) || a.nome.localeCompare(b.nome, "pt-BR"))
    .slice(0, limite);
}
