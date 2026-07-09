/**
 * Regenerate formula parse/eval modules from js/datacapturesummary.js (manual sync reference).
 * Core utilities are maintained in frontend/src/pages/datacapturesummary/formula/.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const legacyPath = path.resolve(__dirname, "../../js/datacapturesummary.js");

const markers = [
  "function parseIdProductColumnRef",
  "function removeThousandsSeparators",
  "function evaluateMoneyExpression",
  "function evaluateExpression",
  "function parseCompleteFormula",
  "function parseSourceColumnsInput",
];

const src = fs.readFileSync(legacyPath, "utf8");
const found = markers.filter((m) => src.includes(m));
console.log("Legacy formula markers present:", found.join(", "));
console.log("React modules: frontend/src/pages/datacapturesummary/formula/");
console.log("Next extract target: parseReferenceFormula, evaluateFormulaExpression, saveFormula");
