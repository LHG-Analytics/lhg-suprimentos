"use server";

/**
 * app/(app)/estoque/contagem/actions.ts — módulo de Estoque (bloco 2)
 * Abertura/fechamento do ciclo mensal e registro item a item da contagem.
 *
 * A equipe conta andando pelo estoque com o celular na mão: cada item é salvo
 * sozinho (`registrarContagem`) em vez de um "salvar tudo" no fim — um sinal
 * ruim no meio do corredor não pode custar a contagem inteira.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { somarSaidasPorProduto, AutomoIndisponivelError } from "@/lib/automo/client";
import { converterSaidas, type ItemMapeado } from "@/lib/estoque/saidas";
import { resolverChavesOmiePorUnidade, somarEntradasPorItem, type ProdutoRef } from "@/lib/estoque/entradas";
import { somarEntradasOmie } from "@/lib/omie/client";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

function mesAtualIso(): string {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  return `${ano}-${mes}-01`;
}

/**
 * Primeiro dia do mês seguinte a `mesIso` ("YYYY-MM-01"), em string — sem
 * passar por `Date`, que interpretaria a data como UTC meia-noite e correria
 * risco de voltar um dia em fuso negativo. `somarSaidasPorProduto` trata o
 * fim do período como exclusivo, então este é o valor certo para `fimIso`.
 */
function proximoMesIso(mesIso: string): string {
  const [anoStr, mesStr] = mesIso.split("-");
  let ano = Number(anoStr);
  let mes = Number(mesStr) + 1;
  if (mes > 12) {
    mes = 1;
    ano += 1;
  }
  return `${ano}-${String(mes).padStart(2, "0")}-01`;
}

export async function abrirCiclo(
  localId: string,
): Promise<{ ok: true; cicloId: string } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: "Não autenticado" };

  const mes = mesAtualIso();

  // Idempotente: se já existe ciclo deste local neste mês, devolve o mesmo id
  // em vez de deixar a constraint UNIQUE(local_id, mes) estourar um erro cru.
  const { data: existente, error: errExistente } = await supabase
    .from("estoque_ciclos")
    .select("id")
    .eq("local_id", localId)
    .eq("mes", mes)
    .maybeSingle();
  if (errExistente) return { erro: errExistente.message };
  if (existente) return { ok: true, cicloId: existente.id };

  // Itens ativos do local — sem eles não há o que contar.
  const { data: itens, error: errItens } = await supabase
    .from("estoque_itens")
    .select("id")
    .eq("local_id", localId)
    .eq("ativo", true);
  if (errItens) return { erro: errItens.message };
  if (!itens || itens.length === 0) {
    return { erro: "Nenhum item controlado neste local. Cadastre os itens antes de abrir a contagem." };
  }

  // O índice parcial só permite um ciclo 'aberto' por local — fecha qualquer
  // um esquecido de um mês anterior antes de criar o deste mês.
  const { error: errFechar } = await supabase
    .from("estoque_ciclos")
    .update({ status: "fechado", fechado_em: new Date().toISOString(), fechado_por: user.id })
    .eq("local_id", localId)
    .eq("status", "aberto");
  if (errFechar) return { erro: errFechar.message };

  const { data: novoCiclo, error: errCiclo } = await supabase
    .from("estoque_ciclos")
    .insert({ local_id: localId, mes, aberto_por: user.id })
    .select("id")
    .single();
  if (errCiclo || !novoCiclo) return { erro: errCiclo?.message ?? "Falha ao abrir o ciclo" };

  // contagem_anterior = a última contagem_atual não nula de cada item, olhando
  // todo o histórico do local (não só o ciclo imediatamente anterior — o item
  // pode ter ficado sem contagem em algum mês no meio do caminho).
  const { data: ciclosAnteriores, error: errCiclosAnt } = await supabase
    .from("estoque_ciclos")
    .select("id, mes")
    .eq("local_id", localId)
    .order("mes", { ascending: false });
  if (errCiclosAnt) return { erro: errCiclosAnt.message };

  const ordemCiclo = new Map((ciclosAnteriores ?? []).map((c, idx) => [c.id, idx]));
  const cicloIdsAnteriores = (ciclosAnteriores ?? [])
    .map((c) => c.id)
    .filter((id) => id !== novoCiclo.id);

  const contagensAnteriores = new Map<string, number>();
  if (cicloIdsAnteriores.length > 0) {
    const { data: itensAnteriores, error: errItensAnt } = await supabase
      .from("estoque_ciclo_itens")
      .select("estoque_item_id, contagem_atual, ciclo_id")
      .in("ciclo_id", cicloIdsAnteriores)
      .not("contagem_atual", "is", null);
    if (errItensAnt) return { erro: errItensAnt.message };

    const ordenados = (itensAnteriores ?? [])
      .slice()
      .sort((a, b) => (ordemCiclo.get(a.ciclo_id) ?? 0) - (ordemCiclo.get(b.ciclo_id) ?? 0));
    for (const row of ordenados) {
      if (!contagensAnteriores.has(row.estoque_item_id) && row.contagem_atual != null) {
        contagensAnteriores.set(row.estoque_item_id, row.contagem_atual);
      }
    }
  }

  const linhas = itens.map((item) => ({
    ciclo_id: novoCiclo.id,
    estoque_item_id: item.id,
    contagem_anterior: contagensAnteriores.get(item.id) ?? null,
  }));

  const { error: errInsertItens } = await supabase.from("estoque_ciclo_itens").insert(linhas);
  if (errInsertItens) return { erro: errInsertItens.message };

  revalidatePath("/estoque/contagem");
  return { ok: true, cicloId: novoCiclo.id };
}

