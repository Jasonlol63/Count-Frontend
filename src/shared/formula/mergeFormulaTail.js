import { removeTrailingSourcePercentExpression } from "./removeTrailingSourcePercent.js";
import { isMisplacedCommission } from "./isMisplacedCommission.js";

const ROW_TAIL_PATTERN = /^(.*)\*([0-9.]+)\s*$/;

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
  return isMisplacedCommission(effectiveSource) || Math.abs(Number(effectiveSource) - 1) < 1e-9;
}
