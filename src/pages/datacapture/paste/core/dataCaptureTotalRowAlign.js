/**
 * TOTAL / 总数 row column alignment — matches the PHP site's visible result.
 *
 * PHP 1.TEXT renders Chinese total rows (总数 / 合计 …) with numbers flush against
 * the label: `总数 | num1 | num2 | ...` starting in column 2. If the captured row
 * has a blank gap between the label and its first number, that gap is collapsed.
 * SUB TOTAL / GRAND TOTAL (2.Format) keep their name-column gap and are never
 * shifted here — PHP has no equivalent alignment on the format paste path.
 */

function trimCellValue(cell) {
  if (cell != null && typeof cell === "object" && "value" in cell) {
    return String(cell.value ?? "").trim();
  }
  return String(cell ?? "").trim();
}

function isBlankCell(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim() === "";
}

function isNumericSerial(value) {
  return /^\d+$/.test(value) && value.length <= 6;
}

function isAlphaCode(value) {
  return /^[A-Za-z]{2,8}\d*$/.test(value);
}

function isNameLike(value) {
  if (isBlankCell(value)) return false;
  const cleaned = String(value).replace(/,/g, "");
  if (/^-?\d+(\.\d+)?$/.test(cleaned)) return false;
  return true;
}

const CJK_TOTAL_LABELS = new Set(["总数", "总计", "合计", "總數", "總計", "合計"]);

function isTotalLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  const upper = raw.toUpperCase();
  if (upper === "TOTAL" || upper === "SUB TOTAL" || upper === "GRAND TOTAL") return true;
  return CJK_TOTAL_LABELS.has(raw);
}

function isNumericValue(value) {
  const cleaned = String(value ?? "").replace(/,/g, "").trim();
  if (cleaned === "") return false;
  return /^-?\d+(\.\d+)?$/.test(cleaned);
}

function rowFirstNonEmptyIndex(row) {
  for (let i = 0; i < row.length; i += 1) {
    if (!isBlankCell(trimCellValue(row[i]))) return i;
  }
  return -1;
}

function rowFirstNumericIndex(row) {
  for (let i = 0; i < row.length; i += 1) {
    if (isNumericValue(trimCellValue(row[i]))) return i;
  }
  return -1;
}

/** True for 1.TEXT-style Chinese total rows (总数 / 合计 …), not SUB/GRAND TOTAL. */
function isTextStyleTotalLabel(value) {
  const raw = String(value || "").trim();
  return CJK_TOTAL_LABELS.has(raw);
}

/** A 1.TEXT total row: first non-empty cell is a Chinese total label. */
function rowIsTextStyleTotalRow(row) {
  if (!Array.isArray(row)) return false;
  const idx = rowFirstNonEmptyIndex(row);
  if (idx < 0) return false;
  return isTextStyleTotalLabel(trimCellValue(row[idx]));
}

function makeBlankCellLike(row) {
  const sample = row.find((cell) => cell != null && typeof cell === "object" && "value" in cell);
  return sample ? { value: "" } : "";
}

function rowHasTotalLabel(row) {
  if (!Array.isArray(row)) return false;
  for (let i = 0; i < Math.min(row.length, 4); i += 1) {
    if (isTotalLabel(trimCellValue(row[i]))) return true;
  }
  return false;
}

/** True when regular rows use serial | code | name before numeric columns. */
export function matrixHasNameColumnPattern(matrix) {
  if (!Array.isArray(matrix) || matrix.length < 2) return false;

  let matches = 0;
  for (const row of matrix) {
    if (!Array.isArray(row) || row.length < 3) continue;

    const col0 = trimCellValue(row[0]);
    const col1 = trimCellValue(row[1]);
    const col2 = trimCellValue(row[2]);

    if (rowHasTotalLabel(row)) continue;
    if (isNumericSerial(col0) && isAlphaCode(col1) && isNameLike(col2)) {
      matches += 1;
      if (matches >= 1) return true;
    }
  }

  return false;
}

/**
 * Preserve the source TOTAL row exactly as pasted (matches PHP).
 *
 * PHP renders the captured row as-is — it neither inserts a name-column gap nor
 * removes one — so this is intentionally a no-op.
 */
export function alignTotalRowArray(row) {
  return row;
}

/**
 * Collapse the blank gap between a TOTAL / 总数 label and its first number so the
 * total row's numbers start in column 2 (matches PHP). Cells after the first
 * number keep their order; row length is preserved by padding blanks at the end.
 *
 * @param {Array<Array<string|object>>} matrix
 * @returns {Array<Array<string|object>>}
 */
export function alignTotalRowsInMatrix(matrix) {
  if (!Array.isArray(matrix) || !matrix.length) return matrix;
  if (!matrix.some(rowIsTextStyleTotalRow)) return matrix;

  let changed = false;
  const aligned = matrix.map((row) => {
    if (!Array.isArray(row) || !rowIsTextStyleTotalRow(row)) return row;

    const labelIdx = rowFirstNonEmptyIndex(row);
    const numIdx = rowFirstNumericIndex(row);
    if (numIdx <= labelIdx + 1) return row;

    const gap = numIdx - (labelIdx + 1);
    const next = [...row];
    next.splice(labelIdx + 1, gap);
    for (let i = 0; i < gap; i += 1) next.push(makeBlankCellLike(row));
    changed = true;
    return next;
  });

  if (changed) {
    console.log("Collapsed TOTAL row label gap so numbers start in column 2 (matches PHP).");
  }

  return aligned;
}

function getSnapshotDataText(rowData, dataColIndex) {
  const cell = rowData[dataColIndex + 1];
  if (!cell || cell.type !== "data") return "";
  return String(cell.value || "").trim();
}

export function alignSnapshotRow(rowData) {
  if (!Array.isArray(rowData) || rowData.length < 4) return rowData;

  const values = [];
  for (let i = 0; i < rowData.length - 1; i += 1) {
    values.push(getSnapshotDataText(rowData, i));
  }

  const alignedValues = alignTotalRowArray(values);
  if (alignedValues === values) return rowData;

  const next = [rowData[0]];
  for (let i = 0; i < alignedValues.length; i += 1) {
    const prev = rowData[i + 1];
    const value = alignedValues[i];
    if (prev?.type === "data") {
      next.push({ ...prev, value, col: i });
    } else {
      next.push({ type: "data", value, col: i });
    }
  }

  return next;
}

/**
 * Submit-time snapshot fix (same rule as paste matrix alignment).
 * @param {object} tableData
 * @returns {object}
 */
export function alignTotalRowsInSnapshot(tableData) {
  if (!tableData?.rows?.length) return tableData;

  const probe = tableData.rows.map((rowData) => {
    const values = [];
    for (let i = 0; i < Math.max(0, (rowData?.length || 1) - 1); i += 1) {
      values.push(getSnapshotDataText(rowData, i));
    }
    return values;
  });

  if (!matrixHasNameColumnPattern(probe) && !probe.some(rowHasTotalLabel)) return tableData;

  const working = JSON.parse(JSON.stringify(tableData));
  let changed = false;

  working.rows = working.rows.map((rowData) => {
    const aligned = alignSnapshotRow(rowData);
    if (aligned !== rowData) changed = true;
    return aligned;
  });

  if (!changed) return tableData;
  console.log("Submit snapshot: aligned TOTAL row columns to match PHP.");
  return working;
}
