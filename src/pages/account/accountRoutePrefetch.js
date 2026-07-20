import {
  fetchFilteredAccountListByTenantId,
  resolveAccountListTenantId,
} from "./accountListApi.js";
import { resolveGroupCodeToTenantId } from "./accountLogic.js";
import { getCachedOwnerCompanies } from "../../utils/company/sharedCompanyFilter.js";

const accountListRouteWarmCache = new Map();
const accountListRouteWarmInflight = new Map();

function accountListRouteCacheKey({
  companyId = null,
  groupId = null,
  search = "",
  showInactive = false,
  showAll = false,
} = {}) {
  const cid = companyId != null ? Number(companyId) : null;
  const gid = groupId ? String(groupId).trim().toUpperCase() : "";
  return `${cid ?? ""}|${gid}|${String(search || "").trim()}|${showInactive ? 1 : 0}|${showAll ? 1 : 0}`;
}

function hasAccountRows(rows) {
  return Array.isArray(rows) && rows.length > 0;
}

function resolvePrefetchTenantId({ companyId = null, groupId = null } = {}) {
  const fromCompany = resolveAccountListTenantId(companyId);
  if (fromCompany) return fromCompany;
  return resolveGroupCodeToTenantId(groupId, getCachedOwnerCompanies());
}

async function fetchAccountListSlice({
  companyId = null,
  groupId = null,
  search = "",
  showInactive = false,
  showAll = false,
  signal,
} = {}) {
  const tenantId = resolvePrefetchTenantId({ companyId, groupId });
  if (!tenantId) return null;

  return fetchFilteredAccountListByTenantId(
    tenantId,
    { searchTerm: search, showInactive, showAll },
    signal,
  );
}

/** Sidebar hover / dashboard idle warm — consumed on AccountListPage boot. */
export function warmAccountListRouteCache({
  companyId = null,
  groupId = null,
  search = "",
  showInactive = false,
  showAll = false,
} = {}) {
  const key = accountListRouteCacheKey({ companyId, groupId, search, showInactive, showAll });
  if (accountListRouteWarmCache.has(key) || accountListRouteWarmInflight.has(key)) return;

  const promise = fetchAccountListSlice({ companyId, groupId, search, showInactive, showAll })
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
