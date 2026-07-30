/**
 * lib/relatorios.ts
 * Agregações puras dos relatórios de compras — curva ABC de produtos, ranking de
 * categorias e categoria predominante por fornecedor.
 *
 * Vive fora do Server Component de propósito: é lógica de negócio testável, sem
 * dependência de Supabase nem de React. As três funções consomem a MESMA leitura
 * de `pedido_itens`, então a página faz uma query e agrega três vezes.
 */

/** Linha de `pedido_itens` com os joins de produto e pedido. */
export interface ItemPedido {
  pedido_id:      string;
  quantidade:     number;
  preco_unitario: number;
  valor_total:    number | null;
  produtos: { nome: string; categoria: string; unidade_med: string } | null;
  pedidos:  { fornecedor_id: string } | null;
}

export interface ProdutoAbc {
  nome: string;
  categoria: string;
  unidadeMed: string;
  qtd: number;
  total: number;
  pedidos: number;
  precoMedio: number;
  precoMin: number;
  precoMax: number;
  /** Variação percentual entre o menor e o maior preço unitário pago no período. */
  variacaoPct: number;
  pctTotal: number;
  pctAcumulado: number;
  classe: ClasseAbc;
}

export interface CategoriaDetalhe {
  categoria: string;
  total: number;
  pctTotal: number;
  produtos: number;
  pedidos: number;
  fornecedores: number;
  produtoTop: string;
  produtoTopPct: number;
  fornecedorTop: string;
  fornecedorTopPct: number;
}

export type ClasseAbc = "A" | "B" | "C";

/**
 * Cortes da curva ABC, em % acumulado do gasto.
 * 80/95 é a convenção clássica de Pareto para gestão de estoque.
 */
export const CORTE_ABC = { a: 80, b: 95 } as const;

/**
 * `valor_total` é uma coluna GENERATED em `pedido_itens`, mas o fallback protege
 * contra linhas antigas gravadas antes da coluna existir.
 */
export function valorDoItem(i: ItemPedido): number {
  return i.valor_total ?? i.quantidade * i.preco_unitario;
}

export function classeAbc(pctAcumulado: number): ClasseAbc {
  if (pctAcumulado <= CORTE_ABC.a) return "A";
  if (pctAcumulado <= CORTE_ABC.b) return "B";
  return "C";
}

/** Chave da maior entrada de um mapa nome→valor. Retorna ["", 0] se vazio. */
function maiorEntrada(m: Map<string, number>): [string, number] {
  return Array.from(m.entries()).reduce<[string, number]>(
    (melhor, atual) => (atual[1] > melhor[1] ? atual : melhor),
    ["", 0],
  );
}

/**
 * Ordena produtos por R$ gasto e classifica pela curva ABC.
 * A lista resultante responde "onde negociar primeiro": os produtos de classe A
 * concentram 80% do dinheiro, então 1% de desconto neles vale mais que 20% na cauda.
 */
export function computeTopProdutos(itens: ItemPedido[]): ProdutoAbc[] {
  const map = new Map<string, {
    nome: string; categoria: string; unidadeMed: string;
    qtd: number; total: number; pedidos: Set<string>;
    precoMin: number; precoMax: number;
  }>();

  for (const i of itens) {
    const p = i.produtos;
    if (!p) continue;
    const entry = map.get(p.nome) ?? {
      nome: p.nome, categoria: p.categoria, unidadeMed: p.unidade_med,
      qtd: 0, total: 0, pedidos: new Set<string>(),
      precoMin: Infinity, precoMax: 0,
    };
    entry.qtd   += i.quantidade;
    entry.total += valorDoItem(i);
    entry.pedidos.add(i.pedido_id);
    entry.precoMin = Math.min(entry.precoMin, i.preco_unitario);
    entry.precoMax = Math.max(entry.precoMax, i.preco_unitario);
    map.set(p.nome, entry);
  }

  const ordenados  = Array.from(map.values()).sort((a, b) => b.total - a.total);
  const totalGeral = ordenados.reduce((s, p) => s + p.total, 0);

  let acumulado = 0;
  return ordenados.map((p) => {
    acumulado += p.total;
    const pctAcumulado = totalGeral > 0 ? (acumulado / totalGeral) * 100 : 0;
    const precoMin     = p.precoMin === Infinity ? 0 : p.precoMin;
    return {
      nome:         p.nome,
      categoria:    p.categoria,
      unidadeMed:   p.unidadeMed,
      qtd:          p.qtd,
      total:        p.total,
      pedidos:      p.pedidos.size,
      precoMedio:   p.qtd > 0 ? p.total / p.qtd : 0,
      precoMin,
      precoMax:     p.precoMax,
      variacaoPct:  precoMin > 0 ? ((p.precoMax - precoMin) / precoMin) * 100 : 0,
      pctTotal:     totalGeral > 0 ? (p.total / totalGeral) * 100 : 0,
      pctAcumulado,
      classe:       classeAbc(pctAcumulado),
    };
  });
}

