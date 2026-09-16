/**
 * Citibet Agent PT Report clipboard helper — scoped only.
 *
 * Source: https://www.klu008.com/users_pt_report.jsp
 * Table: `ptreport_content`, per-user footer `tr[name=total_trs]`.
 *
 * Chrome copies that Total row as:
 * - leading empty <td> dropped in text/plain
 * - `<div>Total</div>` becoming its own line
 * - three `&nbsp;` cells kept as tabs on the next line
 * - last cell `<script>associate(...)</script>` leftover
 *
 * Result in 1.TEXT: A1=TOTAL, B4–B6=amounts. Recover the 9-col source shape:
 *   ['', '', 'Total', '', '', '', '$141.38', '$2.63', '$138.75']
 *
 * Payment Citibet sheets, fruit16 Sub/Grand, and other reports must not enter.
 */

import { applyDataMatrixToGrid, notifyPasteSuccess } from "./dataCapturePasteApply.js";
import { pastedPlainTextLooksCitibetReport } from "./dataCapturePasteDetect.js";

const PT_TOTAL_WIDTH = 9;

function normalizeClipboardText(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ");
}

function cellText(cell) {
  return String(cell ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function blobOf(text, html) {
  return `${text || ""}\n${html || ""}`;
}

function looksLikeForeignReport(blob) {
  if (pastedPlainTextLooksCitibetReport(blob)) return true;
  if (/upline\s+payment|downline\s+payment|my\s+earnings/i.test(blob)) return true;
  if (/PRODUCT BRAND/i.test(blob) || /EXTRA FEE/i.test(blob)) return true;
  if (/BET\s*COUNTS/i.test(blob) && /VALID\s*BET/i.test(blob)) return true;
  return false;
}

function isBareTotalLabel(text) {
  return /^total$/i.test(cellText(text).replace(/[:：]+$/g, ""));
}

function isMoneyOrCount(text) {
  const cleaned = cellText(text)
    .replace(/,/g, "")
    .replace(/^\$/, "")
    .replace(/^\((.*)\)$/, "-$1");
  if (!cleaned) return false;
  return /^-?\d+(?:\.\d+)?$/.test(cleaned);
}

function filledCells(row) {
  return (row || []).map(cellText).filter(Boolean);
}

function rowIsAssociateJunk(row) {
  const filled = filledCells(row);
  return filled.length > 0 && filled.every((token) => /^associate\s*\(/i.test(token));
}

function rowIsBareTotal(row) {
  const filled = filledCells(row);
  return filled.length === 1 && isBareTotalLabel(filled[0]);
}

function rowIsThreeAmounts(row) {
  const filled = filledCells(row);
  return filled.length === 3 && filled.every((token) => isMoneyOrCount(token));
}

function looksLikeHtmlAgentPt(html) {
  const raw = String(html || "");
  if (!raw.trim()) return false;
  if (/ptreport_content|name\s*=\s*["']?total_trs|users_pt_report/i.test(raw)) return true;
  if (/associate\s*\(\s*['"][A-Za-z0-9_]+['"]/i.test(raw) && /<t[dh]\b/i.test(raw)) return true;
  if (/downline\s+profit\s*\/\s*loss/i.test(raw) && /my\s+profit\s*\/\s*loss/i.test(raw)) return true;
  return false;
}

function looksLikePlainAgentPt(text) {
  const raw = normalizeClipboardText(text);
  if (!raw.trim()) return false;
  if (/agent\s+pt\s+report/i.test(raw)) return true;
  if (/downline\s+profit\s*\/\s*loss/i.test(raw) && /my\s+(?:pt\s+)?profit\s*\/\s*loss/i.test(raw)) {
    return true;
  }
  if (/my\s+pt\s+p\/l/i.test(raw)) return true;

  const tokens = raw
    .split(/\n|\t/)
    .map(cellText)
    .filter(Boolean);
  if (tokens.some((token) => /sub\s*total|grand\s*total/i.test(token))) return false;
  if (tokens.filter((token) => isBareTotalLabel(token)).length !== 1) return false;
  const amounts = tokens.filter((token) => isMoneyOrCount(token));
  if (amounts.length !== 3) return false;
  if (tokens.length > 5) return false;
  const dollarAmounts = amounts.filter((token) => /\$/.test(token) || /^\(.*\)$/.test(token));
  return dollarAmounts.length >= 2;
}

export function looksLikeCitibetAgentPtReport(pastedData, html = "") {
  const blob = blobOf(pastedData, html);
  if (!blob.trim()) return false;
  if (looksLikeForeignReport(blob)) return false;
  return looksLikeHtmlAgentPt(html) || looksLikePlainAgentPt(pastedData);
}

function parseTdInner(inner) {
  return String(inner || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseHtmlRowsWithRegex(html) {
  const cleaned = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  const trs = cleaned.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  return trs
    .map((trHtml) => {
      const cells = [];
      const tdRe = /<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi;
      let match;
      while ((match = tdRe.exec(trHtml))) {
        const spanMatch = /colspan\s*=\s*["']?(\d+)/i.exec(match[1] || "");
        const span = Math.max(1, Number(spanMatch?.[1] || 1) || 1);
        cells.push(parseTdInner(match[2]));
        for (let i = 1; i < span; i += 1) cells.push("");
      }
      return cells;
    })
    .filter((row) => row.length && !rowIsAssociateJunk(row));
}

function parseHtmlRowsWithDom(html) {
  const root = document.createElement("div");
  root.innerHTML = String(html);
  root.querySelectorAll("script, style").forEach((el) => el.remove());
  const table = root.querySelector("table") || root;
  return Array.from(table.querySelectorAll("tr"))
    .map((tr) => {
      const cells = [];
      Array.from(tr.querySelectorAll("td, th")).forEach((td) => {
        const clone = td.cloneNode(true);
        clone.querySelectorAll("script, style").forEach((el) => el.remove());
        const span = Math.max(1, Number(td.getAttribute("colspan") || td.colSpan || 1) || 1);
        cells.push(cellText(clone.textContent));
        for (let i = 1; i < span; i += 1) cells.push("");
      });
      return cells;
    })
    .filter((row) => row.length && !rowIsAssociateJunk(row));
}

function parseHtmlRows(html) {
  if (!html || typeof html !== "string") return [];
  if (!/<t[rdh]\b/i.test(html)) return [];
  if (typeof document !== "undefined") {
    try {
      const fromDom = parseHtmlRowsWithDom(html);
      if (fromDom.length) return fromDom;
    } catch {
      /* regex fallback */
    }
  }
  return parseHtmlRowsWithRegex(html);
}

function parsePlainRows(text) {
  const lines = normalizeClipboardText(text)
    .split("\n")
    .map((line) => line.replace(/\u00a0/g, " "))
    .filter((line) => line.trim() !== "");
  return lines
    .map((line) => line.split("\t").map((cell) => cellText(cell)))
    .filter((row) => row.length && !rowIsAssociateJunk(row));
}

function padLeading(row, count) {
  if (count <= 0) return [...row];
  return [...Array.from({ length: count }, () => ""), ...row];
}

function padWidth(row, width) {
  const next = [...row];
  while (next.length < width) next.push("");
  return next;
}

/** `$141.38` → `141.38`, `($1,421.85)` → `(1,421.85)`; leaves labels untouched. */
function stripCurrencySign(value) {
  const text = cellText(value);
  if (!text || !text.includes("$")) return text;
  const stripped = text.replace(/\$/g, "");
  return isMoneyOrCount(stripped) ? stripped : text;
}

/**
 * A Total-only copy carries the two leading empty `<td>` of `total_trs`; with no
 * body row to align under they only push amounts right, so collapse them.
 */
function dropLeadingEmptyColumns(rows) {
  let lead = 0;
  const width = Math.max(...rows.map((row) => row.length));
  while (lead < width && rows.every((row) => cellText(row[lead]) === "")) lead += 1;
  if (lead <= 0) return rows;
  return rows.map((row) => row.slice(lead));
}

/** Recover total_trs: Total in col 3, My PT amounts in cols 7–9. */
export function normalizeCitibetPtTotalRow(row) {
  if (!Array.isArray(row) || !row.length) return row;
  const filled = filledCells(row);
  if (!filled.length) return row;
  if (!isBareTotalLabel(filled[0])) return row;
  if (filled.filter((token) => isMoneyOrCount(token)).length !== 3) return row;
  if (filled.some((token, index) => index > 0 && !isMoneyOrCount(token))) return row;

  const labelIdx = row.findIndex((cell) => cellText(cell) !== "");
  if (labelIdx < 0 || !isBareTotalLabel(row[labelIdx])) return row;
  const amounts = row.slice(labelIdx + 1);
  if (labelIdx === 2 && row.length >= PT_TOTAL_WIDTH) {
    return padWidth(row, Math.max(row.length, PT_TOTAL_WIDTH)).slice(0, Math.max(row.length, PT_TOTAL_WIDTH));
  }
  return padWidth(padLeading(["Total", ...amounts], 2), PT_TOTAL_WIDTH);
}

function mergeBareTotalAndAmountRows(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const next = rows[i + 1];
    if (rowIsBareTotal(row) && next && rowIsThreeAmounts(next)) {
      out.push(normalizeCitibetPtTotalRow(["Total", ...next]));
      i += 1;
      continue;
    }
    out.push(normalizeCitibetPtTotalRow(row));
  }
  return out;
}

function pickSourceRows(pastedData, html) {
  const htmlRows = parseHtmlRows(html);
  const htmlLooks = htmlRows.length > 0 && looksLikeHtmlAgentPt(html);
  if (htmlLooks) return htmlRows;

  const textRows = parsePlainRows(pastedData);
  if (textRows.length && looksLikeCitibetAgentPtReport(pastedData, html)) return textRows;

  if (htmlRows.length && looksLikeCitibetAgentPtReport(pastedData, html)) return htmlRows;
  return [];
}

/**
 * @returns {string[][] | null}
 */
export function tryBuildCitibetAgentPtReportMatrix(pastedData, html) {
  if (!looksLikeCitibetAgentPtReport(pastedData, html)) return null;
  const source = pickSourceRows(pastedData, html);
  if (!source.length) return null;

  const merged = mergeBareTotalAndAmountRows(source).filter((row) => !rowIsAssociateJunk(row));
  if (!merged.length) return null;

  const collapsed = dropLeadingEmptyColumns(merged);
  const width = Math.max(...collapsed.map((row) => row.length));
  return collapsed.map((row) => padWidth(row, width).map(stripCurrencySign));
}

export function tryHandleCitibetAgentPtReportPaste(html, pastedData, applyOptions = {}) {
  const matrix = tryBuildCitibetAgentPtReportMatrix(pastedData, html);
  if (!matrix?.length) return false;

  const { successCount, maxRows, maxCols } = applyDataMatrixToGrid(
    matrix,
    applyOptions.anchorCell || null,
    {
      alignTotalRows: false,
      uppercaseValues: false,
      trimValues: false,
      startRowOverride: applyOptions.startRowOverride,
      startColOverride: applyOptions.startColOverride,
    },
  );
  if (successCount <= 0) return false;
  notifyPasteSuccess(`成功粘贴 Citibet Agent PT ${maxRows} 行 x ${maxCols} 列`);
  return true;
}
