import { formatSourcePercent } from "./formatSourcePercent.js";
import { isSourceOne } from "./isMisplacedCommission.js";

/** Formula column display = base + (source≠1 ? " * (source)" : "") */
export function buildFormulaDisplayParenFromParts(base, sourcePercent, enableSourcePercent) {
  const b = String(base ?? "").trim();
  const pct = String(sourcePercent ?? "").trim();
  const en = Number(enableSourcePercent) ? 1 : 0;
  if (!b) return "";
  if (!en || pct === "" || isSourceOne(pct)) return b;
  return `${b} * (${formatSourcePercent(pct)})`;
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
  const trimmedFormula = String(formula).trim();
  if (!enableSourcePercent) return trimmedFormula;

  if (!sourcePercentValue || String(sourcePercentValue).trim() === "") {
    return `${trimmedFormula}*(0)`;
  }

  const pct = String(sourcePercentValue).trim();
  if (isSourceOne(pct)) return trimmedFormula;

  const formatted = formatSourcePercent(pct);
  const formulaTrimmed = trimmedFormula.replace(/\s+/g, "");
  const srcNorm = pct.replace(/\s+/g, "");
  const alreadyHas =
    formulaTrimmed.endsWith(`*(${srcNorm})`) ||
    formulaTrimmed.endsWith(`*${srcNorm}`) ||
    formulaTrimmed.endsWith(`*(${formatted})`) ||
    formulaTrimmed.endsWith(`*${formatted}`);
  if (alreadyHas) return trimmedFormula;

  return `${trimmedFormula}*(${formatted})`;
}

