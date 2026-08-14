/**
 * Same-page sidebar re-click soft refresh.
 * Remount alone is not enough for pages with module/DOM state (e.g. Transaction Capture Date).
 * Layout bumps a key and pages can also react via outlet context `pageRefreshKey`.
 */

let pendingPageKey = null;

/** Mark which page should apply defaults after the soft-refresh remount. */
export function markSidebarPageSoftRefresh(pageKey) {
  pendingPageKey = pageKey || null;
}

/** True once per soft refresh for the given page key (consumed by the page). */
export function consumeSidebarPageSoftRefresh(pageKey) {
  if (!pageKey || pendingPageKey !== pageKey) return false;
  pendingPageKey = null;
  return true;
}
