/**
 * GET /api/debug-sheets
 * Rota de diagnóstico TEMPORÁRIA — diagnostica a conexão com o Google Sheets.
 * REMOVER após resolver o problema.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  // Só acessível por usuários autenticados
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  }

  const result: Record<string, unknown> = {};

  // 1. Verifica a env var
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  result.env_var_configurada = !!saJson;
  result.env_var_tamanho     = saJson?.length ?? 0;

  if (!saJson) {
    return NextResponse.json({ ...result, erro: "GOOGLE_SERVICE_ACCOUNT_JSON não configurado" });
  }

  // 2. Parseia o JSON
  let creds: { client_email?: string; private_key?: string; token_uri?: string };
  try {
    creds = JSON.parse(saJson);
    result.client_email       = creds.client_email;
    result.private_key_inicio = creds.private_key?.slice(0, 40) + "...";
    result.private_key_tem_n  = creds.private_key?.includes("\n") ?? false;
  } catch (e) {
    return NextResponse.json({ ...result, erro: `JSON inválido: ${e}` });
  }

  // 3. Tenta obter token OAuth
  try {
    const { createSign } = await import("crypto");
    const tokenUri = creds.token_uri ?? "https://oauth2.googleapis.com/token";
    const now      = Math.floor(Date.now() / 1000);

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
    const signature = sign.sign(creds.private_key!, "base64url");
    const jwt       = `${toSign}.${signature}`;

    const tokenRes = await fetch(tokenUri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion:  jwt,
      }),
      cache: "no-store",
    });

    const tokenData = await tokenRes.json() as Record<string, unknown>;
    result.token_status = tokenRes.status;

    if (!tokenRes.ok) {
      return NextResponse.json({ ...result, erro: "Falha ao obter token", detalhe: tokenData });
    }

    result.token_obtido = true;
    const accessToken = tokenData.access_token as string;

    // 4. Testa a Sheets API com o sheet da Lush Ipiranga
    const sheetId   = "1g-pJVqA4jyHE2UEshKAlX6wCvRHQX6N9zQNSnDiYl84";
    const sheetName = "Custos";
    const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetName)}?valueRenderOption=FORMATTED_VALUE`;

    const sheetsRes = await fetch(sheetsUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache:   "no-store",
    });

    result.sheets_status = sheetsRes.status;

    if (!sheetsRes.ok) {
      const err = await sheetsRes.text();
      return NextResponse.json({ ...result, erro: "Falha na Sheets API", detalhe: err });
    }

    const sheetsData = await sheetsRes.json() as { values?: string[][] };
    result.rows_retornados  = sheetsData.values?.length ?? 0;
    result.primeira_celula  = sheetsData.values?.[0]?.[0];
    result.sucesso          = true;

  } catch (e) {
    result.erro = `Exceção: ${e}`;
  }

  return NextResponse.json(result, { status: 200 });
}
