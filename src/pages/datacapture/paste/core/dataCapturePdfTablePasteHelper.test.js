import test from "node:test";
import assert from "node:assert/strict";

import {
  looksLikePdfTablePlain,
  tryReshapePdfTablePlainMatrix,
  trySplitPdfTableLine,
} from "./dataCapturePdfTablePasteHelper.js";

test("multi-space PDF columns split without vendor-specific tokens", () => {
  assert.deepEqual(
    trySplitPdfTableLine("Some Product    AA    10.00    200.50    15.00"),
    ["Some Product", "AA", "10.00", "200.50", "15.00"],
  );
});

test("single-space collapsed invoice-style row keeps multi-word brand", () => {
  assert.deepEqual(
    trySplitPdfTableLine("Ag:Asiagaming - Gsc Lc - VTBM PT 7.50 (MYR) 171.50 12.86"),
    ["Ag:Asiagaming - Gsc Lc - VTBM", "PT", "7.50", "(MYR) 171.50", "12.86"],
  );
  assert.deepEqual(
    trySplitPdfTableLine("Ag Asiagaming - GscLc - VTBM PT 7.50 (MYR) 171.50 12.86"),
    ["Ag Asiagaming - GscLc - VTBM", "PT", "7.50", "(MYR) 171.50", "12.86"],
  );
  assert.deepEqual(
    trySplitPdfTableLine("AG ASIAGAMING- GSCLC- VTBM PT 7.50 (MYR) 171.50 12.86"),
    ["AG ASIAGAMING- GSCLC- VTBM", "PT", "7.50", "(MYR) 171.50", "12.86"],
  );
});

test("optional row index stays first column", () => {
  assert.deepEqual(
    trySplitPdfTableLine("1 AG:ASIAGAMING - GSC LC - K69M PT 7.50 (MYR) 25.00 1.88"),
    ["1", "AG:ASIAGAMING - GSC LC - K69M", "PT", "7.50", "(MYR) 25.00", "1.88"],
  );
});

test("footer labels", () => {
  assert.deepEqual(trySplitPdfTableLine("Grand Total 12.86"), ["Grand Total", "12.86"]);
  assert.deepEqual(trySplitPdfTableLine("Net Sub Total 12.86"), ["Net Sub Total", "12.86"]);
});

test("reshape multi-line paste for 1.TEXT / 2.FORMAT", () => {
  const pasted = [
    "Ag:Asiagaming - Gsc Lc - VTBM PT 7.50 (MYR) 171.50 12.86",
    "Grand Total 12.86",
  ].join("\n");
  assert.equal(looksLikePdfTablePlain(pasted), true);
  const matrix = tryReshapePdfTablePlainMatrix(pasted);
  assert.ok(matrix);
  assert.equal(matrix.length, 2);
  assert.deepEqual(matrix[0], [
    "Ag:Asiagaming - Gsc Lc - VTBM",
    "PT",
    "7.50",
    "(MYR) 171.50",
    "12.86",
  ]);
});

test("does not claim free prose or dense TSV", () => {
  assert.equal(looksLikePdfTablePlain("hello world how are you"), false);
  assert.equal(
    tryReshapePdfTablePlainMatrix("a\tb\tc\n1\t2\t3"),
    null,
  );
});
