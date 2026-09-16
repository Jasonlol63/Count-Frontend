/**
 * KING855 agent Win/Loss (simple.html) clipboard helper — scoped only.
 *
 * Source: https://ag.myking855.com/ag/report/simple.html
 *
 * Unique to this report:
 * - Nested "Sub Com" header (Winloss / Comm / Total) plus Shares "View"
 * - Currency subtotal "Sub (MYR)" is narrower than the agent row
 * - A single agent row's leading "No." is a short integer; generic 1.TEXT
 *   identifier-shift drops it when there are fewer than 2 such rows
 *
 * Other Data Capture pastes must not enter this path.
 */

import { applyDataMatrixToGrid, notifyPasteSuccess } from "./dataCapturePasteApply.js";

const CURRENCY_RE = /^(MYR|SGD|USD|EUR|HKD|THB|CNY|IDR|VND|GBP|AUD|USDT)$/i;
const SUB_CUR_RE = /^SUB\s*\(([A-Z]{3})\)$/i;
const VIEW_RE = /^VIEW$/i;

function normalizeClipboardText(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ");
}

function cellText(cell) {
  return String(cell ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isMoneyOrCount(text) {
  const cleaned = cellText(text)
    .replace(/,/g, "")
    .replace(/^\((.*)\)$/, "-$1");
  if (!cleaned) return false;
  return /^-?\d+(?:\.\d+)?$/.test(cleaned);
}

function looksLikeForeignReport(text) {
  if (/PRODUCT BRAND/i.test(text) || /EXTRA FEE/i.test(text)) return true;
  if (/USERNAME/i.test(text) && /TURNOVER/i.test(text) && /GROSS COMM/i.test(text)) return true;
  return false;
}

export function looksLikeKing855WinLossPlain(pastedData) {
  const text = normalizeClipboardText(pastedData);
  if (text.length < 40) return false;
  if (looksLikeForeignReport(text)) return false;

  const hasHeaderShape =
    /BET\s*COUNTS/i.test(text) &&
    /VALID\s*BET/i.test(text) &&
    /\bSENIOR\b/i.test(text) &&
    (/SUB\s*COM/i.test(text) || /\bSUPERIOR\b/i.test(text));
  if (hasHeaderShape) return true;

  const hasView = /\bVIEW\b/i.test(text);
  const hasSubCur = /SUB\s*\([A-Z]{3}\)/i.test(text);
  const moneyCount = (text.match(/-?[\d,]+\.\d{2}/g) || []).length;
  return hasView && hasSubCur && moneyCount >= 6;
}

function rowLooksLikeHeader(row) {
  const joined = row.map(cellText).join(" ").toUpperCase();
  if (!joined) return false;
  if (/\bSENIOR\b/.test(joined) && /\bNAME\b/.test(joined) && /CURRENCY/.test(joined)) {
    return true;
  }
  const texts = row.map((cell) => cellText(cell).toUpperCase()).filter(Boolean);
  return (
    texts.includes("WINLOSS") &&
    texts.includes("COMM") &&
    texts.includes("TOTAL") &&
    texts.length <= 6
  );
}

function rowLooksLikeChrome(row) {
  const joined = row.map(cellText).join(" ");
  if (!joined.trim()) return true;
  if (/PageSize/i.test(joined) || /^<<|^>>/.test(joined.trim())) return true;
  return /^Showing\s+\d+\s+to\s+\d+/i.test(joined);
}

function parseTabMatrix(pastedData) {
  const lines = normalizeClipboardText(pastedData)
    .split("\n")
    .filter((line) => String(line).trim() !== "");
  if (lines.length < 1) return null;
  const tabby = lines.filter((line) => line.includes("\t")).length;
  if (tabby < 1) return null;
  return lines.map((line) => line.split("\t").map(cellText));
}

function tableOccupancyMatrix(table) {
  const trs = Array.from(table.querySelectorAll("tr"));
  const grid = [];
  trs.forEach((tr, r) => {
    if (!grid[r]) grid[r] = [];
    let c = 0;
    Array.from(tr.querySelectorAll("td, th")).forEach((cell) => {
      while (grid[r][c] != null) c += 1;
      const cs = Math.max(1, parseInt(cell.getAttribute("colspan") || "1", 10) || 1);
      const rs = Math.max(1, parseInt(cell.getAttribute("rowspan") || "1", 10) || 1);
      const text = cellText(cell.textContent);
      for (let i = 0; i < rs; i += 1) {
        if (!grid[r + i]) grid[r + i] = [];
        for (let j = 0; j < cs; j += 1) {
          if (i === 0 && j === 0) grid[r + i][c + j] = text;
          else if (grid[r + i][c + j] == null) grid[r + i][c + j] = "";
        }
      }
      c += cs;
    });
  });
  const width = Math.max(0, ...grid.map((row) => row.length));
  return grid.map((row) => {
    const next = [];
    for (let i = 0; i < width; i += 1) next.push(cellText(row[i]));
    return next;
  });
}

function parseHtmlMatrix(html) {
  if (!html || typeof document === "undefined") return null;
  try {
    const root = document.createElement("div");
    root.innerHTML = String(html);
    const tables = Array.from(root.querySelectorAll("table")).filter(
      (table) => !table.parentElement?.closest("table"),
    );
    let best = null;
    tables.forEach((table) => {
      const matrix = tableOccupancyMatrix(table);
      if (!matrix.length) return;
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

function nameColumnIndex(agentRow) {
  const curIdx = (agentRow || []).findIndex((cell) => CURRENCY_RE.test(cellText(cell)));
  if (curIdx >= 2) return curIdx - 1;
  if (curIdx === 1) return 1;
  return 2;
}

function moneyStartIndex(agentRow) {
  const viewIdx = (agentRow || []).findIndex((cell) => VIEW_RE.test(cellText(cell)));
  if (viewIdx >= 0) return viewIdx + 1;
  const curIdx = (agentRow || []).findIndex((cell) => CURRENCY_RE.test(cellText(cell)));
  if (curIdx >= 0) return curIdx + 2;
  return 5;
}

function findAgentRow(rows) {
  return rows.find((row) => {
    const hasView = row.some((cell) => VIEW_RE.test(cellText(cell)));
    const money = row.filter((cell) => isMoneyOrCount(cell)).length;
    return hasView && money >= 4;
  });
}

function alignSubCurrencyRows(rows) {
  const dataRows = rows.filter((row) => !rowLooksLikeHeader(row) && !rowLooksLikeChrome(row));
  const agent = findAgentRow(dataRows);
  const width = Math.max(13, ...dataRows.map((row) => row.length), agent?.length || 0);
  const nameCol = nameColumnIndex(agent);
  const moneyStart = moneyStartIndex(agent);

  return dataRows
    .map((row) => {
      const cells = row.map(cellText);
      const labelIdx = cells.findIndex((cell) => SUB_CUR_RE.test(cell));
      if (labelIdx < 0) {
        const next = [...cells];
        while (next.length < width) next.push("");
        return next;
      }
      const label = cells[labelIdx];
      const amounts = cells.slice(labelIdx + 1).filter((cell) => isMoneyOrCount(cell));
      const next = Array.from({ length: width }, () => "");
      if (nameCol >= 0 && nameCol < width) next[nameCol] = label;
      amounts.forEach((token, index) => {
        const dest = moneyStart + index;
        if (dest >= 0 && dest < width) next[dest] = token;
      });
      return next;
    })
    .filter((row) => row.some((cell) => cellText(cell) !== ""));
}

/**
 * @returns {string[][] | null}
 */
export function tryBuildKing855WinLossMatrix(pastedData, html) {
  const fromText = looksLikeKing855WinLossPlain(pastedData) ? parseTabMatrix(pastedData) : null;
  const fromHtml = parseHtmlMatrix(html);
  const htmlLooks =
    fromHtml && looksLikeKing855WinLossPlain(flattenMatrix(fromHtml));

  const textAligned = fromText?.length ? alignSubCurrencyRows(fromText) : null;
  const htmlAligned = htmlLooks ? alignSubCurrencyRows(fromHtml) : null;
  const aligned =
    (textAligned?.length || 0) >= (htmlAligned?.length || 0) ? textAligned : htmlAligned;
  if (!aligned?.length) return null;

  const hasAgent = Boolean(findAgentRow(aligned));
  const hasSub = aligned.some((row) => row.some((cell) => SUB_CUR_RE.test(cellText(cell))));
  if (!hasAgent) return null;
  if (hasSub) return aligned;
  if (looksLikeKing855WinLossPlain(pastedData) || htmlLooks) return aligned;
  return null;
}

export function tryHandleKing855WinLossPaste(html, pastedData, applyOptions = {}) {
  const matrix = tryBuildKing855WinLossMatrix(pastedData, html);
  if (!matrix?.length) return false;
  if (!findAgentRow(matrix)) return false;

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
  notifyPasteSuccess(`成功粘贴 KING855 Win/Loss ${maxRows} 行 x ${maxCols} 列`);
  return true;
}
