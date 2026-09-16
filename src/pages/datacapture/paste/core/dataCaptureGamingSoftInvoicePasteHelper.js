/**
 * GamingSoft Excel invoice clipboard (e.g. AllBET95ONLINEGAMINGWORLD_*.xlsx).
 *
 * Scoped only: PRODUCT BRAND / EXTRA FEE / "(MYR) 12.34" rows.
 * Other Data Capture pastes must not enter this path.
 *
 * Excel/WPS HTML is often truncated (~92 body rows). text/plain TSV still has
 * the rest, but column counts jump on EXTRA FEE rows so the shared "aligned TSV"
 * gate rejects it. Parse TSV here and ignore HTML when TSV is longer.
 */

import { applyDataMatrixToGrid, notifyPasteSuccess } from "./dataCapturePasteApply.js";

const PAREN_MONEY_RE = /\([A-Za-z]{3}\)\s*-?\s*[\d,]/;
const BRAND_DASH_RE = /\b[A-Za-z]{1,4}:[^\n\t]{0,48}\s-\s/;

function normalizeClipboardText(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

export function looksLikeGamingSoftInvoicePlain(pastedData) {
  const text = normalizeClipboardText(pastedData);
  if (text.length < 120) return false;
  // Win/Loss portals (PS38 and similar) — never steal those pastes.
  if (/USERNAME/i.test(text) && /TURNOVER/i.test(text) && /GROSS COMM/i.test(text)) {
    return false;
  }
  const parenMoney = (text.match(/\([A-Za-z]{3}\)\s*-?\s*[\d,]/g) || []).length;
  if (parenMoney < 8) return false;
  const brandDash = (text.match(/\b[A-Za-z]{1,4}:[^\n\t]{0,48}\s-\s/g) || []).length;
  // NET WIN is a common report column — do not treat it as an invoice marker.
  const hasInvoiceHeader = /PRODUCT BRAND/i.test(text) || /EXTRA FEE/i.test(text);
  return brandDash >= 8 || hasInvoiceHeader;
}

function parseTabMatrix(pastedData) {
  const lines = normalizeClipboardText(pastedData)
    .split("\n")
    .filter((line) => String(line).trim() !== "");
  const tabLines = lines.filter((line) => line.includes("\t"));
  if (tabLines.length < 8) return null;
  const rows = lines.map((line) => line.split("\t").map((cell) => cell.trim()));
  const width = Math.max(0, ...rows.map((row) => row.length));
  if (width < 4) return null;
  return rows.map((row) => {
    const next = [...row];
    while (next.length < width) next.push("");
    return next;
  });
}

function tableToMatrix(table) {
  if (!table?.querySelectorAll) return null;
  const rows = [];
  table.querySelectorAll("tr").forEach((tr) => {
    const cells = Array.from(tr.querySelectorAll("td, th")).map((cell) =>
      String(cell.textContent || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    );
    if (cells.some((cell) => cell !== "")) rows.push(cells);
  });
  if (rows.length < 8) return null;
  const width = Math.max(0, ...rows.map((row) => row.length));
  return rows.map((row) => {
    const next = [...row];
    while (next.length < width) next.push("");
    return next;
  });
}

function parseHtmlInvoiceMatrix(html) {
  if (!html || typeof document === "undefined") return null;
  try {
    const root = document.createElement("div");
    root.innerHTML = String(html);
    const tables = Array.from(root.querySelectorAll("table"));
    let best = null;
    tables.forEach((table) => {
      const matrix = tableToMatrix(table);
      if (!matrix) return;
      if (!best || matrix.length > best.length) best = matrix;
    });
    return best;
  } catch {
    return null;
  }
}

function flattenMatrix(matrix) {
  return (matrix || []).map((row) => row.join("\t")).join("\n");
}

/**
 * Prefer the longer of TSV vs HTML tables. TSV usually wins on WPS/Excel.
 * @returns {string[][] | null}
 */
export function tryBuildGamingSoftInvoiceMatrix(pastedData, html) {
  const fromText = looksLikeGamingSoftInvoicePlain(pastedData)
    ? parseTabMatrix(pastedData)
    : null;
  const fromHtml = parseHtmlInvoiceMatrix(html);
  const htmlLooksInvoice =
    fromHtml && looksLikeGamingSoftInvoicePlain(flattenMatrix(fromHtml));

  const textRows = fromText?.length || 0;
  const htmlRows = htmlLooksInvoice ? fromHtml.length : 0;
  if (textRows >= 8 && textRows >= htmlRows) return fromText;
  if (htmlRows >= 8) return fromHtml;
  if (textRows >= 8) return fromText;
  return null;
}

export function tryHandleGamingSoftInvoicePaste(html, pastedData, applyOptions = {}) {
  const matrix = tryBuildGamingSoftInvoiceMatrix(pastedData, html);
  if (!matrix?.length) return false;
  const productish = matrix.filter((row) =>
    row.some((cell) => PAREN_MONEY_RE.test(cell) || BRAND_DASH_RE.test(cell)),
  );
  if (productish.length < 8) return false;

  const { successCount, maxRows, maxCols } = applyDataMatrixToGrid(
    matrix,
    applyOptions.anchorCell || null,
    {
      alignTotalRows: false,
      startRowOverride: applyOptions.startRowOverride,
      startColOverride: applyOptions.startColOverride,
    },
  );
  if (successCount <= 0) return false;
  notifyPasteSuccess(`成功粘贴发票 ${maxRows} 行 x ${maxCols} 列`);
  return true;
}