const RegistrarContagemSchema = z.object({
  cicloItemId: z.string().uuid(),
  quantidade: z.number().min(0, "Quantidade não pode ser negativa"),
});

export async function registrarContagem(
  input: z.infer<typeof RegistrarContagemSchema>,
): Promise<{ ok: true } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: "Não autenticado" };

  const parsed = RegistrarContagemSchema.safeParse(input);
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const { error } = await supabase
    .from("estoque_ciclo_itens")
    .update({
      contagem_atual: parsed.data.quantidade,
      contado_por: user.id,
      contado_em: new Date().toISOString(),
    })
    .eq("id", parsed.data.cicloItemId);
  if (error) return { erro: error.message };

  revalidatePath("/estoque/contagem");
  return { ok: true };
}

const RegistrarInventarioInicialSchema = z.object({
  cicloItemId: z.string().uuid(),
  quantidade: z.number().min(0, "Quantidade não pode ser negativa"),
});

type CicloItemComCicloRow = {
  id: string;
  contagem_anterior: number | null;
  estoque_ciclos: { id: string; local_id: string; mes: string } | null;
};

/**
 * Grava o saldo de ABERTURA (`contagem_anterior`) de um item — usado só no
 * primeiro ciclo de um local, no dia em que o time começa a contar do zero.
 *
 * Gravar essa contagem em `contagem_atual` (como `registrarContagem` faz)
 * compararia a contagem do dia 1 contra as entradas e saídas do mês inteiro,
 * e a divergência do primeiro mês sairia errada — daí a action separada.
 *
 * Só permite quando `contagem_anterior` ainda está null E não existe ciclo
 * anterior deste local (`mes` menor): nos demais casos o valor já foi (ou já
 * deveria ter sido) herdado do ciclo anterior por `abrirCiclo`, e sobrescrever
 * aqui destruiria essa herança.
 */
