/**
 * Keep sensitive SPA state out of the browser address bar.
 * Filters / company scope live in sessionStorage + server session — not ?company_id= in URL.
 */

/** Query keys never shown to end users in the address bar. */
export const PRIVATE_BROWSER_QUERY_KEYS = new Set([
  "company_id",
  "group_id",
  "group_only",
  "view_group",
  "group_aggregate",
  "subsidiary_accounts_only",
  "search",
  "showInactive",
  "showActive",
  "showAll",
  "showOfficial",
  "showEInvoice",
  "showBlock",
  "date_from",
  "date_to",
  "currency",
  "roles",
  "ph",
  "account_db_id",
  "account_code",
  "account_name",
  "virtual_company_code",
  "entry",
  "user",
  "module",
  "q",
  "p",
  "restore",
  "gs",
  "gc",
  "process_id",
  "capture_date",
  "id",
  "action",
  "permission",
  "country",
  "company_ids",
  "success",
  "error",
  "_",
]);

/**
 * Read a boot param from the URL once, then remove it from the address bar.
 * @param {string} key
 * @returns {string|null}
 */
export function consumeBootQueryParam(key) {
  if (typeof window === "undefined" || !key) return null;
  try {
    const url = new URL(window.location.href);
    const value = url.searchParams.get(key);
    if (value == null) return null;
    url.searchParams.delete(key);
    const qs = url.searchParams.toString();
    window.history.replaceState(
      window.history.state,
      document.title,
      `${url.pathname}${qs ? `?${qs}` : ""}${url.hash || ""}`,
    );
    return value;
  } catch {
    return null;
  }
}

/** Strip private query keys; leave pathname (+ hash) only when nothing public remains. */
export function stripPrivateQueryFromBrowserUrl() {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(window.location.href);
    let changed = false;
    for (const key of [...url.searchParams.keys()]) {
      if (PRIVATE_BROWSER_QUERY_KEYS.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    if (!changed) return false;
    const qs = url.searchParams.toString();
    const next = `${url.pathname}${qs ? `?${qs}` : ""}${url.hash || ""}`;
    window.history.replaceState(window.history.state, document.title, next);
    return true;
  } catch {
    return false;
  }
}

/** Canonical visible URL: pathname + hash only (no query string). */
export function replaceBrowserPathOnly() {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    const next = `${url.pathname}${url.hash || ""}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash || ""}`;
    if (current !== next) {
      window.history.replaceState(window.history.state, document.title, next);
    }
  } catch {
    /* ignore */
  }
}

/** @deprecated Use stripPrivateQueryFromBrowserUrl */
export function stripSearchParamsFromUrl(keys) {
  if (!Array.isArray(keys) || keys.length === 0) return;
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    let changed = false;
    keys.forEach((key) => {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    });
    if (!changed) return;
    const qs = url.searchParams.toString();
    window.history.replaceState(
      window.history.state,
      document.title,
      `${url.pathname}${qs ? `?${qs}` : ""}${url.hash || ""}`,
    );
  } catch {
    /* ignore */
  }
}
