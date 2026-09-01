/**
 * lib/estoque/import-contagem.ts
 *
 * Regras da importação da contagem por planilha. Puro de propósito — sem
 * exceljs, sem Supabase, sem React — porque cada decisão aqui é um jeito
 * silencioso de estragar o mês inteiro e precisa de teste direto:
 *
 *   - célula vazia confundida com zero zera o estoque em item que ninguém contou;
 *   - planilha do mês errado importa lisa e sobrescreve a contagem certa;
 *   - casamento por semelhança casa o produto errado sem ninguém ver.
 *
 * Quem fala com o arquivo é a Server Action; ela entrega linhas já lidas para
 * `montarPrevia` e grava só o que a pessoa confirmar.
 */
import { normalizarNome } from "./mapeamento";

// ── Leitura de uma célula de contagem ───────────────────────────────────────

export type ValorCelula =
  /** Sem dado: a linha não deve ser tocada. NÃO é zero. */
  | { tipo: "vazio" }
  | { tipo: "numero"; valor: number }
  | { tipo: "invalido"; motivo: string };

/** Caracteres que a exportação (e as pessoas) usam para "sem dado". */
const SO_TRACOS = /^[-–—]+$/;
/** "1.234" ou "1.234.567" — ponto como separador de milhar, grupos de 3. */
const GRUPOS_DE_MILHAR = /^\d{1,3}(\.\d{3})+$/;

/**
 * Interpreta uma célula da coluna de contagem.
 *
 * ⚠️ Vazio e zero são resultados DIFERENTES e não podem se misturar: vazio é
 * "não contei", zero é "contei e não tem nenhum". Se vazio virasse 0, uma
 * planilha preenchida pela metade declararia o estoque zerado e produziria
 * divergência negativa gigante em itens intocados. É a mesma razão de
 * `entradas`/`saidas`/`contagem_*` serem nullable e nunca `DEFAULT 0`.
 */
export function normalizarValorCelula(bruto: unknown): ValorCelula {
  if (bruto == null) return { tipo: "vazio" };

  if (typeof bruto === "number") {
    if (!Number.isFinite(bruto)) return { tipo: "invalido", motivo: "não é um número" };
    if (bruto < 0) return { tipo: "invalido", motivo: "quantidade negativa" };
    return { tipo: "numero", valor: bruto };
  }

  if (typeof bruto !== "string") return { tipo: "invalido", motivo: "não é um número" };

  const texto = bruto.trim();
  if (texto === "") return { tipo: "vazio" };
  // "—" é o que a própria exportação escreve para dado ausente; um "-" digitado
  // à mão tem a mesma intenção.
  if (SO_TRACOS.test(texto)) return { tipo: "vazio" };

  const negativo = texto.startsWith("-");
  const semSinal = negativo ? texto.slice(1).trim() : texto;

  /*
   * Decimal em português vem com vírgula, e o Excel deixa como texto quando a
   * pessoa digita. Só o ponto é ambíguo ("1.234" pode ser mil duzentos e trinta
   * e quatro ou um vírgula duzentos e trinta e quatro — o formato da exportação
   * tem 3 decimais, então as duas leituras são plausíveis). Resolvido por forma:
   * grupos exatos de 3 dígitos são milhar, qualquer outra coisa é decimal.
   */
  let normalizado: string;
  if (semSinal.includes(",")) {
    normalizado = semSinal.replace(/\./g, "").replace(",", ".");
  } else if (GRUPOS_DE_MILHAR.test(semSinal)) {
    normalizado = semSinal.replace(/\./g, "");
  } else {
    normalizado = semSinal;
  }

  if (!/^\d*\.?\d+$/.test(normalizado)) {
    return { tipo: "invalido", motivo: "não é um número" };
  }

  const valor = Number(normalizado);
  if (!Number.isFinite(valor)) return { tipo: "invalido", motivo: "não é um número" };
  if (negativo && valor !== 0) return { tipo: "invalido", motivo: "quantidade negativa" };

  return { tipo: "numero", valor };
}

