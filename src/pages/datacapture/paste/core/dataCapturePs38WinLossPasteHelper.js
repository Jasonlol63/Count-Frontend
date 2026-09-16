/**
 * PS3838 / ps38ag partner-ui Win Loss Detail (fixed-data-table div grid).
 *
 * Source: https://www.ps38ag.com/partner-ui-v2/report-winloss-detail-v2
 *
 * Unique to this report:
 * - Rows/cells are divs (`fixedDataTableRowLayout_*`, `role=gridcell`), not <table>
 * - Frozen + scroll panes duplicate the same `rowindex` with `left` reset to 0
 * - Chrome HTML copy collapses a visual row into stacked text inside a few cells
 * - Copy start drifts (No. vs Username); Total omits empty Name/Level/Currency cells
 *
 * Callers must use {@link tryBuildPs38FixedDataTable} / {@link tryReshapePs38WinLossPlainMatrix}
 * which return null when the clipboard is not this grid.
 */

import {
  isVerticalDumpMoneyToken,
  normalizeVerticalDumpToken,
} from "./dataCaptureVerticalDumpDetect.js";

const LEVEL_RE = /^(AGENT|MEMBER|MASTER(?:\s*AGENT)?|PLAYER)$/i;
const CURRENCY_RE = /^(MYR|USD|SGD|HKD|CNY|THB|IDR|VND|EUR|GBP|AUD|JPY|KHR|USDT)$/i;
const HEADER_LABEL_RE =
  /^(NO\.?|USERNAME|NICKNAME|NAME|LEVEL|CURRENCY|TOTAL WAGER|TURNOVER|VOLUME|GROSS COMM|MEMBER|AGENT|MASTER AGENT|COMPANY|WIN\/LOSS|WIN LOSS|COMM|TOTAL)$/i;

function cellPlainText(el) {
  return normalizeVerticalDumpToken(el?.textContent ?? "");
}

function isFdtRoot(root) {
  if (!root?.querySelector) return false;
  return Boolean(
    root.querySelector(
      [
        ".fixedDataTableRowLayout_rowWrapper",
        ".fixedDataTableRowLayout_main",
        ".public_fixedDataTableRow_main",
        ".fixedDataTableCellLayout_main",
        ".public_fixedDataTableCell_main",
        "[rowindex]",
      ].join(", "),
    ),
  );
}

function looksLikePs38FdtMarkup(root) {
  if (!isFdtRoot(root)) return false;
  const html = String(root.innerHTML || "");
  if (/fixedDataTable/i.test(html) || /public_fixedDataTable/i.test(html)) return true;
  const gridcells = root.querySelectorAll('[role="gridcell"]');
  if (gridcells.length < 10) return false;
  const rowIndexed = root.querySelectorAll("[rowindex]");
  return rowIndexed.length >= 1;
}

function fdtRowWrappers(root) {
  const nodes = root.querySelectorAll(
    ".fixedDataTableRowLayout_rowWrapper, .fixedDataTableRowLayout_main.public_fixedDataTableRow_main, [rowindex]",
  );
  const seen = new Set();
  const out = [];
  nodes.forEach((node) => {
    const row =
      node.closest?.(".fixedDataTableRowLayout_rowWrapper") ||
      node.closest?.("[rowindex]") ||
      node;
    if (!row || seen.has(row)) return;
    seen.add(row);
    out.push(row);
  });
  return out;
}

