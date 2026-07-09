import { removeTrailingSourcePercentExpression } from "./removeTrailingSourcePercent.js";
import { createFormulaDisplayFromExpression } from "./buildFormulaDisplay.js";
import {
  mergeFormulaOperatorsWithResolvedTail,
  shouldMergeRowTailFromResolvedSources,
} from "./mergeFormulaTail.js";
import { isMisplacedCommission } from "./isMisplacedCommission.js";

function pickFormulaBodyFromRow(row, form) {
  const fromTemplate = row?.getAttribute?.("data-template-formula-operators");
  if (fromTemplate && String(fromTemplate).trim() !== "") {
    return String(fromTemplate).trim();
  }
  const fromDataOps = row?.getAttribute?.("data-formula-operators");
  if (fromDataOps && String(fromDataOps).trim() !== "") {
    return String(fromDataOps).trim();
  }
  if (form?.formulaValue && String(form.formulaValue).trim() !== "") {
    return String(form.formulaValue).trim();
  }
  const display = form?.formulaDisplay || row?.getAttribute?.("data-formula-display") || "";
  return removeTrailingSourcePercentExpression(String(display).trim());
}

function normalizeSourcePercent(row, form) {
  const fromAttr = row?.getAttribute?.("data-source-percent") || "";
  const fromForm = form?.sourcePercentValue || form?.sourcePercent || "";
  const raw = String(fromAttr || fromForm || "1").trim() || "1";
  if (isMisplacedCommission(raw)) return "1";
  return raw;
}

/** formula_operators body for save: includes row *0.90, excludes *(source). */
export function resolveFormulaOperatorsBodyForSave(row, form) {
  let body = pickFormulaBodyFromRow(row, form);
  body = removeTrailingSourcePercentExpression(body);

  const source = normalizeSourcePercent(row, form);
  const lsv = form?.lastSourceValue || row?.getAttribute?.("data-last-source-value") || "";
  const display = form?.formulaDisplay || "";

  if (shouldMergeRowTailFromResolvedSources(source)) {
    body = mergeFormulaOperatorsWithResolvedTail(
      body,
      lsv,
      removeTrailingSourcePercentExpression(display)
    );
  }

  return body;
}

/** last_source_value: numeric/display formula with commission tail, without *(source). */
export function resolveLastSourceValueForSave(row, form) {
  const display = form?.formulaDisplay || row?.getAttribute?.("data-formula-display") || "";
  if (display && String(display).trim() !== "" && display !== "Formula") {
    return removeTrailingSourcePercentExpression(String(display).trim());
  }
  return resolveFormulaOperatorsBodyForSave(row, form);
}

/** Apply unified formula field convention to template save payload. */
export function applyTemplateFormulaSaveFields(rowData, row, form) {
  if (!rowData) return rowData;

  const sourcePercent = normalizeSourcePercent(row, form);
  const enableSourcePercent = sourcePercent.trim() !== "" ? 1 : 0;
  const formulaOperators = resolveFormulaOperatorsBodyForSave(row, form);
  const formulaDisplay =
    form?.formulaDisplay ||
    createFormulaDisplayFromExpression(
      formulaOperators,
      sourcePercent,
      enableSourcePercent === 1
    );
  const lastSourceValue = resolveLastSourceValueForSave(row, form);

  rowData.source_percent = sourcePercent;
  rowData.enable_source_percent = enableSourcePercent;
  rowData.formula_operators = formulaOperators;
  rowData.formula_display = formulaDisplay;
  rowData.last_source_value = lastSourceValue;

  return rowData;
}

export function buildTemplateSavePayloadFromForm(row, form) {
  const sourcePercent = normalizeSourcePercent(row, form);
  const enableSourcePercent = sourcePercent.trim() !== "" ? 1 : 0;
  const formulaOperators = resolveFormulaOperatorsBodyForSave(row, form);
  const formulaDisplay =
    form?.formulaDisplay ||
    createFormulaDisplayFromExpression(formulaOperators, sourcePercent, enableSourcePercent === 1);

  return {
    source_percent: sourcePercent,
    enable_source_percent: enableSourcePercent,
    formula_operators: formulaOperators,
    formula_display: formulaDisplay,
    last_source_value: resolveLastSourceValueForSave(row, form),
  };
}
