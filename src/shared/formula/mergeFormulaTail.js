import { removeTrailingSourcePercentExpression } from "./removeTrailingSourcePercent.js";
import { isSourceOne } from "./isMisplacedCommission.js";

const ROW_TAIL_PATTERN = /^(.*)\*([0-9.]+)\s*$/;
const DOLLAR_COLUMN_TAIL_PATTERN = /\$(\d+)\s*$/;

/** True when formula ends with a $column ref (e.g. ...*$9), not a numeric tail. */
export function endsWithDollarColumnRef(formulaText) {
  return DOLLAR_COLUMN_TAIL_PATTERN.test(String(formulaText ?? "").trim());
}

/** Extract trailing row coefficient (*0.90, *0.10) from a formula string. */
export function extractRowCoefficientTail(formulaText) {
  if (!formulaText) return null;
  let s = removeTrailingSourcePercentExpression(String(formulaText).trim());
  const m = s.match(ROW_TAIL_PATTERN);
  if (!m) return null;
  const tail = m[2].trim();
  if (!tail || tail.includes("$")) return null;
  if (!/^[0-9.]+$/.test(tail.replace(/\s/g, ""))) return null;
  return `*${tail}`;
}

export function hasRowCoefficientTail(formulaText) {
  return extractRowCoefficientTail(formulaText) != null;
}

/**
 * Merge missing row commission tail (*0.90) from resolved sources into formula body.
 * Skips lsv/display merge when source is a real Source value (0.1, 0.14), not misplaced commission.
 */
export function mergeFormulaOperatorsWithResolvedTail(body, ...resolvedSources) {
  let base = String(body ?? "").trim();
  if (!base) return base;
  if (hasRowCoefficientTail(base)) return base;
  // Do not merge numeric tail from saved display when body already ends with $N;
  // $N will expand to the same rate on render — merging would duplicate it.
  if (endsWithDollarColumnRef(base)) return base;

  for (const src of resolvedSources) {
    if (!src) continue;
    const tail = extractRowCoefficientTail(src);
    if (tail) {
      base = `${base}${tail}`;
      break;
    }
  }
  return base;
}

/** Whether we should merge row tail from lsv/display for this effective source. */
export function shouldMergeRowTailFromResolvedSources(effectiveSource) {
  if (effectiveSource == null || String(effectiveSource).trim() === "") return true;
  return isSourceOne(effectiveSource);
}
