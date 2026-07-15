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
const { normalizeClipboardHtmlToTable } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatClipboardNormalize.js")).href,
);
const { parseFormatHtmlTableStructure, buildFormatBodyMatrix } = await import(
  pathToFileURL(path.join(base, "dataCaptureFormatHtmlMatrix.js")).href,
);

const rows = [
  "SDSPDA95 2,881 $0.00 $4,378.65 $4,378.65 $3,000.00 $4,378.65 $0.00 $1,000.00",
  "SUBTOTAL 2,881 $0.00 $4,378.65 $4,378.65 $3,000.00 $4,378.65 $0.00 $1,000.00",
  "TOTAL AMOUNT 2,881 $0.00 $4,378.65 $4,378.65 $3,000.00 $4,378.65 $0.00 $1,000.00",
];

const html = `<table>${rows.map((t) => `<tr><td colspan="10">${t}</td></tr>`).join("")}</table>`;
const normalized = normalizeClipboardHtmlToTable(html);
const structure = parseFormatHtmlTableStructure(normalized);
console.log("dataRows", structure.dataRows.length, "maxCols", structure.maxCols);
structure.dataRows.forEach((tr, i) => {
  console.log(
    "row",
    i,
    "directCells",
    tr.children.length,
    [...tr.children].map((c) => (c.textContent || "").slice(0, 24)),
  );
});
const body = buildFormatBodyMatrix(structure.dataRows, structure.maxCols);
console.log("body rows", body.length, "cols", body[0]?.length);
body.forEach((r, i) => {
  const filled = r.filter((c) => String(c.value || "").trim()).length;
  console.log(
    "body",
    i,
    "filledCols",
    filled,
    r.map((c) => String(c.value || "").slice(0, 16)),
  );
});

// Simulate ONE crushed cell with all three rows (newlines) — user may copy as one block
const crushed = `<table><tr><td colspan="10">${rows.join("\n")}</td></tr></table>`;
const n2 = normalizeClipboardHtmlToTable(crushed);
const s2 = parseFormatHtmlTableStructure(n2);
const b2 = buildFormatBodyMatrix(s2.dataRows, s2.maxCols);
console.log("\nCRUSHED-ALL-IN-ONE:");
console.log("dataRows", s2.dataRows.length, "maxCols", s2.maxCols, "body", b2.length, "x", b2[0]?.length);
s2.dataRows.forEach((tr, i) => {
  console.log("crushed row", i, "cells", tr.children.length, [...tr.children].map((c) => (c.textContent || "").slice(0, 20)));
});
b2.forEach((r, i) => console.log("crushed body", i, r.map((c) => String(c.value || "").slice(0, 14))));
