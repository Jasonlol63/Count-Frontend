/**
 * Feedback loop for Add User role-select lag (real browser layout).
 *
 * Red path: each "role switch" rebuilds a 80-row user table AND runs
 * clear+getBoundingClientRect+write minHeight across 2×120 cards
 * (mirrors UserListPage + UserModal syncGridCardHeights).
 *
 * Green path: freeze the table + skip height sync (the intended fix).
 *
 * Usage: node ./scripts/bench-userlist-role-lag.mjs
 */
import { chromium } from "playwright";

const THRESHOLD_MS = 80; // 20 role switches with DOM layout thrash should exceed this
const ROLE_SWITCHES = 20;

const pageHtml = `<!DOCTYPE html>
<html><head><style>
  body { margin: 0; font: 14px sans-serif; }
  .user-row { display: grid; grid-template-columns: repeat(8, 1fr); padding: 6px 8px; border-bottom: 1px solid #eee; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 8px; width: 420px; }
  .card { border: 1px solid #ccc; padding: 8px; border-radius: 6px; }
</style></head><body>
<div id="users"></div>
<div id="accounts" class="grid"></div>
<div id="processes" class="grid"></div>
<script>
window.__bench = {
  buildUsers(n) {
    const root = document.getElementById('users');
    root.textContent = '';
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const row = document.createElement('div');
      row.className = 'user-row';
      row.innerHTML = '<div>'+(i+1)+'</div><div>USER'+i+'</div><div>NAME '+i+'</div><div>u'+i+'@ex.com</div><div>ADMIN</div><div>ACTIVE</div><div>2026-07-01</div><div>OWNER</div>';
      frag.appendChild(row);
    }
    root.appendChild(frag);
  },
  buildCards(id, n, prefix) {
    const root = document.getElementById(id);
    root.textContent = '';
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = 'card user-modal-select-card';
      el.innerHTML = '<strong>'+prefix+i+'</strong><div>Description for '+prefix+i+' with extra text</div>';
      frag.appendChild(el);
    }
    root.appendChild(frag);
  },
  syncGrid(id) {
    const grid = document.getElementById(id);
    const cards = grid.querySelectorAll('.user-modal-select-card');
    cards.forEach((c) => { c.style.minHeight = ''; });
    let maxH = 0;
    cards.forEach((c) => { maxH = Math.max(maxH, c.getBoundingClientRect().height); });
    const px = maxH > 0 ? Math.ceil(maxH) + 'px' : '';
    if (!px) return;
    cards.forEach((c) => { c.style.minHeight = px; });
  },
  run({ freezeList, skipHeightSync, switches }) {
    this.buildUsers(80);
    this.buildCards('accounts', 120, 'ACC');
    this.buildCards('processes', 120, 'PROC');
    const t0 = performance.now();
    for (let i = 0; i < switches; i++) {
      if (!freezeList) this.buildUsers(80);
      if (!skipHeightSync) {
        this.syncGrid('accounts');
        this.syncGrid('processes');
      }
    }
    return performance.now() - t0;
  }
};
</script>
</body></html>`;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.setContent(pageHtml, { waitUntil: "domcontentloaded" });

  const baselineMs = await page.evaluate(
    ({ switches }) => window.__bench.run({ freezeList: false, skipHeightSync: false, switches }),
    { switches: ROLE_SWITCHES },
  );
  const fixedMs = await page.evaluate(
    ({ switches }) => window.__bench.run({ freezeList: true, skipHeightSync: true, switches }),
    { switches: ROLE_SWITCHES },
  );

  await browser.close();

  const baselineRed = baselineMs >= THRESHOLD_MS;
  const fixedGreen = fixedMs < THRESHOLD_MS;
  const pass = baselineRed && fixedGreen;

  console.log(
    JSON.stringify(
      {
        ROLE_SWITCHES,
        THRESHOLD_MS,
        baselineMs: Number(baselineMs.toFixed(2)),
        fixedMs: Number(fixedMs.toFixed(2)),
        speedup: Number((baselineMs / Math.max(fixedMs, 0.01)).toFixed(1)),
        baselineRed,
        fixedGreen,
        verdict: pass
          ? "PASS (loop catches bug; fix path green)"
          : baselineRed
            ? "RED baseline only — fix path still slow"
            : "THRESHOLD too high / environment too fast",
      },
      null,
      2,
    ),
  );

  if (!pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
