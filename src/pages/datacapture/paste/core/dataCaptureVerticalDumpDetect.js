/**
 * Detect Material / Report-Center "one field per line" clipboard dumps and
 * reshape them into horizontal Excel-like rows for 1.TEXT / 2.Format.
 *
 * Source sites often copy:
 *   SDSPDA95\n3,000\n$0.00\n…\nSUBTOTAL\n…
 * instead of tab-separated rows. Without reshape, paste lands as N×1 vertical.
 */

/** Normalize clipboard token noise before numeric / summary checks. */
export function normalizeVerticalDumpToken(text) {
  return String(text ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
    .replace(/[＄￥]/g, "$")
    .replace(/\u201a/g, ",") // SINGLE LOW-9 QUOTATION MARK used as thousands sep
    .replace(/\u066c/g, ",") // Arabic thousands separator
    .replace(/\s+/g, " ")
    .trim();
}

export function isVerticalDumpMoneyToken(text) {
  const cleaned = normalizeVerticalDumpToken(text)
    .replace(/[,$]/g, "")
    .replace(/^\((.*)\)$/, "-$1")
    .trim();
  if (!cleaned) return false;
  return /^-?\d+(?:\.\d+)?$/.test(cleaned);
}

export function isVerticalDumpSummaryLabel(text) {
  const normalized = normalizeVerticalDumpToken(text)
    .replace(/:$/, "")
    .toUpperCase();
  return (
    normalized === "SUBTOTAL" ||
    normalized === "SUB TOTAL" ||
    normalized === "TOTAL AMOUNT" ||
    normalized === "TOTAL" ||
    normalized === "GRAND TOTAL"
  );
}

function isDenseReportRow(row) {
  if (!row || row.length < 3) return false;
  if (isVerticalDumpMoneyToken(row[0])) return false;
  const nums = row.filter((cell) => isVerticalDumpMoneyToken(cell)).length;
  return nums >= 2 && nums >= Math.ceil(row.length * 0.5);
}

/** Agent/account-like or summary labels — not prose headers like "Amount". */
function looksLikeReportRowLabel(token) {
  if (isVerticalDumpSummaryLabel(token)) return true;
  const t = normalizeVerticalDumpToken(token);
  if (!t || t.length < 3) return false;
  // Reject single Title-case prose words (Amount, Name, …).
  if (/^[A-Z][a-z]+$/.test(t)) return false;
  // Agent/account codes: letters required; digits optional (AGENTA / SDSPDA95).
  return /^[A-Z0-9][A-Z0-9_-]{2,}$/i.test(t) && /[A-Za-z]/.test(t);
}

function isDroppableTrailingLeftover(leftover, width) {
  if (!leftover.length) return true;
  const leftoverNums = leftover.filter((t) => isVerticalDumpMoneyToken(t)).length;
  if (leftoverNums === 0) return true;
  if (!isVerticalDumpMoneyToken(leftover[0]) && leftover.length < width) return true;
  return false;
}

/** DataTables / Material paginator chrome often appended by drag-to-end. */
function looksLikePaginatorChrome(token) {
  const upper = normalizeVerticalDumpToken(token).toUpperCase();
  if (!upper) return false;
  if (/^SHOWING\s+\d+\s+TO\s+\d+\s+OF\s+\d+/i.test(upper)) return true;
  if (/^NO\.\s*\d+/i.test(upper) && /ITEMS/i.test(upper)) return true;
  if (/TOTALLY\s+\d+\s+ITEMS/i.test(upper)) return true;
  return (
    upper === "SHOWING" ||
    upper === "ENTRIES" ||
    upper === "ITEMS" ||
    upper === "TOTALLY" ||
    upper === "ITEM" ||
    upper === "OF" ||
    upper === "TO" ||
    upper === "NO." ||
    upper === "NO"
  );
}

function stripTrailingPaginatorTokens(tokens) {
  let end = tokens.length;
  while (end > 0 && looksLikePaginatorChrome(tokens[end - 1])) end -= 1;
  // Also drop a trailing short numeric stub left by "No. 1 - 1 …"
  while (end > 0) {
    const t = tokens[end - 1];
    if (looksLikePaginatorChrome(t)) {
      end -= 1;
      continue;
    }
    if (/^\d{1,4}$/.test(normalizeVerticalDumpToken(t)) && end < tokens.length) {
      // Only strip bare page numbers when we already peeled chrome after them.
      break;
    }
    break;
  }
  return tokens.slice(0, end);
}

/** True when a single line already looks like a multi-column report row. */
function lineLooksAlreadyMultiColumn(token) {
  const text = String(token ?? "");
  if (text.includes("\t")) return true;
  const parts = text
    .split(/\s{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 3) return false;
  const nums = parts.filter((p) => isVerticalDumpMoneyToken(p)).length;
  return nums >= 2;
}

/**
 * Prefer width from SUBTOTAL / TOTAL AMOUNT spacing (Material agent statements).
 * @returns {number | null}
 */
function detectSummaryStride(tokens) {
  const summaryIndices = [];
  tokens.forEach((token, index) => {
    if (isVerticalDumpSummaryLabel(token)) summaryIndices.push(index);
  });
  if (!summaryIndices.length) return null;

  const diffs = [];
  for (let i = 1; i < summaryIndices.length; i += 1) {
    const diff = summaryIndices[i] - summaryIndices[i - 1];
    if (diff >= 3 && diff <= 20) diffs.push(diff);
  }
  if (diffs.length) {
    const counts = new Map();
    diffs.forEach((diff) => counts.set(diff, (counts.get(diff) || 0) + 1));
    let best = diffs[0];
    let bestCount = 0;
    counts.forEach((count, diff) => {
      if (count > bestCount || (count === bestCount && diff > best)) {
        best = diff;
        bestCount = count;
      }
    });
    return best;
  }

  const firstIdx = summaryIndices[0];
  // Header row + data row before SUBTOTAL → index ≈ 2× width.
  // Check before treating firstIdx as width (headers alone can push SUBTOTAL to 16–20).
  if (firstIdx >= 6 && firstIdx <= 40 && firstIdx % 2 === 0) {
    const half = firstIdx / 2;
    if (half >= 3 && half <= 20) {
      const firstHalf = tokens.slice(0, half);
      const secondHalf = tokens.slice(half, firstIdx);
      const firstHalfAllLabels = firstHalf.every((t) => !isVerticalDumpMoneyToken(t));
      if (firstHalfAllLabels && secondHalf.length === half) return half;
    }
  }
  // Agent row then SUBTOTAL → first summary index === row width.
  if (firstIdx >= 3 && firstIdx <= 20) return firstIdx;
  return null;
}

function chunkTokensToRows(tokens, width, { requireDense = true } = {}) {
  if (!width || width < 3 || tokens.length < width) return null;

  const rows = [];
  for (let i = 0; i < tokens.length; i += width) {
    const chunk = tokens.slice(i, i + width);
    if (chunk.length < width) {
      if (!isDroppableTrailingLeftover(chunk, width)) return null;
      break;
    }
    rows.push(chunk);
  }
  if (!rows.length) return null;
  if (requireDense && !rows.every((row) => isDenseReportRow(row))) return null;
  return rows;
}

/**
 * DataTables / Material copies often prepend column-title tokens. Find the best
 * "label + consecutive numbers" anchor (no fixed width).
 */
function tryParseAnchoredVerticalRows(tokens) {
  if (tokens.length < 3) return null;

  let best = null;

  for (let start = 0; start < tokens.length - 2; start += 1) {
    if (isVerticalDumpMoneyToken(tokens[start])) continue;
    // Skip prose headers (e.g. "Amount") — only agent/summary-like anchors.
    if (!looksLikeReportRowLabel(tokens[start])) continue;

    let end = start + 1;
    while (end < tokens.length && isVerticalDumpMoneyToken(tokens[end])) end += 1;
    const consecutiveNums = end - start - 1;
    if (consecutiveNums < 2) continue;

    const width = consecutiveNums + 1;
    if (width < 3) continue;

    const dataTokens = tokens.slice(start);
    const completeRows = Math.floor(dataTokens.length / width);
    if (completeRows < 1) continue;

    const rows = [];
    for (let r = 0; r < completeRows; r += 1) {
      rows.push(dataTokens.slice(r * width, (r + 1) * width));
    }
    if (!rows.every((row) => isDenseReportRow(row))) continue;

    const rem = dataTokens.length % width;
    if (rem > 0) {
      const leftover = dataTokens.slice(completeRows * width);
      if (!isDroppableTrailingLeftover(leftover, width)) continue;
    }

    if (
      !best ||
      completeRows > best.completeRows ||
      (completeRows === best.completeRows && width > best.width)
    ) {
      best = { rows, width, completeRows };
    }
  }

  if (!best) return null;
  best.rows.forEach((row) => {
    while (row.length < best.width) row.push("");
  });
  return best.rows;
}

/**
 * Summary-label stride path for Agent / SUBTOTAL / TOTAL AMOUNT statements.
 */
function tryParseSummaryStrideRows(tokens) {
  const width = detectSummaryStride(tokens);
  if (!width) return null;

  const firstSummary = tokens.findIndex((token) => isVerticalDumpSummaryLabel(token));
  let start = 0;
  if (firstSummary > width && firstSummary % width === 0) {
    // Only skip a leading header strip when that strip is all labels (column titles),
    // not a dense agent data row (e.g. two agents before SUBTOTAL).
    if (firstSummary === width * 2) {
      const firstHalf = tokens.slice(0, width);
      const firstHalfAllLabels = firstHalf.every((t) => !isVerticalDumpMoneyToken(t));
      if (firstHalfAllLabels) start = width;
    }
  } else if (firstSummary === width) {
    // Data row then SUBTOTAL — keep from 0.
    start = 0;
  } else if (firstSummary > width) {
    // Try anchoring at firstSummary - width (start of the row before SUBTOTAL).
    const candidate = firstSummary - width;
    if (candidate >= 0 && !isVerticalDumpMoneyToken(tokens[candidate])) {
      start = candidate;
    }
  }

  const dataTokens = tokens.slice(start);
  const rows = chunkTokensToRows(dataTokens, width, { requireDense: true });
  if (rows?.length) return rows;

  // Allow first incomplete header strip: skip leading non-dense tokens until a dense row fits.
  for (let offset = 0; offset <= Math.min(width, dataTokens.length - width); offset += 1) {
    const sliced = dataTokens.slice(offset);
    const retry = chunkTokensToRows(sliced, width, { requireDense: true });
    if (retry?.length) return retry;
  }
  return null;
}

/**
 * Wrap reshaped rows as `{ width, rows }` (Plan B public shape).
 * @param {string[][]} rows
 * @returns {{ width: number, rows: string[][] } | null}
 */
function asVerticalDumpResult(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const width = Math.max(...rows.map((row) => (Array.isArray(row) ? row.length : 0)));
  if (width < 2) return null;
  const normalized = rows.map((row) => {
    const next = Array.isArray(row) ? [...row] : [row];
    while (next.length < width) next.push("");
    return next;
  });
  return { width, rows: normalized };
}

/**
 * Detect vertical field dump and reshape to horizontal rows.
 *
 * Plan B: detection + row-cut only. Callers (parsePlainTextMatrix) own apply.
 *
 * @param {string[]} nonEmptyLines
 * @returns {{ width: number, rows: string[][] } | null}
 */
export function detectVerticalFieldDump(nonEmptyLines) {
  if (!Array.isArray(nonEmptyLines) || nonEmptyLines.length < 3) return null;

  const rawTokens = nonEmptyLines
    .map((line) => normalizeVerticalDumpToken(line))
    .filter(Boolean);
  if (rawTokens.length < 3) return null;

  // Already mostly multi-column lines → leave for spacing/tab paths.
  // (Do NOT abort on a single token that happens to contain double spaces.)
  const multiColCount = rawTokens.filter((token) => lineLooksAlreadyMultiColumn(token)).length;
  if (multiColCount >= Math.max(2, Math.ceil(rawTokens.length * 0.5))) return null;
  if (rawTokens.some((token) => token.includes("\t"))) return null;

  const tokens = stripTrailingPaginatorTokens(rawTokens);
  if (tokens.length < 3) return null;

  const numericLikeCount = tokens.filter((token) => isVerticalDumpMoneyToken(token)).length;
  if (numericLikeCount < 2) return null;

  // 1) Statement summary stride (Agent + SUBTOTAL / TOTAL AMOUNT) — highest confidence.
  const summaryRows = tryParseSummaryStrideRows(tokens);
  if (summaryRows) return asVerticalDumpResult(summaryRows);

  // 2) Anchor on first dense label+numbers block (skips column-title headers).
  const anchoredRows = tryParseAnchoredVerticalRows(tokens);
  if (anchoredRows) return asVerticalDumpResult(anchoredRows);

  // Without a header-stripped anchor, require overall numeric density.
  if (numericLikeCount < Math.ceil(tokens.length * 0.5)) return null;

  const labelIndices = [];
  tokens.forEach((token, index) => {
    if (!isVerticalDumpMoneyToken(token)) labelIndices.push(index);
  });

  // Pure numeric column paste — keep as vertical 1-col (intentional list).
  if (labelIndices.length === 0) return null;

  // Multiple report rows: non-numeric labels at a steady stride → row width.
  if (labelIndices.length >= 2) {
    const diffs = [];
    for (let i = 1; i < labelIndices.length; i += 1) {
      diffs.push(labelIndices[i] - labelIndices[i - 1]);
    }
    const stride = diffs[0];
    const steady =
      stride >= 3 && diffs.every((diff) => diff === stride) && labelIndices[0] === 0;
    if (steady) {
      const rows = chunkTokensToRows(tokens, stride, { requireDense: true });
      if (rows) return asVerticalDumpResult(rows);
    }
  }

  // Single crushed report row: leading agent/summary label + dense money fields.
  // Do NOT reshape "Header\n1\n2\n3" intentional 1-col pastes.
  if (
    labelIndices.length <= 2 &&
    labelIndices[0] === 0 &&
    isDenseReportRow(tokens) &&
    looksLikeReportRowLabel(tokens[0])
  ) {
    return asVerticalDumpResult([tokens]);
  }

  return null;
}

/**
 * Flattened statement matrix when every cell is already one line but summaries
 * mark a fixed column width (legacy path used by parsePlainTextMatrix).
 *
 * @param {string[]} nonEmptyLines
 * @returns {string[][] | null}
 */
export function detectFlattenedStatementMatrix(nonEmptyLines) {
  if (!Array.isArray(nonEmptyLines) || nonEmptyLines.length < 8) return null;

  const tokens = nonEmptyLines.map((line) => normalizeVerticalDumpToken(line)).filter(Boolean);
  const numericLikeCount = tokens.filter((token) => isVerticalDumpMoneyToken(token)).length;
  if (numericLikeCount < Math.ceil(tokens.length * 0.4)) return null;

  const colCount = detectSummaryStride(tokens);
  if (!colCount || colCount < 2) return null;

  let start = 0;
  const firstSummary = tokens.findIndex((token) => isVerticalDumpSummaryLabel(token));
  if (firstSummary > colCount && firstSummary % colCount === 0) {
    if (firstSummary === colCount * 2) start = colCount;
  }

  const dataTokens = tokens.slice(start);
  const dataRows = [];
  for (let i = 0; i < dataTokens.length; i += colCount) {
    const chunk = dataTokens.slice(i, i + colCount);
    if (chunk.length < colCount) break;
    dataRows.push(chunk);
  }
  if (dataRows.length < 2) return null;

  const hasSummaryRow = dataRows.some((row) => row.length && isVerticalDumpSummaryLabel(row[0]));
  if (!hasSummaryRow) return null;

  return dataRows;
}
