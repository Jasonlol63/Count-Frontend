/**
 * Repro smoke: C8Play Win Loss Detail (3 rows: 2 agents + Subtotal)
 * paste into Data Capture 1.TEXT / 2.FORMAT.
 *
 * Source site (agbc.i8win.com) requires login — fixtures mimic Material clipboard.
 *
 * Usage:
 *   node scripts/playwright-c8winloss-paste-smoke.mjs
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  dropTrailingJunkRows,
  plainTextLooksLikeAlignedTsv,
  sanitizePasteMatrix,
} from "../src/pages/datacapture/paste/core/dataCapturePasteMatrixSanitize.js";
import { parsePlainTextMatrix } from "../src/pages/datacapture/paste/core/dataCaptureTextPaste.js";
import {
  looksLikeC8WinLossPlain,
  tryReshapeC8WinLossPlainMatrix,
} from "../src/pages/datacapture/paste/core/dataCaptureC8WinLossPasteHelper.js";
import { detectVerticalFieldDump } from "../src/pages/datacapture/paste/core/dataCaptureVerticalDumpDetect.js";
import { buildColumnAEntries } from "../src/pages/datacapturesummary/table/summaryColumnAData.js";
import { buildInitialSummaryRows } from "../src/pages/datacapturesummary/table/summaryTemplatePopulatePure.js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");

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

/** Values from user screenshot (Turn Over / Downline totals). */
const AGENT1 = [
  "CK203",
  "87",
  "AGENT",
  "85,423.66",
  "19,004.16",
  "0.00",
  "19,004.16",
  "0.00",
  "16,254.51",
  "-2,749.65",
  "0.00",
  "0.00",
  "0.00",
  "0.00",
  "0.00",
  "0.00",
  "19,004.16",
  "0.00",
  "16,254.51",
  "-2,749.65",
];
const AGENT2 = [
  "CXZ15",
  "8",
  "AGENT",
  "175,530.04",
  "40,500.00",
  "0.00",
  "40,500.00",
  "0.00",
  "34,200.00",
  "-6,300.00",
  "0.00",
  "0.00",
  "0.00",
  "0.00",
  "0.00",
  "0.00",
  "40,500.00",
  "0.00",
  "34,200.00",
  "-6,300.00",
];
const SUBTOTAL = [
  "",
  "",
  "Subtotal",
  "260,953.70",
  "59,504.16",
  "0.00",
  "59,504.16",
  "0.00",
  "50,454.51",
  "-9,049.65",
  "0.00",
  "0.00",
  "0.00",
  "0.00",
  "0.00",
  "0.00",
  "59,504.16",
  "0.00",
  "50,454.51",
  "-9,049.65",
];

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function fail(msg) {
  console.error(`  ✗ ${msg}`);
  throw new Error(msg);
}

function assertRowCount(label, matrix, expected) {
  const n = matrix?.length ?? 0;
  if (n !== expected) {
    fail(`${label}: expected ${expected} rows, got ${n}\n${JSON.stringify(matrix?.map((r) => r.slice(0, 4)), null, 2)}`);
  }
  ok(`${label}: ${n} rows`);
}

function buildTsv() {
  return [AGENT1, AGENT2, SUBTOTAL].map((row) => row.join("\t")).join("\n");
}

function buildVerticalDump() {
  return [AGENT1, AGENT2, SUBTOTAL].flat().filter((c) => c !== "").join("\n");
}

/** Angular Material-style clipboard (Chrome often rewrites tags → div.mat-*). */
function buildMatRowHtml() {
  const rowHtml = (cells, { footer = false } = {}) => {
    const rowClass = footer ? "mat-mdc-footer-row mat-footer-row" : "mat-mdc-row mat-row";
    const cellClass = footer ? "mat-mdc-footer-cell mat-footer-cell" : "mat-mdc-cell mat-cell";
    const inner = cells
      .map((v) => `<div class="${cellClass}" role="gridcell">${v === "" ? "&nbsp;" : v}</div>`)
      .join("");
    return `<div class="${rowClass}" role="row">${inner}</div>`;
  };
  return `<div class="mat-mdc-table mat-table" role="table">
  ${rowHtml(AGENT1)}
  ${rowHtml(AGENT2)}
  ${rowHtml(SUBTOTAL, { footer: true })}
</div>`;
}

