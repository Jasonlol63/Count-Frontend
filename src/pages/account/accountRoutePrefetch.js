import { fetchAccountListByTenantId, filterAccountListRows } from "./accountListApi.js";

const accountListRouteWarmCache = new Map();
const accountListRouteWarmInflight = new Map();

function accountListRouteCacheKey({
  companyId = null,
  groupId = null,
  search = "",
  showActive = false,
  showInactive = false,
  showAll = false,
} = {}) {
  const cid = companyId != null ? Number(companyId) : null;
  const gid = groupId ? String(groupId).trim().toUpperCase() : "";
  return `${cid ?? ""}|${gid}|${String(search || "").trim()}|${showActive ? 1 : 0}|${showInactive ? 1 : 0}|${showAll ? 1 : 0}`;
}

function hasAccountRows(rows) {
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * Spring `/api/account/list` is single-tenant only — there's no server-side group_id/group_only
 * resolution to warm against, so a group-only sidebar hover (no companyId yet) is a no-op here;
 * the page still loads correctly on its own, just without this warm-cache head start.
 */
async function fetchAccountListSlice({
  companyId = null,
  search = "",
  showInactive = false,
  showAll = false,
  signal,
} = {}) {
  const cid = companyId != null ? Number(companyId) : null;
  if (!Number.isFinite(cid) || cid <= 0) return null;
  const rows = await fetchAccountListByTenantId(cid, signal);
  return filterAccountListRows(rows, { searchTerm: search, showInactive, showAll });
}

/** Sidebar hover / dashboard idle warm — consumed on AccountListPage boot. */
export function warmAccountListRouteCache({
  companyId = null,
  groupId = null,
  search = "",
  showActive = false,
  showInactive = false,
  showAll = false,
} = {}) {
  const key = accountListRouteCacheKey({ companyId, groupId, search, showActive, showInactive, showAll });
  if (accountListRouteWarmCache.has(key) || accountListRouteWarmInflight.has(key)) return;

  const promise = fetchAccountListSlice({ companyId, search, showInactive, showAll })
    .then((rows) => {
      if (hasAccountRows(rows)) accountListRouteWarmCache.set(key, rows);
      return rows;
    })
    .finally(() => {
      if (accountListRouteWarmInflight.get(key) === promise) {
        accountListRouteWarmInflight.delete(key);
      }
    });
  accountListRouteWarmInflight.set(key, promise);
}

export function consumeAccountListRouteCache(opts = {}) {
  const key = accountListRouteCacheKey(opts);
  const cached = accountListRouteWarmCache.get(key) || null;
  if (cached) accountListRouteWarmCache.delete(key);
  return cached;
}

/** Drop all sidebar warm entries so remount cannot skip a stale paint-only boot. */
export function clearAccountListRouteWarmCache() {
  accountListRouteWarmCache.clear();
  accountListRouteWarmInflight.clear();
}

/** Use sidebar warm cache, in-flight warm, or return null (page fetches). */
export async function resolveAccountListRouteCache(opts = {}) {
  const cached = consumeAccountListRouteCache(opts);
  if (hasAccountRows(cached)) return cached;
  const key = accountListRouteCacheKey(opts);
  const inflight = accountListRouteWarmInflight.get(key);
  if (!inflight) return null;
  try {
    const rows = await inflight;
    return hasAccountRows(rows) ? rows : null;
  } catch {
    return null;
  }
}
