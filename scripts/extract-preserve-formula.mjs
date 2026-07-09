import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const legacyPath = path.resolve(__dirname, "../../js/datacapturesummary.js");
const outPath = path.resolve(
  __dirname,
  "../src/pages/datacapturesummary/formula/summaryPreserveFormula.js"
);

const lines = fs.readFileSync(legacyPath, "utf8").split("\n");
const body = lines.slice(10981, 11583).join("\n");

const header = `/**
 * preserveFormulaStructure (extracted from js/datacapturesummary.js).
 * Regenerate: node frontend/scripts/extract-preserve-formula.mjs
 */
import { createFormulaDisplayFromExpression } from "../../../shared/formula/index.js";
import {
  formatNegativeNumbersInFormula,
  removeThousandsSeparators,
  getFormulaNumberMatches,
} from "./summaryFormulaParseUtils.js";

function formatDecimalValue(num) {
  const n = Number(num);
  return Number.isNaN(n) ? String(num) : String(n);
}

function createSourcePercentDisplay(sourcePercentValue) {
  try {
    if (!sourcePercentValue || String(sourcePercentValue).trim() === "") return "(0)";
    const sourcePercentExpr = String(sourcePercentValue).trim();
    if (/[+\\-*/]/.test(sourcePercentExpr)) {
      return \`(\${removeThousandsSeparators(sourcePercentExpr)})\`;
    }
    const numValue = parseFloat(sourcePercentExpr);
    if (!Number.isNaN(numValue)) return \`(\${formatDecimalValue(numValue)})\`;
    return \`(\${sourcePercentExpr})\`;
  } catch {
    return "(0)";
  }
}

`;

const patched = body.replace(
  /^function preserveFormulaStructure/,
  "export function preserveFormulaStructure"
);

fs.writeFileSync(outPath, header + patched + "\n");
console.log("Wrote", outPath);
