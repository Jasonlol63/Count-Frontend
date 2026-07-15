import { rememberCompanySessionFlags } from "./companySessionFlagsCache.js";

/**
 * Call after POST /auth/switch-tenant succeeds so AuthenticatedLayout
 * can patch sidebar flags immediately (without waiting for current-user).
 * @param {object|null} [sessionData] — payload from switch-tenant `data`
 */
export function notifyCompanySessionUpdated(sessionData = null) {
  if (sessionData && typeof sessionData === "object") {
    rememberCompanySessionFlags(sessionData);
  }
  window.dispatchEvent(
    new CustomEvent("eazycount:company-session-updated", { detail: sessionData ?? null })
  );
}

/** Refresh sidebar expiration / current-user after company settings change (Domain, etc.). */
export function notifySessionRefreshRequested() {
  window.dispatchEvent(new CustomEvent("eazycount:session-refresh-requested"));
}
