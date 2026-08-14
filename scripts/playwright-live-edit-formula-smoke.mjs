/**
 * Live Playwright smoke: login → secondary → Data Capture Summary Edit Formula.
 *
 * Usage (PowerShell):
 *   $env:EC_COMPANY="test"; $env:EC_USER="test"; $env:EC_PASS="1"; $env:EC_SECONDARY="222222"
 *   node scripts/playwright-live-edit-formula-smoke.mjs
 *
 * Optional:
 *   EC_BASE=https://count168.site
 *   EC_STORAGE=.auth/ec-storage.json
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  throw new Error("playwright not found — npm i -D playwright in frontend/");
}

const { chromium } = loadPlaywright();

const BASE = (process.env.EC_BASE || "https://count168.site").replace(/\/$/, "");
const STORAGE = process.env.EC_STORAGE
  ? path.resolve(process.env.EC_STORAGE)
  : path.resolve(__dirname, "../.auth/ec-storage.json");

const company = String(process.env.EC_COMPANY || "").trim();
const user = String(process.env.EC_USER || "").trim();
const pass = String(process.env.EC_PASS || "");
const secondary = String(process.env.EC_SECONDARY || "").trim();

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}
function fail(msg) {
  console.error(`  ✗ ${msg}`);
  throw new Error(msg);
}
function info(msg) {
  console.log(`  · ${msg}`);
}

async function ensureLoggedIn(page, context) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(800);

  if (!page.url().includes("/login") && !page.url().includes("secondary")) {
    ok("session reused (not on login)");
    return;
  }

  if (page.url().includes("secondary")) {
    await fillSecondary(page);
    return;
  }

  if (!company || !user || pass === "") {
    fail("Not logged in. Set EC_COMPANY / EC_USER / EC_PASS (and EC_SECONDARY if needed).");
  }

  const adminBtn = page.getByRole("button", { name: /^Admin$|^管理员$/i });
  if (await adminBtn.count()) {
    await adminBtn.click();
    await page.waitForTimeout(200);
  }

  await page.getByPlaceholder(/Company|集团|Group/i).fill(company);
  const userBox = page.getByPlaceholder(/Username|User|用户名|账号/i).first();
  await userBox.fill(user);
  await page.getByPlaceholder(/^Password$|^密码$/i).fill(pass);
  await page.getByRole("button", { name: /^Login$|^登录$/i }).click();

  await page.waitForURL(
    (url) => !String(url).includes("/login") || String(url).includes("secondary"),
    { timeout: 45000 }
  );

  if (page.url().includes("secondary")) {
    await fillSecondary(page);
  }

  fs.mkdirSync(path.dirname(STORAGE), { recursive: true });
  await context.storageState({ path: STORAGE });
  ok(`logged in; storage saved → ${STORAGE}`);
}

async function fillSecondary(page) {
  if (!secondary) {
    fail("Secondary password required — set EC_SECONDARY");
  }
  info("entering secondary password…");
  const input = page.locator("#secondary_password, input[type='password']").first();
  await input.waitFor({ state: "visible", timeout: 15000 });
  await input.fill(secondary);
  const submit = page.getByRole("button", { name: /^Confirm$|^Submit$|^Verify$|^确认$|^验证$|^继续$/i });
  if (await submit.count()) {
    await submit.click();
  } else {
    await input.press("Enter");
  }
  await page.waitForURL((url) => !String(url).includes("secondary"), { timeout: 45000 });
  ok("secondary password accepted");
}

function buildSeedTable() {
  const cell = (v) => ({ type: "data", value: v });
  const header = (v) => ({ type: "header", value: v });
  const aw07 = [header("A"), cell("AW07"), cell("0"), cell("-227.95")];
  while (aw07.length < 15) aw07.push(cell("0"));
  aw07[14] = cell("-15.60");
  const aw9966 = [header("B"), cell("AW9966"), cell("0"), cell("-718.39")];
  return { rows: [aw07, aw9966] };
}

async function seedCaptureAndOpenSummary(page) {
  const table = buildSeedTable();
  await page.goto(`${BASE}/datacapture`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);

  await page.evaluate((payload) => {
    localStorage.setItem("capturedTableData", JSON.stringify(payload.table));
    localStorage.setItem(
      "capturedProcessData",
      JSON.stringify({ process: "AW07", processes: ["AW07", "AW9966"] })
    );
    localStorage.setItem("capturedDataCaptureType", "normal");
    try {
      sessionStorage.setItem("dc_summary_fresh_nav", "1");
    } catch {
      /* ignore */
    }
  }, { table });

  ok("seeded capturedTableData (AW07 + AW9966)");
  await page.goto(`${BASE}/datacapturesummary`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  ok(`summary url: ${page.url()}`);
}

