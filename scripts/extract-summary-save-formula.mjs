import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const legacyPath = path.join(root, "js/datacapturesummary.js");
const outPath = path.join(
  root,
  "frontend/src/pages/datacapturesummary/formula/summarySaveFormula.js"
);

const START = 8079;
const END = 8794;

const lines = fs.readFileSync(legacyPath, "utf8").split("\n");
const bodyLines = lines.slice(START - 1, END);
const body = bodyLines
  .join("\n")
  .replace(/^function saveFormula\(\)/, "export function saveFormula()");

const header = `/**
 * Phase 9c: Edit Formula Save orchestration (extracted from datacapturesummary.js).
 * Regenerate: node frontend/scripts/extract-summary-save-formula.mjs
 */
import { parseIdProductColumnRef } from "./summaryFormulaParseUtils.js";
import {
  calculateFormulaResultFromExpression,
  evaluateFormulaExpression,
} from "./summaryFormulaReference.js";

function call(name, ...args) {
  const fn = window[name];
  if (typeof fn !== "function") {
    throw new Error(\`Legacy summary helper missing: \${name}\`);
  }
  return fn(...args);
}

const showNotification = (...args) => call("showNotification", ...args);
const getAccountId = (...args) => call("getAccountId", ...args);
const getAccountText = (...args) => call("getAccountText", ...args);
const getColumnsDisplayFromClickedColumns = (...args) =>
  call("getColumnsDisplayFromClickedColumns", ...args);
const getEffectiveClickedRefsForDollarOnlyFormula = (...args) =>
  call("getEffectiveClickedRefsForDollarOnlyFormula", ...args);
const getSummaryRowFormulaRefContext = (...args) =>
  call("getSummaryRowFormulaRefContext", ...args);
const getProcessValueFromRow = (...args) => call("getProcessValueFromRow", ...args);
const getProductValuesFromCell = (...args) => call("getProductValuesFromCell", ...args);
const getRowLabelFromProcessValue = (...args) => call("getRowLabelFromProcessValue", ...args);
const updateFormulaDisplay = (...args) => call("updateFormulaDisplay", ...args);
const createFormulaDisplayFromExpression = (...args) =>
  call("createFormulaDisplayFromExpression", ...args);
const roundProcessedAmountTo2Decimals = (...args) =>
  call("roundProcessedAmountTo2Decimals", ...args);
const updateSubIdProductRow = (...args) => call("updateSubIdProductRow", ...args);
const updateSummaryTableRow = (...args) => call("updateSummaryTableRow", ...args);
const addSubIdProductRow = (...args) => call("addSubIdProductRow", ...args);
const updateIdProductWithDescription = (...args) =>
  call("updateIdProductWithDescription", ...args);
const rebuildUsedAccountIds = (...args) => call("rebuildUsedAccountIds", ...args);
const findSummaryRowForTemplate = (...args) => call("findSummaryRowForTemplate", ...args);
const extractRowDataForTemplate = (...args) => call("extractRowDataForTemplate", ...args);
const saveTemplateAsync = (...args) => call("saveTemplateAsync", ...args);
const closeEditFormulaForm = (...args) => call("closeEditFormulaForm", ...args);
const saveFormulaSourceForRefresh = (...args) => call("saveFormulaSourceForRefresh", ...args);
const formatNumberWithThousands = (...args) => call("formatNumberWithThousands", ...args);
const extractNumbersFromFormula = (...args) => call("extractNumbersFromFormula", ...args);

`;

const footer = `

export function registerSummarySaveFormula() {
  window.__SUMMARY_SAVE_FORMULA__ = saveFormula;
  window.saveFormula = saveFormula;
}

export function unregisterSummarySaveFormula() {
  delete window.__SUMMARY_SAVE_FORMULA__;
}
`;

fs.writeFileSync(outPath, header + body + footer);
console.log("Wrote", outPath, `(${END - START + 1} lines)`);