export async function registrarInventarioInicial(
  input: z.infer<typeof RegistrarInventarioInicialSchema>,
): Promise<{ ok: true } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: "Não autenticado" };

  const parsed = RegistrarInventarioInicialSchema.safeParse(input);
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const { data: cicloItemRaw, error: errItem } = await supabase
    .from("estoque_ciclo_itens")
    .select("id, contagem_anterior, estoque_ciclos(id, local_id, mes)")
    .eq("id", parsed.data.cicloItemId)
    .maybeSingle();
  if (errItem) return { erro: errItem.message };

  const cicloItem = cicloItemRaw as CicloItemComCicloRow | null;
  if (!cicloItem || !cicloItem.estoque_ciclos) {
    return { erro: "Item de ciclo não encontrado" };
  }

  const jaTemSaldoAbertura = cicloItem.contagem_anterior != null;

  const { count: ciclosAnteriores, error: errAnt } = await supabase
    .from("estoque_ciclos")
    .select("id", { count: "exact", head: true })
    .eq("local_id", cicloItem.estoque_ciclos.local_id)
    .lt("mes", cicloItem.estoque_ciclos.mes);
  if (errAnt) return { erro: errAnt.message };

  if (jaTemSaldoAbertura || (ciclosAnteriores ?? 0) > 0) {
    return { erro: "Este ciclo já tem saldo de abertura herdado do ciclo anterior." };
  }

  const { error } = await supabase
    .from("estoque_ciclo_itens")
    .update({
      contagem_anterior: parsed.data.quantidade,
      contado_por: user.id,
      contado_em: new Date().toISOString(),
    })
    .eq("id", parsed.data.cicloItemId);
  if (error) return { erro: error.message };

  revalidatePath("/estoque/contagem");
  return { ok: true };
}

export async function fecharCiclo(
  cicloId: string,
): Promise<{ ok: true } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: "Não autenticado" };

  const { count, error: errCount } = await supabase
    .from("estoque_ciclo_itens")
    .select("id", { count: "exact", head: true })
    .eq("ciclo_id", cicloId)
    .is("contagem_atual", null);
  if (errCount) return { erro: errCount.message };
  if (count && count > 0) {
    return { erro: `Faltam ${count} ${count === 1 ? "item" : "itens"} para contar antes de fechar o ciclo.` };
  }

  const { error } = await supabase
    .from("estoque_ciclos")
    .update({ status: "fechado", fechado_em: new Date().toISOString(), fechado_por: user.id })
    .eq("id", cicloId);
  if (error) return { erro: error.message };

  revalidatePath("/estoque/contagem");
  return { ok: true };
}

/**
 * Importa as saídas do Automo do mês do ciclo e grava em `estoque_ciclo_itens.saidas`.
 *
 * Idempotente por natureza: `converterSaidas` recalcula do zero a partir do
 * período, então reimportar sobrescreve em vez de somar em cima do que já
 * estava lá.
 */
