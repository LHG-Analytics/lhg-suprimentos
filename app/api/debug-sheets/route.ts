/**
 * GET /api/debug-sheets
 * Rota de diagnóstico TEMPORÁRIA — diagnostica toda a chain: env → token → API → parse.
 * REMOVER após resolver o problema.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUnidadeSheetConfig } from "@/lib/sheets/get-unidade-sheet";

export async function GET() {
  // Só acessível por usuários autenticados
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  }

  const result: Record<string, unknown> = {};

  // ── 1. Verifica config da unidade no banco ──────────────────────────────────
  const sheetConfig = await getUnidadeSheetConfig();
  result.sheetConfig = sheetConfig;

  if (!sheetConfig) {
    return NextResponse.json({ ...result, erro: "getUnidadeSheetConfig retornou null — checar banco" });
  }

  // ── 2. Verifica a env var ───────────────────────────────────────────────────
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  result.env_var_configurada = !!saJson;
  result.env_var_tamanho     = saJson?.length ?? 0;

  if (!saJson) {
    return NextResponse.json({ ...result, erro: "GOOGLE_SERVICE_ACCOUNT_JSON não configurado" });
  }

  // ── 3. Parseia o JSON ───────────────────────────────────────────────────────
  let creds: { client_email?: string; private_key?: string; token_uri?: string };
  try {
    creds = JSON.parse(saJson);
    result.client_email = creds.client_email;
  } catch (e) {
    return NextResponse.json({ ...result, erro: `JSON inválido: ${e}` });
  }

  // ── 4. Testa a Sheets API ───────────────────────────────────────────────────
  try {
    const { createSign } = await import("crypto");
    const tokenUri = creds.token_uri ?? "https://oauth2.googleapis.com/token";
    const now      = Math.floor(Date.now() / 1000);

    const header  = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      iss: creds.client_email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: tokenUri, exp: now + 3600, iat: now,
    })).toString("base64url");

    const toSign    = `${header}.${payload}`;
    const sign      = createSign("RSA-SHA256");
    sign.update(toSign);
    const jwt = `${toSign}.${sign.sign(creds.private_key!, "base64url")}`;

    const tokenRes  = await fetch(tokenUri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
      cache: "no-store",
    });
    const tokenData = await tokenRes.json() as Record<string, unknown>;
    result.token_status = tokenRes.status;
    if (!tokenRes.ok) return NextResponse.json({ ...result, erro: "Falha ao obter token", detalhe: tokenData });

    const accessToken = tokenData.access_token as string;

    // ── 5. Busca o sheet ────────────────────────────────────────────────────
    const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetConfig.sheetId}/values/${encodeURIComponent(sheetConfig.sheetName)}?valueRenderOption=FORMATTED_VALUE`;
    const sheetsRes = await fetch(sheetsUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    result.sheets_status = sheetsRes.status;
    if (!sheetsRes.ok) {
      return NextResponse.json({ ...result, erro: "Falha na Sheets API", detalhe: await sheetsRes.text() });
    }

    const sheetsData = await sheetsRes.json() as { values?: string[][] };
    const rows = sheetsData.values ?? [];
    result.rows_retornados = rows.length;
    result.primeira_celula = rows[0]?.[0];

    // ── 6. Testa o parsing ──────────────────────────────────────────────────
    // Converte para CSV e testa o parser (mesmo caminho que o dashboard usa)
    const csv = rows
      .map((row) =>
        row.map((cell) => {
          const s = String(cell ?? "");
          return s.includes(",") || s.includes('"') || s.includes("\n")
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        }).join(","),
      )
      .join("\n");

    // Procura a linha de header com meses
    const MESES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
    const lines = csv.split("\n").map((line) => line.split(","));
    let headerIdx = -1;
    let mesesEncontrados: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const found = lines[i]
        .map((c) => c.toLowerCase().trim())
        .filter((c) => MESES.some((m) => c.match(new RegExp(`^${m}\\.\\d{2}$`))));
      if (found.length >= 6) {
        headerIdx = i;
        mesesEncontrados = found;
        break;
      }
    }

    result.parse_header_linha   = headerIdx;
    result.parse_meses_encontrados = mesesEncontrados;

    if (headerIdx === -1) {
      // Mostra as primeiras 5 linhas para diagnóstico
      result.primeiras_5_linhas = lines.slice(0, 5).map((r) => r.slice(0, 5));
      return NextResponse.json({ ...result, erro: "Parser não encontrou linha de meses — estrutura da aba pode ser diferente" });
    }

    // Conta categorias
    const categorias = lines
      .slice(headerIdx + 1)
      .map((r) => r[0]?.trim())
      .filter((desc) => desc && !["TOTAL","DESCRIÇÃO","CUSTOS"].some((p) => desc.toUpperCase() === p))
      .filter((desc) => !desc.match(/^(custo d|variáveis|lush |andar|altana)/i));

    result.categorias_encontradas = categorias.length;
    result.primeiras_categorias   = categorias.slice(0, 8);
    result.sucesso = true;

  } catch (e) {
    result.erro = `Exceção: ${e}`;
  }

  return NextResponse.json(result, { status: 200 });
}
