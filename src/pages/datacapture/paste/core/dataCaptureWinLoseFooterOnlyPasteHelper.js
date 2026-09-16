/**
 * Footer-only Sub Total + Grand Total clipboard helper — scoped only.
 *
 * Source: https://fruit16.com/dailyWinlose (Win Lose table).
 *
 * Copying just the two footer TRs (no agent rows) often:
 * - drops colspan blanks on one row only → first amounts zipper
 * - copies column-major / transposed (`SUB TOTAL` then `GRAND TOTAL` then paired amounts)
 * - fails the aligned-TSV grill (width delta > 2) then vertical-dump
 *   (needs a body row) → N×1 / unusable paste
 *
 * Other Data Capture pastes must not enter this path (agents, Superbo TOTAL, etc.).
 */

import { applyDataMatrixToGrid, notifyPasteSuccess } from "./dataCapturePasteApply.js";
import { pastedPlainTextLooksCitibetReport } from "./dataCapturePasteDetect.js";

function normalizeClipboardText(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ");
}

function cellText(cell) {
  if (cell != null && typeof cell === "object" && "value" in cell) {
    return String(cell.value ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return String(cell ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBlankCell(cell) {
  return cellText(cell) === "";
}

function blankLike(row) {
  const sample = (row || []).find((cell) => cell != null && typeof cell === "object" && "value" in cell);
  return sample ? { value: "" } : "";
}

function isMoneyOrCount(text) {
  const cleaned = cellText(text)
    .replace(/,/g, "")
    .replace(/^\((.*)\)$/, "-$1");
  if (!cleaned) return false;
  return /^-?\d+(?:\.\d+)?$/.test(cleaned);
}

function isSubTotalLabel(text) {
  const upper = cellText(text)
    .replace(/[:：=]+$/g, "")
    .toUpperCase();
  return upper === "SUB TOTAL" || upper === "SUBTOTAL";
}

function isGrandTotalLabel(text) {
  const upper = cellText(text)
    .replace(/[:：=]+$/g, "")
    .toUpperCase();
  return upper === "GRAND TOTAL" || upper === "GRANDTOTAL";
}

function isFooterPairLabel(text) {
  return isSubTotalLabel(text) || isGrandTotalLabel(text);
}

function firstLabelIndex(row) {
  if (!Array.isArray(row)) return -1;
  return row.findIndex((cell) => cellText(cell) !== "");
}

function firstNonEmptyAfter(row, start) {
  if (!Array.isArray(row)) return -1;
  for (let i = start; i < row.length; i += 1) {
    if (!isBlankCell(row[i])) return i;
  }
  return -1;
}

function contentRows(matrix) {
  return (matrix || []).filter((row) => Array.isArray(row) && row.some((cell) => cellText(cell) !== ""));
}

function flattenNonEmptyTokens(text) {
  const tokens = [];
  normalizeClipboardText(text)
    .split("\n")
    .forEach((line) => {
      if (line.includes("\t")) {
        line.split("\t").forEach((part) => {
          const token = cellText(part);
          if (token) tokens.push(token);
        });
        return;
      }
      const token = cellText(line);
      if (token) tokens.push(token);
    });
  const coalesced = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const current = tokens[i].toUpperCase();
    const next = String(tokens[i + 1] || "").toUpperCase();
    if (current === "SUB" && next === "TOTAL") {
      coalesced.push("SUB TOTAL");
      i += 1;
      continue;
    }
    if (current === "GRAND" && next === "TOTAL") {
      coalesced.push("GRAND TOTAL");
      i += 1;
      continue;
    }
    coalesced.push(tokens[i]);
  }
  return coalesced;
}

function extraNonFooterLabels(tokens) {
  return tokens.filter(
    (token) => token && !isMoneyOrCount(token) && !isFooterPairLabel(token),
  );
}

function clipboardLooksLikeCitibet(text, html = "") {
  if (pastedPlainTextLooksCitibetReport(text)) return true;
  const blob = `${text || ""}\n${html || ""}`;
  if (/upline\s+payment|downline\s+payment|my\s+earnings/i.test(blob)) return true;
  return /ptreport_content|name\s*=\s*["']?total_trs|users_pt_report|agent\s+pt\s+report/i.test(blob);
}

function replaceContentRows(matrix, nextRows) {
  let index = 0;
  return matrix.map((row) => {
    if (!Array.isArray(row) || !row.some((cell) => cellText(cell) !== "")) return row;
    const next = nextRows[index];
    index += 1;
    return next || row;
  });
}

/**
 * Clipboard is only Sub Total + Grand Total (and their amounts). No agent rows.
 */
export function looksLikeFooterOnlySubGrandPlain(pastedData) {
  const text = normalizeClipboardText(pastedData);
  if (!text.trim()) return false;
  if (clipboardLooksLikeCitibet(text)) return false;
  const tokens = flattenNonEmptyTokens(text);
  const subCount = tokens.filter((token) => isSubTotalLabel(token)).length;
  const grandCount = tokens.filter((token) => isGrandTotalLabel(token)).length;
  if (subCount !== 1 || grandCount !== 1) return false;
  if (extraNonFooterLabels(tokens).length) return false;
  if (tokens.filter((token) => isMoneyOrCount(token)).length < 6) return false;
  return true;
}

function padRowWidth(row, width) {
  const next = Array.isArray(row) ? [...row] : [];
  while (next.length < width) next.push(blankLike(next.length ? next : row));
  return next;
}

/**
 * Pad the narrower footer so both first amounts share a column.
 * No-op when already aligned (avoids shifting correct dual-footer HTML).
 */
export function alignFooterOnlySubGrandMatrix(matrix) {
  const rows = contentRows(matrix);
  if (rows.length !== 2) return matrix;

  const a = firstLabelIndex(rows[0]);
  const b = firstLabelIndex(rows[1]);
  if (a < 0 || b < 0) return matrix;
  const labelA = rows[0][a];
  const labelB = rows[1][b];
  const pair =
    (isSubTotalLabel(labelA) && isGrandTotalLabel(labelB)) ||
    (isGrandTotalLabel(labelA) && isSubTotalLabel(labelB));
  if (!pair) return matrix;

  const firstA = firstNonEmptyAfter(rows[0], a + 1);
  const firstB = firstNonEmptyAfter(rows[1], b + 1);
  if (firstA < 0 || firstB < 0) return matrix;
  const target = Math.max(firstA, firstB);
  const aligned = rows.map((row) => {
    const labelIdx = firstLabelIndex(row);
    const first = firstNonEmptyAfter(row, labelIdx + 1);
    const need = target - first;
    if (need <= 0) return [...row];
    const blanks = Array.from({ length: need }, () => blankLike(row));
    return [...row.slice(0, labelIdx + 1), ...blanks, ...row.slice(labelIdx + 1)];
  });
  const width = Math.max(...aligned.map((row) => row.length));
  const padded = aligned.map((row) => padRowWidth(row, width));
  if (
    firstA === firstB &&
    rows[0].length === width &&
    rows[1].length === width &&
    padded.every((row, index) => row.length === rows[index].length)
  ) {
    return matrix;
  }
  return replaceContentRows(matrix, padded);
}

function parseTwoTabFooterRows(text) {
  const lines = normalizeClipboardText(text)
    .split("\n")
    .filter((line) => String(line).trim() !== "");
  if (lines.length !== 2) return null;
  if (!lines[0].includes("\t") && !lines[1].includes("\t")) return null;
  const rows = lines.map((line) => line.split("\t").map((cell) => cellText(cell)));
  const a = rows[0].find((cell) => cellText(cell) !== "");
  const b = rows[1].find((cell) => cellText(cell) !== "");
  if (
    !(isSubTotalLabel(a) && isGrandTotalLabel(b)) &&
    !(isGrandTotalLabel(a) && isSubTotalLabel(b))
  ) {
    return null;
  }
  return rows;
}

/**
 * fruit16 footer-only copy is often column-major / transposed:
 *   SUB TOTAL, GRAND TOTAL, amtSub, amtGrand, amtSub, amtGrand, …
 * Selecting two TRs as text also zippers into overlapping 2-col TSV
 * (`SUB TOTAL` then `GRAND TOTAL\\t1195` then `1195\\t158,293.52` …).
 * Flatten + de-interleave recovers two aligned rows.
 */
function deinterleaveAdjacentFooterLabels(tokens) {
  if (!Array.isArray(tokens) || tokens.length < 8) return null;
  if (!isFooterPairLabel(tokens[0]) || !isFooterPairLabel(tokens[1])) return null;
  if (isSubTotalLabel(tokens[0]) === isSubTotalLabel(tokens[1])) return null;
  if (isGrandTotalLabel(tokens[0]) === isGrandTotalLabel(tokens[1])) return null;

  const amounts = tokens.slice(2);
  if (!amounts.length || amounts.length % 2 !== 0) return null;
  if (!amounts.every((token) => isMoneyOrCount(token))) return null;
  if (amounts.length < 6) return null;

  const left = [];
  const right = [];
  for (let i = 0; i < amounts.length; i += 2) {
    left.push(amounts[i]);
    right.push(amounts[i + 1]);
  }
  return [
    [tokens[0], ...left],
    [tokens[1], ...right],
  ];
}

function reshapeVerticalFooterTokens(text) {
  const tokens = flattenNonEmptyTokens(text);
  const subIdx = tokens.findIndex((token) => isSubTotalLabel(token));
  const grandIdx = tokens.findIndex((token) => isGrandTotalLabel(token));
  if (subIdx < 0 || grandIdx < 0 || subIdx === grandIdx) return null;
  const first = Math.min(subIdx, grandIdx);
  const second = Math.max(subIdx, grandIdx);
  if (first !== 0) return null;

  if (second === 1) {
    return deinterleaveAdjacentFooterLabels(tokens);
  }

  const row1 = tokens.slice(first, second);
  const row2 = tokens.slice(second);
  if (row1.length < 4 || row2.length < 4) return null;
  const money1 = row1.filter(isMoneyOrCount).length;
  const money2 = row2.filter(isMoneyOrCount).length;
  if (money1 < 3 || money2 < 3) return null;
  if (Math.abs(money1 - money2) > 2) return null;
  return [row1, row2];
}

/**
 * Both footers live in ONE &lt;tr&gt;: every cell stacks the Sub Total value over
 * the Grand Total value, and the label cell spans the identity columns.
 * @param {{lines: string[], span: number}[]} cells
 * @returns {string[][] | null}
 */
export function splitStackedFooterCells(cells) {
  if (!Array.isArray(cells) || cells.length < 4) return null;

  const top = [];
  const bottom = [];
  let stackedCount = 0;
  for (const cell of cells) {
    const lines = (cell?.lines || []).map((line) => cellText(line)).filter((line) => line !== "");
    if (lines.length === 2) {
      stackedCount += 1;
      top.push(lines[0]);
      bottom.push(lines[1]);
    } else if (lines.length === 0) {
      top.push("");
      bottom.push("");
    } else {
      return null;
    }
    // A colspan cell covers the identity columns the amounts must clear —
    // keep those blanks so the paste lands where a full-table copy would.
    const span = Math.max(1, Number(cell?.span) || 1);
    for (let i = 1; i < span; i += 1) {
      top.push("");
      bottom.push("");
    }
  }
  if (stackedCount < 4) return null;

  const first = top.find((cell) => cellText(cell) !== "");
  const second = bottom.find((cell) => cellText(cell) !== "");
  const pair =
    (isSubTotalLabel(first) && isGrandTotalLabel(second)) ||
    (isGrandTotalLabel(first) && isSubTotalLabel(second));
  if (!pair) return null;
  return [top, bottom];
}

/** Text lines of a cell, treating &lt;br&gt; and block children as line breaks. */
function stackedCellLines(td) {
  const clone = td.cloneNode(true);
  clone.querySelectorAll("br").forEach((br) => br.replaceWith(clone.ownerDocument.createTextNode("\n")));
  clone.querySelectorAll("div, p, li, tr").forEach((block) => {
    block.appendChild(clone.ownerDocument.createTextNode("\n"));
  });
  return String(clone.textContent || "").split("\n");
}

function splitStackedFooterRow(tr) {
  const cells = Array.from(tr.querySelectorAll("td, th")).map((td) => ({
    lines: stackedCellLines(td),
    span: Math.max(1, Number(td.getAttribute("colspan") || td.colSpan || 1)),
  }));
  return splitStackedFooterCells(cells);
}

function parseHtmlFooterOnlyTable(html) {
  if (!html || typeof document === "undefined") return null;
  if (!/<table\b/i.test(html) && !/<tr\b/i.test(html)) return null;
  try {
    const root = document.createElement("div");
    root.innerHTML = String(html);
    const table = root.querySelector("table") || root;
    const trs = Array.from(table.querySelectorAll("tr")).filter((tr) =>
      cellText(tr.textContent),
    );
    const rows = trs
      .map((tr) => {
        const cells = [];
        Array.from(tr.querySelectorAll("td, th")).forEach((td) => {
          const span = Math.max(1, Number(td.getAttribute("colspan") || td.colSpan || 1));
          cells.push(cellText(td.textContent));
          for (let i = 1; i < span; i += 1) cells.push("");
        });
        return cells;
      })
      .filter((row) => row.some((cell) => cellText(cell) !== ""));
    if (!rows.length) return null;

    if (trs.length === 1) {
      const stacked = splitStackedFooterRow(trs[0]);
      if (stacked) return stacked;
    }

    if (rows.length === 2) {
      const a = rows[0].find((cell) => cellText(cell) !== "");
      const b = rows[1].find((cell) => cellText(cell) !== "");
      if (
        (isSubTotalLabel(a) && isGrandTotalLabel(b)) ||
        (isGrandTotalLabel(a) && isSubTotalLabel(b))
      ) {
        return rows;
      }
    }

    const filled = rows.map((row) => row.map(cellText).filter(Boolean));
    if (filled.length >= 4 && filled[0].length === 2) {
      const [leftLabel, rightLabel] = filled[0];
      if (
        isFooterPairLabel(leftLabel) &&
        isFooterPairLabel(rightLabel) &&
        isSubTotalLabel(leftLabel) !== isSubTotalLabel(rightLabel)
      ) {
        const left = [leftLabel];
        const right = [rightLabel];
        for (let i = 1; i < filled.length; i += 1) {
          if (filled[i].length !== 2) return null;
          if (!isMoneyOrCount(filled[i][0]) || !isMoneyOrCount(filled[i][1])) return null;
          left.push(filled[i][0]);
          right.push(filled[i][1]);
        }
        return [left, right];
      }
    }

    const tokens = filled.flat();
    return deinterleaveAdjacentFooterLabels(tokens) || reshapeVerticalFooterTokens(tokens.join("\n"));
  } catch {
    return null;
  }
}

function htmlToPlain(html) {
  const raw = String(html ?? "");
  if (!raw.trim()) return "";
  if (typeof document !== "undefined") {
    try {
      const root = document.createElement("div");
      root.innerHTML = raw;
      return String(root.innerText || root.textContent || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
    } catch {
      /* fall through */
    }
  }
  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:tr|p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "\t")
    .replace(/\t+/g, "\t");
}

/**
 * @returns {string[][] | null}
 */
export function tryBuildFooterOnlySubGrandMatrix(pastedData, html) {
  if (clipboardLooksLikeCitibet(pastedData, html)) return null;

  const fromHtml = parseHtmlFooterOnlyTable(html);
  if (fromHtml?.length === 2) return alignFooterOnlySubGrandMatrix(fromHtml);

  const text = String(pastedData ?? "").trim() ? pastedData : "";
  if (!looksLikeFooterOnlySubGrandPlain(text) && !looksLikeFooterOnlySubGrandPlain(htmlToPlain(html))) {
    return null;
  }

  const source = looksLikeFooterOnlySubGrandPlain(text) ? text : htmlToPlain(html);

  const tabRows = parseTwoTabFooterRows(source);
  if (tabRows) return alignFooterOnlySubGrandMatrix(tabRows);

  const vertical = reshapeVerticalFooterTokens(source);
  if (vertical) return alignFooterOnlySubGrandMatrix(vertical);

  return null;
}

export function tryHandleFooterOnlySubGrandPaste(html, pastedData, applyOptions = {}) {
  const matrix = tryBuildFooterOnlySubGrandMatrix(pastedData, html);
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
  notifyPasteSuccess(`成功粘贴 Win Lose Total ${maxRows} 行 x ${maxCols} 列`);
  return true;
}