/** Collapsed clipboard: each logical row is one cell with newline-separated fields. */
function buildCollapsedMatHtml() {
  const pack = (cells) =>
    cells
      .filter((c) => c !== "")
      .join("\n");
  return `<div class="mat-table">
  <div class="mat-row" role="row"><div class="mat-cell">${pack(AGENT1)}</div></div>
  <div class="mat-row" role="row"><div class="mat-cell">${pack(AGENT2)}</div></div>
  <div class="mat-footer-row" role="row"><div class="mat-footer-cell">${pack(SUBTOTAL)}</div></div>
</div>`;
}

/** N×1 failure mode: one <tr><td> per field (fig3 symptom). */
function buildVerticalNx1TableHtml() {
  const fields = [...AGENT1, ...AGENT2, ...SUBTOTAL.filter(Boolean)];
  const rows = fields.map((f) => `<tr><td>${f}</td></tr>`).join("");
  return `<table><tbody>${rows}</tbody></table>`;
}

/**
 * Real C8Play/Kendo clipboard (live Ctrl+C shape):
 * - Agent: td.k-group-cell (no role) + td[role=gridcell]…
 * - Subtotal: tr.k-group-footer with NO role; cells have NO role=gridcell;
 *   4 leading empties then Turn Over money (aligns with agent col after strip).
 */
function buildKendoGroupFooterHtml() {
  const agentTr = (cells, alt = false) => {
    const cls = alt ? ' class="k-alt"' : "";
    const dataTds = cells
      .map((v) => `<td role="gridcell">${v === "" ? "&nbsp;" : v}</td>`)
      .join("");
    return `<tr role="row"${cls}><td class="k-group-cell">&nbsp;</td>${dataTds}</tr>`;
  };
  // Footer width matches agent+indent (1 group + AGENT1.length). Money at Turn Over.
  const footerCells = Array.from({ length: AGENT1.length + 1 }, (_, i) => {
    if (i < 4) return "";
    return SUBTOTAL[i - 1] || "";
  });
  const footerTds = footerCells
    .map((v, i) => {
      const cls = i === 0 ? ' class="k-group-cell"' : "";
      return `<td${cls}>${v === "" ? "&nbsp;" : v}</td>`;
    })
    .join("");
  return `<table role="grid"><tbody>
  ${agentTr(AGENT1)}
  ${agentTr(AGENT2, true)}
  <tr class="k-group-footer">${footerTds}</tr>
</tbody></table>`;
}

/** Real-ish plain text from C8Play Ctrl+C (mixed newlines + sparse tabs). */
function buildKendoMessyPlain() {
  const packAgent = (row) =>
    [
      " \t",
      row[0],
      `${row[1]}\t${row[2]}\t`,
      ...row.slice(3),
    ].join("\n");
  const packFooter = (row) =>
    [" \t \t \t \t", ...row.filter((c) => c !== "")].join("\n");
  return [packAgent(AGENT1), packAgent(AGENT2), packFooter(SUBTOTAL)].join("\n");
}