function translateY(el) {
  const style = String(el.getAttribute?.("style") || "");
  const match = style.match(/translate3d\(\s*[\d.-]+px\s*,\s*([\d.-]+)px/i);
  if (match) return match[1];
  return "";
}

function rowGroupKey(el) {
  const idx = el.getAttribute?.("rowindex");
  if (idx != null && String(idx).trim() !== "") return `i:${idx}`;
  const y = translateY(el);
  if (y !== "") return `y:${y}`;
  return `n:${outId(el)}`;
}

function outId(el) {
  return String(el.getAttribute?.("id") || el.className || "");
}

function collectFdtMainCells(rowEl) {
  const mains = Array.from(
    rowEl.querySelectorAll(
      ".fixedDataTableCellLayout_main, .public_fixedDataTableCell_main",
    ),
  );
  const withRole = mains.filter((el) => {
    const role = String(el.getAttribute("role") || "").toLowerCase();
    return role === "gridcell" || role === "columnheader";
  });
  if (withRole.length) return withRole;

  const leaf = Array.from(rowEl.querySelectorAll('[role="gridcell"], [role="columnheader"]')).filter(
    (el) => !el.querySelector('[role="gridcell"], [role="columnheader"]'),
  );
  return leaf;
}

function rowLooksLikeHeader(texts) {
  const labels = texts.filter((t) => HEADER_LABEL_RE.test(t));
  if (texts.some((t) => t.toUpperCase() === "USERNAME" || t.toUpperCase() === "TURNOVER")) {
    return true;
  }
  return labels.length >= 4 && !texts.some((t) => isLevelToken(t) && isVerticalDumpMoneyToken(t));
}

function isLevelToken(token) {
  return LEVEL_RE.test(normalizeVerticalDumpToken(token));
}

function isCurrencyToken(token) {
  return CURRENCY_RE.test(normalizeVerticalDumpToken(token));
}

function isTotalLabel(token) {
  return normalizeVerticalDumpToken(token).toUpperCase() === "TOTAL";
}

function isRowSerialToken(token) {
  return /^\d{1,4}$/.test(normalizeVerticalDumpToken(token));
}

function stripLeadingEmpties(row) {
  const next = Array.isArray(row) ? row.map((cell) => normalizeVerticalDumpToken(cell)) : [];
  while (next.length && next[0] === "") next.shift();
  return next;
}

function findLevelCurrencyPairs(cells) {
  const pairs = [];
  for (let i = 0; i < cells.length - 1; i += 1) {
    if (isLevelToken(cells[i]) && isCurrencyToken(cells[i + 1])) pairs.push(i);
  }
  return pairs;
}

function pairLooksLikeHeader(cells, levelIdx) {
  const after = cells[levelIdx + 2];
  if (after == null || after === "") return true;
  if (HEADER_LABEL_RE.test(after)) return true;
  return !isVerticalDumpMoneyToken(after);
}

function bodyLevelCurrencyPairs(cells) {
  return findLevelCurrencyPairs(cells).filter((idx) => !pairLooksLikeHeader(cells, idx));
}

function collapseConsecutiveDupes(cells) {
  const out = [];
  cells.forEach((cell) => {
    const t = normalizeVerticalDumpToken(cell);
    if (out.length && normalizeVerticalDumpToken(out[out.length - 1]) === t && t !== "") return;
    out.push(t);
  });
  return out;
}

function collapseRepeatedPrefix(cells) {
  const t = collapseConsecutiveDupes(cells);
  for (const period of [3, 2]) {
    if (t.length < period * 2 || t.length % period !== 0) continue;
    const chunk = t.slice(0, period);
    if (t.every((v, i) => v === chunk[i % period])) return chunk;
  }
  return t;
}

function parseIdentityBeforeLevel(before) {
  const t = collapseRepeatedPrefix(before);
  while (t.length && t[0] === "") t.shift();
  while (t.length && t[t.length - 1] === "") t.pop();
  let serial = "";
  let rest = t;
  if (
    rest.length >= 2 &&
    isRowSerialToken(rest[0]) &&
    !isLevelToken(rest[1]) &&
    !isCurrencyToken(rest[1])
  ) {
    serial = rest[0];
    rest = rest.slice(1);
  }
  return {
    serial,
    username: rest[0] || "",
    name: rest.slice(1).join(" ").trim(),
  };
}

function identityStart(tokens, levelIdx, minStart) {
  let start = Math.max(minStart, levelIdx - 2);
  if (start > minStart && isRowSerialToken(tokens[start - 1])) start -= 1;
  return start;
}

function findFooterTotalIndex(tokens, afterIdx) {
  for (let i = afterIdx; i < tokens.length; i += 1) {
    if (!isTotalLabel(tokens[i])) continue;
    if (collectMoneyTokens(tokens.slice(i + 1)).length >= 8) return i;
  }
  return -1;
}

function padRow(row, width) {
  const next = Array.isArray(row) ? [...row] : [];
  while (next.length < width) next.push("");
  return next.slice(0, width);
}

function collectMoneyTokens(cells) {
  return (cells || []).filter((cell) => isVerticalDumpMoneyToken(cell));
}

function tryCanonicalAgentRow(row) {
  const cells = stripLeadingEmpties(row);
  const pairs = bodyLevelCurrencyPairs(cells);
  if (!pairs.length) return null;
  let pairIdx = pairs[0];
  pairs.forEach((idx) => {
    if (collectMoneyTokens(cells.slice(idx + 2)).length >= 8) pairIdx = idx;
  });
  const identity = parseIdentityBeforeLevel(cells.slice(0, pairIdx));
  if (!identity.username && !identity.name) return null;
  const level = cells[pairIdx];
  const currency = cells[pairIdx + 1];
  const money = collectMoneyTokens(cells.slice(pairIdx + 2));
  if (money.length < 8) return null;
  const head = identity.serial
    ? [identity.serial, identity.username, identity.name, level, currency]
    : [identity.username, identity.name, level, currency];
  return [...head, ...money];
}

function agentIdentityWidth(row) {
  const currIdx = (row || []).findIndex((cell) => isCurrencyToken(cell));
  return currIdx >= 0 ? currIdx + 1 : 4;
}

function alignAgentIdentity(agents) {
  const idWidth = Math.max(...agents.map((row) => agentIdentityWidth(row)));
  return agents.map((row) => {
    const width = agentIdentityWidth(row);
    if (width >= idWidth) return row;
    return [...Array.from({ length: idWidth - width }, () => ""), ...row];
  });
}

function tryCanonicalTotalRow(row, identityWidth, width) {
  const cells = stripLeadingEmpties(row);
  if (cells.length > 1 && isRowSerialToken(cells[0]) && isTotalLabel(cells[1])) {
    cells.shift();
  }
  const totalIdx = cells.findIndex((cell) => isTotalLabel(cell));
  if (totalIdx < 0) return null;
  const money = collectMoneyTokens(cells.slice(totalIdx + 1));
  const identity = Array.from({ length: identityWidth }, () => "");
  identity[Math.max(0, identityWidth - 4)] = "Total";
  const moneyWidth = Math.max(0, width - identityWidth);
  const clipped = moneyWidth ? money.slice(0, moneyWidth) : money;
  return padRow([...identity, ...clipped], width);
}

/**
 * Force agent + Total onto [No?] Username / Name / Level / Currency / amounts.
 * Copy start may include or omit No.; empty Name/Level/Currency on Total are restored.
 */
export function canonicalizePs38WinLossMatrix(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const agents = [];
  const totals = [];
  rows.forEach((row) => {
    const agent = tryCanonicalAgentRow(row);
    if (agent) {
      agents.push(agent);
      return;
    }
    if (stripLeadingEmpties(row).some((cell) => isTotalLabel(cell))) {
      totals.push(row);
    }
  });
  if (!agents.length) return null;
  const aligned = alignAgentIdentity(agents);
  const identityWidth = agentIdentityWidth(aligned[0]);
  const width = Math.max(...aligned.map((row) => row.length));
  if (width < 8) return null;
  const matrix = aligned.map((row) => padRow(row, width));
  totals.forEach((row) => {
    matrix.push(tryCanonicalTotalRow(row, identityWidth, width) || padRow(["Total"], width));
  });
  return matrix;
}

/**
 * PS38's identity block is `No.? | Username | Name | Level | Currency`. Reports
 * that go straight from username to level (Superbo WinLossSimple:
 * `JKR9520 | AGENT | MYR | amounts`) would get a blank Name column invented for
 * them, shifting every amount one column right. Require at least one real Name
 * before claiming a clipboard that carries no PS38 markup.
 */
function matrixHasPs38NameColumn(matrix) {
  const agentRows = (matrix || []).filter(
    (row) => Array.isArray(row) && row.some((cell) => isCurrencyToken(cell)),
  );
  if (!agentRows.length) return false;
  return agentRows.some((row) => {
    const nameIdx = row.findIndex((cell) => isCurrencyToken(cell)) - 2;
    return nameIdx >= 0 && normalizeVerticalDumpToken(row[nameIdx]) !== "";
  });
}

/**
 * Build a real &lt;table&gt; from a PS38 fixed-data-table clipboard fragment.
 * @returns {HTMLTableElement | null}
 */
export function tryBuildPs38FixedDataTable(root) {
  if (!looksLikePs38FdtMarkup(root)) return null;

  const wrappers = fdtRowWrappers(root);
  if (!wrappers.length) return null;

  const groups = new Map();
  wrappers.forEach((wrapper) => {
    const key = rowGroupKey(wrapper);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(wrapper);
  });

  const orderedKeys = [];
  wrappers.forEach((wrapper) => {
    const key = rowGroupKey(wrapper);
    if (!orderedKeys.includes(key)) orderedKeys.push(key);
  });

  const dataRows = [];
  orderedKeys.forEach((key) => {
    const seen = new Set();
    const cells = [];
    groups.get(key).forEach((wrapper) => {
      collectFdtMainCells(wrapper).forEach((cell) => {
        if (seen.has(cell)) return;
        seen.add(cell);
        cells.push(cell);
      });
    });
    const texts = cells.map((cell) => cellPlainText(cell));
    if (texts.every((t) => t === "")) return;
    if (rowLooksLikeHeader(texts)) return;
    dataRows.push(texts);
  });

  if (!dataRows.length) return null;
  if (!dataRows.some((row) => bodyLevelCurrencyPairs(row).length)) return null;

  const matrix = canonicalizePs38WinLossMatrix(dataRows);
  const width = matrix?.[0]?.length || 0;
  if (width < 8 || matrix.length < 1) return null;

  const table = document.createElement("table");
  const tbody = document.createElement("tbody");
  matrix.forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}

export function expandPs38ClipboardTokens(pastedData) {
  const lines = String(pastedData ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => normalizeVerticalDumpToken(line))
    .filter(Boolean);
  return lines;
}

export function looksLikePs38WinLossPlain(pastedData) {
  const tokens = expandPs38ClipboardTokens(pastedData);
  if (tokens.length < 16) return false;
  if (!bodyLevelCurrencyPairs(tokens).length) return false;
  const moneyCount = tokens.filter((t) => isVerticalDumpMoneyToken(t)).length;
  return moneyCount >= 8;
}

function looksLikePs38WinLossRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return false;
  return rows.some((row) => tryCanonicalAgentRow(row));
}

