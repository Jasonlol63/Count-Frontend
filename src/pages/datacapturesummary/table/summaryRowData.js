import { normalizeSummaryIdProductText } from "../lib/summaryIdProductUtils.js";
import { evaluateFormulaExpression } from "../formula/summaryFormulaReference.js";
import { formatNegativeNumbersInFormula } from "../formula/summaryFormulaParseUtils.js";
import { resolveTemplateFormulaDisplay } from "../formula/summaryTemplateFormulaDisplay.js";
import {
  buildFormulaDisplayParenFromRow,
  resolveEffectiveSourcePercentForRow,
  resolveTemplateFormulaBaseAndPercent,
} from "../../../shared/formula/index.js";
import { MoneyDecimal } from "../../../utils/money/moneyDecimal.js";
import {
  computeRowFinalAmountForTotal,
  formatProcessedAmountDisplay,
  recalculateRowAmounts,
  roundSummaryTotalForValidation,
} from "./summaryRowAmount.js";

/** @typedef {import('./summaryRowModel.js').SummaryRowKey} SummaryRowKey */

/**
 * Full display + edit state for one summary table row (pure React source of truth).
 * @typedef {Object} SummaryRowData
 * @property {string} key
 * @property {string} idProduct
 * @property {number} rowIndex
 * @property {'main'|'sub'} productType
 * @property {string|null} parentIdProduct
 * @property {number|null} parentRowIndex
 * @property {string} account
 * @property {string|null} accountId
 * @property {string} currency
 * @property {string|null} currencyId
 * @property {string} formula
 * @property {string} formulaDisplay
 * @property {string} formulaOperators
 * @property {string} sourceColumns
 * @property {string} sourcePercent
 * @property {boolean} enableSourcePercent
 * @property {string} baseProcessedAmount
 * @property {string} processedAmount
 * @property {string} processedAmountDisplay
 * @property {boolean} rateChecked
 * @property {string} rateValue
 * @property {boolean} skipChecked
 * @property {boolean} deleteChecked
 * @property {boolean} selectChecked
 * @property {number|null} templateId
 * @property {string} templateKey
 * @property {number|null} formulaVariant
 * @property {number|null} subOrder
 * @property {boolean} templateApplied
 * @property {string} originalDescription
 * @property {string} clickedColumns
 * @property {string} inputMethod
 * @property {boolean} enableInputMethod
 * @property {string} subIdProduct
 */

export function createEmptyRowFields() {
  return {
    account: "",
    accountId: null,
    currency: "",
    currencyId: null,
    formula: "",
    formulaDisplay: "",
    formulaOperators: "",
    sourceColumns: "",
    sourcePercent: "1",
    enableSourcePercent: true,
    baseProcessedAmount: "",
    processedAmount: "",
    processedAmountDisplay: "",
    rateChecked: false,
    rateValue: "",
    skipChecked: false,
    deleteChecked: false,
    selectChecked: false,
    templateId: null,
    templateKey: "",
    formulaVariant: null,
    subOrder: null,
    templateApplied: false,
    originalDescription: "",
    clickedColumns: "",
    inputMethod: "",
    enableInputMethod: false,
    subIdProduct: "",
  };
}

/** @param {{ idProduct: string, rowIndex: number, key?: string }} entry */
export function createMainRowFromEntry(entry, index) {
  const idProduct = String(entry.idProduct || "").trim();
  const norm = normalizeSummaryIdProductText(idProduct);
  return {
    key: entry.key || `main-${entry.rowIndex}-${index}-${norm}`,
    idProduct,
    rowIndex: entry.rowIndex,
    productType: "main",
    parentIdProduct: null,
    parentRowIndex: null,
    ...createEmptyRowFields(),
  };
}

/** @param {SummaryRowData} parentRow @param {object} subTemplate */
export function createSubRowFromTemplate(parentRow, subTemplate, insertIndex) {
  const parentTrimmed = String(parentRow.idProduct || "").trim();
  const subId =
    String(subTemplate.id_product_sub || subTemplate.sub_id_product || subTemplate.id_product || "").trim() ||
    parentTrimmed;
  return {
    key: `sub-${parentRow.rowIndex}-${Date.now()}-${insertIndex}-${Math.random().toString(36).slice(2, 6)}`,
    idProduct: subId,
    rowIndex: subTemplate.row_index != null ? Number(subTemplate.row_index) : parentRow.rowIndex,
    productType: "sub",
    parentIdProduct: parentTrimmed,
    parentRowIndex: parentRow.rowIndex,
    ...createEmptyRowFields(),
    subIdProduct: subId,
    subOrder: subTemplate.sub_order != null ? Number(subTemplate.sub_order) : 1,
    formulaVariant:
      subTemplate.formula_variant != null ? Number(subTemplate.formula_variant) : null,
    templateId: subTemplate.id != null ? Number(subTemplate.id) : null,
  };
}

