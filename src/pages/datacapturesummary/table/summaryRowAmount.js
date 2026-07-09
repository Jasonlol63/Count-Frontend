import { calculateFormulaResultFromExpression } from "../formula/summaryFormulaReference.js";
import { MoneyDecimal, formatThousands } from "../../../utils/money/moneyDecimal.js";

/** Legacy roundProcessedAmountTo2Decimals — HalfUp to 2 decimals. */
export function roundProcessedAmountTo2Decimals(value) {
  try {
    return MoneyDecimal.formatFixedHalfUp(value, 2);
  } catch {
    return "0.00";
  }
}

/** Legacy formatNumberWithThousands — HalfUp 2 decimals, then thousand separators. */
export function formatProcessedAmountDisplay(value) {
  if (value === "" || value == null) return "";
  try {
    return formatThousands(roundProcessedAmountTo2Decimals(value), 2);
  } catch {
    return "0.00";
  }
}

/** Legacy setRowProcessedAmountDisplay — data-final-processed-amount (6-dec truncate). */
export function normalizeProcessedAmountForTotalStorage(finalAmount) {
  let normalized = "0";
  try {
    normalized = MoneyDecimal.toDecimal(finalAmount, 0).toString();
  } catch {
    normalized = "0";
  }
  return truncateProcessedAmountTo6Decimals(normalized);
}

export function truncateProcessedAmountTo6Decimals(value) {
  try {
    return MoneyDecimal.formatFixed(value, 6);
  } catch {
    return "0.000000";
  }
}

export function truncateRateAmountTo8Decimals(value) {
  try {
    return MoneyDecimal.formatFixed(value, 8);
  } catch {
    return "0.00000000";
  }
}

function applyRateValueToAmount(processedAmount, rateValueStr) {
  const value = String(rateValueStr || "").trim();
  if (!value) return null;
  try {
    if (value.startsWith("*")) {
      const rateValue = MoneyDecimal.toDecimal(value.substring(1), 0);
      if (!rateValue.isZero()) {
        return truncateRateAmountTo8Decimals(
          MoneyDecimal.mul(processedAmount, rateValue).toString()
        );
      }
    } else if (value.startsWith("/")) {
      const rateValue = MoneyDecimal.toDecimal(value.substring(1), 0);
      if (!rateValue.isZero()) {
        return truncateRateAmountTo8Decimals(
          MoneyDecimal.div(processedAmount, rateValue).toString()
        );
      }
    } else {
      const rateValue = MoneyDecimal.toDecimal(value, 0);
      if (!rateValue.isZero()) {
        return truncateRateAmountTo8Decimals(
          MoneyDecimal.mul(processedAmount, rateValue).toString()
        );
      }
    }
  } catch {
    /* ignore invalid rate */
  }
  return null;
}

/** Resolve expression used to calculate base processed amount (legacy recalculateAndRenderProcessedAmount). */
export function resolveFormulaTextForCalculation(row) {
  const operators = String(row.formulaOperators || "").trim();
  let displayExpanded = String(row.formulaDisplay || row.formula || "").trim();
  const hasDollarColumnRef = /\$(\d+)/.test(displayExpanded);
  if (displayExpanded && displayExpanded !== "Formula" && !hasDollarColumnRef) {
    return displayExpanded;
  }
  return operators || displayExpanded || "";
}

export function calculateBaseProcessedAmount(row) {
  const formulaText = resolveFormulaTextForCalculation(row);
  if (!formulaText || formulaText === "Formula") {
    const stored = String(row.baseProcessedAmount || row.processedAmount || "")
      .replace(/,/g, "")
      .trim();
    if (stored) {
      try {
        return MoneyDecimal.toDecimal(stored, 0).toString();
      } catch {
        return "0";
      }
    }
    return "0";
  }

  const processValue =
    row.productType === "sub" ? row.subIdProduct || row.idProduct : row.idProduct;
  const sourcePercentText = String(row.sourcePercent || "1").trim() || "1";
  const enableSourcePercent =
    row.enableSourcePercent != null
      ? !!row.enableSourcePercent
      : sourcePercentText.trim() !== "";

  let baseProcessedAmount = "0";
  try {
    baseProcessedAmount = calculateFormulaResultFromExpression(
      formulaText,
      sourcePercentText,
      row.inputMethod || "",
      row.enableInputMethod,
      enableSourcePercent,
      processValue,
      row.clickedColumns || "",
      row.rowIndex
    );
    baseProcessedAmount = MoneyDecimal.toDecimal(baseProcessedAmount, 0).toString();
  } catch {
    baseProcessedAmount = "0";
  }
  return baseProcessedAmount;
}

/**
 * Apply rate to base amount — row rateValue first, then global rate when checkbox checked.
 */
export function applyRateToRowAmount(row, baseAmount, globalRateInput = "") {
  const base = (() => {
    try {
      return MoneyDecimal.toDecimal(baseAmount, 0).toString();
    } catch {
      return "0";
    }
  })();

  const rowRate = String(row.rateValue || "").trim();
  if (rowRate) {
    const rated = applyRateValueToAmount(base, rowRate);
    if (rated !== null) return rated;
  }

  if (row.rateChecked) {
    const globalRate = String(globalRateInput || "").trim();
    if (globalRate) {
      const rated = applyRateValueToAmount(base, globalRate);
      if (rated !== null) return rated;
    }
  }

  return base;
}