export async function importarSaidasDoAutomo(
  cicloId: string,
): Promise<{ ok: true; itensAtualizados: number; produtosIgnorados: number } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: "Não autenticado" };

  const { data: ciclo, error: errCiclo } = await supabase
    .from("estoque_ciclos")
    .select("id, local_id, mes, status, locais_estoque(automo_conn_key)")
    .eq("id", cicloId)
    .maybeSingle();
  if (errCiclo) return { erro: errCiclo.message };
  if (!ciclo) return { erro: "Ciclo não encontrado" };
  if (ciclo.status === "fechado") {
    return { erro: "Ciclo já fechado — não é possível reimportar." };
  }

  const connKey = ciclo.locais_estoque?.automo_conn_key;
  if (!connKey) return { erro: "Este local não tem banco do Automo configurado." };

  const inicioIso = ciclo.mes;
  const fimIso = proximoMesIso(ciclo.mes);

  let saidasAutomo;
  try {
    saidasAutomo = await somarSaidasPorProduto(connKey, inicioIso, fimIso);
  } catch (err) {
    if (err instanceof AutomoIndisponivelError) {
      return {
        erro:
          "Banco do Automo desta unidade está indisponível agora (o do Andar de Cima cai com frequência) — tente novamente em alguns minutos.",
      };
    }
    return { erro: "Erro inesperado ao importar saídas do Automo." };
  }

  const { data: cicloItens, error: errItens } = await supabase
    .from("estoque_ciclo_itens")
    .select("id, estoque_itens(id, automo_produto_id, fator_conversao)")
    .eq("ciclo_id", cicloId);
  if (errItens) return { erro: errItens.message };

  type CicloItemRow = NonNullable<typeof cicloItens>[number];
  const linhas = (cicloItens ?? []) as CicloItemRow[];

  // Chave do mapa é o id da própria linha de estoque_ciclo_itens — é nela
  // que o UPDATE roda, e evita um segundo lookup por estoque_item_id.
  const itensMapeados: ItemMapeado[] = linhas
    .filter((linha) => linha.estoque_itens != null)
    .map((linha) => ({
      estoque_item_id: linha.id,
      automo_produto_id: linha.estoque_itens!.automo_produto_id,
      fator_conversao: linha.estoque_itens!.fator_conversao,
    }));

  const mapa = converterSaidas(itensMapeados, saidasAutomo);

  const automoIdsMapeados = new Set(
    itensMapeados
      .map((item) => item.automo_produto_id)
      .filter((id): id is number => id != null),
  );
  const produtosIgnorados = new Set(
    saidasAutomo
      .map((s) => s.automo_produto_id)
      .filter((id) => !automoIdsMapeados.has(id)),
  ).size;

  const resultados = await Promise.all(
    linhas.map(async (linha) => {
      const quantidade = mapa.get(linha.id);
      if (quantidade === undefined) return { atualizado: false, ok: true as const };

      const { error } = await supabase
        .from("estoque_ciclo_itens")
        .update({ saidas: quantidade })
        .eq("id", linha.id);
      return { atualizado: true, ok: !error, erro: error?.message };
    }),
  );

  const sucessos = resultados.filter((r) => r.atualizado && r.ok).length;
  const falhas = resultados.filter((r) => r.atualizado && !r.ok);
  if (falhas.length > 0) {
    return {
      erro:
        `Falha ao salvar ${falhas.length} ${falhas.length === 1 ? "item" : "itens"} ` +
        `(${sucessos} atualizados antes da falha): ${falhas[0]?.erro ?? "erro desconhecido"}`,
    };
  }

  revalidatePath("/estoque/contagem");
  return { ok: true, itensAtualizados: sucessos, produtosIgnorados };
}

// ── Importação de entradas do Omie (bloco 4) ────────────────────────────────

/**
 * Env vars com BOM (U+FEFF) na frente quebram silenciosamente a autenticação
 * (ver §8 do CLAUDE.md) — mesmo cuidado se aplica às credenciais Omie
 * cadastradas em `unidades`, que às vezes são coladas de editores Windows.
 */
function stripBom(valor: string): string {
  return valor.replace(/^﻿/, "");
}

function ehBissexto(ano: number): boolean {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
}

const DIAS_POR_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function diasNoMes(ano: number, mes: number): number {
  if (mes === 2 && ehBissexto(ano)) return 29;
  return DIAS_POR_MES[mes - 1];
}

/**
 * Período do ciclo no formato do Omie (dd/mm/aaaa): do dia 1 ao último dia do
 * mês do ciclo. Aritmética pura sobre a string ISO — nunca `new Date(mesIso)`,
 * que interpretaria a data como UTC meia-noite e voltaria um dia em fuso
 * negativo (mesmo cuidado de `rotuloMes` em lib/estoque/ciclo.ts).
 */
function periodoOmieDoMes(mesIso: string): { dataInicial: string; dataFinal: string } {
  const [anoStr, mesStr] = mesIso.split("-");
  const ultimoDia = diasNoMes(Number(anoStr), Number(mesStr));
  return {
    dataInicial: `01/${mesStr}/${anoStr}`,
    dataFinal: `${String(ultimoDia).padStart(2, "0")}/${mesStr}/${anoStr}`,
  };
}

type UnidadeLocalRow = {
  unidade_id: string;
  unidades: {
    id: string;
    nome: string;
    omie_app_key: string | null;
    omie_app_secret: string | null;
  } | null;
};

type CicloItemComProdutoRow = {
  id: string;
  estoque_itens: {
    id: string;
    produto_id: string;
    produtos: { codigo: string; nome: string } | null;
  } | null;
};

