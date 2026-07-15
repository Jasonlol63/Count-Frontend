/**
 * Red/green loop: mat-table clipboard HTML must become multi-column <table>.
 * Run: node ./scripts/repro-mat-clipboard-normalize.mjs
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

const modUrl = pathToFileURL(
  path.join(__dirname, "../src/pages/datacapture/paste/core/dataCaptureFormatClipboardNormalize.js"),
).href;
const { normalizeClipboardHtmlToTable } = await import(modUrl);

function tableShape(html) {
  const root = document.createElement("div");
  root.innerHTML = html;
  const table = root.querySelector("table");
  if (!table) return { rows: 0, cols: 0, cells: [] };
  const trs = Array.from(table.querySelectorAll("tr"));
  const cells = trs.map((tr) =>
    Array.from(tr.querySelectorAll("td, th")).map((c) => (c.textContent || "").trim()),
  );
  const cols = Math.max(0, ...cells.map((r) => r.length));
  return { rows: trs.length, cols, cells };
}

const FIXTURES = {
  "native-mat-tags": `
    <mat-table>
      <mat-header-row role="row">
        <mat-header-cell role="columnheader">Agent</mat-header-cell>
        <mat-header-cell role="columnheader">Bet Number</mat-header-cell>
        <mat-header-cell role="columnheader">Promo Win</mat-header-cell>
      </mat-header-row>
      <mat-row role="row">
        <mat-cell role="gridcell">SDSPDA95</mat-cell>
        <mat-cell role="gridcell">2,120</mat-cell>
        <mat-cell role="gridcell">$0.00</mat-cell>
      </mat-row>
      <mat-row role="row">
        <mat-cell role="gridcell">SUBTOTAL</mat-cell>
        <mat-cell role="gridcell">2,120</mat-cell>
        <mat-cell role="gridcell">$0.00</mat-cell>
      </mat-row>
      <mat-row role="row">
        <mat-cell role="gridcell">TOTAL AMOUNT</mat-cell>
        <mat-cell role="gridcell">2,120</mat-cell>
        <mat-cell role="gridcell">$0.00</mat-cell>
      </mat-row>
    </mat-table>
  `,
  "div-class-mat-row": `
    <div class="mat-table cdk-table">
      <div role="row" class="mat-header-row">
        <div role="columnheader" class="mat-header-cell">Agent</div>
        <div role="columnheader" class="mat-header-cell">Bet Number</div>
        <div role="columnheader" class="mat-header-cell">Promo Win</div>
      </div>
      <div role="row" class="mat-row">
        <div role="gridcell" class="mat-cell">SDSPDA95</div>
        <div role="gridcell" class="mat-cell">2,120</div>
        <div role="gridcell" class="mat-cell">$0.00</div>
      </div>
      <div role="row" class="mat-row">
        <div role="gridcell" class="mat-cell">SUBTOTAL</div>
        <div role="gridcell" class="mat-cell">2,120</div>
        <div role="gridcell" class="mat-cell">$0.00</div>
      </div>
    </div>
  `,
  // Chrome often strips custom tags / roles and leaves flex children as plain divs
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
      <div class="mat-row" style="display:flex">
        <div class="mat-cell">TOTAL AMOUNT</div>
        <div class="mat-cell">2,120</div>
        <div class="mat-cell">$0.00</div>
        <div class="mat-cell">$3,008.85</div>
      </div>
    </div>
  `,
  // Worst case: row text only, cells flattened to newlines (user symptom)
  "row-text-only-newlines": `
    <div class="mat-table">
      <div role="row" class="mat-row">SDSPDA95
2,120
$0.00
$3,008.85
$3,008.85
$2,546.40
$3,008.85
$0.00
$462.45</div>
      <div role="row" class="mat-row">SUBTOTAL
2,120
$0.00
$3,008.85
$3,008.85
$2,546.40
$3,008.85
$0.00
$462.45</div>
      <div role="row" class="mat-row">TOTAL AMOUNT
2,120
$0.00
$3,008.85
$3,008.85
$2,546.40
$3,008.85
$0.00
$462.45</div>
    </div>
  `,
  // Single wrapper cell containing nested column divs
  "single-wrapper-nested-cells": `
    <div role="row" class="mat-row">
      <div class="row-inner">
        <div class="mat-cell">SDSPDA95</div>
        <div class="mat-cell">2,120</div>
        <div class="mat-cell">$0.00</div>
        <div class="mat-cell">$3,008.85</div>
      </div>
    </div>
  `,
};

let failed = 0;
for (const [name, html] of Object.entries(FIXTURES)) {
  const out = normalizeClipboardHtmlToTable(html);
  const shape = tableShape(out);
  const ok = shape.cols >= 3 && (shape.rows >= 2 || name === "single-wrapper-nested-cells");
  const firstRowCols = shape.cells[0]?.length ?? 0;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}: rows=${shape.rows} cols=${shape.cols} firstRowCols=${firstRowCols}`,
  );
  if (!ok) {
    failed += 1;
    console.log("  first row cells:", shape.cells[0]);
    console.log("  out snippet:", String(out).slice(0, 240).replace(/\s+/g, " "));
  }
}

if (failed) {
  console.error(`\n${failed} fixture(s) failed (expected multi-column table)`);
  process.exit(1);
}
console.log("\nAll fixtures green");
