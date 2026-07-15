import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const legacyPath = path.join(root, "js/datacapturesummary.js");
const outPath = path.join(
  root,
  "frontend/src/pages/datacapturesummary/formula/summaryFormulaReference.js"
);

const RANGES = [
  [2207, 2233],
  [2234, 2361],
  [8896, 8927],
  [8932, 9067],
  [9068, 9162],
  [9163, 9206],
  [9207, 9277],
  [9278, 9607],
  [9610, 9667],
  [10059, 10136],
  [10286, 10396],
  [11145, 11167],
];

const lines = fs.readFileSync(legacyPath, "utf8").split("\n");
const body = RANGES.map(([s, e]) => lines.slice(s - 1, e).join("\n")).join("\n\n");

const header = `/**
 * Phase 9b: Reference formula resolution + evaluation (extracted from datacapturesummary.js).
 * Regenerate: node frontend/scripts/extract-summary-formula-reference.mjs
 */
import { MoneyDecimal } from "../../../utils/money/moneyDecimal.js";
import { evaluateExpression } from "./summaryFormulaEvaluate.js";
import { removeThousandsSeparators } from "./summaryFormulaParseUtils.js";

function normalizeIdProductText(text) {
  if (typeof window.normalizeIdProductText === "function") {
    return window.normalizeIdProductText(text);
  }
  return (text || "").trim().replace(/\\s+/g, "");
}

function truncateProcessedAmountTo6Decimals(value) {
  if (typeof window.truncateProcessedAmountTo6Decimals === "function") {
    return window.truncateProcessedAmountTo6Decimals(value);
  }
  return value;
}

`;

const footer = `

export function registerSummaryFormulaReferenceEngine() {
  window.__SUMMARY_FORMULA_REFERENCE_ENGINE__ = true;
  window.__SUMMARY_PARSE_REFERENCE_FORMULA__ = parseReferenceFormula;
  window.__SUMMARY_EVALUATE_FORMULA_EXPRESSION__ = evaluateFormulaExpression;
  window.__SUMMARY_CALCULATE_FORMULA_RESULT_FROM_EXPRESSION__ = calculateFormulaResultFromExpression;
  window.parseReferenceFormula = parseReferenceFormula;
  window.evaluateFormulaExpression = evaluateFormulaExpression;
  window.calculateFormulaResultFromExpression = calculateFormulaResultFromExpression;
  window.getCellValueByIdProductAndColumn = getCellValueByIdProductAndColumn;
  window.resolveToFullIdProduct = resolveToFullIdProduct;
  window.applyInputMethodTransformation = applyInputMethodTransformation;
}

export function unregisterSummaryFormulaReferenceEngine() {
  delete window.__SUMMARY_FORMULA_REFERENCE_ENGINE__;
  delete window.__SUMMARY_PARSE_REFERENCE_FORMULA__;
  delete window.__SUMMARY_EVALUATE_FORMULA_EXPRESSION__;
  delete window.__SUMMARY_CALCULATE_FORMULA_RESULT_FROM_EXPRESSION__;
}
`;

fs.writeFileSync(outPath, header + body + footer);
console.log("Wrote", outPath, `(${RANGES.length} slices)`);
