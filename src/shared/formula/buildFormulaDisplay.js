import { formatSourcePercent } from "./formatSourcePercent.js";
import { formatNegativeNumbersInFormula } from "./formatNegativeNumbersInFormula.js";
import { isSourceOne } from "./isMisplacedCommission.js";
import { removeTrailingSourcePercentExpression } from "./removeTrailingSourcePercent.js";

/** True when source is an arithmetic expression (e.g. 0.18/2), not a plain number. */
function isArithmeticSourceExpression(value) {
  const s = String(value ?? "").trim();
  if (s === "") return false;
  return /[+\-*/]/.test(s.replace(/^[+-]/, ""));
}

/**
 * Source value as shown inside the formula's "*(...)" suffix.
 * Arithmetic expressions are preserved verbatim (e.g. 0.18/2 → 0.18/2),
 * matching the legacy PHP Summary display; plain numbers are formatted.
 */
export function formatSourceForFormulaSuffix(value) {
  const s = String(value ?? "").trim();
  if (isArithmeticSourceExpression(s)) {
    return s.replace(/\s+/g, "");
  }
  return formatSourcePercent(s);
}

/** Formula column display = base + (source≠1 ? " * (source)" : "") */
export function buildFormulaDisplayParenFromParts(base, sourcePercent, enableSourcePercent) {
  const b = formatNegativeNumbersInFormula(String(base ?? "").trim());
  const pct = String(sourcePercent ?? "").trim();
  const en = Number(enableSourcePercent) ? 1 : 0;
  if (!b) return "";
  if (!en || pct === "" || isSourceOne(pct)) return b;
  return `${b} * (${formatSourceForFormulaSuffix(pct)})`;
}

/** Edit box holds formula base only — no Source suffix. */
export function buildFormulaEditFromParts(base) {
  return String(base ?? "").trim();
}

/**
 * Build display string from expression body + source (Summary save/display).
 * Does not resolve $refs — caller passes resolved or raw body as needed.
 */
export function createFormulaDisplayFromExpression(formula, sourcePercentValue, enableSourcePercent = true) {
  if (!formula) return "Formula";
  const trimmedFormula = formatNegativeNumbersInFormula(String(formula).trim());
  if (!enableSourcePercent) return trimmedFormula;

  if (!sourcePercentValue || String(sourcePercentValue).trim() === "") {
    return `${trimmedFormula}*(0)`;
  }

  const pct = String(sourcePercentValue).trim();
  if (isSourceOne(pct)) return trimmedFormula;

  const formatted = formatSourceForFormulaSuffix(pct);
  // Formula-body multipliers (e.g. *0.10) are independent of Source; always append bracketed Source.
  const base = removeTrailingSourcePercentExpression(trimmedFormula);
  return `${base}*(${formatted})`;
}