/** Recompute base + final amounts and display fields for one row model. */
export function recalculateRowAmounts(row, globalRateInput = "") {
  if (!row) return row;

  const hasFormula = Boolean(
    (row.formulaOperators || row.formulaDisplay || row.formula || "").trim()
  );
  const hasStoredBase = String(row.baseProcessedAmount || "").trim() !== "";

  let baseProcessedAmount;
  if (hasFormula || !hasStoredBase) {
    baseProcessedAmount = calculateBaseProcessedAmount(row);
  } else {
    baseProcessedAmount = String(row.baseProcessedAmount).replace(/,/g, "").trim();
  }

  let finalProcessedAmount = applyRateToRowAmount(row, baseProcessedAmount, globalRateInput);
  try {
    finalProcessedAmount = MoneyDecimal.toDecimal(finalProcessedAmount, 0).toString();
  } catch {
    finalProcessedAmount = "0";
  }

  return {
    ...row,
    baseProcessedAmount,
    processedAmount: normalizeProcessedAmountForTotalStorage(finalProcessedAmount),
    processedAmountDisplay: formatProcessedAmountDisplay(finalProcessedAmount),
  };
}

/**
 * Legacy getSummaryRowFinalAmount — base + rate, then 6-dec truncate for total.
 * Does not use cell display text (2-dec HalfUp) for statistics.
 */
export function computeRowFinalAmountForTotal(row, globalRateInput = "") {
  const baseStored = String(row.baseProcessedAmount ?? "").replace(/,/g, "").trim();
  if (baseStored) {
    return truncateProcessedAmountTo6Decimals(
      applyRateToRowAmount(row, baseStored, globalRateInput)
    );
  }

  const finalStored = String(row.processedAmount ?? "").replace(/,/g, "").trim();
  if (finalStored) {
    return truncateProcessedAmountTo6Decimals(finalStored);
  }

  return truncateProcessedAmountTo6Decimals("0");
}

/** HalfUp 2-decimal total for UI display and submit validation (legacy updateProcessedAmountTotal). */
export function roundSummaryTotalForValidation(total) {
  const plain =
    total != null && typeof total.toString === "function" ? total.toString() : String(total ?? "0");
  return roundProcessedAmountTo2Decimals(plain);
}

/**
 * Legacy prepareSummarySubmitCollection processed amount resolution.
 * Priority: formula recalc → cell display → base attribute.
 */
export function resolveSubmitProcessedAmount(row, globalRateInput = "") {
  const effectiveGlobal =
    String(row.rateValue || "").trim() ? "" : row.rateChecked ? globalRateInput : "";

  const formulaDisplay = String(row.formulaDisplay || row.formula || "").trim();
  if (formulaDisplay && formulaDisplay !== "Formula") {
    try {
      const base = calculateBaseProcessedAmount(row);
      const finalRaw = applyRateToRowAmount(row, base, effectiveGlobal);
      const num = Number(MoneyDecimal.toDecimal(finalRaw, 0).toString());
      if (Number.isFinite(num)) return num;
    } catch {
      /* try fallbacks */
    }
  }

  const displayRaw = String(row.processedAmountDisplay || "").replace(/,/g, "").trim();
  const displayNum = parseFloat(displayRaw);
  if (displayRaw !== "" && !Number.isNaN(displayNum) && Number.isFinite(displayNum)) {
    return displayNum;
  }

  const baseRaw = String(row.baseProcessedAmount || "").replace(/,/g, "").trim();
  if (baseRaw) {
    try {
      const finalRaw = applyRateToRowAmount(row, baseRaw, effectiveGlobal);
      const num = Number(MoneyDecimal.toDecimal(finalRaw, 0).toString());
      if (Number.isFinite(num)) return num;
    } catch {
      /* ignore */
    }
  }

  const storedRaw = String(row.processedAmount || "").replace(/,/g, "").trim();
  const storedNum = parseFloat(storedRaw);
  if (storedRaw !== "" && !Number.isNaN(storedNum) && Number.isFinite(storedNum)) {
    return storedNum;
  }

  return 0;
}

export function mapRowsWithAmountRecalc(rows, globalRateInput = "") {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => recalculateRowAmounts(row, globalRateInput));
}

/** Whether every row with account has currency + formula (legacy submit gate). */
export function rowsHaveCompleteFormulaCurrency(rows) {
  for (const row of rows) {
    if (row.selectChecked || !row.account?.trim()) continue;
    const currencyText = String(row.currency || "")
      .replace(/[()]/g, "")
      .trim();
    const formulaText = String(row.formulaDisplay || row.formula || row.formulaOperators || "").trim();
    const currencyEmpty = !currencyText || /^select\s*curren/i.test(currencyText);
    const formulaEmpty = !formulaText;
    if (currencyEmpty || formulaEmpty) return false;
  }
  return true;
}
