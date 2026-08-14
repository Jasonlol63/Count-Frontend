/**
 * Universal PDF table-row clipboard helper for 1.TEXT / 2.FORMAT.
 *
 * Browser PDF copies often flatten a table row into one line with no tabs:
 *   multi-space:  "Brand Name    PT    7.50    (MYR) 171.50    12.86"
 *   single-space: "Brand Name - Foo PT 7.50 (MYR) 171.50 12.86"
 *
 * Not vendor-specific. Callers use {@link tryReshapePdfTablePlainMatrix};
 * returns null when clipboard is not a flattened table row dump (TSV,
 * free text, other report shapes).
 */

const CURRENCY_PAREN_RE = /^\([A-Za-z]{3}\)$/;
const MONEY_RE = /^-?\$?[\d,]+(?:\.\d+)?$/;
const TOTAL_LABEL_RE = /^(?:GRAND\s*TOTAL|SUB\s*TOTAL|SUBTOTAL|NET\s*SUB\s*TOTAL|TOTAL)$/i;
const CURRENCY_CODE_RE =
  /^(MYR|USD|SGD|HKD|CNY|THB|IDR|VND|EUR|GBP|AUD|JPY|KHR|USDT)$/i;

function normalizeLine(line) {
  return String(line ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .trim();
}

function isMoneyToken(token) {
  const t = String(token ?? "").trim();
  if (!t || !MONEY_RE.test(t)) return false;
  return /\d/.test(t);
}

function isCurrencyParen(token) {
  return CURRENCY_PAREN_RE.test(String(token ?? "").trim());
}

/** Short code like PT / FT — only when not a 3-letter currency. */
function isShortTypeCode(token) {
  const t = String(token ?? "").trim();
  if (!/^[A-Za-z]{2,4}$/.test(t)) return false;
  if (CURRENCY_CODE_RE.test(t)) return false;
  return true;
}

function countMoneyLike(cells) {
  return cells.filter((c) => {
    const parts = String(c ?? "").trim().split(/\s+/);
    if (parts.length === 2 && isCurrencyParen(parts[0]) && isMoneyToken(parts[1])) {
      return true;
    }
    return isMoneyToken(c);
  }).length;
}

/**
 * Split one flattened PDF table line into columns.
 * Order of strategies:
 * 1) multi-space column gaps (PDF column padding)
 * 2) total/footer "Grand Total 12.86"
 * 3) structural smart split (label + type + numbers + (CUR) amounts)
 * @returns {string[] | null}
 */
export function trySplitPdfTableLine(line) {
  const raw = String(line ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\t+/g, "  ")
    .trim();
  if (!raw) return null;

  // 1) Multi-space columns — most faithful when PDF pads between cells.
  const multi = raw
    .split(/\s{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (multi.length >= 3 && countMoneyLike(multi) >= 1) {
    return mergeCurrencyParenCells(multi);
  }

  const single = normalizeLine(raw);
  const words = single.split(" ").filter(Boolean);
  if (words.length < 2) return null;

  // 2) Footer rows
  if (words.length >= 2 && words.length <= 5) {
    const last = words[words.length - 1];
    const label = words.slice(0, -1).join(" ");
    if (isMoneyToken(last) && TOTAL_LABEL_RE.test(label)) {
      return [label, last];
    }
  }

  // 3) Structural smart split for single-space collapse
  if (words.length < 4) return null;
  const smart = smartSplitCollapsedPdfWords(words);
  if (!smart || smart.length < 3) return null;
  if (countMoneyLike(smart) < 2) return null;
  // Need a non-money leading field (product / label). Leading row # is ok.
  const lead = String(smart[0] ?? "").trim();
  const leadIsRowNo = /^\d{1,4}$/.test(lead);
  const firstLabel = leadIsRowNo ? String(smart[1] ?? "").trim() : lead;
  if (!firstLabel || (isMoneyToken(firstLabel) && !/[A-Za-z]/.test(firstLabel))) {
    return null;
  }
  return smart;
}

/** Join consecutive "(MYR)" + "171.50" cells produced by multi-space split. */
function mergeCurrencyParenCells(cells) {
  const out = [];
  for (let i = 0; i < cells.length; i += 1) {
    const cur = cells[i];
    const next = cells[i + 1];
    if (isCurrencyParen(cur) && next && isMoneyToken(next)) {
      out.push(`${cur} ${next}`);
      i += 1;
      continue;
    }
    // One cell already holds "(MYR) 171.50"
    const m = String(cur).match(/^(\([A-Za-z]{3}\))\s+(-?[\d,]+(?:\.\d+)?)$/);
    if (m) {
      out.push(`${m[1]} ${m[2]}`);
      continue;
    }
    out.push(cur);
  }
  return out;
}

/**
 * Single-space dump: keep multi-word labels, emit type codes only when
 * followed by money, merge (CUR) + amount, emit money as own columns.
 */
function smartSplitCollapsedPdfWords(words) {
  const out = [];
  let label = "";
  let i = 0;

  const flushLabel = () => {
    const t = label.trim();
    if (t) out.push(t);
    label = "";
  };

  // Optional leading row index only while next tokens look non-numeric-only row.
  if (
    words.length >= 5 &&
    /^\d{1,4}$/.test(words[0]) &&
    !isMoneyToken(words[1]) &&
    /[A-Za-z]/.test(words[1] || "")
  ) {
    out.push(words[0]);
    i = 1;
  }

  while (i < words.length) {
    const word = words[i];
    const next = words[i + 1];
    const next2 = words[i + 2];

    // (CUR) amount → one cell
    if (isCurrencyParen(word) && next && isMoneyToken(next)) {
      flushLabel();
      out.push(`${word} ${next}`);
      i += 2;
      continue;
    }

    // TYPE code only when next token is money (avoids mid-brand "LC")
    if (isShortTypeCode(word) && next && isMoneyToken(next)) {
      flushLabel();
      out.push(word);
      i += 1;
      continue;
    }

    if (isMoneyToken(word)) {
      flushLabel();
      out.push(word);
      i += 1;
      continue;
    }

    // "TYPE:PT" style
    if (/^type:?$/i.test(word) && next && isShortTypeCode(next) && next2 && isMoneyToken(next2)) {
      flushLabel();
      out.push(next);
      i += 2;
      continue;
    }

    label = label ? `${label} ${word}` : word;
    i += 1;
  }
  flushLabel();
  return out;
}

/**
 * Gate: looks like flattened PDF table line(s), not free prose / dense TSV.
 */
export function looksLikePdfTablePlain(pastedData) {
  const lines = String(pastedData ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => String(line ?? "").replace(/\u00a0/g, " ").trim())
    .filter(Boolean);

  if (!lines.length || lines.length > 80) return false;

  let bodyHits = 0;
  for (const line of lines) {
    if (line.includes("\t") && line.split("\t").filter(Boolean).length >= 3) {
      // Already tabular — not our collapse case
      continue;
    }
    const split = trySplitPdfTableLine(line);
    if (split && split.length >= 3 && countMoneyLike(split) >= 2) {
      bodyHits += 1;
    }
  }
  return bodyHits >= 1;
}

/**
 * Reshape PDF table plain clipboard into a horizontal matrix.
 * @returns {string[][] | null}
 */
export function tryReshapePdfTablePlainMatrix(pastedData) {
  const text = String(pastedData ?? "");
  if (!text.trim()) return null;

  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => String(line ?? "").replace(/\u00a0/g, " ").trim())
    .filter(Boolean);

  // Dense TSV keeps empty cells — leave to aligned-TSV path.
  const tabHeavy =
    lines.length >= 2 &&
    lines.filter((line) => line.includes("\t")).length >= Math.ceil(lines.length * 0.6);
  if (tabHeavy) return null;

  if (!looksLikePdfTablePlain(pastedData)) return null;

  const rows = [];
  for (const line of lines) {
    if (line.includes("\t")) {
      const tabCells = line.split("\t").map((c) => c.trim()).filter(Boolean);
      if (tabCells.length >= 3 && countMoneyLike(tabCells) >= 1) {
        rows.push(mergeCurrencyParenCells(tabCells));
        continue;
      }
      const joined = trySplitPdfTableLine(tabCells.join(" "));
      if (joined) {
        rows.push(joined);
        continue;
      }
      continue;
    }

    const split = trySplitPdfTableLine(line);
    if (split) rows.push(split);
  }

  if (!rows.length) return null;
  // Need at least one multi-col body row (not only a 2-col total footer alone)
  if (!rows.some((row) => row.length >= 3 && countMoneyLike(row) >= 2)) return null;

  const maxCols = Math.max(...rows.map((row) => row.length));
  return rows.map((row) => {
    const next = [...row];
    while (next.length < maxCols) next.push("");
    return next;
  });
}

// Backward-compatible aliases (previous Gamingsoft-named API).
export const trySplitGamingsoftInvoiceLine = trySplitPdfTableLine;
export const looksLikeGamingsoftInvoicePlain = looksLikePdfTablePlain;
export const tryReshapeGamingsoftInvoicePlainMatrix = tryReshapePdfTablePlainMatrix;