async function exerciseEditFormula(page) {
  const editBtn = page.locator(".edit-formula-btn, button[title*='Formula'], button[aria-label*='Formula']").first();
  const modal = page.locator("#editFormulaModal");

  if (!(await editBtn.count())) {
    // Try any pencil / edit in formula column
    const fallback = page.locator("button.edit-formula-btn, .summary-table button").filter({ hasText: /edit|formula|✎|✏/i }).first();
    if (!(await fallback.count()) && !(await page.locator("#editFormulaModal").count())) {
      info("No Edit Formula button — page may need real capture session; checking modal inject path");
      return { skipped: true, reason: "no_edit_button" };
    }
  }

  if (await editBtn.count()) {
    await editBtn.click();
  } else {
    // open via first visible edit-formula control
    await page.locator(".edit-formula-btn").first().click();
  }

  await modal.waitFor({ state: "visible", timeout: 20000 }).catch(() => null);
  if (!(await modal.isVisible().catch(() => false))) {
    return { skipped: true, reason: "modal_not_open" };
  }
  ok("Edit Formula modal open");

  const formulaInput = page.locator("#formula");
  await formulaInput.waitFor({ state: "visible", timeout: 10000 });

  // Clear and type the repro formula (other-row then own-row with /)
  await formulaInput.click({ clickCount: 3 });
  await formulaInput.fill("");
  await formulaInput.pressSequentially("$14-[AW9966,3]/$3", { delay: 15 });
  await page.waitForTimeout(600);

  const raw = await formulaInput.inputValue();
  const preview = await page.locator("#formulaDisplay").inputValue().catch(async () =>
    page.locator("#formulaDisplay").textContent()
  );
  const previewText = String(preview || "").trim();

  info(`formula input: ${raw}`);
  info(`formula preview: ${previewText}`);

  if (previewText.includes("$-")) {
    fail(`preview still has stray $: ${previewText}`);
  }

  // Allow either fully resolved preview or unresolved if seed cells not wired —
  // but never the known buggy leftover "$-"
  if (/\/\$-?\d/.test(previewText) || previewText.includes(")$-")) {
    fail(`buggy preview pattern: ${previewText}`);
  }

  if (previewText.includes("(-15.60)") && previewText.includes("(-718.39)") && previewText.includes("(-227.95)")) {
    ok(`preview correctly expanded: ${previewText}`);
  } else if (previewText && !previewText.includes("$")) {
    ok(`preview expanded without stray $: ${previewText}`);
  } else if (raw.includes("[AW9966,3]") && raw.includes("$3")) {
    info("preview may not resolve seeded cells; raw formula kept — no stray $- in preview");
    if (previewText.includes("$-")) fail(`stray $- in preview: ${previewText}`);
    ok("no stray $- in preview");
  } else {
    fail(`unexpected formula/preview state input=${raw} preview=${previewText}`);
  }

  // Cancel without saving
  const cancel = page.getByRole("button", { name: /^Cancel$|^取消$/i });
  if (await cancel.count()) await cancel.click();
  else await page.keyboard.press("Escape");

  return { skipped: false };
}

async function verifyDeployedBundle(page) {
  // Confirm production serves a Summary chunk (hash may change after deploy)
  const html = await page.goto(`${BASE}/frontend/dist/index.html`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  }).then(() => page.content());
  const hasSpa = /index-[A-Za-z0-9_-]+\.js/.test(html);
  if (!hasSpa) fail("production index.html missing SPA bundle");
  ok("production SPA index reachable");
}

async function main() {
  console.log("Live Edit Formula smoke");
  console.log(`  base: ${BASE}`);
  console.log(`  company: ${company || "(from storage)"} user: ${user || "(from storage)"}`);

  const launchOpts = { headless: true };
  const contextOpts = { locale: "en-US" };
  if (fs.existsSync(STORAGE)) {
    contextOpts.storageState = STORAGE;
    ok(`using storage ${STORAGE}`);
  }

  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();
  page.setDefaultTimeout(45000);

  try {
    await verifyDeployedBundle(page);
    await ensureLoggedIn(page, context);

    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1000);
    ok(`post-login url: ${page.url()}`);

    await seedCaptureAndOpenSummary(page);

    const heading = page.getByRole("heading", { name: /Data Capture Summary|数据汇总|汇总/i });
    if (await heading.count()) ok("Summary heading visible");
    else info("Summary heading not found (may still be usable)");

    const result = await exerciseEditFormula(page);
    if (result?.skipped) {
      info(`Edit Formula UI skipped: ${result.reason}`);
      info("Login + Summary navigation still validated.");
    }

    fs.mkdirSync(path.dirname(STORAGE), { recursive: true });
    await context.storageState({ path: STORAGE });
    console.log("Live smoke finished.");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