async function runNodePureChecks() {
  console.log("\n[1] Node pure parsers (sanitize / plain / vertical dump)");

  const tsvMatrix = parsePlainTextMatrix(buildTsv());
  assertRowCount("TSV parsePlainTextMatrix", tsvMatrix, 3);
  if (!/subtotal/i.test(String(tsvMatrix[2]?.[2] ?? tsvMatrix[2]?.[0] ?? ""))) {
    fail(`TSV row2 label missing Subtotal: ${JSON.stringify(tsvMatrix[2]?.slice(0, 4))}`);
  }
  ok("TSV keeps Subtotal label");

  const sanitizedTsv = sanitizePasteMatrix(tsvMatrix);
  assertRowCount("TSV after sanitizePasteMatrix", sanitizedTsv, 3);

  const narrowSubtotal = sanitizePasteMatrix([
    AGENT1,
    AGENT2,
    ["Subtotal", "260,953.70", "59,504.16", "0.00", "59,504.16"],
  ]);
  assertRowCount("narrow Subtotal kept by sanitize", narrowTsvOr(narrowSubtotal), 3);

  const moneyFirstSubtotal = dropTrailingJunkRows([
    AGENT1,
    AGENT2,
    ["260,953.70", "59,504.16", "0.00", "59,504.16", "0.00", "50,454.51", "-9,049.65"],
  ]);
  // May or may not keep — log for diagnosis
  console.log(
    `  · money-first footer rows after dropTrailingJunkRows: ${moneyFirstSubtotal.length}`,
  );

  const vertical = buildVerticalDump();
  const lines = vertical.split("\n");
  const dump = detectVerticalFieldDump(lines);
  console.log(
    `  · detectVerticalFieldDump → ${dump?.rows?.length ?? 0} rows x ${dump?.rows?.[0]?.length ?? 0} cols`,
  );
  const verticalMatrix = parsePlainTextMatrix(vertical);
  console.log(
    `  · parsePlainTextMatrix(vertical) → ${verticalMatrix.length} rows x ${verticalMatrix[0]?.length ?? 0} cols`,
  );
  if (verticalMatrix.length < 3 || (verticalMatrix[0]?.length ?? 0) < 2) {
    fail(
      `vertical dump reshape failed (fig3 root): ${verticalMatrix.length}x${verticalMatrix[0]?.length ?? 0}`,
    );
  }
  assertRowCount("vertical dump reshape", verticalMatrix, 3);

  // Money-only footer (no Subtotal label) — real Kendo plain after blank cells strip.
  const moneyFooterVertical = [AGENT1, AGENT2, SUBTOTAL.slice(3)].flat().join("\n");
  const moneyFooterMatrix = parsePlainTextMatrix(moneyFooterVertical);
  console.log(
    `  · money-only footer vertical → ${moneyFooterMatrix.length} rows x ${moneyFooterMatrix[0]?.length ?? 0} cols`,
  );
  if (moneyFooterMatrix.length < 3) {
    fail(`money-only footer vertical lost Subtotal: ${moneyFooterMatrix.length} rows`);
  }
  ok("money-only footer vertical keeps 3 rows");
  // 1.TEXT must left-pad like 2.FORMAT (empty Player/Name/Type), not shove money into col0.
  const footerLead = (moneyFooterMatrix[2] || []).slice(0, 3).map((c) => String(c ?? "").trim());
  const footerMoneyAt = (moneyFooterMatrix[2] || []).findIndex((c) => /[\d,]/.test(String(c ?? "").trim()));
  if (footerLead.some(Boolean) || footerMoneyAt !== 3) {
    fail(
      `money-only footer must left-pad 3 empties (Turn Over @ col3); got lead=${JSON.stringify(footerLead)} moneyAt=${footerMoneyAt}`,
    );
  }
  ok("money-only footer left-pads to match agent Turn Over col");

  // C8Play sparse tab "87\tAGENT" must split — not collapse to "87 AGENT" (1.TEXT fig).
  const sparseTabVertical = [
    "CKZ03",
    "87\tAGENT",
    ...AGENT1.slice(3),
    "CKZ16",
    "8\tAGENT",
    ...AGENT2.slice(3),
    ...SUBTOTAL.slice(3),
  ].join("\n");
  const sparseMatrix = parsePlainTextMatrix(sparseTabVertical);
  if (sparseMatrix.length !== 3) {
    fail(`sparse-tab vertical expected 3 rows, got ${sparseMatrix.length}`);
  }
  if (String(sparseMatrix[0]?.[1] ?? "") !== "87" || String(sparseMatrix[0]?.[2] ?? "").toUpperCase() !== "AGENT") {
    fail(
      `sparse-tab must split Name/UserType; got ${JSON.stringify(sparseMatrix[0]?.slice(0, 4))}`,
    );
  }
  if (String(sparseMatrix[2]?.[0] ?? "").trim() !== "" || String(sparseMatrix[2]?.[3] ?? "").trim() !== String(SUBTOTAL[3])) {
    fail(
      `sparse-tab footer must stay left-padded; got ${JSON.stringify(sparseMatrix[2]?.slice(0, 5))}`,
    );
  }
  ok("sparse-tab 87\\tAGENT splits + footer left-pads (1.TEXT)");

  // Helper must be scoped — agent_period (narrow, no AGENT/MEMBER col) must NOT match.
  const agentPeriodPlain = ["SDSPDA95", "3,000", "$0.00", "1,200", "SUBTOTAL", "3,000", "$0.00", "1,200"].join(
    "\n",
  );
  if (looksLikeC8WinLossPlain(agentPeriodPlain) || tryReshapeC8WinLossPlainMatrix(agentPeriodPlain)) {
    fail("C8 helper must not claim agent_period / non-WinLoss dumps");
  }
  ok("C8 helper ignores non-WinLoss plain (scoped)");

  const messyKendoPlain = buildKendoMessyPlain();
  if (plainTextLooksLikeAlignedTsv(messyKendoPlain)) {
    fail("C8 messy plain must NOT look like aligned TSV (would reject Format HTML)");
  }
  ok("C8 messy plain is not aligned TSV");
  if (!plainTextLooksLikeAlignedTsv(buildTsv())) {
    fail("clean TSV should look like aligned TSV");
  }
  ok("clean TSV looks like aligned TSV");

  // agent_period (SDSPDA95 + SUBTOTAL): sparse tabs must NOT force N×1 col1 stack.
  const agentPeriod = [
    "SDSPDA95",
    "5,300\t",
    "$0.00",
    "$9,134.90",
    "$9,134.90",
    "$7,787.17",
    "$9,134.90",
    "$0.00",
    "$1,347.73",
    "SUBTOTAL",
    "5,300",
    "$0.00",
    "$9,134.90",
    "$9,134.90",
    "$7,787.17",
    "$9,134.90",
    "$0.00",
    "$1,347.73",
  ].join("\n");
  const agentPeriodMatrix = parsePlainTextMatrix(agentPeriod);
  console.log(
    `  · agent_period sparse-tab → ${agentPeriodMatrix.length} rows x ${agentPeriodMatrix[0]?.length ?? 0} cols`,
  );
  if (agentPeriodMatrix.length !== 2 || (agentPeriodMatrix[0]?.length ?? 0) < 8) {
    fail(
      `agent_period reshape failed (col1 stack risk): ${agentPeriodMatrix.length}x${agentPeriodMatrix[0]?.length ?? 0} ` +
        JSON.stringify(agentPeriodMatrix.slice(0, 3).map((r) => r.slice(0, 3))),
    );
  }
  if (String(agentPeriodMatrix[0]?.[0] ?? "") !== "SDSPDA95") {
    fail(`agent_period row0 id wrong: ${JSON.stringify(agentPeriodMatrix[0]?.slice(0, 3))}`);
  }
  if (!/subtotal/i.test(String(agentPeriodMatrix[1]?.[0] ?? ""))) {
    fail(`agent_period row1 missing SUBTOTAL: ${JSON.stringify(agentPeriodMatrix[1]?.slice(0, 3))}`);
  }
  ok("agent_period sparse-tab reshapes to 2 wide rows");

  // agent_period + TOTAL AMOUNT (same shape as 2.FORMAT success screenshot).
  const agentPeriod3 = [
    "SDSPDA95",
    "5,300",
    "$0.00",
    "$9,134.90",
    "$9,134.90",
    "$7,787.17",
    "$9,134.90",
    "$0.00",
    "$1,347.73",
    "SUBTOTAL",
    "5,300",
    "$0.00",
    "$9,134.90",
    "$9,134.90",
    "$7,787.17",
    "$9,134.90",
    "$0.00",
    "$1,347.73",
    "TOTAL AMOUNT",
    "5,300",
    "$0.00",
    "$9,134.90",
    "$9,134.90",
    "$7,787.17",
    "$9,134.90",
    "$0.00",
    "$1,347.73",
  ].join("\n");
  const agentPeriod3Matrix = parsePlainTextMatrix(agentPeriod3);
  if (
    agentPeriod3Matrix.length !== 3 ||
    (agentPeriod3Matrix[0]?.length ?? 0) < 8 ||
    String(agentPeriod3Matrix[0]?.[0] ?? "") !== "SDSPDA95" ||
    !/subtotal/i.test(String(agentPeriod3Matrix[1]?.[0] ?? "")) ||
    !/total\s*amount/i.test(String(agentPeriod3Matrix[2]?.[0] ?? ""))
  ) {
    fail(
      `agent_period+TOTAL AMOUNT should match 2.FORMAT 3x9 layout, got ` +
        `${agentPeriod3Matrix.length}x${agentPeriod3Matrix[0]?.length ?? 0} ` +
        JSON.stringify(agentPeriod3Matrix.map((r) => r?.[0])),
    );
  }
  ok("agent_period+TOTAL AMOUNT reshapes to 3 wide rows (like 2.FORMAT)");

  // Summary: money-only footer (empty Id Product) must still become a row — no fake SUBTOTAL.
  const snapshotRows = [AGENT1, AGENT2, ["", "", "", ...SUBTOTAL.slice(3)]].map((cells, rowIndex) => {
    const row = [{ type: "header", value: String.fromCharCode(65 + rowIndex) }];
    cells.forEach((value, col) => {
      row.push({ type: "data", value: String(value ?? ""), col });
    });
    return row;
  });
  const { entries, idProducts } = buildColumnAEntries({ rows: snapshotRows });
  if (entries.length !== 3) {
    fail(`buildColumnAEntries expected 3 entries, got ${entries.length}: ${JSON.stringify(entries)}`);
  }
  if (entries[2]?.idProduct !== "") {
    fail(`footer entry must keep empty idProduct (paste fidelity), got ${JSON.stringify(entries[2])}`);
  }
  if (idProducts.length !== 2) {
    fail(`idProducts for templates should stay 2 agents, got ${idProducts.length}`);
  }
  const summaryRows = buildInitialSummaryRows({ rows: snapshotRows });
  if (summaryRows.length !== 3) {
    fail(`buildInitialSummaryRows expected 3 rows, got ${summaryRows.length}`);
  }
  ok("Summary keeps money-only empty-Id footer as 3rd row (no SUBTOTAL inject)");
}

