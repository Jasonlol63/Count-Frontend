/**
 * Shared paste-matrix cleanup for 1.TEXT + 2.Format (over-select trim only).
 * Total-row empty cells between label and first number are preserved 1:1.
 */

function cellValue(cell) {
  if (cell != null && typeof cell === "object" && "value" in cell) {
    return String(cell.value ?? "").trim();
  }
  return String(cell ?? "").trim();
}

function makeBlankCellLike(row) {
  const sample = row?.find((cell) => cell != null && typeof cell === "object" && "value" in cell);
  return sample ? { value: "" } : "";
}

function isMoneyOrNumberLikeToken(text) {
  const cleaned = String(text ?? "")
    .trim()
    .replace(/[,$]/g, "")
    .replace(/^\((.*)\)$/, "-$1");
  if (!cleaned) return false;
  return /^-?\d+(?:\.\d+)?$/.test(cleaned);
}

function isPaginatorToken(text) {
  const upper = String(text ?? "")
    .trim()
    .replace(/:$/, "")
    .toUpperCase();
  return (
    upper === "SHOWING" ||
    upper === "ENTRIES" ||
    upper === "TO" ||
    upper === "OF" ||
    /^\d{1,4}$/.test(upper)
  );
}

/** Paginator / info chrome row (DataTables drag-to-end over-select). */
export function rowLooksLikePaginatorRow(row) {
  if (!Array.isArray(row)) return false;
  const tokens = row.map((cell) => cellValue(cell)).filter(Boolean);
  if (!tokens.length) return true;
  if (tokens.every((token) => isPaginatorToken(token))) return true;
  const joined = tokens.join(" ").replace(/\s+/g, " ").trim();
  return /^Showing\s+\d+\s+to\s+\d+\s+of\s+\d+/i.test(joined);
}

function countNonEmpty(row) {
  if (!Array.isArray(row)) return 0;
  return row.filter((cell) => cellValue(cell) !== "").length;
}

/** Drop trailing empty tab/HTML columns after drag-to-end over-select. */
export function trimTrailingEmptyColumns(matrix) {
  if (!matrix?.length) return matrix;

  let lastNonEmpty = -1;
  matrix.forEach((row) => {
    for (let i = row.length - 1; i >= 0; i -= 1) {
      if (cellValue(row[i]) !== "") {
        lastNonEmpty = Math.max(lastNonEmpty, i);
        break;
      }
    }
  });
  if (lastNonEmpty < 0) return matrix;

  const width = lastNonEmpty + 1;
  return matrix.map((row) => {
    const next = row.slice(0, width);
    while (next.length < width) next.push(makeBlankCellLike(row));
    return next;
  });
}

