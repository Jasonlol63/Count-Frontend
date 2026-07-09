/**
 * Module-scoped formula/capture context for pure React Summary (no window globals).
 */

/** @type {object|null} */
let ctx = null;

export function bindSummaryFormulaContext(next) {
  ctx = next ? { ...next } : null;
}

export function clearSummaryFormulaContext() {
  ctx = null;
}

export function getTransformedTableData() {
  return ctx?.tableData ?? null;
}

export function getCapturedProcessData() {
  return ctx?.processData ?? null;
}
