/**
 * lib/cotacao/economia.ts
 * Cálculo único da economia de uma cotação (usado por aprovarCotacao,
 * gerarPedidosDeCotacao e backfills) — evita divergência entre fluxos.
 *
 * Critério: para cada item COM concorrência (≥2 fornecedores cotaram), compara
 * o preço do fornecedor escolhido com o MAIOR preço cotado naquele item.
 * Economia = quanto se deixou de gastar vs comprar do mais caro. Sempre ≥ 0.
 */

export interface ItemEconomia {
  quantidade:    number;
  precoVencedor: number;    // preço do fornecedor selecionado para o item
  precosCotados: number[];  // todos os preços cotados no item (inclui o vencedor)
}

export interface ResultadoEconomia {
  economia:       number | null; // null quando nenhum item teve concorrência
  economiaPct:    number | null;
  valorAprovado:  number;        // total da compra pelos preços escolhidos
}

export function calcularEconomia(itens: ItemEconomia[]): ResultadoEconomia {
  let economiaTotal = 0;
  let baseMaxima    = 0; // soma do maior preço × qtd nos itens com concorrência
  let valorAprovado = 0;
  let comConcorrencia = 0;

  for (const it of itens) {
    valorAprovado += it.quantidade * it.precoVencedor;

    const cotados = it.precosCotados.filter(p => p > 0);
    if (cotados.length >= 2) {
      const maior = Math.max(...cotados);
      economiaTotal += (maior - it.precoVencedor) * it.quantidade;
      baseMaxima    += maior * it.quantidade;
      comConcorrencia++;
    }
  }

  const economia    = comConcorrencia > 0 ? economiaTotal : null;
  const economiaPct = comConcorrencia > 0 && baseMaxima > 0 ? (economiaTotal / baseMaxima) * 100 : null;
  return { economia, economiaPct, valorAprovado };
}
