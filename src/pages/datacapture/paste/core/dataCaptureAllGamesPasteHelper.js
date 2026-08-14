/**
 * Won Casino / iview allGames report (ag.*.xyz/#/e/report/allGames) clipboard helper — scoped only.
 *
 * Other report pastes must NOT go through this. Callers check
 * {@link tryReshapeAllGamesPlainMatrix} / {@link tryMergeAllGamesIvuTables}
 * which return null when the clipboard is not an allGames dump.
 *
 * Fixes unique to this source:
 * - plain is one-field-per-line; % tokens break shared vertical-dump
 * - Total(1) is not recognized as TOTAL by shared summary labels
 * - iView splits body + ivu-table-summary into sibling <table>s; normalize
 *   that keeps only the first table drops the Total row
 */

import {
  isVerticalDumpMoneyToken,
  normalizeVerticalDumpToken,
} from "./dataCaptureVerticalDumpDetect.js";

const CURRENCY_RE = /^(MYR|USD|SGD|HKD|CNY|THB|IDR|VND|EUR|GBP|AUD|JPY|KHR|USDT)$/i;
const TYPE_RE = /^(agent|member|player|sub)$/i;
const TOTAL_LABEL_RE = /^TOTAL\(\d+\)$/i;
const PCT_RE = /^-?\d+(?:\.\d+)?\s*%$/;

function isPctToken(token) {
  return PCT_RE.test(normalizeVerticalDumpToken(token));
}

function isCurrencyToken(token) {
  return CURRENCY_RE.test(normalizeVerticalDumpToken(token));
}

function isTypeToken(token) {
  return TYPE_RE.test(normalizeVerticalDumpToken(token));
}

function isTotalLabel(token) {
  return TOTAL_LABEL_RE.test(normalizeVerticalDumpToken(token));
}

function isOperatorLike(token) {
  const t = normalizeVerticalDumpToken(token);
  if (!t || isVerticalDumpMoneyToken(t) || isPctToken(t) || isCurrencyToken(t) || isTypeToken(t)) {
    return false;
  }
  if (isTotalLabel(t)) return false;
  // WN002 / AG01 — short alphanumeric codes with a letter
  return /^[A-Z0-9][A-Z0-9_-]{1,}$/i.test(t) && /[A-Za-z]/.test(t);
}

/** Expand tabs before whitespace normalize. */
export function expandAllGamesClipboardTokens(pastedData) {
  const lines = String(pastedData ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => String(line ?? "").replace(/\u00a0/g, " ").trim() !== "");

  const tokens = [];
  lines.forEach((line) => {
    const raw = String(line ?? "").replace(/\u00a0/g, " ");
    if (raw.includes("\t")) {
      raw.split("\t").forEach((part) => {
        const token = normalizeVerticalDumpToken(part);
        if (token) tokens.push(token);
      });
      return;
    }
    const normalized = normalizeVerticalDumpToken(raw);
    if (normalized) tokens.push(normalized);
  });
  return tokens;
}

/**
 * Strict gate: Operator + UID + Name + agent + Currency + Count + amounts/% + Total(N).
 */
export function looksLikeAllGamesPlain(pastedData) {
  const tokens = expandAllGamesClipboardTokens(pastedData);
  if (tokens.length < 20) return false;
  if (!tokens.some(isTypeToken)) return false;
  if (!tokens.some(isCurrencyToken)) return false;
  if (!tokens.some(isPctToken)) return false;
  if (!tokens.some(isTotalLabel)) return false;

  const agentStarts = findAgentRowStarts(tokens);
  if (agentStarts.length < 1) return false;

  const width = detectAgentWidth(tokens, agentStarts[0]);
  // Body fields without expand/checkbox empties: typically 18 (Operator…NetProfit).
  if (width < 14 || width > 22) return false;
  return true;
}

function findAgentRowStarts(tokens) {
  const starts = [];
  for (let i = 0; i < tokens.length - 5; i += 1) {
    if (!isOperatorLike(tokens[i])) continue;
    if (!isTypeToken(tokens[i + 3])) continue;
    if (!isCurrencyToken(tokens[i + 4])) continue;
    if (!isVerticalDumpMoneyToken(tokens[i + 5])) continue;
    starts.push(i);
  }
  return starts;
}

function detectAgentWidth(tokens, start) {
  const totalIdx = tokens.findIndex((t, i) => i > start && isTotalLabel(t));
  if (totalIdx > start) {
    const width = totalIdx - start;
    if (width >= 14 && width <= 22) return width;
  }
  // Fallback: walk until next operator-like or Total.
  let end = start + 1;
  while (end < tokens.length) {
    if (isTotalLabel(tokens[end])) break;
    if (end > start + 5 && isOperatorLike(tokens[end]) && isTypeToken(tokens[end + 3] || "")) break;
    end += 1;
    if (end - start > 22) break;
  }
  return end - start;
}

