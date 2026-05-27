/**
 * lib/csv.ts
 * Utilitário client-side para gerar e baixar arquivos CSV.
 * Não requer server action — gera o arquivo diretamente no browser.
 */

/** Escapa um valor de célula CSV: envolve em aspas se contiver vírgula, aspas ou newline */
function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Uma linha CSV com os valores separados por vírgula */
function toCsvLine(cells: Array<string | number | null | undefined>): string {
  return cells.map(escapeCsvCell).join(",");
}

/**
 * Baixa um CSV no browser.
 * @param filename  Nome do arquivo (sem extensão)
 * @param headers   Array com nomes das colunas
 * @param rows      Array de arrays de valores (uma entrada por linha)
 */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
): void {
  const lines = [
    toCsvLine(headers),
    ...rows.map(toCsvLine),
  ];
  const bom  = "﻿"; // BOM UTF-8 para Excel abrir corretamente
  const blob = new Blob([bom + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
