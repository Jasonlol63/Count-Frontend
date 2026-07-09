import { createFormulaDisplayFromExpression } from "../../../shared/formula/index.js";
import { removeTrailingSourcePercentExpression } from "../../../shared/formula/removeTrailingSourcePercent.js";
import { evaluateExpression } from "./summaryFormulaEvaluate.js";
import { parseCompleteFormula, removeThousandsSeparators } from "./summaryFormulaParseUtils.js";
import {
  buildExpandedFormulaDisplay,
  resolveEnableSourcePercent,
} from "./editFormulaFormState.js";

/** Value shown when double-clicking Formula — prefer operators ($refs), else display text. */
export function getFormulaInlineEditValue(row) {
  const stored = String(row?.formulaOperators || "").trim();
  const displayed = String(row?.formulaDisplay || row?.formula || "").trim();
  if (!displayed && !stored) return "";
  return stored || displayed;
}

function resolveProcessValue(row) {
  return row?.productType === "sub"
    ? row?.subIdProduct || row?.idProduct || ""
    : row?.idProduct || "";
}

function evaluateSourcePercentValue(sourceExpr) {
  if (!sourceExpr || !String(sourceExpr).trim()) return "1";
  try {
    const sanitized = removeThousandsSeparators(String(sourceExpr).trim());
    const result = evaluateExpression(sanitized);
    return result != null && String(result).trim() !== "" ? String(result) : "1";
  } catch {
    return String(sourceExpr).trim() || "1";
  }
}

function buildDisplayPatch(row, baseFormula, sourcePercent) {
  const processValue = resolveProcessValue(row);
  const sourcePercentValue = String(sourcePercent || "1").trim() || "1";
  const enableSourcePercent = resolveEnableSourcePercent(sourcePercentValue);
  const expanded = buildExpandedFormulaDisplay(
    baseFormula,
    processValue,
    row?.clickedColumns || "",
    row?.rowIndex ?? null
  );
  const formulaDisplay = createFormulaDisplayFromExpression(
    expanded,
    sourcePercentValue,
    enableSourcePercent
  );
  return {
    formulaOperators: baseFormula,
    formula: baseFormula,
    formulaDisplay,
    sourcePercent: sourcePercentValue,
    enableSourcePercent,
  };
}

/** Apply legacy enableFormulaInlineEdit save — returns row patch or null if unchanged. */
export function buildFormulaInlineEditPatch(row, newFormulaValue, originalValue) {
  const original =
    originalValue != null ? String(originalValue).trim() : getFormulaInlineEditValue(row);
  const trimmed = String(newFormulaValue ?? "").trim();
  if (trimmed === original) return null;

  const parsed = parseCompleteFormula(trimmed);
  let sourcePercent = String(row?.sourcePercent || "1").trim() || "1";
  if (parsed.sourcePercent) {
    sourcePercent = evaluateSourcePercentValue(parsed.sourcePercent);
  }

  const baseFormula = (parsed.baseFormula || trimmed).trim();
  if (!baseFormula) return null;

  return buildDisplayPatch(row, baseFormula, sourcePercent);
}

/** Apply legacy enableSourcePercentInlineEdit save — returns row patch or null if unchanged. */
export function buildSourceInlineEditPatch(row, newSourceValue, originalValue) {
  const original =
    originalValue != null
      ? String(originalValue).trim() || "1"
      : String(row?.sourcePercent || "1").trim() || "1";
  const next = String(newSourceValue ?? "").trim() || "1";
  if (next === original) return null;

  let baseFormula = String(row?.formulaOperators || "").trim();
  if (!baseFormula) {
    const fromDisplay = removeTrailingSourcePercentExpression(
      String(row?.formulaDisplay || row?.formula || "").trim()
    );
    baseFormula = fromDisplay;
  }
  if (!baseFormula) return null;

  return buildDisplayPatch(row, baseFormula, next);
}