/**
 * Ranking de categorias com foco em CONCENTRAÇÃO, não em volume — o volume já
 * está na pizza da página. Categoria atendida por um único fornecedor com
 * fatia dominante é risco de dependência.
 */
export function computeTopCategorias(
  itens: ItemPedido[],
  fornecedorNome: Map<string, string>,
): CategoriaDetalhe[] {
  const map = new Map<string, {
    categoria: string; total: number;
    produtos: Map<string, number>;      // nome do produto  → R$ na categoria
    fornecedores: Map<string, number>;  // id do fornecedor → R$ na categoria
    pedidos: Set<string>;
  }>();

  // Passada única: acumula produto e fornecedor por categoria de uma vez.
  for (const i of itens) {
    const cat   = i.produtos?.categoria ?? "Outros";
    const entry = map.get(cat) ?? {
      categoria: cat, total: 0,
      produtos: new Map<string, number>(), fornecedores: new Map<string, number>(),
      pedidos: new Set<string>(),
    };
    const v = valorDoItem(i);
    entry.total += v;
    entry.pedidos.add(i.pedido_id);
    if (i.produtos?.nome) {
      entry.produtos.set(i.produtos.nome, (entry.produtos.get(i.produtos.nome) ?? 0) + v);
    }
    const fid = i.pedidos?.fornecedor_id;
    if (fid) entry.fornecedores.set(fid, (entry.fornecedores.get(fid) ?? 0) + v);
    map.set(cat, entry);
  }

  const totalGeral = Array.from(map.values()).reduce((s, c) => s + c.total, 0);

  return Array.from(map.values())
    .map((c) => {
      const [topProduto, topProdutoValor] = maiorEntrada(c.produtos);
      const [topFornId,  topFornValor]    = maiorEntrada(c.fornecedores);
      return {
        categoria:        c.categoria,
        total:            c.total,
        pctTotal:         totalGeral > 0 ? (c.total / totalGeral) * 100 : 0,
        produtos:         c.produtos.size,
        pedidos:          c.pedidos.size,
        fornecedores:     c.fornecedores.size,
        produtoTop:       topProduto || "—",
        produtoTopPct:    c.total > 0 ? (topProdutoValor / c.total) * 100 : 0,
        fornecedorTop:    fornecedorNome.get(topFornId) ?? "—",
        fornecedorTopPct: c.total > 0 ? (topFornValor / c.total) * 100 : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
}

/**
 * `fornecedores.categoria` está NULL nos 1.006 registros (o Omie não traz esse
 * campo), então a categoria exibida é derivada: a de maior gasto no histórico.
 */
export function categoriaPorFornecedor(itens: ItemPedido[]): Map<string, string> {
  const porForn = new Map<string, Map<string, number>>();
  for (const i of itens) {
    const fid = i.pedidos?.fornecedor_id;
    if (!fid) continue;
    const cat  = i.produtos?.categoria ?? "Outros";
    const cats = porForn.get(fid) ?? new Map<string, number>();
    cats.set(cat, (cats.get(cat) ?? 0) + valorDoItem(i));
    porForn.set(fid, cats);
  }

  const out = new Map<string, string>();
  for (const [fid, cats] of porForn) {
    const [top] = maiorEntrada(cats);
    if (top) out.set(fid, top);
  }
  return out;
}
