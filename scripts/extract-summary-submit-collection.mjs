import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const legacyPath = path.join(root, "js/datacapturesummary.js");
const outPath = path.join(
  root,
  "frontend/src/pages/datacapturesummary/submit/summarySubmitRowCollection.js"
);

let s = fs.readFileSync(legacyPath, "utf8");

const blockStart = "        // Collect all rows with data from summary table";
const blockStartIdx = s.indexOf(blockStart);
if (blockStartIdx === -1) throw new Error("collect block start not found");

const prepStart = "        // Pre-load account list so rows without data-account-id can resolve accountId";
const prepIdx = s.indexOf(prepStart, blockStartIdx);
const startMarker = "        rows.forEach(row => {";
const startIdx = s.indexOf(startMarker, blockStartIdx);
const endMarker = "        if (summaryRows.length === 0) {";
const endIdx = s.indexOf(endMarker, startIdx);
if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
  throw new Error("forEach markers not found");
}

const forEachBody = s
  .slice(startIdx + startMarker.length, endIdx)
  .replace(/\s*\}\);\s*$/, "")
  .replace(/^            /gm, "    ");

const reactModule = `import { validateSummaryRowsCurrencyFormula } from "./summarySubmitRowValidation.js";

/** Collect summary table DOM rows into API payload objects. */
export function collectSummarySubmitRowsFromTable(rows, parsedProcessData) {
  const summaryRows = [];
  rows.forEach((row) => {${forEachBody}
  });
  return summaryRows;
}

/** Preload accounts, validate rows, collect payload rows. */
export async function prepareSummarySubmitCollection(parsedProcessData) {
  const summaryTableBody = document.getElementById("summaryTableBody");
  if (!summaryTableBody) {
    return { ok: false, message: "Summary table not found.", rows: [] };
  }

  const rows = summaryTableBody.querySelectorAll("tr");
  if (typeof window.fetchSummaryAccountList === "function") {
    window.__summaryAccountListCache = await window.fetchSummaryAccountList();
  }

  const rowValidation = validateSummaryRowsCurrencyFormula(rows);
  if (!rowValidation.ok) {
    return { ok: false, message: rowValidation.message, rows: [] };
  }

  const summaryRows = collectSummarySubmitRowsFromTable(rows, parsedProcessData);
  if (summaryRows.length === 0) {
    return {
      ok: false,
      warning: true,
      message: "No data to submit. Please add at least one row with data.",
      rows: [],
    };
  }

  return { ok: true, rows: summaryRows };
}
`;

fs.writeFileSync(outPath, reactModule);

const legacyPrepareFn = `
async function prepareSummarySubmitCollection(parsedProcessData) {
    if (typeof window.__SUMMARY_REACT_PREPARE_SUBMIT_COLLECTION__ === 'function') {
        return window.__SUMMARY_REACT_PREPARE_SUBMIT_COLLECTION__(parsedProcessData);
    }
    const summaryTableBody = document.getElementById('summaryTableBody');
    if (!summaryTableBody) {
        return { ok: false, message: 'Summary table not found.', rows: [] };
    }
    const rows = summaryTableBody.querySelectorAll('tr');
    window.__summaryAccountListCache = await fetchSummaryAccountList();
    const rowValidation = validateSummaryRowsCurrencyFormula(rows);
    if (!rowValidation.ok) {
        return { ok: false, message: rowValidation.message, rows: [] };
    }
    const summaryRows = collectSummarySubmitRowsFromTable(rows, parsedProcessData);
    if (summaryRows.length === 0) {
        return {
            ok: false,
            warning: true,
            message: 'No data to submit. Please add at least one row with data.',
            rows: []
        };
    }
    return { ok: true, rows: summaryRows };
}

function collectSummarySubmitRowsFromTable(rows, parsedProcessData) {
    const summaryRows = [];
    rows.forEach(row => {${s.slice(startIdx + startMarker.length, endIdx).replace(/\s*\}\);\s*$/, "")}
    });
    return summaryRows;
}

window.__SUMMARY_PREPARE_SUBMIT_COLLECTION__ = prepareSummarySubmitCollection;
window.__SUMMARY_COLLECT_SUBMIT_ROWS__ = async function () {
    const raw = localStorage.getItem('capturedProcessData');
    if (!raw) return [];
    const parsedProcessData = JSON.parse(raw);
    const prep = await prepareSummarySubmitCollection(parsedProcessData);
    return prep.ok ? prep.rows : [];
};
`;

const insertBefore = "function validateSummarySubmitTotal() {";
const insertIdx = s.indexOf(insertBefore);
if (insertIdx === -1) throw new Error("insert point not found");

if (!s.includes("function collectSummarySubmitRowsFromTable")) {
  s = s.slice(0, insertIdx) + legacyPrepareFn + "\n" + s.slice(insertIdx);
}

const replacement = [
  "        const prep = await prepareSummarySubmitCollection(parsedProcessData);",
  "        if (!prep.ok) {",
  "            setSummarySubmitUiActive(false);",
  "            showNotification(prep.warning ? 'Warning' : 'Error', prep.message || 'Failed to prepare summary rows.', 'error');",
  "            return;",
  "        }",
  "        const summaryRows = prep.rows;",
  "",
  "        ",
].join("\n");

const obs = s.indexOf(blockStart);
const obe = s.indexOf(endMarker, obs);
if (obs === -1 || obe === -1) throw new Error("old block not found for replacement");

if (s.slice(obs, obe).includes("rows.forEach(row =>")) {
  s = s.slice(0, obs) + replacement + s.slice(obe);
}

fs.writeFileSync(legacyPath, s);
console.log("Wrote", outPath);
console.log("Patched", legacyPath);