/**
 * Importa as entradas do Omie do mês do ciclo e grava em
 * `estoque_ciclo_itens.entradas`.
 *
 * Um local físico pode ter mais de uma unidade fiscal (CNPJ) — ex.: Lush
 * Ipiranga tem RCC e CONCAVO — e cada CNPJ tem sua própria conta Omie, então
 * o mesmo produto físico aparece com um `omie_codigo` diferente em cada uma.
 * Por isso a busca é feita CNPJ a CNPJ e as entradas somadas por item via
 * `resolverChavesOmie`/`somarEntradasPorItem` (ver lib/estoque/entradas.ts),
 * em vez de casar direto `produto_id → omie_codigo` (que capturaria só um
 * CNPJ e perderia o outro em silêncio).
 *
 * Idempotente pela mesma razão de `importarSaidasDoAutomo`: recalcula do zero
 * a partir do período, então reimportar sobrescreve em vez de somar em cima.
 */
export async function importarEntradasDoOmie(
  cicloId: string,
): Promise<
  | { ok: true; itensAtualizados: number; itensParciais: number; ajustesDetectados: number }
  | { erro: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: "Não autenticado" };

  const { data: ciclo, error: errCiclo } = await supabase
    .from("estoque_ciclos")
    .select("id, local_id, mes, status")
    .eq("id", cicloId)
    .maybeSingle();
  if (errCiclo) return { erro: errCiclo.message };
  if (!ciclo) return { erro: "Ciclo não encontrado" };
  if (ciclo.status === "fechado") {
    return { erro: "Ciclo já fechado — não é possível reimportar." };
  }

  const { data: unidadesLocal, error: errUnidades } = await supabase
    .from("local_unidade")
    .select("unidade_id, unidades(id, nome, omie_app_key, omie_app_secret)")
    .eq("local_id", ciclo.local_id);
  if (errUnidades) return { erro: errUnidades.message };

  const linhasUnidades = (unidadesLocal ?? []) as UnidadeLocalRow[];
  const totalUnidadesFiscais = linhasUnidades.length;
  if (totalUnidadesFiscais === 0) {
    return { erro: "Este local não tem nenhuma unidade fiscal vinculada." };
  }

  const unidadesComCredencial = linhasUnidades
    .map((linha) => linha.unidades)
    .filter((u): u is NonNullable<typeof u> => u != null)
    .map((u) => ({
      id: u.id,
      nome: u.nome,
      appKey: u.omie_app_key ? stripBom(u.omie_app_key) : "",
      appSecret: u.omie_app_secret ? stripBom(u.omie_app_secret) : "",
    }))
    .filter((u) => u.appKey && u.appSecret);

  if (unidadesComCredencial.length === 0) {
    return { erro: "Nenhuma unidade fiscal deste local tem credenciais Omie configuradas." };
  }

  const { dataInicial, dataFinal } = periodoOmieDoMes(ciclo.mes);

  const entradasMerged = new Map<string, number>();
  const ajustesMerged = new Map<string, number>();
  // Resultado bruto por unidade fiscal, guardado ANTES do merge — sem isso
  // não haveria como saber depois de onde veio cada quantidade somada em
  // `entradasMerged`. É o que permite gravar o rateio por CNPJ em
  // `estoque_ciclo_item_entradas` (bloco 5) além do total.
  const entradasPorUnidade = new Map<string, Map<string, number>>();
  let falhasBusca = 0;

  for (const unidade of unidadesComCredencial) {
    try {
      const { entradas, ajustes } = await somarEntradasOmie(
        { appKey: unidade.appKey, appSecret: unidade.appSecret },
        dataInicial,
        dataFinal,
      );
      entradasPorUnidade.set(unidade.id, entradas);
      for (const [chave, valor] of entradas) {
        entradasMerged.set(chave, (entradasMerged.get(chave) ?? 0) + valor);
      }
      for (const [chave, valor] of ajustes) {
        ajustesMerged.set(chave, (ajustesMerged.get(chave) ?? 0) + valor);
      }
    } catch (err) {
      falhasBusca++;
      console.error(
        `[importarEntradasDoOmie] falha ao buscar entradas da unidade ${unidade.nome} (${unidade.id}):`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  if (falhasBusca === unidadesComCredencial.length) {
    return { erro: "Não foi possível consultar o Omie em nenhuma unidade fiscal deste local." };
  }

  const { data: cicloItens, error: errItens } = await supabase
    .from("estoque_ciclo_itens")
    .select("id, estoque_itens(id, produto_id, produtos(codigo, nome))")
    .eq("ciclo_id", cicloId);
  if (errItens) return { erro: errItens.message };

  const linhas = (cicloItens ?? []) as CicloItemComProdutoRow[];

  // Catálogo completo das unidades fiscais do local — passa de 1.000 linhas
  // e o PostgREST corta em silêncio sem paginar manualmente.
  const unidadeIds = linhasUnidades.map((linha) => linha.unidade_id);
  const catalogo = await fetchAllRows<ProdutoRef>((from, to) =>
    supabase
      .from("produtos")
      .select("id, codigo, nome, omie_codigo, omie_unidade_id")
      .in("omie_unidade_id", unidadeIds)
      .eq("ativo", true)
      .order("id")
      .range(from, to),
  );

  let itensParciais = 0;
  // Rateio por CNPJ acumulado aqui e gravado num único upsert em lote no
  // final, em vez de uma escrita por item — mesmo padrão de `linhas` acima.
  const detalheRows: { ciclo_item_id: string; unidade_id: string; quantidade: number }[] = [];

  const resultados = await Promise.all(
    linhas.map(async (linha) => {
      const produto = linha.estoque_itens?.produtos;
      if (!produto) return { atualizado: false, ok: true as const };

      const pares = resolverChavesOmiePorUnidade(
        { codigo: produto.codigo, nome: produto.nome },
        catalogo,
      );
      const chaves = pares.map((par) => par.omie_codigo);
      const { quantidade, cnpjsComEntrada } = somarEntradasPorItem(chaves, entradasMerged);

      // Produto existe em mais de um CNPJ mas não recebeu entrada de todas
      // as unidades fiscais do local — pode ser legítimo (compra concentrada
      // em um CNPJ), mas o usuário precisa ver para não confiar num teórico
      // que só reflete parte da compra.
      if (chaves.length > 1 && cnpjsComEntrada < totalUnidadesFiscais) {
        itensParciais++;
      }

      // Uma linha de detalhe por CNPJ onde o produto existe — só quando a
      // busca daquela unidade teve sucesso (ver `entradasPorUnidade` acima).
      // Se a busca falhou, não sabemos a quantidade daquele CNPJ: gravar 0
      // aqui seria confundir "não sei" com "não comprou".
      for (const par of pares) {
        const mapaUnidade = entradasPorUnidade.get(par.unidade_id);
        if (!mapaUnidade) continue;
        detalheRows.push({
          ciclo_item_id: linha.id,
          unidade_id: par.unidade_id,
          quantidade: mapaUnidade.get(par.omie_codigo) ?? 0,
        });
      }

      const { error } = await supabase
        .from("estoque_ciclo_itens")
        .update({ entradas: quantidade })
        .eq("id", linha.id);
      return { atualizado: true, ok: !error, erro: error?.message };
    }),
  );

  const sucessos = resultados.filter((r) => r.atualizado && r.ok).length;
  const falhasSalvar = resultados.filter((r) => r.atualizado && !r.ok);
  if (falhasSalvar.length > 0) {
    return {
      erro:
        `Falha ao salvar ${falhasSalvar.length} ${falhasSalvar.length === 1 ? "item" : "itens"} ` +
        `(${sucessos} atualizados antes da falha): ${falhasSalvar[0]?.erro ?? "erro desconhecido"}`,
    };
  }

  if (detalheRows.length > 0) {
    const { error: errDetalhe } = await supabase
      .from("estoque_ciclo_item_entradas")
      .upsert(detalheRows, { onConflict: "ciclo_item_id,unidade_id" });
    if (errDetalhe) return { erro: errDetalhe.message };
  }

  revalidatePath("/estoque/contagem");
  return {
    ok: true,
    itensAtualizados: sucessos,
    itensParciais,
    ajustesDetectados: ajustesMerged.size,
  };
}
