import { mergeCurrencyCodesWithSavedOrder } from "../../utils/company/currencyDisplayOrder.js";
import {
  applyProcessListFilters,
  processListCacheHasEntry,
  rowCurrencyCodesFromRows,
} from "./processListHelpers.js";
import { fetchProcessFormMeta, fetchProcessListByTenantId } from "./processListApi.js";

const processListRouteWarmCache = new Map();
const processListRouteWarmInflight = new Map();
const bankProcessListRouteWarmCache = new Map();
const bankProcessListRouteWarmInflight = new Map();

function processListRouteCacheKey(tenantId, { search = "", showInactive = false, showAll = false } = {}) {
  return `${Number(tenantId)}|${String(search || "").trim()}|${showInactive ? 1 : 0}|${showAll ? 1 : 0}`;
}

/** Sidebar hover / idle warm — consumed on ProcessListPage boot. */
export function warmProcessListRouteCache(tenantId, opts = {}) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) return;
  const key = processListRouteCacheKey(tid, opts);
  if (processListRouteWarmCache.has(key) || processListRouteWarmInflight.has(key)) return;
  const promise = fetchGamesProcessListSlice(tid, opts)
    .then((slice) => {
      if (processListCacheHasEntry(slice)) processListRouteWarmCache.set(key, slice);
      return slice;
    })
    .finally(() => {
      if (processListRouteWarmInflight.get(key) === promise) {
        processListRouteWarmInflight.delete(key);
      }
    });
  processListRouteWarmInflight.set(key, promise);
}

export function consumeProcessListRouteCache(tenantId, opts = {}) {
  const key = processListRouteCacheKey(Number(tenantId), opts);
  const cached = processListRouteWarmCache.get(key) || null;
  if (cached) processListRouteWarmCache.delete(key);
  return cached;
}

/** Use sidebar warm cache, in-flight warm, or fetch once. */
export async function resolveProcessListRouteCache(tenantId, opts = {}) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) {
    return { rows: null, currencyCodes: null };
  }
  const cached = consumeProcessListRouteCache(tid, opts);
  if (processListCacheHasEntry(cached)) return cached;
  const key = processListRouteCacheKey(tid, opts);
  const inflight = processListRouteWarmInflight.get(key);
  if (inflight) {
    try {
      const slice = await inflight;
      if (processListCacheHasEntry(slice)) return slice;
    } catch {
      /* fall through to fetch */
    }
  }
  return fetchGamesProcessListSlice(tid, opts);
}

/** Games process list row + currency pill payload (tenant switch cache / hover warm). */
export async function fetchGamesProcessListSlice(
  tenantId,
  { search = "", showInactive = false, showAll = false, signal } = {},
) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) {
    return { rows: null, currencyCodes: null };
  }

  try {
    const allRows = await fetchProcessListByTenantId(tid, signal);
    const rows = applyProcessListFilters(allRows, { search, showInactive, showAll });
    const currencyCodes = rowCurrencyCodesFromRows(allRows);
    return { rows, currencyCodes };
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    return { rows: null, currencyCodes: null };
  }
}

function bankProcessListRouteCacheKey(tenantId, { search = "" } = {}) {
  return `${Number(tenantId)}|${String(search || "").trim()}`;
}

function bankProcessListCacheHasEntry(cached) {
  return cached != null && Array.isArray(cached.rows);
}

/** Sidebar hover / idle warm — consumed on BankProcessListPage boot. */
export function warmBankProcessListRouteCache(tenantId, opts = {}) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) return;
  const key = bankProcessListRouteCacheKey(tid, opts);
  if (bankProcessListRouteWarmCache.has(key) || bankProcessListRouteWarmInflight.has(key)) return;
  const promise = prefetchBankProcessListPayload(tid, opts)
    .then((slice) => {
      if (bankProcessListRouteWarmInflight.get(key) !== promise) return slice;
      if (bankProcessListCacheHasEntry(slice)) bankProcessListRouteWarmCache.set(key, slice);
      return slice;
    })
    .finally(() => {
      if (bankProcessListRouteWarmInflight.get(key) === promise) {
        bankProcessListRouteWarmInflight.delete(key);
      }
    });
  bankProcessListRouteWarmInflight.set(key, promise);
}

export function consumeBankProcessListRouteCache(tenantId, opts = {}) {
  const key = bankProcessListRouteCacheKey(Number(tenantId), opts);
  const cached = bankProcessListRouteWarmCache.get(key) || null;
  if (cached) bankProcessListRouteWarmCache.delete(key);
  return cached;
}

/** Drop warm list slices for a tenant after mutations (status/update) so remount does not show stale rows. */
export function invalidateBankProcessListRouteCache(tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) return;
  const prefix = `${tid}|`;
  for (const key of [...bankProcessListRouteWarmCache.keys()]) {
    if (String(key).startsWith(prefix)) bankProcessListRouteWarmCache.delete(key);
  }
  for (const key of [...bankProcessListRouteWarmInflight.keys()]) {
    if (String(key).startsWith(prefix)) bankProcessListRouteWarmInflight.delete(key);
  }
}

/** Use sidebar warm cache, in-flight warm, or fetch once. */
export async function resolveBankProcessListRouteCache(tenantId, opts = {}) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) {
    return { rows: null, currencyCodes: null };
  }
  const cached = consumeBankProcessListRouteCache(tid, opts);
  if (bankProcessListCacheHasEntry(cached)) return cached;
  const key = bankProcessListRouteCacheKey(tid, opts);
  const inflight = bankProcessListRouteWarmInflight.get(key);
  if (inflight) {
    try {
      const slice = await inflight;
      if (bankProcessListCacheHasEntry(slice)) return slice;
    } catch {
      /* fall through to fetch */
    }
  }
  return prefetchBankProcessListPayload(tid, opts);
}

/** Warm Bank Process List data before route swap (Games → Bank). */
export async function prefetchBankProcessListPayload(tenantId, { search = "", signal } = {}) {
  const tid = Number(tenantId);
  if (!tid) return { rows: null, currencyCodes: null };

  try {
    const { fetchBankProcessListByTenantId } = await import("../bankprocesslist/bankProcessListApi.js");
    const rows = await fetchBankProcessListByTenantId(tid, signal);
    const filtered = search
      ? rows.filter((r) => {
          const q = String(search).trim().toUpperCase();
          if (!q) return true;
          const hay = [r?.country, r?.bank, r?.type, r?.supplier, r?.card_lower, r?.customer]
            .map((x) => String(x || "").toUpperCase())
            .join(" ");
          return hay.includes(q);
        })
      : rows;

    const currencyCodes = rowCurrencyCodesFromRows(filtered);
    return { rows: filtered, currencyCodes };
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    return { rows: null, currencyCodes: null };
  }
}

/** Warm Games Process List data before route swap (Bank → Games). */
export async function prefetchGamesProcessListPayload(tenantId) {
  const tid = Number(tenantId);
  if (!tid) return { rows: null, meta: null, currencyCodes: null };

  try {
    const [slice, meta] = await Promise.all([
      fetchGamesProcessListSlice(tid),
      fetchProcessFormMeta(tid),
    ]);
    return { rows: slice.rows, meta, currencyCodes: slice.currencyCodes };
  } catch {
    return { rows: null, meta: null, currencyCodes: null };
  }
}
