import { rememberCompanySessionFlags } from "./companySessionFlagsCache.js";
import { clearOwnerCompaniesCache, fetchOwnerCompaniesAll } from "./sharedCompanyFilter.js";

/**
 * Call after `update_company_session_api.php` succeeds so AuthenticatedLayout
 * can patch sidebar flags immediately (without waiting for current_user_api).
 */
/** @param {object|null} [sessionData] — payload from update_company_session_api.php `data` */
export function notifyCompanySessionUpdated(sessionData = null) {
  if (sessionData && typeof sessionData === "object") {
    rememberCompanySessionFlags(sessionData);
  }
  window.dispatchEvent(
    new CustomEvent("eazycount:company-session-updated", { detail: sessionData ?? null })
  );
}

/**
 * Refresh sidebar expiration / current_user after company settings change (Domain, etc.).
 * Clears the in-memory owner-companies cache and kicks off a refetch first — otherwise the
 * sidebar keeps resolving expiration_date from the stale tenant row until a full page reload.
 */
export function notifySessionRefreshRequested() {
  clearOwnerCompaniesCache();
  void fetchOwnerCompaniesAll().catch(() => null);
  window.dispatchEvent(new CustomEvent("eazycount:session-refresh-requested"));
}