function isSummaryLabelToken(text) {
  const normalized = String(text ?? "")
    .trim()
    .replace(/:$/, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
  return (
    normalized === "SUBTOTAL" ||
    normalized === "SUB TOTAL" ||
    normalized === "TOTAL AMOUNT" ||
    normalized === "TOTAL" ||
    normalized === "GRAND TOTAL" ||
    normalized === "GRANDTOTAL"
  );
}

/**
 * Real footer total rows often have fewer filled cells than body (no serial / code),
 * but still carry many amount columns — must not be treated as over-select stubs.
 */
function rowLooksLikeKeptSummaryTotalRow(row, bodyWidth) {
  if (!Array.isArray(row)) return false;
  const tokens = row.map((cell) => cellValue(cell)).filter(Boolean);
  if (!tokens.length || !isSummaryLabelToken(tokens[0])) return false;

  const moneyCount = tokens.filter((token) => isMoneyOrNumberLikeToken(token)).length;
  if (moneyCount < 2) return false;

  const minKeepWidth = Math.max(3, Math.ceil(bodyWidth * 0.5));
  const minKeepMoney = Math.max(2, Math.ceil(bodyWidth * 0.35));
  return tokens.length >= minKeepWidth || moneyCount >= minKeepMoney;
}

/** Drop trailing empty / paginator / truncated stub rows (loop for multi-line chrome). */
export function dropTrailingJunkRows(matrix) {
  if (!Array.isArray(matrix) || matrix.length < 2) return matrix;

  let next = [...matrix];
  while (next.length > 1) {
    const last = next[next.length - 1];
    if (rowLooksLikePaginatorRow(last)) {
      next = next.slice(0, -1);
      continue;
    }

    const bodyWidths = next.slice(0, -1).map(countNonEmpty);
    const bodyWidth = Math.max(0, ...bodyWidths);
    if (bodyWidth < 3) break;

    const lastTokens = last.map((cell) => cellValue(cell)).filter(Boolean);
    if (!lastTokens.length) {
      next = next.slice(0, -1);
      continue;
    }

    // Keep SUBTOTAL / GRANDTOTAL footers even when narrower than body rows.
    if (rowLooksLikeKeptSummaryTotalRow(last, bodyWidth)) {
      break;
    }

    const lastWidth = lastTokens.length;
    if (lastWidth >= bodyWidth - 1) break;

    const first = lastTokens[0];
    if (!isMoneyOrNumberLikeToken(first) && lastWidth < bodyWidth) {
      next = next.slice(0, -1);
      continue;
    }
    break;
  }
  return next;
}

/** @deprecated use dropTrailingJunkRows */
export function dropTrailingIncompleteRows(matrix) {
  return dropTrailingJunkRows(matrix);
}

/**
 * Plain string[][] or format cell matrix — trim trailing over-select chrome only.
 * @param {Array<Array<string|object>>} matrix
 */
export function sanitizePasteMatrix(matrix) {
  if (!Array.isArray(matrix) || !matrix.length) return matrix;
  let next = trimTrailingEmptyColumns(matrix);
  next = dropTrailingJunkRows(next);
  next = trimTrailingEmptyColumns(next);
  return next;
}

/** True when clipboard plain TSV parses to a usable multi-column matrix. */
export function plainTabTextLooksPasteable(text) {
  if (!text || !String(text).includes("\t")) return false;
  const lines = String(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim() !== "" && line.includes("\t"));
  if (!lines.length) return false;
  const widths = lines.map((line) => line.split("\t").length);
  const maxCols = Math.max(...widths);
  return maxCols >= 2;
}

/** Sanitized plain matrix is usable as the alignment source of truth. */
export function plainMatrixLooksReliable(matrix) {
  if (!Array.isArray(matrix) || matrix.length < 1) return false;
  const cols = matrix[0]?.length || 0;
  if (cols < 2) return false;
  // N×1 vertical dump is never a reliable alignment source.
  if (matrix.length > 1 && cols === 1) return false;
  const widths = matrix.map((row) => (Array.isArray(row) ? row.length : 0));
  const maxW = Math.max(...widths);
  const minW = Math.min(...widths);
  return maxW >= 2 && maxW - minW <= 1;
}

/**
 * Grill rule: with plain TSV present, HTML/format matrix must match plain shape
 * (same row count + width). Fewer rows means lost footers (SUBTOTAL/GRANDTOTAL).
 */
export function matrixAlignsWithPlainSource(bodyMatrix, plainMatrix) {
  if (!plainMatrixLooksReliable(plainMatrix)) return false;
  if (!Array.isArray(bodyMatrix) || !bodyMatrix.length) return false;

  const plainRows = plainMatrix.length;
  const plainCols = plainMatrix[0].length;
  const bodyRows = bodyMatrix.length;
  const bodyCols = Math.max(0, ...bodyMatrix.map((row) => (Array.isArray(row) ? row.length : 0)));

  if (bodyCols < 2) return false;
  if (bodyRows !== plainRows) return false;
  // Plain TSV is source of truth — widths must match (Total empties kept 1:1).
  if (Math.abs(bodyCols - plainCols) > 0) return false;
  return true;
}

/** Structure heuristic when no reliable plain TSV exists. */
export function matrixPassesStructureHeuristic(matrix) {
  if (!Array.isArray(matrix) || !matrix.length) return false;
  const cols = Math.max(0, ...matrix.map((row) => (Array.isArray(row) ? row.length : 0)));
  if (cols < 2) return false;
  if (matrix.length > 1 && cols === 1) return false;
  return true;
}
