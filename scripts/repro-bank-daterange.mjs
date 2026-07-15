/**
 * Local Bank Process Date Range visual + functional smoke (Vite must be on :5173).
 * node scripts/repro-bank-daterange.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "../../verify-bank-daterange-fixed.png");
const BASE = process.env.VITE_BASE || "http://127.0.0.1:5173";
const FIXTURE_DIR = path.resolve(__dirname, "../public/dev-fixtures");
const FIXTURE_FILE = path.join(FIXTURE_DIR, "bank-daterange.html");
const FIXTURE_URL = `${BASE}/dev-fixtures/bank-daterange.html`;

const fixtureHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Bank DateRange Fixture</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css" />
  <link rel="stylesheet" href="/css/date-range-picker.css" />
  <link rel="stylesheet" href="/css/processCSS.css" />
</head>
<body class="process-page process-page--bank">
  <div class="action-controls-row bank-process-toolbar-primary" style="display:flex;align-items:center;gap:12px;padding:24px;background:#f8fafc">
    <div class="process-list-date-filter transaction-date-range-group" id="processListDateFilter" style="display:inline-flex">
      <div class="date-range-picker" id="date-range-picker" role="button" tabindex="0">
        <i class="fas fa-calendar-alt" aria-hidden="true"></i>
        <span id="date-range-display"></span>
        <button type="button" class="process-list-date-clear" id="processListDateClearBtn">&times;</button>
        <i class="fas fa-chevron-down transaction-date-range-chevron" aria-hidden="true"></i>
      </div>
      <input type="hidden" id="date_from" value="" />
      <input type="hidden" id="date_to" value="" />
    </div>
  </div>
  <div class="calendar-popup calendar-popup--transaction-range" id="calendar-popup" style="display:none">
    <div class="transaction-calendar-presets">
      <button type="button" class="transaction-calendar-preset" data-period-key="today">Today</button>
      <button type="button" class="transaction-calendar-preset" data-period-key="yesterday">Yesterday</button>
      <button type="button" class="transaction-calendar-preset" data-period-key="this_month">This Month</button>
    </div>
    <div class="transaction-calendar-panel">
      <div class="calendar-header">
        <button type="button" class="calendar-nav-btn"><i class="fas fa-chevron-left"></i></button>
        <div class="calendar-month-year">
          <button type="button" id="calendar-month-select" class="calendar-month-trigger">Jul</button>
          <button type="button" id="calendar-year-select" class="calendar-year-trigger">2026</button>
        </div>
        <button type="button" class="calendar-nav-btn"><i class="fas fa-chevron-right"></i></button>
      </div>
      <div class="calendar-weekdays"></div>
      <div class="calendar-days" id="calendar-days"></div>
    </div>
  </div>
  <script type="module">
    import { ensureMaintenanceDateRangePicker } from "/src/utils/date/dateRangePicker.js";
    ensureMaintenanceDateRangePicker();
    window.MaintenanceDateRangePicker.init({
      allowEmpty: true,
      preserveDisplayUntilCommit: true,
      placeholder: "Select date range",
      selectEndDateHint: "Select end date",
      clearDateLabel: "Clear",
    });
    window.__drpReady = true;
  </script>
</body>
</html>`;

fs.mkdirSync(FIXTURE_DIR, { recursive: true });
fs.writeFileSync(FIXTURE_FILE, fixtureHtml, "utf8");

let exitCode = 0;
try {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (err) => console.error("pageerror", err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("console", msg.text());
  });

  await page.goto(FIXTURE_URL, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForFunction(() => window.__drpReady === true, null, { timeout: 20000 });
  await page.waitForTimeout(200);

  const styles = await page.evaluate(() => {
    const pick = document.querySelector("#date-range-picker");
    const icon = pick.querySelector("i.fa-calendar-alt");
    const cs = getComputedStyle(pick);
    const ic = getComputedStyle(icon);
    const pr = pick.getBoundingClientRect();
    const ir = icon.getBoundingClientRect();
    return {
      border: cs.border,
      radius: cs.borderRadius,
      gap: cs.gap,
      overflow: cs.overflow,
      pad: cs.padding,
      iconBg: ic.backgroundColor,
      iconRadius: ic.borderRadius,
      iconH: ic.height,
      flush: {
        top: Math.abs(ir.top - pr.top),
        bottom: Math.abs(ir.bottom - pr.bottom),
        left: Math.abs(ir.left - pr.left),
      },
    };
  });

  await page.locator("#date-range-picker").screenshot({ path: OUT });

  await page.locator("#date-range-picker").click();
  await page.waitForTimeout(200);
  const opened = await page.evaluate(() => ({
    display: getComputedStyle(document.getElementById("calendar-popup")).display,
    days: document.querySelectorAll("#calendar-days .calendar-day").length,
  }));
  await page.locator('.transaction-calendar-preset[data-period-key="today"]').click();
  await page.waitForTimeout(200);
  const today = await page.evaluate(() => ({
    display: document.getElementById("date-range-display").textContent,
    from: document.getElementById("date_from").value,
    to: document.getElementById("date_to").value,
  }));

  await page.locator("#date-range-picker").click();
  await page.waitForTimeout(150);
  const days = page.locator("#calendar-days .calendar-day:not(.disabled)");
  await days.nth(2).click();
  await page.waitForTimeout(80);
  await days.nth(4).click();
  await page.waitForTimeout(200);
  const rangePick = await page.evaluate(() => ({
    display: document.getElementById("date-range-display").textContent,
    from: document.getElementById("date_from").value,
    to: document.getElementById("date_to").value,
  }));

  const pass = {
    borderOk: styles.border.includes("1px") && styles.border.includes("148, 163, 184"),
    gapZero: styles.gap === "0px",
    overflowHidden: styles.overflow === "hidden",
    iconBlue: styles.iconBg.includes("59, 130, 246"),
    iconFlush: styles.flush.top <= 1.5 && styles.flush.bottom <= 1.5 && styles.flush.left <= 1.5,
    calendarOpens: opened.display !== "none" && opened.days > 0,
    todayWorks: !!(today.from && today.to && String(today.display).includes("/")),
    rangeWorks: !!(rangePick.from && rangePick.to && rangePick.from !== rangePick.to),
  };

  console.log(JSON.stringify({ styles, opened, today, rangePick, pass, shot: OUT }, null, 2));
  const failed = Object.entries(pass).filter(([, v]) => !v).map(([k]) => k);
  await browser.close();
  if (failed.length) {
    console.error("FAIL:", failed.join(", "));
    exitCode = 1;
  } else {
    console.log("OK");
  }
} finally {
  try {
    fs.unlinkSync(FIXTURE_FILE);
  } catch {
    /* ignore */
  }
}

process.exit(exitCode);
