import test from "node:test";
import assert from "node:assert/strict";

import {
  bindSummaryFormulaContext,
  clearSummaryFormulaContext,
} from "../lib/summaryFormulaContext.js";
import {
  isSafeIdProductSuffixMatch,
  summaryIdProductsEqual,
} from "../lib/summaryIdProductUtils.js";
import {
  getCellValueByIdProductAndColumn,
  parseReferenceFormula,
} from "./summaryFormulaReference.js";
import { findMainRowForTemplate } from "../table/summaryTemplateMatching.js";

function dataCell(value) {
  return { type: "data", value };
}

function headerCell(value) {
  return { type: "header", value };
}

/**
 * Build a minimal captured table:
 *   row A = AW07 with cols 3 (-227.95) and 14 (-15.60)
 *   row B = AW9966 with col 3 (-718.39)
 */
function buildTable() {
  const aw07 = [
    headerCell("A"),
    dataCell("AW07"),
    dataCell("0"), // display col 2 / data col 1
    dataCell("-227.95"), // display col 3 / data col 2
  ];
  // Pad so display column 14 exists (data column index 13 → row slot 14)
  while (aw07.length < 15) {
    aw07.push(dataCell("0"));
  }
  aw07[14] = dataCell("-15.60"); // display col 14

  const aw9966 = [
    headerCell("B"),
    dataCell("AW9966"),
    dataCell("0"),
    dataCell("-718.39"), // display col 3
  ];

  return { rows: [aw07, aw9966] };
}

/** Fixture matching the TT683951 / *REVERT* capture layout. */
function buildRevertSiblingTable() {
  const revertA = [
    headerCell("A"),
    dataCell("*REVERT* TT683951A"),
    dataCell("468.32"),
    dataCell("-29.27"),
    dataCell("-439.05"),
  ];
  const revertB = [
    headerCell("B"),
    dataCell("*REVERT* TT683951"),
    dataCell("468.32"),
    dataCell("-29.27"),
    dataCell("-439.05"),
  ];
  const live = [
    headerCell("C"),
    dataCell("TT683951A"),
    dataCell("103,700.00"),
    dataCell("84,400.00"),
    dataCell("0"),
    dataCell("256.96"),
    dataCell("-15"),
    dataCell("-1.05"),
    dataCell("-16.06"),
    dataCell("0"),
    dataCell("-240.9"),
  ];
  return { rows: [revertA, revertB, live] };
}

test("parseReferenceFormula keeps $N indices valid after [other,col] expansion", () => {
  bindSummaryFormulaContext({ tableData: buildTable() });
  try {
    const formula = "$14-[AW9966,3]/$3";
    const expanded = parseReferenceFormula(formula, "AW07", "", 0);
    assert.equal(expanded, "(-15.60)-(-718.39)/(-227.95)");
    assert.equal(expanded.includes("$-"), false);
  } finally {
    clearSummaryFormulaContext();
  }
});

test("parseReferenceFormula handles other-row ref before own-row $N without slash", () => {
  bindSummaryFormulaContext({ tableData: buildTable() });
  try {
    const formula = "$14-[AW9966,3]$3";
    const expanded = parseReferenceFormula(formula, "AW07", "", 0);
    assert.equal(expanded, "(-15.60)-(-718.39)(-227.95)");
    assert.equal(expanded.includes("$"), false);
  } finally {
    clearSummaryFormulaContext();
  }
});

test("summaryIdProductsEqual treats *REVERT* sibling as a distinct product", () => {
  assert.equal(summaryIdProductsEqual("TT683951A", "TT683951A"), true);
  assert.equal(summaryIdProductsEqual("TT683951A", "*REVERT* TT683951A"), false);
  assert.equal(isSafeIdProductSuffixMatch("*REVERT* TT683951A", "TT683951A"), false);
  assert.equal(isSafeIdProductSuffixMatch("FOO(T07)", "(T07)"), true);
});

test("getCellValueByIdProductAndColumn does not resolve TT683951A onto *REVERT* row", () => {
  bindSummaryFormulaContext({ tableData: buildRevertSiblingTable() });
  try {
    // Stale template row label A points at *REVERT*, but Id Product must win.
    const col2 = getCellValueByIdProductAndColumn("TT683951A", 1, "A", null);
    assert.equal(col2, "103700.00");
    const col5 = getCellValueByIdProductAndColumn("TT683951A", 4, null, null);
    assert.equal(col5, "256.96");
    const dollarExpanded = parseReferenceFormula("$2 $5", "TT683951A", "", 2);
    assert.equal(dollarExpanded.includes("103700.00") || dollarExpanded.includes("103,700.00"), true);
    assert.equal(dollarExpanded.includes("256.96"), true);
    assert.equal(dollarExpanded.includes("468.32"), false);
  } finally {
    clearSummaryFormulaContext();
  }
});

test("findMainRowForTemplate prefers exact TT683951A over stale row_index 0", () => {
  const rows = [
    {
      key: "r0",
      productType: "main",
      idProduct: "*REVERT* TT683951A",
      rowIndex: 0,
      accountId: null,
      account: "",
    },
    {
      key: "r2",
      productType: "main",
      idProduct: "TT683951A",
      rowIndex: 2,
      accountId: null,
      account: "",
    },
  ];
  const target = findMainRowForTemplate(
    rows,
    "TT683951A",
    { id_product: "TT683951A", row_index: 0, account_id: null },
    new Set()
  );
  assert.equal(target?.idProduct, "TT683951A");
  assert.equal(target?.rowIndex, 2);
});
