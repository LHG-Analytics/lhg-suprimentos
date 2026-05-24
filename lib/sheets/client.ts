/**
 * lib/sheets/client.ts
 * Lê a planilha pública de orçamento do Google Sheets via CSV export.
 *
 * Não requer API key — funciona para planilhas compartilhadas como
 * "Qualquer pessoa com o link pode ver".
 *
 * Estrutura esperada da aba "Custos":
 *   - Linha 1: nome da unidade (ex: "Lush Ipiranga")
 *   - Seção "Custo dos Serviços Prestados": Amenities, Manutenção, etc.
 *   - Seção "Custo de Produtos Vendidos": Alimentos, Bebidas, etc.
 *   - Colunas: DESCRIÇÃO | jan.XX | fev.XX | ... | dez.XX | TOTAL
 *   - Valores em formato BR negativo: "-1.500" = R$ 1.500 (custo)
 */

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type OrcamentoSecao = "servicos" | "produtos";

export interface OrcamentoCategoria {
  /** Nome exato como aparece na planilha, ex: "Materiais de Manutenção" */
  categoria:  string;
  secao:      OrcamentoSecao;
  /** Orçamento mensal: chave = "jan" | "fev" | ... | "dez" (valor positivo em R$) */
  mensal:     Record<string, number>;
  /** Soma dos 12 meses */
  anual:      number;
}

export interface OrcamentoSheet {
  /** Unidade identificada na linha 1 da aba */
  unidade:    string;
  /** Ano do orçamento (ex: 2026) */
  ano:        number;
  categorias: OrcamentoCategoria[];
  fetchedAt:  string;
}

// ── Constantes ────────────────────────────────────────────────────────────────

const MESES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const;
type MesKey = typeof MESES_PT[number];

