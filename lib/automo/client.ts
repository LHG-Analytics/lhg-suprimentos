/**
 * lib/automo/client.ts
 * Leitura dos bancos do Automo (um Postgres por unidade física).
 *
 * SOMENTE LEITURA. O LHG nunca escreve no Automo.
 *
 * ⚠️ Os bancos estão em IP público SEM TLS — `ssl: false` é obrigatório, senão a
 * conexão falha com "The server does not support SSL connections". Isso significa
 * que credenciais e dados trafegam em texto claro; risco registrado no spec.
 */
import { Client } from "pg";

/** Chaves de conexão aceitas — espelham `locais_estoque.automo_conn_key`. */
export type AutomoConnKey =
  | "DATABASE_URL_LOCAL_IPIRANGA"
  | "DATABASE_URL_LOCAL_LAPA"
  | "DATABASE_URL_LOCAL_ANDAR_DE_CIMA"
  | "DATABASE_URL_LOCAL_ALTANA";

export interface ProdutoAutomo {
  id:        number;
  codigo:    string | null;
  descricao: string;
  tipo:      string | null;
}

/** Erro de conexão/consulta com o Automo, para o chamador distinguir do resto. */
export class AutomoIndisponivelError extends Error {
  constructor(readonly connKey: string, causa: unknown) {
    super(`Automo indisponível (${connKey}): ${causa instanceof Error ? causa.message : String(causa)}`);
    this.name = "AutomoIndisponivelError";
  }
}

async function comCliente<T>(connKey: string, fn: (c: Client) => Promise<T>): Promise<T> {
  // Strip BOM: env var copiada de editor Windows pode vir com U+FEFF (ver CLAUDE.md §8)
  const conn = process.env[connKey]?.replace(/^﻿/, "");
  if (!conn) throw new AutomoIndisponivelError(connKey, "variável de ambiente ausente");

  const client = new Client({
    connectionString: conn,
    ssl: false,
    statement_timeout: 20_000,
    connectionTimeoutMillis: 10_000,
  });

  try {
    await client.connect();
  } catch (err) {
    throw new AutomoIndisponivelError(connKey, err);
  }

  try {
    return await fn(client);
  } catch (err) {
    throw new AutomoIndisponivelError(connKey, err);
  } finally {
    await client.end().catch(() => { /* já caiu; nada a fazer */ });
  }
}

/**
 * Catálogo de produtos de uma unidade do Automo.
 *
 * Filtra `dataexclusao IS NULL` (produto excluído não deve aparecer no
 * mapeamento) e traz o tipo para a tela poder mostrar o contexto — `CAUCAO` e
 * `SERVICOS` estão marcados como consumíveis no Automo, então a decisão de
 * incluir ou não é humana, na tela, e não automática por flag.
 */
export interface SaidaAgregada {
  automo_produto_id: number;
  descricao:         string;
  quantidade:        number;
  /** Quantas linhas de saída somaram — útil para desconfiar de número redondo demais. */
  linhas:            number;
}

/**
 * Soma as saídas de um período por produto, agregando a ÁRVORE INTEIRA de estoque.
 *
 * Não filtra por depósito de propósito: a árvore do Automo é frigobar por
 * apartamento (61 no Ipiranga), não almoxarifado — "AGUA SEM GAS" sai de 59
 * depósitos distintos no mesmo mês. O estoque é do LHG e é um por local físico.
 *
 * `cancelado IS NULL` descarta saída cancelada (816 num único mês no Ipiranga).
 * `fim` é exclusivo, então passe o primeiro dia do mês seguinte.
 *
 * Verificado contra o banco de produção: a soma do agregado bate exatamente com a
 * soma crua sem GROUP BY (19.800 em julho/2026, Ipiranga).
 */
export async function somarSaidasPorProduto(
  connKey: string,
  inicioIso: string,
  fimIso: string,
): Promise<SaidaAgregada[]> {
  return comCliente(connKey, async (client) => {
    const { rows } = await client.query<{
      produto_id: number; descricao: string; quantidade: string; linhas: string;
    }>(
      `SELECT pe.id_produto       AS produto_id,
              p.descricao         AS descricao,
              sum(sei.quantidade) AS quantidade,
              count(*)            AS linhas
       FROM saidaestoqueitem sei
       JOIN produtoestoque pe ON pe.id = sei.id_produtoestoque
       JOIN produto p         ON p.id  = pe.id_produto
       WHERE sei.cancelado IS NULL
         AND sei.datasaidaitem >= $1
         AND sei.datasaidaitem <  $2
       GROUP BY 1, 2`,
      [inicioIso, fimIso],
    );

    // `pg` devolve numeric e bigint como string para não perder precisão.
    return rows.map(r => ({
      automo_produto_id: Number(r.produto_id),
      descricao:         r.descricao,
      quantidade:        Number(r.quantidade),
      linhas:            Number(r.linhas),
    }));
  });
}

/** Linha crua de `listarProdutosAutomo`, com os tipos que o driver DE FATO devolve. */
export interface ProdutoAutomoRow {
  id:        number | string;
  /** `produto.codigo` é `integer` nos 4 bancos — chega como NUMBER, não string. */
  codigo:    number | string | null;
  descricao: string | null;
  tipo:      string | null;
}

/**
 * Converte a linha crua no tipo público.
 *
 * ⚠️ Existe por causa de um bug em produção: a interface declarava
 * `codigo: string | null`, mas a coluna é `integer` nos quatro bancos e o `pg`
 * devolve number. A busca no catálogo fazia `(p.codigo ?? "").toLowerCase()` —
 * `??` protege de null, não de tipo — e estourava
 * `p.codigo.toLowerCase is not a function` a cada tecla digitada, derrubando a
 * tela no error.tsx.
 *
 * O TypeScript não pegou porque o tipo vinha de `client.query<{...}>()`:
 * genérico escrito à mão é AFIRMAÇÃO, não validação. Declarei uma mentira e o
 * compilador acreditou. A conversão fica aqui, na fronteira, para o tipo público
 * passar a ser verdade — e é função exportada para ter teste.
 */
export function normalizarProdutoAutomo(row: ProdutoAutomoRow): ProdutoAutomo {
  return {
    id:        Number(row.id),
    codigo:    row.codigo == null ? null : String(row.codigo),
    descricao: row.descricao ?? "",
    tipo:      row.tipo,
  };
}

export async function listarProdutosAutomo(connKey: string): Promise<ProdutoAutomo[]> {
  return comCliente(connKey, async (client) => {
    const { rows } = await client.query<ProdutoAutomoRow>(`
      SELECT p.id, p.codigo, p.descricao, tp.descricao AS tipo
      FROM produto p
      LEFT JOIN tipoproduto tp ON tp.id = p.id_tipoproduto
      WHERE p.dataexclusao IS NULL
      ORDER BY p.descricao
    `);
    return rows.map(normalizarProdutoAutomo);
  });
}
