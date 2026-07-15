import { buildApiUrl } from "../../utils/core/apiUrl.js";
import { buildAccountsUrl } from "./accountLogic.js";

const accountListRouteWarmCache = new Map();
const accountListRouteWarmInflight = new Map();

function buildGroupAccountsUrl(groupId, searchTerm, showInactive, showAll) {
  const url = new URL(buildApiUrl("api/accounts/accountlistapi.php"));
  url.searchParams.set("group_id", String(groupId));
  url.searchParams.set("group_only", "1");
  if (String(searchTerm || "").trim()) url.searchParams.set("search", String(searchTerm || "").trim());
  if (showInactive) url.searchParams.set("showInactive", "1");
  if (showAll) url.searchParams.set("showAll", "1");
  return url;
}

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

async function fetchAccountListSlice({
  companyId = null,
  groupId = null,
  search = "",
  showInactive = false,
  showAll = false,
  signal,
} = {}) {
  const cid = companyId != null ? Number(companyId) : null;
  const gid = groupId ? String(groupId).trim().toUpperCase() : "";
  const url =
    cid != null && Number.isFinite(cid) && cid > 0
      ? buildAccountsUrl(cid, search, showInactive, showAll, { groupId: gid || null })
      : gid
        ? buildGroupAccountsUrl(gid, search, showInactive, showAll)
        : null;
  if (!url) return null;

  const res = await fetch(url.toString(), { credentials: "include", signal });
  const json = await res.json();
  if (!json?.success) return null;
  return Array.isArray(json?.data?.accounts) ? json.data.accounts : [];
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
