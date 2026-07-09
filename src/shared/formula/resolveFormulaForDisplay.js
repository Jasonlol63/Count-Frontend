import {
  parseTrailingSourceParenValue,
  removeTrailingSourcePercentExpression,
} from "./removeTrailingSourcePercent.js";
import { formatSourcePercent } from "./formatSourcePercent.js";
import { isMisplacedCommission, isSourceOne } from "./isMisplacedCommission.js";
import {
  mergeFormulaOperatorsWithResolvedTail,
  shouldMergeRowTailFromResolvedSources,
} from "./mergeFormulaTail.js";
import {
  buildFormulaDisplayParenFromParts,
  buildFormulaEditFromParts,
} from "./buildFormulaDisplay.js";

function parseNumeric(value) {
  const num = Number(String(value ?? "").trim().replace(/%/g, ""));
  return Number.isFinite(num) ? num : NaN;
}

function isValidEffectiveSourceFromParen(parenValue) {
  if (parenValue == null || String(parenValue).trim() === "") return false;
  const num = parseNumeric(parenValue);
  if (!Number.isFinite(num)) return false;
  if (isSourceOne(num)) return false;
  if (isMisplacedCommission(num)) return false;
  return true;
}

/**
 * Resolve effective Source for a DB row.
 * Priority: formula_display *(source) → last_source_value *(source) → misplaced commission → DB field.
 */
export function resolveEffectiveSourcePercentForRow(row) {
  const enableDb = Number(row?.enable_source_percent ?? 0) ? 1 : 0;

  const fromDisplay = parseTrailingSourceParenValue(row?.formula_display);
  if (isValidEffectiveSourceFromParen(fromDisplay)) {
    return { source: formatSourcePercent(fromDisplay), enable: enableDb || 1 };
  }

  const fromLsv = parseTrailingSourceParenValue(row?.last_source_value);
  if (isValidEffectiveSourceFromParen(fromLsv)) {
    return { source: formatSourcePercent(fromLsv), enable: enableDb || 1 };
  }

  const dbPctRaw = String(row?.source_percent ?? "").trim();
  if (dbPctRaw !== "" && isMisplacedCommission(dbPctRaw)) {
    return { source: "1", enable: enableDb };
  }

  if (dbPctRaw !== "") {
    return { source: formatSourcePercent(dbPctRaw), enable: enableDb || 1 };
  }

  return { source: "1", enable: 0 };
}

/**
 * Resolve formula base + source + enable from a DB template row.
 */
export function resolveTemplateFormulaBaseAndPercent(row) {
  const { source, enable } = resolveEffectiveSourcePercentForRow(row);

  let raw = String(row?.formula_operators ?? "").trim();
  if (!raw) {
    raw = String(row?.formula_display ?? "").trim();
  }

  let base = removeTrailingSourcePercentExpression(raw);

  const displayMisplaced = parseTrailingSourceParenValue(row?.formula_display);
  if (displayMisplaced != null && isMisplacedCommission(displayMisplaced)) {
    // Trailing *(0.9) on display is misplaced commission, not Source — already stripped from base via removeTrailing
  }

  if (shouldMergeRowTailFromResolvedSources(source)) {
    base = mergeFormulaOperatorsWithResolvedTail(
      base,
      row?.last_source_value,
      removeTrailingSourcePercentExpression(row?.formula_display ?? "")
    );
  }

  return [base, source, enable];
}

export function buildFormulaDisplayParenFromRow(row) {
  const [base, source, enable] = resolveTemplateFormulaBaseAndPercent(row);
  return buildFormulaDisplayParenFromParts(base, source, enable);
}

export function buildFormulaEditFromRow(row) {
  const [base] = resolveTemplateFormulaBaseAndPercent(row);
  return buildFormulaEditFromParts(base);
}

export function resolveRowForMaintenanceDisplay(row) {
  const [base, source, enable] = resolveTemplateFormulaBaseAndPercent(row);
  return {
    base,
    source,
    enable,
    sourceDisplay: formatSourcePercent(source),
    formulaDisplay: buildFormulaDisplayParenFromParts(base, source, enable),
    formulaEdit: base,
  };
}
