import { fetchAccessibleTenants, tenantAccessibleRowToUiTenant } from "../../utils/company/tenantAccessibleApi.js";

const CACHE_KEY = "all";
const cache = new Map();
const inflight = new Map();

function fetchAllTenants({ force = false } = {}) {
  if (force) {
    cache.delete(CACHE_KEY);
    inflight.delete(CACHE_KEY);
  } else {
    const hit = cache.get(CACHE_KEY);
    if (hit) return Promise.resolve(hit);
  }

  const pending = inflight.get(CACHE_KEY);
  if (pending) return pending;

  const promise = fetchAccessibleTenants({ all: true, throwOnError: true })
    .then(({ tenants }) => {
      const rows = tenants
        .map((t) => tenantAccessibleRowToUiTenant(t))
        .filter(Boolean)
        // Ownership UI displays `name` — Spring tenants only carry a `code` (no separate
        // business name), matching the original PHP `get_companies_api.php` which set
        // `name` = company code too.
        .map((row) => ({ ...row, name: row.company_id }));
      cache.set(CACHE_KEY, rows);
      return rows;
    })
    .finally(() => {
      inflight.delete(CACHE_KEY);
    });

  inflight.set(CACHE_KEY, promise);
  return promise;
}

/** Read warm tenant list (UI shape) from sidebar hover prefetch, filtered to COMPANY rows. */
export function peekOwnershipCompaniesCache() {
  const rows = cache.get(CACHE_KEY);
  return rows ? rows.filter((t) => t.tenant_type === "COMPANY") : null;
}

/** Drop cached tenant list so the next load hits the API (after join/ungroup/save). */
export function invalidateOwnershipCompaniesCache() {
  cache.delete(CACHE_KEY);
  inflight.delete(CACHE_KEY);
}

/** Drop the ownership tenant warm cache (shell realtime). */
export function clearAllOwnershipCompaniesCache() {
  cache.clear();
  inflight.clear();
}

export async function prefetchOwnershipCompanies(_monthKeyOrOptions, maybeOptions) {
  // Legacy call sites pass (monthKey, { force }) — the tenant list itself does not vary
  // by month (only per-tenant ownership rows do), so month is accepted and ignored here.
  const { force = false } =
    typeof _monthKeyOrOptions === "object" && _monthKeyOrOptions !== null
      ? _monthKeyOrOptions
      : maybeOptions || {};
  const rows = await fetchAllTenants({ force });
  return rows.filter((t) => t.tenant_type === "COMPANY");
}

/** GROUP-type tenants for the Group Earnings tab — shares the same underlying fetch/cache. */
export async function prefetchOwnershipGroups({ force = false } = {}) {
  const rows = await fetchAllTenants({ force });
  return rows.filter((t) => t.tenant_type === "GROUP");
}