function narrowTsvOr(m) {
  return m;
}

async function runPlaywrightHtmlChecks() {
  console.log("\n[2] Playwright DOM: normalizeClipboardHtmlToTable");

  const { formatBodyMatrixLooksCollapsed } = await import(
    pathToFileURL(
      path.join(frontendRoot, "src/pages/datacapture/paste/core/dataCaptureFormatHtmlPaste.js"),
    ).href
  );

  const fs = await import("node:fs/promises");
  const http = await import("node:http");
  const coreDir = path.join(frontendRoot, "src/pages/datacapture/paste/core");

  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === "/" || req.url?.startsWith("/?")) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<!DOCTYPE html><html><body></body></html>");
        return;
      }
      if (req.url?.startsWith("/paste-mod/")) {
        const base = path.basename(decodeURIComponent(req.url.slice("/paste-mod/".length)));
        let body = await fs.readFile(path.join(coreDir, base), "utf8");
        body = body.replace(
          /from\s+["'](\.\/[^"']+)["']/g,
          (_m, spec) => `from "/paste-mod/${path.basename(spec)}"`,
        );
        // Bridge imports that leave paste/core (../../lib, ../vendors, etc.)
        body = body.replace(
          /from\s+["']((?:\.\.\/)+[^"']+)["']/g,
          (_m, spec) => {
            const resolved = path.resolve(coreDir, spec);
            const rel = path.relative(frontendRoot, resolved).replace(/\\/g, "/");
            return `from "/src/${rel}"`;
          },
        );
        res.writeHead(200, { "Content-Type": "application/javascript" });
        res.end(body);
        return;
      }
      if (req.url?.startsWith("/src/")) {
        const rel = decodeURIComponent(req.url.slice("/src/".length));
        const filePath = path.join(frontendRoot, rel);
        let body = await fs.readFile(filePath, "utf8");
        const dir = path.dirname(filePath);
        body = body.replace(/from\s+["'](\.[^"']+)["']/g, (_m, spec) => {
          const resolved = path.resolve(dir, spec);
          const out = path.relative(frontendRoot, resolved).replace(/\\/g, "/");
          return `from "/src/${out}"`;
        });
        res.writeHead(200, { "Content-Type": "application/javascript" });
        res.end(body);
        return;
      }
      res.writeHead(404);
      res.end("not found");
    } catch (err) {
      res.writeHead(500);
      res.end(String(err));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(origin);

    const cases = [
      { name: "mat-row + footer-row", html: buildMatRowHtml(), expectRows: 3, expectColsMin: 10 },
      { name: "collapsed mat-row", html: buildCollapsedMatHtml(), expectRows: 3, expectColsMin: 10 },
      {
        name: "Kendo k-group-footer (no role=row)",
        html: buildKendoGroupFooterHtml(),
        expectRows: 3,
        expectColsMin: 10,
        // Footer has no Subtotal label — accept money in first filled cell
        allowMoneyFirstFooter: true,
        // After stripping k-group-cell, Turn Over is index 3 (id, count, level, turnover)
        expectTurnOverCol: 3,
      },
      { name: "vertical N×1 table", html: buildVerticalNx1TableHtml(), expectRows: null, expectColsMin: 1 },
    ];

    for (const c of cases) {
      const result = await page.evaluate(async (html) => {
        const normalizeMod = await import("/paste-mod/dataCaptureFormatClipboardNormalize.js");
        const matrixMod = await import("/paste-mod/dataCaptureFormatHtmlMatrix.js");
        const normalized = normalizeMod.normalizeClipboardHtmlToTable(html);
        const structure = matrixMod.parseFormatHtmlTableStructure(normalized || html);
        if (!structure) {
          return { rows: 0, cols: 0, sample: [], labels: [] };
        }
        const body = matrixMod.buildFormatBodyMatrix(structure.dataRows, structure.maxCols);
        return {
          rows: body.length,
          cols: structure.maxCols,
          sample: body.slice(0, 3).map((row) =>
            (row || []).slice(0, 4).map((cell) => String(cell?.value ?? "")),
          ),
          labels: body.map((row) => {
            const vals = (row || []).map((cell) => String(cell?.value ?? "").trim()).filter(Boolean);
            return vals[0] || "";
          }),
        };
      }, c.html);

      console.log(
        `  · ${c.name}: ${result.rows} rows x ${result.cols} cols labels=${JSON.stringify(result.labels)} sample=${JSON.stringify(result.sample)}`,
      );

      if (c.expectRows != null) {
        if (result.rows !== c.expectRows) {
          fail(`${c.name}: expected ${c.expectRows} body rows, got ${result.rows}`);
        }
        if (result.cols < c.expectColsMin) {
          fail(`${c.name}: expected >=${c.expectColsMin} cols, got ${result.cols}`);
        }
        const hasSub = result.labels.some((l) => /subtotal/i.test(l));
        const hasMoneyFooter = result.labels.some((l) =>
          /^-?[\d,]+(?:\.\d+)?$/.test(String(l).replace(/[,$]/g, "")),
        );
        if (!hasSub && !(c.allowMoneyFirstFooter && hasMoneyFooter && result.rows >= 3)) {
          fail(`${c.name}: Subtotal/footer row missing from body labels`);
        }
        if (c.expectTurnOverCol != null && result.sample.length >= 3) {
          const agentTurnOver = String(result.sample[0]?.[c.expectTurnOverCol] ?? "").trim();
          const footerVals = result.sample[2] || [];
          const footerTurnOver = String(footerVals[c.expectTurnOverCol] ?? "").trim();
          const footerFirstFilled = footerVals.map((v) => String(v ?? "").trim()).find((v) => v) || "";
          if (!agentTurnOver || !/[\d,]/.test(agentTurnOver)) {
            fail(`${c.name}: agent Turn Over missing at col ${c.expectTurnOverCol}: ${JSON.stringify(result.sample[0])}`);
          }
          if (footerTurnOver !== footerFirstFilled || !/[\d,]/.test(footerTurnOver)) {
            fail(
              `${c.name}: footer money not aligned at col ${c.expectTurnOverCol} ` +
                `(got ${JSON.stringify(footerVals.slice(0, 6))}; firstFilled=${footerFirstFilled})`,
            );
          }
          // Must NOT shove footer money into col 0 when agent id is in col 0.
          if (String(footerVals[0] ?? "").trim() === footerFirstFilled && c.expectTurnOverCol > 0) {
            fail(`${c.name}: footer money stuck in col 0 (misaligned)`);
          }
          ok(`${c.name}: Turn Over aligned at col ${c.expectTurnOverCol}`);
        }
        ok(`${c.name}: ${result.rows}x${result.cols} (footer kept)`);
      } else {
        const looksNx1 = result.cols <= 1 && result.rows >= 3;
        console.log(`  · vertical N×1 shape (cols<=1, rows>=3): ${looksNx1}`);
        if (!looksNx1) {
          fail("vertical N×1 HTML not detected — Format may accept bad matrix (fig3)");
        }
        ok("vertical N×1 flagged");
      }
    }

    const fig3Matrix = [
      [{ value: "CK203" }],
      [{ value: "87" }, { value: "AGENT" }],
      ...AGENT1.slice(3).map((v) => [{ value: v }]),
    ];
    const collapsed = formatBodyMatrixLooksCollapsed(fig3Matrix, null);
    console.log(`  · fig3-like matrix formatBodyMatrixLooksCollapsed: ${collapsed}`);
    if (!collapsed) {
      fail("fig3-like near-vertical matrix not rejected by formatBodyMatrixLooksCollapsed");
    }
    ok("fig3-like matrix rejected as collapsed");

    // Format path: Kendo HTML + messy C8 plain must fill (not grill-reject) and keep borders.
    const formatFill = await page.evaluate(async (html) => {
      const normalizeMod = await import("/paste-mod/dataCaptureFormatClipboardNormalize.js");
      const matrixMod = await import("/paste-mod/dataCaptureFormatHtmlMatrix.js");
      const normalized = normalizeMod.normalizeClipboardHtmlToTable(html);
      const structure = matrixMod.parseFormatHtmlTableStructure(normalized || html);
      const body = structure
        ? matrixMod.buildFormatBodyMatrix(structure.dataRows, structure.maxCols)
        : [];
      const hasBorder = (body[0] || []).some((cell) =>
        /border/i.test(String(cell?.styleCssText || "")),
      );
      return {
        rows: body.length,
        cols: structure?.maxCols || 0,
        hasBorder,
        sample: (body[2] || []).slice(0, 5).map((c) => String(c?.value ?? "")),
        footerMoneyCol: (body[2] || []).findIndex((c) => /[\d,]/.test(String(c?.value ?? "").trim())),
      };
    }, buildKendoGroupFooterHtml());
    console.log(`  · Format Kendo+messy plain body: ${JSON.stringify(formatFill)}`);
    if (formatFill.rows !== 3 || formatFill.footerMoneyCol < 2) {
      fail(`Format Kendo body misaligned: ${JSON.stringify(formatFill)}`);
    }
    if (!formatFill.hasBorder) {
      fail("Format body cells missing border style (分线条)");
    }
    ok("Format Kendo body keeps footer align + cell borders");

    // Full-width Subtotal (realistic) must survive sanitize — baseline.
    const fullSanitized = sanitizePasteMatrix([AGENT1, AGENT2, SUBTOTAL]);
    assertRowCount("full-width Subtotal sanitize", fullSanitized, 3);
  } finally {
    await browser.close();
    server.close();
  }
}

async function main() {
  console.log("C8 WinLoss Detail → Data Capture paste smoke");
  console.log("(source site login-walled; using Material clipboard fixtures)");

  let failed = false;
  try {
    await runNodePureChecks();
  } catch (err) {
    failed = true;
    console.error(err.message || err);
  }

  try {
    await runPlaywrightHtmlChecks();
  } catch (err) {
    failed = true;
    console.error(err.message || err);
  }

  if (failed) {
    console.error("\nSMOKE RED — paste bug reproduced / regression gap found");
    process.exit(1);
  }
  console.log("\nSMOKE GREEN — fixtures pass current parsers");
  process.exit(0);
}

main();
