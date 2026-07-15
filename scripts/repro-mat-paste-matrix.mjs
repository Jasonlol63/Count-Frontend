/**
 * End-to-end: clipboard HTML → normalize → format structure → body matrix cols.
 * Run: node ./scripts/repro-mat-paste-matrix.mjs
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
globalThis.HTMLElement = window.HTMLElement;
globalThis.DOMParser = window.DOMParser;

const base = path.join(__dirname, "../src/pages/datacapture/paste/core");
const { normalizeClipboardHtmlToTable } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatClipboardNormalize.js")).href
);
const { parseFormatHtmlTableStructure, buildFormatBodyMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatHtmlMatrix.js")).href
);

function matrixFromHtml(html) {
  const normalized = normalizeClipboardHtmlToTable(html) || html;
  const structure = parseFormatHtmlTableStructure(normalized);
  if (!structure) return { ok: false, reason: "no-structure", normalized };
  const body = buildFormatBodyMatrix(structure.dataRows, structure.maxCols);
  const cols = body[0]?.length || 0;
  const rows = body.length;
  const sample = body.map((r) => r.map((c) => String(c.value || "").trim().slice(0, 24)));
  return { ok: cols >= 3 && rows >= 1, cols, rows, maxCols: structure.maxCols, sample, normalized };
}

const FIXTURES = {
  "flex-row-plain-divs": `
    <div class="mat-table">
      <div class="mat-row" style="display:flex">
        <div class="mat-cell">SDSPDA95</div>
        <div class="mat-cell">2,120</div>
        <div class="mat-cell">$0.00</div>
        <div class="mat-cell">$3,008.85</div>
      </div>
      <div class="mat-row" style="display:flex">
        <div class="mat-cell">SUBTOTAL</div>
        <div class="mat-cell">2,120</div>
        <div class="mat-cell">$0.00</div>
        <div class="mat-cell">$3,008.85</div>
      </div>
    </div>
  `,
  // Real failure mode: a <table> already exists but each row is ONE td wrapping mat-cells
  "table-one-td-nested-mat-cells": `
    <table>
      <tr><td>
        <div class="mat-cell">SDSPDA95</div>
        <div class="mat-cell">2,120</div>
        <div class="mat-cell">$0.00</div>
        <div class="mat-cell">$3,008.85</div>
        <div class="mat-cell">$2,546.40</div>
      </td></tr>
      <tr><td>
        <div class="mat-cell">SUBTOTAL</div>
        <div class="mat-cell">2,120</div>
        <div class="mat-cell">$0.00</div>
        <div class="mat-cell">$3,008.85</div>
        <div class="mat-cell">$2,546.40</div>
      </td></tr>
      <tr><td>
        <div class="mat-cell">TOTAL AMOUNT</div>
        <div class="mat-cell">2,120</div>
        <div class="mat-cell">$0.00</div>
        <div class="mat-cell">$3,008.85</div>
        <div class="mat-cell">$2,546.40</div>
      </td></tr>
    </table>
  `,
  "table-one-td-newline-text": `
    <table>
      <tr><td>SDSPDA95
2,120
$0.00
$3,008.85</td></tr>
      <tr><td>SUBTOTAL
2,120
$0.00
$3,008.85</td></tr>
    </table>
  `,
  // User symptom: colspan fake width + single-space flattened row (no br)
  "table-colspan-space-flat": `
    <table>
      <tr><td colspan="10">SDSPDA95 2,120 $0.00 $3,008.85 $3,008.85 $2,546.40 $3,008.85 $0.00 $462.45</td></tr>
      <tr><td colspan="10">SUBTOTAL 2,120 $0.00 $3,008.85 $3,008.85 $2,546.40 $3,008.85 $0.00 $462.45</td></tr>
      <tr><td colspan="10">TOTAL AMOUNT 2,120 $0.00 $3,008.85 $3,008.85 $2,546.40 $3,008.85 $0.00 $462.45</td></tr>
    </table>
  `,
};

let failed = 0;
for (const [name, html] of Object.entries(FIXTURES)) {
  const result = matrixFromHtml(html);
  console.log(
    `${result.ok ? "PASS" : "FAIL"} ${name}: rows=${result.rows} cols=${result.cols} maxCols=${result.maxCols}`,
  );
  if (!result.ok) {
    failed += 1;
    console.log("  sample:", result.sample);
    console.log("  reason:", result.reason || "cols<3");
  }
}

if (failed) {
  console.error(`\n${failed} fixture(s) failed`);
  process.exit(1);
}
console.log("\nAll matrix fixtures green");