/**
 * One-field-per-line clipboard from the div grid → horizontal matrix.
 * Also accepts TSV whose start column drifted (No. vs Username).
 * @returns {string[][] | null}
 */
export function tryReshapePs38WinLossPlainMatrix(pastedData) {
  const text = String(pastedData ?? "");
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim() !== "");
  const tabHeavy =
    lines.length >= 2 &&
    lines.filter((line) => line.includes("\t")).length >= Math.ceil(lines.length * 0.6);
  if (tabHeavy) {
    const rows = lines.map((line) =>
      line.split("\t").map((part) => normalizeVerticalDumpToken(part)),
    );
    if (!looksLikePs38WinLossRows(rows)) return null;
    const tabMatrix = canonicalizePs38WinLossMatrix(rows);
    return matrixHasPs38NameColumn(tabMatrix) ? tabMatrix : null;
  }
  if (!looksLikePs38WinLossPlain(pastedData)) return null;

  const tokens = expandPs38ClipboardTokens(pastedData);
  const pairs = bodyLevelCurrencyPairs(tokens);
  if (!pairs.length) return null;
  const rows = [];
  pairs.forEach((levelIdx, index) => {
    const sliceStart = identityStart(tokens, levelIdx, 0);
    const nextStart =
      index + 1 < pairs.length
        ? identityStart(tokens, pairs[index + 1], levelIdx + 2)
        : findFooterTotalIndex(tokens, levelIdx + 2);
    const end = nextStart >= 0 ? nextStart : tokens.length;
    rows.push(tokens.slice(sliceStart, Math.max(end, sliceStart)));
  });
  const footerAt = findFooterTotalIndex(tokens, pairs[pairs.length - 1] + 2);
  if (footerAt >= 0) rows.push(tokens.slice(footerAt));

  const matrix = canonicalizePs38WinLossMatrix(rows);
  return matrixHasPs38NameColumn(matrix) ? matrix : null;
}

/** Format body cells → canonical PS38 matrix, or null when not this report. */
export function tryCanonicalizePs38FormatBody(bodyMatrix) {
  if (!Array.isArray(bodyMatrix) || !bodyMatrix.length) return null;
  const rows = bodyMatrix.map((row) =>
    (row || []).map((cell) => normalizeVerticalDumpToken(cell?.value ?? cell ?? "")),
  );
  if (!looksLikePs38WinLossRows(rows)) return null;
  const next = canonicalizePs38WinLossMatrix(rows);
  if (!next || !matrixHasPs38NameColumn(next)) return null;
  return next.map((row) => row.map((value) => ({ value, html: "" })));
}