// ── Localização das colunas ─────────────────────────────────────────────────

export interface Colunas {
  /** 1-based, como o exceljs. */
  valor:       number;
  codigo:      number | null;
  nome:        number | null;
  cicloItemId: number | null;
}

/** Cabeçalho da coluna oculta que carrega o vínculo exato com o ciclo. */
export const CABECALHO_ID_INTERNO = "ID INTERNO (NÃO EDITAR)";
/** Cabeçalho da coluna de contagem na exportação de fechamento. */
export const CABECALHO_VALOR_FECHAMENTO = "ESTOQUE ATUAL";
/** Cabeçalho equivalente quando o ciclo está lançando saldo de abertura. */
export const CABECALHO_VALOR_ABERTURA = "SALDO DE ABERTURA";

function comparavel(texto: string | null | undefined): string {
  return normalizarNome(texto ?? "");
}

/** Qual campo o ciclo está coletando — muda o cabeçalho da coluna preenchida. */
export type ModoContagem = "abertura" | "fechamento";

/**
 * Acha as colunas pelo NOME no cabeçalho, não pela posição — assim inserir uma
 * coluna na exportação (ou a equipe reordenar na planilha) não quebra o import.
 *
 * A coluna de contagem é escolhida pelo MODO, não pela primeira que aparecer: no
 * saldo de abertura a exportação tem as duas colunas vazias, e depender da ordem
 * faria o import gravar no campo errado se a exportação mudasse de layout.
 */
export type ErroColunas = {
  erro: string;
  /**
   * Quantos cabeçalhos conhecidos esta linha reconheceu.
   *
   * Serve para escolher, entre várias linhas candidatas, DE QUAL vem a mensagem
   * de erro: a linha que reconheceu mais cabeçalhos é a que de fato tentava ser
   * o cabeçalho, e o erro dela é o único informativo. Sem isso, varrer as
   * primeiras linhas fazia o erro genérico de uma linha de dados vazia
   * sobrescrever o diagnóstico bom vindo do cabeçalho real.
   */
  reconhecidas: number;
};

export function localizarColunas(
  cabecalho: (string | null | undefined)[],
  modo: ModoContagem = "fechamento",
): Colunas | ErroColunas {
  const cabecalhoEsperado = modo === "abertura" ? CABECALHO_VALOR_ABERTURA : CABECALHO_VALOR_FECHAMENTO;
  const cabecalhoDoOutroModo = modo === "abertura" ? CABECALHO_VALOR_FECHAMENTO : CABECALHO_VALOR_ABERTURA;

  let valor: number | null = null;
  let valorDoOutroModo: number | null = null;
  let codigo: number | null = null;
  let nome: number | null = null;
  let cicloItemId: number | null = null;

  cabecalho.forEach((celula, indice) => {
    const chave = comparavel(celula);
    const coluna = indice + 1;
    if (chave === comparavel(cabecalhoEsperado)) {
      valor ??= coluna;
    } else if (chave === comparavel(cabecalhoDoOutroModo)) {
      valorDoOutroModo ??= coluna;
    } else if (chave === comparavel(CABECALHO_ID_INTERNO)) {
      cicloItemId ??= coluna;
    } else if (chave === "codigo") {
      codigo ??= coluna;
    } else if (chave === "item") {
      nome ??= coluna;
    }
  });

  const reconhecidas = [valor, valorDoOutroModo, codigo, nome, cicloItemId]
    .filter((c) => c != null).length;

  if (valor == null) {
    // Planilha do outro estágio: exportada antes de o último saldo de abertura
    // entrar (ou depois). Dizer isso é mais útil que "coluna não encontrada".
    if (valorDoOutroModo != null) {
      return {
        reconhecidas,
        erro:
          `Esta planilha tem a coluna "${cabecalhoDoOutroModo}", mas a contagem está ` +
          `${modo === "abertura" ? "lançando saldo de abertura" : "na contagem de fechamento"}. ` +
          `Baixe o Excel de novo para pegar o formato atual.`,
      };
    }
    return {
      reconhecidas,
      erro:
        `A planilha não tem a coluna "${cabecalhoEsperado}". ` +
        `Baixe o Excel desta contagem e preencha nele.`,
    };
  }
  if (codigo == null && nome == null && cicloItemId == null) {
    return {
      reconhecidas,
      erro: 'A planilha não tem nenhuma coluna que identifique o item ("ITEM" ou "CÓDIGO").',
    };
  }

  return { valor, codigo, nome, cicloItemId };
}

