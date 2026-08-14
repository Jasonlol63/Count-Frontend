import {
  getSiteBasePath,
  pathnameToPageKey,
  resolveCanonicalSpaPath,
  spaPath,
} from "../routing/pageRoutes.js";

export function buildApiUrl(pathAndQuery) {
  const base = window.location.origin + getSiteBasePath();
  return new URL(pathAndQuery, base).href;
}

/**
 * In-app route path (respects subdirectory deploy).
 * Accepts page key ("dashboard"), legacy path ("/dashboard"), or "dashboard?x=1".
 */
export function buildSpaPath(pathAndQuery) {
  const raw = String(pathAndQuery || "").trim();
  if (!raw) return spaPath("login");

  const qIndex = raw.indexOf("?");
  const hIndex = raw.indexOf("#");
  let pathPart = raw;
  let search = "";
  let hash = "";
  if (qIndex >= 0 && (hIndex < 0 || qIndex < hIndex)) {
    pathPart = raw.slice(0, qIndex);
    search = raw.slice(qIndex);
    if (hIndex >= 0) {
      search = raw.slice(qIndex, hIndex);
      hash = raw.slice(hIndex);
    }
  } else if (hIndex >= 0) {
    pathPart = raw.slice(0, hIndex);
    hash = raw.slice(hIndex);
  }

  const normalized = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
  const pageKey = pathnameToPageKey(normalized);
  const canonical = pageKey
    ? spaPath(pageKey, { search, hash })
    : resolveCanonicalSpaPath(normalized, { search, hash }) || normalized;

  // Readable SPA paths are site-root absolute (/dashboard, /login, etc.).
  if (canonical.startsWith("/")) {
    return canonical;
  }

  const url = new URL(canonical.replace(/^\//, ""), window.location.origin + getSiteBasePath());
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Static assets (css/js) under Vite base URL / asset folder — stable across SPA routes. */
export function assetUrl(path) {
  const clean = String(path || "").replace(/^\//, "");
  if (clean.startsWith("images/")) {
    return new URL(`/${clean}`, window.location.origin).href;
  }
  try {
    if (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL != null && import.meta.env.BASE_URL !== "") {
      const baseHref = new URL(import.meta.env.BASE_URL, window.location.origin).href;
      return new URL(clean, baseHref).href;
    }
  } catch {
    /* fall through */
  }
  const entryScript = document.querySelector('script[type="module"][src*="/assets/"]');
  const src = entryScript?.getAttribute("src");
  if (src) {
    try {
      const pathname = new URL(src, window.location.origin).pathname;
      const marker = "/assets/";
      const markerIndex = pathname.indexOf(marker);
      if (markerIndex >= 0) {
        const assetBasePath = pathname.slice(0, markerIndex + 1);
        return new URL(`${assetBasePath}${clean}`, window.location.origin).href;
      }
    } catch {
      /* Fallback to legacy path resolution. */
    }
  }
  return buildApiUrl(clean);
}
