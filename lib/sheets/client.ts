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
      // Detecta "jan.26", "jan/26", "jan./26" (aba Administrativas usa barra), etc.
      const m = cell.match(/^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[.\/]+(\d{2})$/);
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
  // Dedup por nome (case-insensitive): a aba "Administrativas" repete a mesma
  // categoria em mais de um bloco. Mantém a ocorrência de maior valor anual
  // em vez de listar duplicada (que inflava o total).
  const catIndex = new Map<string, number>();
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

    const nova: OrcamentoCategoria = { categoria: desc, secao: secaoAtual, mensal, anual };
    const key = desc.toLowerCase();
    const jaVisto = catIndex.get(key);
    if (jaVisto !== undefined) {
      // Duplicata: substitui só se a nova tiver valor maior (evita perder a linha com dados)
      if (anual > categorias[jaVisto].anual) categorias[jaVisto] = nova;
      continue;
    }
    catIndex.set(key, categorias.length);
    categorias.push(nova);
  }

  return { unidade, ano, categorias };
}

// ── Service Account (planilha privada) ────────────────────────────────────────

interface ServiceAccountCredentials {
  client_email: string;
  private_key:  string;
  token_uri?:   string;
}

/**
 * Gera um token de acesso OAuth2 a partir de credenciais de Service Account.
 * Usa apenas `crypto` nativo do Node.js — sem googleapis/dependências externas.
 * O token expira em 1 hora.
 */
async function getGoogleAccessToken(creds: ServiceAccountCredentials): Promise<string> {
  const { createSign } = await import("crypto");

  const tokenUri = creds.token_uri ?? "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);

  const header  = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss:   creds.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud:   tokenUri,
    exp:   now + 3600,
    iat:   now,
  })).toString("base64url");

  const toSign    = `${header}.${payload}`;
  const sign      = createSign("RSA-SHA256");
  sign.update(toSign);
  const signature = sign.sign(creds.private_key, "base64url");
  const jwt       = `${toSign}.${signature}`;

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  jwt,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[sheets] Erro ao obter token Google: ${res.status} — ${text}`);
  }

  const data = await res.json() as { access_token: string };
  return data.access_token;
}

/**
 * Busca valores da planilha via Google Sheets API v4 (autenticado).
 * Retorna a grade de células como string[][].
 * Cache via unstable_cache — revalida de hora em hora.
 */
async function fetchSheetValues(
  sheetId:   string,
  sheetName: string,
  creds:     ServiceAccountCredentials,
): Promise<string[][] | null> {
  const token = await getGoogleAccessToken(creds);
  const range = encodeURIComponent(sheetName);
  const url   = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueRenderOption=FORMATTED_VALUE`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    // O token muda a cada request, então não usamos fetch cache aqui.
    // O cache é feito por unstable_cache no nível do wrapper.
    cache: "no-store",
  });

  if (!res.ok) {
    console.error(`[sheets] Google Sheets API ${res.status}:`, await res.text());
    return null;
  }

  const data = await res.json() as { values?: string[][] };
  return data.values ?? null;
}

/**
 * Converte string[][] (resposta da API) para CSV e usa o parser existente.
 */
function gridToCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row.map((cell) => {
        const s = String(cell ?? "");
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      }).join(","),
    )
    .join("\n");
}

// ── Fetch principal ────────────────────────────────────────────────────────────

/**
 * Busca dados de orçamento do Google Sheets.
 *
 * Estratégia automática:
 *   1. Se GOOGLE_SERVICE_ACCOUNT_JSON estiver configurado → usa Sheets API v4
 *      (planilha pode ser privada; basta compartilhar com o email da service account)
 *   2. Caso contrário → exportação CSV pública (planilha precisa ser pública)
 *
 * Cache de 1 hora em ambos os casos.
 *
 * @param sheetId    ID da planilha (parte da URL: /spreadsheets/d/SHEET_ID/edit)
 * @param sheetName  Nome exato da aba (padrão: "Custos")
 */
export async function fetchOrcamento(
  sheetId:   string,
  sheetName = "Custos",
): Promise<OrcamentoSheet | null> {
  if (!sheetId) return null;

  // ── Modo autenticado (Service Account) ─────────────────────────────────────
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  // Diagnóstico: exibe no log do servidor se a env var está configurada
  console.log(
    "[sheets] GOOGLE_SERVICE_ACCOUNT_JSON:",
    saJson ? `configurado (${saJson.length} chars)` : "NÃO configurado — usando fallback CSV",
  );

  if (saJson) {
    try {
      const creds = JSON.parse(saJson) as ServiceAccountCredentials;
      console.log("[sheets] Service Account email:", creds.client_email);

      const { unstable_cache } = await import("next/cache");
      const fetchCached = unstable_cache(
        async () => fetchSheetValues(sheetId, sheetName, creds),
        [`orcamento-${sheetId}-${sheetName}`],
        { revalidate: 3600, tags: ["orcamento"] },
      );

      const rows = await fetchCached();
      console.log("[sheets] Rows recebidos da API:", rows?.length ?? 0);

      if (!rows) return null;

      const csv    = gridToCsv(rows);
      const parsed = parseOrcamentoCSV(csv);
      console.log("[sheets] Categorias parseadas:", parsed?.categorias?.length ?? 0);

      if (!parsed) return null;

      return { ...parsed, fetchedAt: new Date().toISOString() };
    } catch (err) {
      console.error("[sheets] Erro com Service Account:", err);
      return null;
    }
  }

  // ── Modo público (fallback) ─────────────────────────────────────────────────
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;

  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      console.error(`[sheets] Erro ao buscar orçamento: HTTP ${res.status}`);
      return null;
    }

    const csv    = await res.text();
    const parsed = parseOrcamentoCSV(csv);
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
