/**
 * Playwright smoke: Edit Formula preview expansion after other-row + own-row refs.
 *
 * Reproduces the bug where `$14-[AW9966,3]/$3` expanded to
 * `(-15.60)-(-718.39)/$-227.95` (stray `$`) because `$N` indices were taken
 * from the pre-bracket string.
 *
 * Usage:
 *   node scripts/playwright-edit-formula-ref-smoke.mjs
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  bindSummaryFormulaContext,
  clearSummaryFormulaContext,
} from "../src/pages/datacapturesummary/lib/summaryFormulaContext.js";
import { buildExpandedFormulaDisplay } from "../src/pages/datacapturesummary/formula/editFormulaFormState.js";
import { parseReferenceFormula } from "../src/pages/datacapturesummary/formula/summaryFormulaReference.js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadPlaywright() {
  const candidates = [
    path.resolve(__dirname, "../node_modules/playwright"),
    path.resolve(__dirname, "../../node_modules/playwright"),
  ];
  for (const dir of candidates) {
    try {
      return require(dir);
    } catch {
      /* next */
    }
  }
  throw new Error("playwright not found — run npm i -D playwright in frontend/");
}

const { chromium } = loadPlaywright();

function dataCell(value) {
  return { type: "data", value };
}

function headerCell(value) {
  return { type: "header", value };
}

function buildTable() {
  const aw07 = [headerCell("A"), dataCell("AW07"), dataCell("0"), dataCell("-227.95")];
  while (aw07.length < 15) aw07.push(dataCell("0"));
  aw07[14] = dataCell("-15.60");

  const aw9966 = [headerCell("B"), dataCell("AW9966"), dataCell("0"), dataCell("-718.39")];
  return { rows: [aw07, aw9966] };
}

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function fail(msg) {
  console.error(`  ✗ ${msg}`);
  throw new Error(msg);
}

async function main() {
  console.log("Playwright Edit Formula ref expansion smoke");
  bindSummaryFormulaContext({ tableData: buildTable() });

  const cases = [
    {
      name: "other-row then own-row with /",
      formula: "$14-[AW9966,3]/$3",
      expected: "(-15.60)-(-718.39)/(-227.95)",
    },
    {
      name: "other-row then own-row without operator",
      formula: "$14-[AW9966,3]$3",
      expected: "(-15.60)-(-718.39)(-227.95)",
    },
  ];

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<!DOCTYPE html>
<html><body>
  <h1 id="title">Edit Formula ref smoke</h1>
  <pre id="out"></pre>
</body></html>`);

    await page.exposeFunction("expandViaEditFormulaPath", (formula) => {
      // Same path Edit Formula preview uses: buildExpandedFormulaDisplay → parseReferenceFormula
      return buildExpandedFormulaDisplay(formula, "AW07", "", 0);
    });

    await page.exposeFunction("expandViaParseReference", (formula) => {
      return parseReferenceFormula(formula, "AW07", "", 0);
    });

    for (const c of cases) {
      const fromPreview = await page.evaluate(async (formula) => {
        return window.expandViaEditFormulaPath(formula);
      }, c.formula);

      const fromParse = await page.evaluate(async (formula) => {
        return window.expandViaParseReference(formula);
      }, c.formula);

      if (fromPreview !== c.expected) {
        fail(`${c.name}: preview got ${JSON.stringify(fromPreview)}, expected ${JSON.stringify(c.expected)}`);
      }
      if (fromParse !== c.expected) {
        fail(`${c.name}: parse got ${JSON.stringify(fromParse)}, expected ${JSON.stringify(c.expected)}`);
      }
      if (String(fromPreview).includes("$-") || String(fromParse).includes("$-")) {
        fail(`${c.name}: stray $- still present`);
      }
      ok(`${c.name} → ${fromPreview}`);
    }

    await page.evaluate((lines) => {
      document.getElementById("out").textContent = lines.join("\n");
    }, cases.map((c) => `${c.formula} => ${c.expected}`));

    const title = await page.locator("#title").textContent();
    if (title !== "Edit Formula ref smoke") fail("page title missing");
    ok("Chromium page rendered");
    console.log("All checks passed.");
  } finally {
    clearSummaryFormulaContext();
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
