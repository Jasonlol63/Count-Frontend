import { assetUrl } from "../core/apiUrl.js";

/**
 * 各 Maintenance 子路由会各自注入 `*_maintenance.css`。SPA 切换时若不移除上一页的 sheet，
 * 多个文件同时定义 `.maintenance-search-section` 等相同选择器，后加载顺序不稳定，会出现
 * 「要点刷新才对」的样式错乱。整页刷新时 head 里只有当前页需要的 CSS，故表现正常。
 *
 * Vite 还会为每个 lazy 路由生成 `*MaintenancePage-*.css` chunk；旧版 remove 逻辑只匹配
 * `capture_maintenance.css` 等文件名，删不掉这些 chunk，导致偶发旧样式。
 */
export const MAINTENANCE_PAGE_STYLESHEETS = [
  "capture_maintenance.css",
  "transaction_maintenance.css",
  "payment_maintenance.css",
  "formula_maintenance.css",
  "bankprocess_maintenance.css",
];

export const MAINTENANCE_PAGE_ENTRIES = [
  { cssFile: "capture_maintenance.css", chunkMarker: "CaptureMaintenancePage" },
  { cssFile: "transaction_maintenance.css", chunkMarker: "TransactionMaintenancePage" },
  { cssFile: "payment_maintenance.css", chunkMarker: "PaymentMaintenancePage" },
  { cssFile: "formula_maintenance.css", chunkMarker: "FormulaMaintenancePage" },
  { cssFile: "bankprocess_maintenance.css", chunkMarker: "BankprocessMaintenancePage" },
];

function hrefMatchesMaintenanceEntry(href, entry) {
  const base = entry.cssFile.replace(/\.css$/i, "");
  return href.includes(entry.chunkMarker) || href.includes(base);
}

/**
 * @param {string} keepFileName - 须保留的文件名，例如 "transaction_maintenance.css"
 */
export function removeOtherMaintenanceStylesheets(keepFileName) {
  const keepEntry = MAINTENANCE_PAGE_ENTRIES.find((entry) => entry.cssFile === keepFileName);

  document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
    const href = link.href || link.getAttribute("href") || "";

    const legacyHit = MAINTENANCE_PAGE_STYLESHEETS.find((name) => {
      const base = name.replace(/\.css$/i, "");
      return href.includes(base);
    });
    if (legacyHit && legacyHit !== keepFileName) {
      link.remove();
      return;
    }

    if (!keepEntry) return;

    for (const entry of MAINTENANCE_PAGE_ENTRIES) {
      if (entry.cssFile === keepFileName) continue;
      if (hrefMatchesMaintenanceEntry(href, entry)) {
        link.remove();
        return;
      }
    }
  });

  pinMaintenancePageStylesheet(keepFileName);
  ensureMaintenanceStylesheetFallback(keepFileName);
}

/** 当前页 stylesheet 移到 head 末尾，同级选择器时优先于仍残留的其它 sheet。 */
export function pinMaintenancePageStylesheet(keepFileName) {
  const keepEntry = MAINTENANCE_PAGE_ENTRIES.find((entry) => entry.cssFile === keepFileName);
  if (!keepEntry) return;

  const current = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).find((link) => {
    const href = link.href || link.getAttribute("href") || "";
    return hrefMatchesMaintenanceEntry(href, keepEntry);
  });

  if (current) {
    document.head.appendChild(current);
  }
}

/**
 * SPA 返回上一 maintenance 路由时，Vite chunk link 可能已被 remove；从 dist/css 补一条 fallback。
 */
export function ensureMaintenanceStylesheetFallback(keepFileName) {
  const keepEntry = MAINTENANCE_PAGE_ENTRIES.find((entry) => entry.cssFile === keepFileName);
  if (!keepEntry) return;

  const hasSheet = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some((link) => {
    const href = link.href || link.getAttribute("href") || "";
    return hrefMatchesMaintenanceEntry(href, keepEntry);
  });
  if (hasSheet) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = assetUrl(`css/${keepFileName}`);
  document.head.appendChild(link);
}

/**
 * 等待样式表可用；支持 href 与 DOM 中已存在 link 的绝对/相对 URL 不一致的情况。
 * @param {string} href - 传给 <link href> 的地址（一般为 assetUrl(...)）
 */
const STYLESHEET_WAIT_MS = 4000;

export function waitForStylesheet(href, { timeoutMs = STYLESHEET_WAIT_MS } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (el) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (el) el.dataset.loaded = "1";
      } catch {
        /* ignore */
      }
      resolve(el ?? null);
    };

    const timer =
      timeoutMs > 0
        ? setTimeout(() => finish(null), timeoutMs)
        : null;

    const file = href.split("/").pop() || href;

    const findExisting = () =>
      Array.from(document.querySelectorAll('link[rel="stylesheet"]')).find((link) => {
        const h = link.href || link.getAttribute("href") || "";
        return h === href || h.endsWith(file) || h.includes(file);
      });

    const existing = document.querySelector(`link[rel="stylesheet"][href="${href}"]`) || findExisting();

    if (existing) {
      document.head.appendChild(existing);
      if (existing.dataset.loaded === "1") return finish(existing);
      try {
        if (existing.sheet != null) return finish(existing);
      } catch {
        /* ignore */
      }
      const onLoad = () => {
        existing.removeEventListener("load", onLoad);
        existing.removeEventListener("error", onError);
        finish(existing);
      };
      const onError = () => {
        existing.removeEventListener("load", onLoad);
        existing.removeEventListener("error", onError);
        finish(existing);
      };
      existing.addEventListener("load", onLoad, { once: true });
      existing.addEventListener("error", onError, { once: true });
      return;
    }

    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.onload = () => finish(l);
    l.onerror = () => finish(l);
    document.head.appendChild(l);
  });
}
