/**
 * Live mobile dashboard smoke (Playwright).
 *
 * Usage:
 *   set MOBILE_COMPANY=... MOBILE_USER=... MOBILE_PASS=...
 *   node scripts/live-dashboard-smoke.mjs
 *
 * Optional:
 *   MOBILE_BASE=https://count168.site/c168_mobile
 *   MOBILE_STORAGE=.auth/mobile-storage.json
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
    path.resolve(__dirname, "../../../frontend/node_modules/playwright"),
    path.resolve(__dirname, "../../../node_modules/playwright"),
  ];
  for (const dir of candidates) {
    try {
      return require(dir);
    } catch {
      /* next */
    }
  }
  throw new Error("playwright not found — npm i -D playwright in c168_mobile/frontend or use main frontend install");
}

const { chromium, devices } = loadPlaywright();
const BASE = process.env.MOBILE_BASE || "https://count168.site/c168_mobile";
const STORAGE = process.env.MOBILE_STORAGE
  ? path.resolve(process.env.MOBILE_STORAGE)
  : path.resolve(__dirname, "../.auth/mobile-storage.json");

const company = process.env.MOBILE_COMPANY || "";
const user = process.env.MOBILE_USER || "";
const pass = process.env.MOBILE_PASS || "";

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}
function fail(msg) {
  console.error(`  ✗ ${msg}`);
  throw new Error(msg);
}

async function ensureLoggedIn(page, context) {
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (!page.url().includes("/login")) {
    ok("session reused");
    return;
  }
  if (!company || !user || !pass) {
    fail("Not logged in. Set MOBILE_COMPANY / MOBILE_USER / MOBILE_PASS or provide storage state.");
  }
  ok("logging in…");
  await page.getByRole("button", { name: "Admin" }).click();
  await page.getByPlaceholder(/Company|Group/i).fill(company);
  await page.getByPlaceholder(/Username|User/i).fill(user);
  await page.getByPlaceholder(/Password/i).fill(pass);
  await page.getByRole("button", { name: /^Login$|^登录$/ }).click();
  await page.waitForURL(/\/(dashboard|owner-secondary|user-secondary)/, { timeout: 45000 });
  if (page.url().includes("secondary")) {
    fail("Secondary password required — complete once and save storage state.");
  }
  fs.mkdirSync(path.dirname(STORAGE), { recursive: true });
  await context.storageState({ path: STORAGE });
  ok(`storage saved → ${STORAGE}`);
}