/** Linhas que devem ser ignoradas durante o parsing */
const IGNORE_PATTERNS = [
  /^TOTAL$/i,
  /^DESCRIÇÃO$/i,
  /^CUSTOS$/i,
  /^custo dos serviços/i,
  /^custo de produtos/i,
  /^variáveis/i,
  /^lush /i,
  /^andar de cima/i,
  /^altana/i,
  /^\s*$/,
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Converte célula BR para número positivo.
 * Aceita: "-1.500", "-1500", "1.500,50", "0", ""
 */
function parseBRNumber(raw: string): number {
  if (!raw) return 0;
  const s = raw.replace(/^["']|["']$/g, "").trim();
  if (!s || s === "0") return 0;
  // Remove separador de milhar (ponto), substitui vírgula decimal por ponto
  const normalised = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(normalised);
  if (isNaN(n)) return 0;
  return Math.abs(n); // orçamento sempre positivo
}

/**
 * Divide uma linha CSV respeitando aspas (ex: "Lush, Ipiranga","1.500")
 */
function parseCSVLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function shouldIgnore(desc: string): boolean {
  return IGNORE_PATTERNS.some((p) => p.test(desc));
}

// ── Parser principal ───────────────────────────────────────────────────────────

function parseOrcamentoCSV(csvText: string): Omit<OrcamentoSheet, "fetchedAt"> | null {
  const lines = csvText.split("\n").map(parseCSVLine);
  if (lines.length < 5) return null;

  // ── Identificar unidade (linha 1, coluna A) ───────────────────────────────
  const unidadeRaw = lines[0]?.[0] ?? "";
  const unidade    = unidadeRaw.replace(/^["']|["']$/g, "").trim() || "Desconhecida";

  // ── Localizar linha de header com meses ───────────────────────────────────
  let headerIdx = -1;
  let colIndices: Partial<Record<MesKey, number>> = {};
  let ano = new Date().getFullYear();

  for (let i = 0; i < lines.length; i++) {
    const row      = lines[i];
    const detected: Partial<Record<MesKey, number>> = {};
    let anoDetected = 0;

    for (let j = 0; j < row.length; j++) {
      const cell = row[j].toLowerCase().replace(/^["']|["']$/g, "").trim();
      // Detecta "jan.26", "fev.26", etc.
      const m = cell.match(/^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\.(\d{2})$/);
      if (m) {
        detected[m[1] as MesKey] = j;
        if (!anoDetected) anoDetected = 2000 + parseInt(m[2], 10);
      }
    }

    if (Object.keys(detected).length >= 6) {
      headerIdx   = i;
      colIndices  = detected;
      if (anoDetected) ano = anoDetected;
      break;
    }
  }

  if (headerIdx === -1) return null;

  // ── Parsear linhas de dados ────────────────────────────────────────────────
  const categorias: OrcamentoCategoria[] = [];
  let secaoAtual: OrcamentoSecao = "servicos";

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const row  = lines[i];
    const desc = (row[0] ?? "").replace(/^["']|["']$/g, "").trim();

    if (!desc) continue;

    // Detecta mudança de seção
    if (/custo de produtos vendidos/i.test(desc) || /^custo de produtos/i.test(desc)) {
      secaoAtual = "produtos";
      continue;
    }
    // Para quando encontra a seção de variáveis (fim dos dados úteis)
    if (/variáveis para/i.test(desc)) break;
    // Pula cabeçalhos, totais e linhas de seção
    if (shouldIgnore(desc)) continue;

    // Extrai valores mensais
    const mensal: Record<string, number> = {};
    let temDados = false;

    for (const [mes, colIdx] of Object.entries(colIndices) as [MesKey, number][]) {
      const val = parseBRNumber(row[colIdx] ?? "");
      mensal[mes] = val;
      if (val > 0) temDados = true;
    }

    // Ignora linhas sem nenhum valor (ex: "Materiais de Limpeza" com 0 em todos os meses)
    // Mantém mesmo com zero para mostrar categorias sem orçamento
    const anual = Object.values(mensal).reduce((s, v) => s + v, 0);

    categorias.push({
      categoria: desc,
      secao:     secaoAtual,
      mensal,
      anual,
    });
  }

  return { unidade, ano, categorias };
}

// ── Fetch público ──────────────────────────────────────────────────────────────

/**
 * Busca os dados de orçamento da planilha pública do Google Sheets.
 * Cache de 1 hora (revalidate: 3600) — não bate a planilha a cada request.
 *
 * @param sheetId  ID da planilha (parte da URL: /spreadsheets/d/SHEET_ID/edit)
 * @param sheetName  Nome exato da aba (padrão: "Custos")
 */
export async function fetchOrcamento(
  sheetId:   string,
  sheetName = "Custos",
): Promise<OrcamentoSheet | null> {
  if (!sheetId) return null;

  // URL de exportação CSV para planilhas públicas (sem API key)
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;

  try {
    const res = await fetch(url, {
      // Next.js Data Cache — revalida de hora em hora
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      console.error(`[sheets] Erro ao buscar orçamento: HTTP ${res.status}`);
      return null;
    }

    const csv     = await res.text();
    const parsed  = parseOrcamentoCSV(csv);
    if (!parsed) return null;

    return { ...parsed, fetchedAt: new Date().toISOString() };
  } catch (err) {
    console.error("[sheets] Falha ao carregar planilha:", err);
    return null;
  }
}

// ── Helpers de consulta ───────────────────────────────────────────────────────

const MES_INDEX = Object.fromEntries(MESES_PT.map((m, i) => [m, i]));

/** Retorna o orçamento total para um mês (ex: "mai") */
export function getBudgetMes(sheet: OrcamentoSheet, mes: MesKey): number {
  return sheet.categorias.reduce((s, c) => s + (c.mensal[mes] ?? 0), 0);
}

/** Retorna o orçamento do mês atual */
export function getBudgetMesAtual(sheet: OrcamentoSheet): { mes: MesKey; valor: number } {
  const mes = MESES_PT[new Date().getMonth()];
  return { mes, valor: getBudgetMes(sheet, mes) };
}

/** Orçamento anual total */
export function getBudgetAnual(sheet: OrcamentoSheet): number {
  return sheet.categorias.reduce((s, c) => s + c.anual, 0);
}

/** Orçamento de uma categoria específica para o mês atual */
export function getBudgetCategoriaMes(sheet: OrcamentoSheet, categoria: string, mes?: MesKey): number {
  const m = mes ?? MESES_PT[new Date().getMonth()];
  const row = sheet.categorias.find((c) =>
    c.categoria.toLowerCase() === categoria.toLowerCase(),
  );
  return row?.mensal[m] ?? 0;
}

/**
 * Formata o contexto de orçamento para injetar no system prompt da IA.
 * Retorna string compacta com as categorias mais relevantes.
 */
export function formatBudgetContextoIA(sheet: OrcamentoSheet | null): string {
  if (!sheet || sheet.categorias.length === 0) return "";

  const mes     = MESES_PT[new Date().getMonth()];
  const mesLabel = `${mes}.${String(sheet.ano).slice(2)}`;
  const totalMes = getBudgetMes(sheet, mes);
  const totalAno = getBudgetAnual(sheet);

  const fBRL = (v: number) =>
    `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const linhas = [
    `\n## Orçamento de Compras — ${sheet.unidade} (${sheet.ano}):`,
    `Orçamento total anual: ${fBRL(totalAno)}`,
    `Orçamento mês atual (${mesLabel}): ${fBRL(totalMes)}`,
    "\nOrçamento por categoria (mês atual):",
  ];

  // Categorias com orçamento > 0, ordenadas pelo valor mensal (maior primeiro)
  const comBudget = sheet.categorias
    .filter((c) => (c.mensal[mes] ?? 0) > 0)
    .sort((a, b) => (b.mensal[mes] ?? 0) - (a.mensal[mes] ?? 0));

  for (const cat of comBudget) {
    const v = cat.mensal[mes] ?? 0;
    linhas.push(`- ${cat.categoria}: ${fBRL(v)}/mês (anual: ${fBRL(cat.anual)})`);
  }

  return linhas.join("\n");
}

/**
 * Retorna categorias ordenadas por orçamento anual para exibir no dashboard.
 */
export function getTopCategorias(
  sheet: OrcamentoSheet,
  limite = 10,
): Array<OrcamentoCategoria & { mesAtual: number }> {
  const mes = MESES_PT[new Date().getMonth()];
  return sheet.categorias
    .map((c) => ({ ...c, mesAtual: c.mensal[mes] ?? 0 }))
    .filter((c) => c.anual > 0)
    .sort((a, b) => b.anual - a.anual)
    .slice(0, limite);
}
