/**
 * lib/estoque/planilha-contagem.ts
 *
 * Ponte entre uma planilha do exceljs e as linhas que `montarPrevia` entende.
 *
 * Separado da Server Action de propósito: é aqui que vive a coerção de célula
 * (fórmula, texto formatado, hyperlink) e a busca da linha de cabeçalho — a parte
 * que só um arquivo .xlsx de verdade exercita, e que portanto precisa de teste
 * com workbook real em vez de confiança.
 *
 * Recebe a worksheet já carregada; quem faz I/O é a action.
 */
import {
  localizarColunas,
  normalizarValorCelula,
  type Colunas,
  type LinhaPlanilha,
  type ModoContagem,
} from "./import-contagem";

/** O mínimo da API do exceljs que este módulo usa — evita depender do tipo todo. */
export interface CelulaLike {
  value: unknown;
}
export interface LinhaLike {
  getCell(coluna: number): CelulaLike;
}
export interface PlanilhaLike {
  rowCount: number;
  columnCount: number;
  getRow(linha: number): LinhaLike;
}

/** Até onde procurar a linha de cabeçalho. A exportação a coloca na linha 4. */
const MAX_LINHAS_CABECALHO = 12;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Valor cru de uma célula.
 *
 * O `.value` do exceljs não é só string|number: vem objeto para fórmula
 * (`{ result }`), texto formatado (`{ richText }`) e hyperlink (`{ text }`).
 * Tratar tudo com `String(v)` daria "[object Object]", que o parser classificaria
 * como "não é um número" — erro verdadeiro, motivo errado.
 */
export function valorBrutoDaCelula(valor: unknown): unknown {
  if (valor == null) return null;
  if (typeof valor === "number" || typeof valor === "string") return valor;
  if (typeof valor === "object") {
    const obj = valor as Record<string, unknown>;
    if ("result" in obj) return valorBrutoDaCelula(obj.result);
    if (Array.isArray(obj.richText)) {
      return obj.richText.map((p) => (p as { text?: string }).text ?? "").join("");
    }
    if (typeof obj.text === "string") return obj.text;
  }
  return String(valor);
}

/** Texto da célula, com "—" e vazio colapsados em `null`. */
export function textoDaCelula(valor: unknown): string | null {
  const bruto = valorBrutoDaCelula(valor);
  if (bruto == null) return null;
  const texto = String(bruto).trim();
  return texto === "" || texto === "—" ? null : texto;
}

export type LeituraPlanilha =
  | {
      ok: true;
      colunas: Colunas;
      linhaCabecalho: number;
      linhas: LinhaPlanilha[];
      /**
       * Linhas COM contagem preenchida que foram descartadas por não trazerem o
       * id da exportação — tipicamente linhas acrescentadas à mão no fim da
       * planilha, para um produto que a equipe contou e não está cadastrado.
       *
       * Precisa ser contado e mostrado: descartar em silêncio um número que
       * alguém digitou é perder trabalho sem avisar. O rodapé da exportação cai
       * no mesmo descarte, mas nunca tem contagem preenchida, então não entra
       * nesta conta.
       */
      linhasSemVinculo: number;
    }
  | { erro: string };

/**
 * Acha o cabeçalho e extrai as linhas de item.
 *
 * A busca do cabeçalho varre as primeiras linhas em vez de assumir a linha 4
 * (onde a exportação o coloca): planilha reaproveitada pela equipe costuma ganhar
 * linhas de anotação no topo, e falhar por isso seria falhar por nada.
 */
export function lerLinhasDaPlanilha(
  ws: PlanilhaLike,
  modo: ModoContagem,
): LeituraPlanilha {
  let colunas: Colunas | null = null;
  let linhaCabecalho = 0;
  /*
   * Guarda o erro da linha que MAIS PARECIA cabeçalho, não o da última varrida.
   *
   * As linhas de dados e as vazias também falham em `localizarColunas`, e com
   * erro genérico; sobrescrever a cada iteração fazia o diagnóstico bom (vindo do
   * cabeçalho real, ex.: "esta planilha é do outro estágio") ser perdido e a
   * pessoa receber "não tem a coluna X" sobre um arquivo que tinha a coluna.
   */
  let melhorErro = { erro: "A planilha não tem a linha de cabeçalho da exportação.", reconhecidas: -1 };

  const limite = Math.min(ws.rowCount, MAX_LINHAS_CABECALHO);
  for (let n = 1; n <= limite; n++) {
    const row = ws.getRow(n);
    const textos: (string | null)[] = [];
    for (let c = 1; c <= ws.columnCount; c++) textos.push(textoDaCelula(row.getCell(c).value));

    const res = localizarColunas(textos, modo);
    if ("erro" in res) {
      if (res.reconhecidas > melhorErro.reconhecidas) melhorErro = res;
      continue;
    }
    colunas = res;
    linhaCabecalho = n;
    break;
  }
  if (!colunas) return { erro: melhorErro.erro };

  const linhas: LinhaPlanilha[] = [];
  let linhasSemVinculo = 0;

  for (let n = linhaCabecalho + 1; n <= ws.rowCount; n++) {
    const row = ws.getRow(n);
    const nome = colunas.nome ? textoDaCelula(row.getCell(colunas.nome).value) : null;
    const codigo = colunas.codigo ? textoDaCelula(row.getCell(colunas.codigo).value) : null;
    const id = colunas.cicloItemId ? textoDaCelula(row.getCell(colunas.cicloItemId).value) : null;
    const valor = normalizarValorCelula(valorBrutoDaCelula(row.getCell(colunas.valor).value));

    /*
     * Descarta o que não é linha de item.
     *
     * Quando a planilha tem a coluna oculta de id (todo arquivo vindo da nossa
     * exportação tem), a única prova de que a linha é um item é o id ser um UUID.
     * O rodapé da exportação ("DIVERGÊNCIA NEGATIVA ACUMULADA" e a nota final)
     * cai justamente na coluna ITEM e, por estar em célula MESCLADA, o exceljs
     * repete o texto em B, C e D — então "tem nome" e "tem código" ambos passam,
     * e o rodapé entraria como dois itens ignorados em toda prévia.
     *
     * Sem coluna de id (planilha montada à mão pela equipe), sobra identificar
     * por nome ou código; linha estranha ali aparece como ignorada, o que é
     * aceitável porque esse arquivo não tem o rodapé da exportação.
     */
    if (colunas.cicloItemId != null) {
      if (id == null || !UUID.test(id)) {
        // Linha acrescentada à mão COM contagem preenchida é perda de trabalho se
        // sumir calada — conta para o aviso. O rodapé cai aqui também, mas nunca
        // tem número na coluna de contagem, então não infla o aviso.
        if (valor.tipo === "numero" && (nome != null || codigo != null)) linhasSemVinculo++;
        continue;
      }
    } else if (nome == null && codigo == null) {
      continue;
    }

    linhas.push({ linhaExcel: n, cicloItemId: id, codigo, nome, valor });
  }

  return { ok: true, colunas, linhaCabecalho, linhas, linhasSemVinculo };
}
