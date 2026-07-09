/** Default grid size (A–Z rows). Matches legacy `initializeTable(26, 20)`. */
export const DEFAULT_GRID_ROWS = 26;
export const DEFAULT_GRID_COLS = 20;

/** Group-only mode (Group selected, no Company): starts at 11×11 (A–K, cols 1–11); rows may grow (L…Z, AA…). */
export const GROUP_ONLY_GRID_ROWS = 11;
export const GROUP_ONLY_GRID_COLS = 11;

/** ZZ row index + 1 in legacy. */
export const MAX_GRID_ROWS = 702;

export function resolveDataCaptureGridDimensions(groupOnly) {
  return groupOnly
    ? { rows: GROUP_ONLY_GRID_ROWS, cols: GROUP_ONLY_GRID_COLS }
    : { rows: DEFAULT_GRID_ROWS, cols: DEFAULT_GRID_COLS };
}

/** Rows/cols when restoring a snapshot — group-only keeps 11 cols; rows expand to fit saved data. */
export function resolveRestoreGridDimensions(groupOnly, tableData = null) {
  const defaults = resolveDataCaptureGridDimensions(groupOnly);
  if (groupOnly) {
    if (!tableData?.rows?.length) {
      return { rows: GROUP_ONLY_GRID_ROWS, cols: GROUP_ONLY_GRID_COLS };
    }
    const requiredRows = Math.max(
      GROUP_ONLY_GRID_ROWS,
      tableData.rowCount || tableData.rows.length,
    );
    return {
      rows: Math.min(requiredRows, MAX_GRID_ROWS),
      cols: GROUP_ONLY_GRID_COLS,
    };
  }
  if (!tableData?.rows?.length) {
    return { rows: defaults.rows, cols: defaults.cols };
  }
  const requiredRows = tableData.rowCount || tableData.rows.length;
  const requiredCols = Math.max(
    tableData.colCount
      ? tableData.colCount - 1
      : tableData.headers
        ? tableData.headers.length - 1
        : defaults.cols,
    15,
  );
  return { rows: requiredRows, cols: requiredCols };
}

/** Row header labels: A, B, …, Z, AA, … — same as `getColumnLabel` in `js/datacapture.js`. */
export function getRowLabel(index) {
  let result = "";
  let i = index;
  while (i >= 0) {
    result = String.fromCharCode(65 + (i % 26)) + result;
    i = Math.floor(i / 26) - 1;
  }
  return result;
}

/** Whether the user has activated the grid (click/focus). */
let tableActive = false;

export function setTableActive(value) {
  tableActive = !!value;
}

export function isTableActive() {
  return tableActive;
}
