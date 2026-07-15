/**
 * Verify billing-statement plain text reshapes to multi-column like 3.CITIBET.
 * Run: node ./scripts/repro-statement-plain-matrix.mjs
 */
import { parseHTML } from "linkedom";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
globalThis.window = window;
globalThis.document = document;
globalThis.Node = window.Node;

const base = path.join(__dirname, "../src/pages/datacapture/paste/core");
const { parsePlainTextMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureTextPaste.js")).href,
);
const {
  plainTextLooksLikeBillingStatement,
  tryApplyBillingStatementPlainMatrix,
} = await import(pathToFileURL(path.join(base, "dataCaptureStatementMatrixPaste.js")).href);
const { tokenizeCollapsedReportRow } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatClipboardNormalize.js")).href,
);

const row1 = [
  "SDSPDA95",
  "2,881",
  "$0.00",
  "$4,378.65",
  "$4,378.65",
  "$4,199.70",
  "$4,378.65",
  "$0.00",
  "$178.95",
];
const row2 = [
  "SUBTOTAL",
  "2,881",
  "$0.00",
  "$4,378.65",
  "$4,378.65",
  "$4,199.70",
  "$4,378.65",
  "$0.00",
  "$178.95",
];
const row3 = [
  "TOTAL AMOUNT",
  "2,881",
  "$0.00",
  "$4,378.65",
  "$4,378.65",
  "$4,199.70",
  "$4,378.65",
  "$0.00",
  "$178.95",
];

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL", msg);
    process.exit(1);
  }
  console.log("PASS", msg);
}

// 3-row flattened (one token per line) — existing path
{
  const pasted = [...row1, ...row2, ...row3].join("\n");
  assert(plainTextLooksLikeBillingStatement(pasted), "3-row looks like statement");
  const matrix = parsePlainTextMatrix(pasted);
  assert(matrix.length === 3 && matrix[0]?.length === 9, `3-row flat parse ${matrix.length}x${matrix[0]?.length}`);
}

// 2-row flattened (Agent + SUBTOTAL, no TOTAL AMOUNT) — the reported bug
{
  const pasted = [...row1, ...row2].join("\n");
  assert(plainTextLooksLikeBillingStatement(pasted), "2-row looks like statement (SUBTOTAL only)");
  const matrix = parsePlainTextMatrix(pasted);
  assert(matrix.length === 2 && matrix[0]?.length === 9, `2-row flat parse ${matrix.length}x${matrix[0]?.length}`);
  assert(matrix[0][0] === "SDSPDA95" && matrix[1][0] === "SUBTOTAL", "2-row labels");
}

// 2 space-separated lines → 1-col parse, then tokenize expand (statement path)
{
  const pasted = `${row1.join(" ")}\n${row2.join(" ")}`;
  assert(plainTextLooksLikeBillingStatement(pasted), "2-line spaced looks like statement");
  const raw = parsePlainTextMatrix(pasted);
  const maxCols = Math.max(...raw.map((r) => r.length));
  if (maxCols < 2) {
    const expanded = raw.map((row) => {
      const text = row.join(" ");
      const tokens = tokenizeCollapsedReportRow(text);
      return tokens.length >= 2 ? tokens : row;
    });
    assert(
      expanded.length === 2 && expanded[0].length === 9,
      `2-line tokenize expand ${expanded.length}x${expanded[0]?.length}`,
    );
  } else {
    assert(maxCols === 9, `2-line parse already ${raw.length}x${maxCols}`);
  }
}

// Gate must not require TOTAL AMOUNT; must not match unrelated text
assert(!plainTextLooksLikeBillingStatement("hello world"), "unrelated text rejected");
assert(
  typeof tryApplyBillingStatementPlainMatrix === "function",
  "tryApplyBillingStatementPlainMatrix exported",
);