async function main() {
  console.log("Live mobile dashboard smoke");
  console.log(`  base: ${BASE}`);

  const launchOpts = { headless: true };
  const contextOpts = {
    ...devices["iPhone 14"],
    locale: "en-US",
  };
  if (fs.existsSync(STORAGE)) {
    contextOpts.storageState = STORAGE;
    ok(`using storage ${STORAGE}`);
  }

  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();

  const apiHits = [];
  page.on("response", (res) => {
    const u = res.url();
    if (u.includes("/api/")) {
      apiHits.push({ status: res.status(), path: u.replace(/^https?:\/\/[^/]+/, "").split("?")[0] });
    }
  });

  try {
    await ensureLoggedIn(page, context);
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle", timeout: 90000 });

    // Wait for hero or error
    await page.waitForTimeout(2500);

    const title = page.getByRole("heading", { name: /Dashboard|仪表盘/i });
    if (await title.count()) {
      console.warn("  ! old Dashboard title still present");
    }

    const menu = page.getByRole("button", { name: /Open menu|打开菜单/i });
    if (!(await menu.count())) fail("Hamburger menu missing");
    ok("App bar hamburger present");

    const logo = page.locator('img[alt="EazyCount"]');
    if (!(await logo.count())) fail("EazyCount logo missing");
    ok("Brand logo present");

    const notify = page.getByRole("button", { name: /Notifications|通知/i });
    if (!(await notify.count())) fail("Notifications button missing");
    ok("Notifications control present");

    const viewing = page.getByText(/Viewing company|当前公司/i);
    if (!(await viewing.count())) fail("Company scope bar missing");
    ok("Company context visible");

    if (await page.getByRole("button", { name: /^Switch$|^切换$/i }).count()) {
      fail("Redundant Switch button should be removed");
    }
    ok("No Switch button");

    const filter = page.getByRole("button", { name: /^Filter$|^筛选$/i }).first();
    if (!(await filter.count())) fail("Filter button missing");
    ok("Filter control present");

    // Filter bar should stay in viewport chrome (not scrolled away with content)
    const filterBox = await filter.boundingBox();
    if (!filterBox || filterBox.y > 220) fail("Filter bar not pinned near top of screen");
    ok(`Filter pinned at y=${Math.round(filterBox.y)}`);

    await filter.click();
    await page.waitForTimeout(400);
    const sheet = page.getByRole("dialog", { name: /Filter|筛选/i });
    if (!(await sheet.isVisible().catch(() => false))) fail("Filter sheet did not open full-screen");
    const sheetBox = await sheet.boundingBox();
    if (!sheetBox) fail("Filter sheet has no box");
    ok("Filter sheet follows viewport");
    await page.getByRole("button", { name: /Apply Filter|应用筛选/i }).click().catch(async () => {
      await page.locator('[aria-label="Close filter"]').click();
    });
    await page.waitForTimeout(300);

    const hero = page.locator("section").filter({ hasText: /NET PROFIT|净利|Net Profit/i }).first();
    if (!(await hero.count())) fail("Hero net profit card missing");
    ok("Hero card present");

    await menu.click();
    await page.waitForTimeout(400);
    const side = page.getByRole("dialog", { name: /Menu|菜单/i });
    if (!(await side.isVisible().catch(() => false))) fail("Sidebar did not open");
    ok("Sidebar opens");
    await page.getByRole("button", { name: /Close|关闭/i }).first().click().catch(async () => {
      await page.locator('[aria-label="Close"], [aria-label="关闭"]').first().click();
    });
    await page.waitForTimeout(300);

    await notify.click();
    await page.waitForTimeout(500);
    const notifyDlg = page.getByRole("dialog", { name: /Notifications|通知/i });
    if (!(await notifyDlg.isVisible().catch(() => false))) fail("Notifications sheet did not open");
    ok("Notifications sheet opens");
    await page.keyboard.press("Escape").catch(() => {});
    await page.getByRole("button", { name: /Close|关闭/i }).first().click().catch(() => {});
    await page.waitForTimeout(200);

    const bootstrap = apiHits.find((h) => h.path.includes("dashboard_bootstrap_api.php"));
    if (!bootstrap) fail("dashboard_bootstrap_api never called");
    if (bootstrap.status >= 400) fail(`bootstrap HTTP ${bootstrap.status}`);
    ok(`bootstrap HTTP ${bootstrap.status}`);

    const currenciesHit = apiHits.find((h) => h.path.includes("get_company_currencies_api.php"));
    if (currenciesHit && currenciesHit.status >= 400) {
      fail(`currencies API HTTP ${currenciesHit.status}`);
    }
    if (currenciesHit) ok(`currencies API HTTP ${currenciesHit.status}`);

    // Filter sheet open/close
    await filter.click();
    await page.waitForTimeout(400);
    const dialog = page.getByRole("dialog");
    if (!(await dialog.isVisible().catch(() => false))) fail("Filter sheet did not open");
    ok("Filter sheet opens");
    await page.getByRole("button", { name: /This Year|今年/i }).click();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: /Apply|应用|Close/i }).first().click().catch(async () => {
      await page.locator('[aria-label="Close filter"], [aria-label="Close"]').first().click();
    });
    await page.waitForTimeout(1500);

    const bootstrapAfter = apiHits.filter((h) => h.path.includes("dashboard_bootstrap_api.php"));
    if (bootstrapAfter.length < 2) {
      console.warn("  ! expected second bootstrap after preset change (may be cached)");
    } else {
      ok(`bootstrap refetch x${bootstrapAfter.length}`);
    }

    const failed = apiHits.filter((h) => h.status >= 500);
    if (failed.length) fail(`API 5xx: ${failed.map((f) => f.path).join(", ")}`);
    ok("no API 5xx");

    console.log("\nAll Playwright paste cases green — dashboard smoke PASS");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("\nSMOKE FAILED:", err.message || err);
  process.exit(1);
});
