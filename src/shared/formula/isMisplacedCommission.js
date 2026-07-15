import { removeTrailingSourcePercentExpression } from "./removeTrailingSourcePercent.js";

const ROW_TAIL_PATTERN = /^(.*)\*([0-9.]+)\s*$/;

function parseNumeric(value) {
  const num = Number(String(value ?? "").trim().replace(/%/g, ""));
  return Number.isFinite(num) ? num : NaN;
}

function extractRowCoefficientTailLocal(formulaText) {
  if (!formulaText) return null;
  let s = removeTrailingSourcePercentExpression(String(formulaText).trim());
  const m = s.match(ROW_TAIL_PATTERN);
  if (!m) return null;
  const tail = m[2].trim();
  if (!tail || tail.includes("$")) return null;
  if (!/^[0-9.]+$/.test(tail.replace(/\s/g, ""))) return null;
  return `*${tail}`;
}

/** Numeric range historically used for misplaced row commission coefficients. */
export function isMisplacedCommissionRange(value) {
  const num = parseNumeric(value);
  if (!Number.isFinite(num)) return false;
  return num > 0.85 && num < 1 - 1e-9;
}

/**
 * True when a (0.85, 1) value duplicates a row coefficient already in the formula body
 * (e.g. source_percent=0.9 while formula_operators is 111*0.9).
 * Plain Source values like 0.92 without a matching body tail are intentional.
 */
export function isDuplicateCoefficientAsSource(value, formulaText) {
  if (!isMisplacedCommissionRange(value)) return false;
  if (!formulaText) return false;

  const tail = extractRowCoefficientTailLocal(formulaText);
  if (!tail) return false;

  const tailNum = parseNumeric(tail.slice(1));
  const valNum = parseNumeric(value);
  if (!Number.isFinite(tailNum) || !Number.isFinite(valNum)) return false;
  return Math.abs(tailNum - valNum) < 1e-9;
}

/** @deprecated Use isDuplicateCoefficientAsSource — kept for call sites passing formula body. */
export function isMisplacedCommission(value, formulaBody = "") {
  return isDuplicateCoefficientAsSource(value, formulaBody);
}

export function isSourceOne(value) {
  if (value === null || value === undefined || value === "") return true;
  const num = parseNumeric(value);
  if (!Number.isFinite(num)) return false;
  return Math.abs(num - 1) < 1e-9;
}
