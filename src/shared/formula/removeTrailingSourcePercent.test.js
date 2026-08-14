import test from "node:test";
import assert from "node:assert/strict";

import { createFormulaDisplayFromExpression } from "./buildFormulaDisplay.js";
import { removeTrailingSourcePercentExpression } from "./removeTrailingSourcePercent.js";

const expandedBankFormula = "1458.78*(1584.25/1458.78-0.0025)";

test("non-one Source preserves a trailing formula-body expression", () => {
  assert.equal(
    createFormulaDisplayFromExpression(expandedBankFormula, "0.5", true),
    `${expandedBankFormula}*(0.5)`,
  );
  assert.equal(
    createFormulaDisplayFromExpression(expandedBankFormula, "1.5", true),
    `${expandedBankFormula}*(1.5)`,
  );
});

test("an existing matching Source suffix is replaced without duplication", () => {
  assert.equal(
    createFormulaDisplayFromExpression(`${expandedBankFormula}*(0.50)`, "0.5", true),
    `${expandedBankFormula}*(0.5)`,
  );
});

test("Source removal does not strip an unrelated arithmetic multiplier", () => {
  assert.equal(
    removeTrailingSourcePercentExpression(expandedBankFormula, "0.5"),
    expandedBankFormula,
  );
  assert.equal(
    removeTrailingSourcePercentExpression(`${expandedBankFormula}*(0.5)`, "0.5"),
    expandedBankFormula,
  );
});