function resolveFormulaDisplay(row, formulaOperators) {
  const ops = String(formulaOperators || row.formulaOperators || "").trim();
  if (!ops || ops === "Formula") return row.formulaDisplay || "";
  try {
    const evaluated = evaluateFormulaExpression(
      ops,
      row.productType === "sub" ? row.subIdProduct || row.idProduct : row.idProduct,
      row.clickedColumns || "",
      row.rowIndex
    );
    if (!Number.isNaN(Number(evaluated)) && Number.isFinite(Number(evaluated))) {
      const display = formatNegativeNumbersInFormula(String(Number(evaluated)));
      return display;
    }
  } catch {
    /* fallback */
  }
  return row.formulaDisplay || row.formula || "";
}

/** Merge API main template fields into a row model. */
export function applyMainTemplateToRowModel(row, mainTemplate, templateKey) {
  if (!row || !mainTemplate) return row;

  const { source, enable } = resolveEffectiveSourcePercentForRow(mainTemplate);
  const sourcePercent = source || "1";
  const enableSourcePercent = enable ? true : sourcePercent.trim() !== "";
  const [resolvedOperators] = resolveTemplateFormulaBaseAndPercent(mainTemplate);
  const formulaOperators = String(
    resolvedOperators || mainTemplate.formula_operators || mainTemplate.formulaOperators || ""
  ).trim();
  const sourceColumns = String(mainTemplate.source_columns || "").trim();
  const next = {
    ...row,
    templateApplied: true,
    templateKey: templateKey || row.templateKey,
    templateId: mainTemplate.id != null ? Number(mainTemplate.id) : row.templateId,
    formulaVariant:
      mainTemplate.formula_variant != null
        ? Number(mainTemplate.formula_variant)
        : row.formulaVariant,
    accountId:
      mainTemplate.account_id != null ? String(mainTemplate.account_id) : row.accountId,
    account: String(mainTemplate.account_display || mainTemplate.account || row.account || "").trim(),
    currencyId:
      mainTemplate.currency_id != null
        ? String(mainTemplate.currency_id)
        : row.currencyId,
    currency: String(
      mainTemplate.currency_display ||
        mainTemplate.currency ||
        mainTemplate.currency_code ||
        row.currency ||
        ""
    ).trim(),
    sourceColumns,
    formulaOperators,
    sourcePercent,
    enableSourcePercent,
    inputMethod: String(mainTemplate.input_method || row.inputMethod || "").trim(),
    enableInputMethod: Boolean(mainTemplate.input_method || row.enableInputMethod),
    clickedColumns: String(mainTemplate.clicked_columns || mainTemplate.clickedColumns || row.clickedColumns || "").trim(),
    originalDescription: String(
      mainTemplate.original_description || mainTemplate.description || row.originalDescription || ""
    ).trim(),
  };

  const dbFormulaDisplay = buildFormulaDisplayParenFromRow(mainTemplate);
  const templateForDisplay = {
    ...mainTemplate,
    formula_display: dbFormulaDisplay || mainTemplate.formula_display,
  };

  const formulaDisplay =
    resolveTemplateFormulaDisplay({
      row: next,
      template: templateForDisplay,
      sourceColumns,
      formulaOperators,
      sourcePercent,
      enableSourcePercent,
    }) || dbFormulaDisplay;

  next.formulaDisplay = formulaDisplay;
  next.formula = formulaOperators || formulaDisplay;
  if (mainTemplate.batch_selection == 1) {
    next.selectChecked = true;
  }

  const amount =
    mainTemplate.last_processed_amount != null && mainTemplate.last_processed_amount !== ""
      ? String(mainTemplate.last_processed_amount)
      : "";
  if (amount) {
    next.baseProcessedAmount = amount;
  }

  return recalculateRowAmounts(next);
}

/** @param {SummaryRowData} row */
export function clearRowEditableFields(row) {
  return {
    ...row,
    ...createEmptyRowFields(),
    key: row.key,
    idProduct: row.idProduct,
    rowIndex: row.rowIndex,
    productType: row.productType,
    parentIdProduct: row.parentIdProduct,
    parentRowIndex: row.parentRowIndex,
    subIdProduct: row.subIdProduct,
  };
}

/** @param {SummaryRowData[]} rows @param {string} [globalRateInput] */
export function computeSummaryTotal(rows, globalRateInput = "") {
  let total = MoneyDecimal.toDecimal("0");
  for (const row of rows) {
    if (row.selectChecked) continue;
    try {
      const rowForTotal = computeRowFinalAmountForTotal(row, globalRateInput);
      total = MoneyDecimal.add(total, MoneyDecimal.toDecimal(rowForTotal, 0));
    } catch {
      /* skip invalid row amount */
    }
  }
  return total;
}

export function formatSummaryTotalDisplay(total) {
  return formatProcessedAmountDisplay(roundSummaryTotalForValidation(total));
}

/** Legacy total color: near-zero blue, otherwise red. */
export function getSummaryTotalColor(total) {
  try {
    const value = roundSummaryTotalForValidation(total);
    if (MoneyDecimal.cmp(value, "-0.05") >= 0 && MoneyDecimal.cmp(value, "0.05") <= 0) {
      return "#0D60FF";
    }
    return "#A91215";
  } catch {
    return "#000000";
  }
}
