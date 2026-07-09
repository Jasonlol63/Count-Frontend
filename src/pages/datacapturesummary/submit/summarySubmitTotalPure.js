import { MoneyDecimal } from "../../../utils/money/moneyDecimal.js";
import { computeSummaryTotal, formatSummaryTotalDisplay } from "../table/summaryRowData.js";
import { roundSummaryTotalForValidation } from "../table/summaryRowAmount.js";

/** Processed Amount total must be within this range before submit. */
export const SUMMARY_SUBMIT_TOTAL_MIN = "-0.05";
export const SUMMARY_SUBMIT_TOTAL_MAX = "0.05";

/** Matches legacy `MAX_ROWS_PER_BATCH` in datacapturesummary.js. */
export const SUMMARY_SUBMIT_MAX_ROWS_PER_BATCH = 20;

export function formatSummarySubmitTotalError(totalDisplay) {
  return `Cannot submit: The sum of Processed Amount must be between ${SUMMARY_SUBMIT_TOTAL_MIN} and ${SUMMARY_SUBMIT_TOTAL_MAX}. Current sum: ${totalDisplay}`;
}

export function validateSummarySubmitTotalPure(rows, globalRateInput = "") {
  const total = computeSummaryTotal(rows, globalRateInput);
  const totalRounded = roundSummaryTotalForValidation(total);
  const min = MoneyDecimal.toDecimal(SUMMARY_SUBMIT_TOTAL_MIN);
  const max = MoneyDecimal.toDecimal(SUMMARY_SUBMIT_TOTAL_MAX);
  if (MoneyDecimal.cmp(totalRounded, min) < 0 || MoneyDecimal.cmp(totalRounded, max) > 0) {
    return {
      ok: false,
      total: totalRounded,
      message: formatSummarySubmitTotalError(formatSummaryTotalDisplay(total)),
    };
  }
  return { ok: true, total: totalRounded };
}