/**
 * Rebuild Total(N) row to agent width: keep empties under UID/Name/Type/Currency
 * and under % columns (stripped from plain clipboard).
 */
function rebuildTotalRow(agentRow, totalLabel, numericTokens) {
  const width = agentRow.length;
  const out = Array.from({ length: width }, () => "");
  out[0] = totalLabel;
  let ni = 0;
  for (let i = 1; i < width; i += 1) {
    // UID / Name / Type / Currency stay blank on Total row.
    if (i >= 1 && i <= 4) continue;
    if (isPctToken(agentRow[i])) continue;
    if (ni < numericTokens.length) {
      out[i] = numericTokens[ni];
      ni += 1;
    }
  }
  return out;
}

function rightPadRow(row, width) {
  const next = Array.isArray(row) ? [...row] : [];
  while (next.length < width) next.push("");
  return next.slice(0, width);
}

/**
 * Reshape allGames plain clipboard into a horizontal matrix.
 * @returns {string[][] | null}
 */
export function tryReshapeAllGamesPlainMatrix(pastedData) {
  const text = String(pastedData ?? "");
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim() !== "");
  const tabHeavy =
    lines.length >= 2 &&
    lines.filter((line) => line.includes("\t")).length >= Math.ceil(lines.length * 0.6);
  // Dense TSV already keeps empty cells — leave to aligned-TSV path.
  if (tabHeavy) return null;

  if (!looksLikeAllGamesPlain(pastedData)) return null;

  const tokens = expandAllGamesClipboardTokens(pastedData);
  const starts = findAgentRowStarts(tokens);
  if (!starts.length) return null;

  const width = detectAgentWidth(tokens, starts[0]);
  if (width < 14 || width > 22) return null;

  const rows = [];
  for (const start of starts) {
    const chunk = tokens.slice(start, start + width);
    if (chunk.length < width) break;
    // Stop if this "agent" chunk actually starts a Total label.
    if (isTotalLabel(chunk[0])) break;
    rows.push(rightPadRow(chunk, width));
  }
  if (!rows.length) return null;

  const totalIdx = tokens.findIndex(isTotalLabel);
  if (totalIdx >= 0) {
    const label = tokens[totalIdx];
    const nums = tokens.slice(totalIdx + 1).filter((t) => isVerticalDumpMoneyToken(t));
    rows.push(rebuildTotalRow(rows[0], label, nums));
  }

  if (rows.length < 1) return null;
  return rows.map((row) => rightPadRow(row, width));
}

function rowCellTexts(tr) {
  return Array.from(tr.querySelectorAll("td, th")).map((td) =>
    String(td.innerText || td.textContent || "")
      .replace(/\u00a0/g, " ")
      .trim(),
  );
}

function tableLooksLikeAllGamesBody(table) {
  if (!table) return false;
  const rows = Array.from(table.querySelectorAll("tr"));
  if (!rows.length) return false;
  for (const tr of rows) {
    const cells = rowCellTexts(tr);
    const joined = cells.join("\t");
    if (TYPE_RE.test(cells.find((c) => TYPE_RE.test(c)) || "") && cells.some(isCurrencyToken)) {
      if (cells.some(isPctToken) || /%/.test(joined)) return true;
    }
  }
  return false;
}

function tableLooksLikeAllGamesSummary(table) {
  if (!table) return false;
  const text = String(table.innerText || table.textContent || "");
  return /Total\(\d+\)/i.test(text);
}

/**
 * Merge iView body + ivu-table-summary sibling tables into one <table>.
 * @param {ParentNode} root
 * @returns {HTMLTableElement | null}
 */
export function tryMergeAllGamesIvuTables(root) {
  if (!root || typeof root.querySelector !== "function") return null;

  const bodyTable =
    root.querySelector(".ivu-table-body table") ||
    Array.from(root.querySelectorAll("table")).find(
      (t) => !/\bivu-table-summary\b/i.test(t.className || "") && tableLooksLikeAllGamesBody(t),
    );
  const summaryTable =
    root.querySelector("table.ivu-table-summary") ||
    Array.from(root.querySelectorAll("table")).find(
      (t) => t !== bodyTable && tableLooksLikeAllGamesSummary(t),
    );

  if (!bodyTable || !summaryTable) return null;
  if (!tableLooksLikeAllGamesBody(bodyTable) && !tableLooksLikeAllGamesSummary(summaryTable)) {
    return null;
  }
  // Require Total(N) on summary so we do not merge unrelated pairs.
  if (!tableLooksLikeAllGamesSummary(summaryTable)) return null;

  const merged = document.createElement("table");
  const tbody = document.createElement("tbody");

  const appendRows = (table) => {
    Array.from(table.querySelectorAll("tr")).forEach((tr) => {
      tbody.appendChild(tr.cloneNode(true));
    });
  };
  appendRows(bodyTable);
  appendRows(summaryTable);
  if (!tbody.querySelectorAll("tr").length) return null;

  merged.appendChild(tbody);
  return merged;
}