// ── Prévia ──────────────────────────────────────────────────────────────────

export interface LinhaPlanilha {
  /** Número da linha no Excel, para citar na prévia. */
  linhaExcel:  number;
  cicloItemId: string | null;
  codigo:      string | null;
  nome:        string | null;
  valor:       ValorCelula;
}

export interface ItemDoCiclo {
  cicloItemId: string;
  codigo:      string;
  nome:        string;
  /** O valor que já está gravado no campo que este import preenche. */
  valorAtual:  number | null;
}

export type StatusLinha = "novo" | "substitui" | "igual" | "ignorado";

export interface LinhaPrevia {
  linhaExcel:  number;
  nome:        string;
  cicloItemId: string | null;
  valor:       number | null;
  status:      StatusLinha;
  /** Valor anterior, só quando `status === "substitui"`. */
  de:          number | null;
  /** Só quando `status === "ignorado"`. */
  motivo:      string | null;
}

export interface Previa {
  linhas:     LinhaPrevia[];
  /** O que será gravado se a pessoa confirmar. */
  aplicaveis: { cicloItemId: string; valor: number }[];
  resumo: {
    novos:        number;
    substituidos: number;
    iguais:       number;
    ignorados:    number;
  };
  /**
   * Problema que invalida o ARQUIVO inteiro (não uma linha) — ex.: planilha de
   * outro ciclo. Quando presente, nada deve ser gravado.
   */
  erroArquivo: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cruza as linhas lidas do arquivo com os itens do ciclo e diz o que cada uma
 * vai fazer. Não grava nada — é o que alimenta a tela de confirmação.
 *
 * Casamento em três níveis, nesta ordem: `cicloItemId` (coluna oculta, exato),
 * `codigo`, e nome normalizado em IGUALDADE EXATA.
 *
 * ⚠️ Nada de semelhança fuzzy aqui. `sugerirCandidatos` usa Jaccard e é o certo
 * para SUGERIR mapeamento a um humano que confirma; num lote sem revisão a mesma
 * técnica casa errado em silêncio — foi fuzzy a 20% que fez `OLLA GEL` casar com
 * `BOOSTER 20ML` na auditoria de correlação Omie↔Automo.
 */
export function montarPrevia(linhas: LinhaPlanilha[], itens: ItemDoCiclo[]): Previa {
  const porId = new Map(itens.map((i) => [i.cicloItemId, i]));

  // Código/nome ambíguo (dois itens do ciclo com a mesma chave) não pode casar
  // por chute: a entrada vira `null` e a linha é ignorada com motivo.
  const porCodigo = new Map<string, ItemDoCiclo | null>();
  for (const item of itens) {
    const chave = item.codigo.trim();
    if (chave === "") continue;
    porCodigo.set(chave, porCodigo.has(chave) ? null : item);
  }
  const porNome = new Map<string, ItemDoCiclo | null>();
  for (const item of itens) {
    const chave = normalizarNome(item.nome);
    if (chave === "") continue;
    porNome.set(chave, porNome.has(chave) ? null : item);
  }

  const idsNoArquivo = linhas
    .map((l) => l.cicloItemId)
    .filter((id): id is string => id != null && UUID.test(id));

  /*
   * Arquivo do mês errado: todos os ids do arquivo são válidos e NENHUM pertence
   * a este ciclo. Sem esta checagem, subir a planilha de setembro no ciclo de
   * outubro importaria liso, casando por código, e sobrescreveria a contagem
   * certa com números do mês passado.
   *
   * Alguns ids estranhos entre muitos conhecidos é outra coisa (item saiu do
   * controle depois da exportação) e vira linha ignorada, não erro de arquivo.
   */
  if (idsNoArquivo.length > 0 && idsNoArquivo.every((id) => !porId.has(id))) {
    return {
      linhas: [],
      aplicaveis: [],
      resumo: { novos: 0, substituidos: 0, iguais: 0, ignorados: 0 },
      erroArquivo:
        "Esta planilha é de outra contagem — nenhum item dela pertence ao ciclo aberto. " +
        "Baixe o Excel desta contagem e preencha nele.",
    };
  }

  const resultado: LinhaPrevia[] = [];
  const aplicaveis: { cicloItemId: string; valor: number }[] = [];
  const jaVisto = new Set<string>();

  for (const linha of linhas) {
    const rotuloArquivo = linha.nome?.trim() || linha.codigo?.trim() || `linha ${linha.linhaExcel}`;

    const ignorar = (motivo: string, nome = rotuloArquivo): void => {
      resultado.push({
        linhaExcel: linha.linhaExcel,
        nome,
        cicloItemId: null,
        valor: linha.valor.tipo === "numero" ? linha.valor.valor : null,
        status: "ignorado",
        de: null,
        motivo,
      });
    };

    // Linha em branco não é problema nenhum: é item que a equipe não contou.
    // Sai da prévia inteira para não afogar o que importa.
    if (linha.valor.tipo === "vazio") continue;

    if (linha.valor.tipo === "invalido") {
      ignorar(linha.valor.motivo);
      continue;
    }

    let item: ItemDoCiclo | null | undefined;
    if (linha.cicloItemId != null && UUID.test(linha.cicloItemId)) {
      item = porId.get(linha.cicloItemId);
      if (item == null) {
        ignorar("não é item controlado deste ciclo");
        continue;
      }
    } else if (linha.codigo?.trim()) {
      item = porCodigo.get(linha.codigo.trim());
      if (item === null) {
        ignorar("código aparece em mais de um item do ciclo");
        continue;
      }
    }
    if (item == null && linha.nome?.trim()) {
      const porNomeItem = porNome.get(normalizarNome(linha.nome));
      if (porNomeItem === null) {
        ignorar("nome aparece em mais de um item do ciclo");
        continue;
      }
      item = porNomeItem ?? undefined;
    }

    if (item == null) {
      ignorar("não é item controlado deste ciclo");
      continue;
    }

    // Duas linhas apontando para o mesmo item: a primeira vale, as seguintes são
    // ignoradas. Deixar a última ganhar faria o resultado depender da ordem das
    // linhas, que a equipe pode reordenar na planilha.
    if (jaVisto.has(item.cicloItemId)) {
      ignorar("item repetido na planilha", item.nome);
      continue;
    }
    jaVisto.add(item.cicloItemId);

    const valor = linha.valor.valor;

    if (item.valorAtual === valor) {
      resultado.push({
        linhaExcel: linha.linhaExcel, nome: item.nome, cicloItemId: item.cicloItemId,
        valor, status: "igual", de: null, motivo: null,
      });
      continue;
    }

    const substitui = item.valorAtual != null;
    resultado.push({
      linhaExcel: linha.linhaExcel, nome: item.nome, cicloItemId: item.cicloItemId,
      valor, status: substitui ? "substitui" : "novo",
      de: substitui ? item.valorAtual : null, motivo: null,
    });
    aplicaveis.push({ cicloItemId: item.cicloItemId, valor });
  }

  return {
    linhas: resultado,
    aplicaveis,
    resumo: {
      novos:        resultado.filter((l) => l.status === "novo").length,
      substituidos: resultado.filter((l) => l.status === "substitui").length,
      iguais:       resultado.filter((l) => l.status === "igual").length,
      ignorados:    resultado.filter((l) => l.status === "ignorado").length,
    },
    erroArquivo: null,
  };
}
