import { mergeCurrencyCodesWithSavedOrder } from "../../utils/company/currencyDisplayOrder.js";
import { processListCacheHasEntry, processListCacheHasRows } from "./processListHelpers.js";
import { fetchProcessListByTenantId, fetchProcessFormMeta } from "./processListApi.js";
import { fetchBankProcessListByTenantId } from "../bankprocesslist/bankProcessListApi.js";
import { fetchCurrencyListByTenantId, normalizeCurrencyRow } from "../../utils/api/currencyApi.js";
import { getUserCurrencyOrder } from "../transaction/lib/transactionApi.js";

/** Currency pill codes + saved drag order (order is localStorage-only, no Spring API). */
async function resolveOrderedCurrencyCodes(tenantId, signal) {
  const rows = await fetchCurrencyListByTenantId(tenantId, signal);
  const codes = rows.map((r) => normalizeCurrencyRow(r).code).filter(Boolean);
  const ordJson = await getUserCurrencyOrder({ companyId: tenantId }).catch(() => null);
  return mergeCurrencyCodesWithSavedOrder(codes, ordJson?.data?.order);
}

const processListRouteWarmCache = new Map();
const processListRouteWarmInflight = new Map();
const bankProcessListRouteWarmCache = new Map();
const bankProcessListRouteWarmInflight = new Map();

function processListRouteCacheKey(companyId, { search = "", showActive = false, showInactive = false, showAll = false } = {}) {
  return `${Number(companyId)}|${String(search || "").trim()}|${showActive ? 1 : 0}|${showInactive ? 1 : 0}|${showAll ? 1 : 0}`;
}

/** Sidebar hover / idle warm — consumed on ProcessListPage boot. */
export function warmProcessListRouteCache(companyId, opts = {}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) return;
  const key = processListRouteCacheKey(cid, opts);
  if (processListRouteWarmCache.has(key) || processListRouteWarmInflight.has(key)) return;
  const promise = fetchGamesProcessListSlice(cid, opts)
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

/** Sync peek for first paint — does not consume (boot still resolve/consume). */
export function peekProcessListRouteCache(companyId, opts = {}) {
  const key = processListRouteCacheKey(Number(companyId), opts);
  return processListRouteWarmCache.get(key) || null;
}

export function consumeProcessListRouteCache(companyId, opts = {}) {
  const key = processListRouteCacheKey(Number(companyId), opts);
  const cached = processListRouteWarmCache.get(key) || null;
  if (cached) processListRouteWarmCache.delete(key);
  return cached;
}

/** Drop Games + Bank process list warm caches (accounts/process realtime). */
export function clearProcessListRouteWarmCaches() {
  processListRouteWarmCache.clear();
  processListRouteWarmInflight.clear();
  bankProcessListRouteWarmCache.clear();
  bankProcessListRouteWarmInflight.clear();
}

/** Use sidebar warm cache, in-flight warm, or fetch once. */
export async function resolveProcessListRouteCache(companyId, opts = {}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) {
    return { rows: null, currencyCodes: null };
  }
  const cached = consumeProcessListRouteCache(cid, opts);
  if (processListCacheHasEntry(cached)) return cached;
  const key = processListRouteCacheKey(cid, opts);
  const inflight = processListRouteWarmInflight.get(key);
  if (inflight) {
    try {
      const slice = await inflight;
      if (processListCacheHasEntry(slice)) return slice;
    } catch {
      /* fall through to fetch */
    }
  }
  return fetchGamesProcessListSlice(cid, opts);
}

/**
 * Games process list row + currency pill payload (company switch cache / hover warm).
 * Spring list has no server-side search/status filtering (client applies it) — `search`/
 * `showActive`/`showInactive`/`showAll` are accepted only to preserve the caller's cache-key
 * shape, they no longer change what's fetched.
 */
export async function fetchGamesProcessListSlice(companyId, { signal } = {}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) {
    return { rows: null, currencyCodes: null };
  }

  try {
    const [rows, currencyCodes] = await Promise.all([
      fetchProcessListByTenantId(cid, signal).catch(() => null),
      resolveOrderedCurrencyCodes(cid, signal).catch(() => null),
    ]);
    return { rows, currencyCodes };
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    return { rows: null, currencyCodes: null };
  }
}

function bankProcessListRouteCacheKey(companyId, { search = "" } = {}) {
  return `${Number(companyId)}|${String(search || "").trim()}`;
}

function bankProcessListCacheHasEntry(cached) {
  return cached != null && Array.isArray(cached.rows);
}

/** Sidebar hover / idle warm — consumed on BankProcessListPage boot. */
export function warmBankProcessListRouteCache(companyId, opts = {}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) return;
  const key = bankProcessListRouteCacheKey(cid, opts);
  if (bankProcessListRouteWarmCache.has(key) || bankProcessListRouteWarmInflight.has(key)) return;
  const promise = prefetchBankProcessListPayload(cid, opts)
    .then((slice) => {
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

export function consumeBankProcessListRouteCache(companyId, opts = {}) {
  const key = bankProcessListRouteCacheKey(Number(companyId), opts);
  const cached = bankProcessListRouteWarmCache.get(key) || null;
  if (cached) bankProcessListRouteWarmCache.delete(key);
  return cached;
}

/** Use sidebar warm cache, in-flight warm, or fetch once. */
export async function resolveBankProcessListRouteCache(companyId, opts = {}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) {
    return { rows: null, currencyCodes: null };
  }
  const cached = consumeBankProcessListRouteCache(cid, opts);
  if (bankProcessListCacheHasEntry(cached)) return cached;
  const key = bankProcessListRouteCacheKey(cid, opts);
  const inflight = bankProcessListRouteWarmInflight.get(key);
  if (inflight) {
    try {
      const slice = await inflight;
      if (bankProcessListCacheHasEntry(slice)) return slice;
    } catch {
      /* fall through to fetch */
    }
  }
  return prefetchBankProcessListPayload(cid, opts);
}

/** Warm Bank Process List data before route swap (Games → Bank). `search` no longer filters server-side. */
export async function prefetchBankProcessListPayload(companyId, { signal } = {}) {
  const cid = Number(companyId);
  if (!cid) return { rows: null, currencyCodes: null };

  try {
    const [rows, currencyCodes] = await Promise.all([
      fetchBankProcessListByTenantId(cid, signal).catch(() => null),
      resolveOrderedCurrencyCodes(cid, signal).catch(() => null),
    ]);
    return { rows, currencyCodes };
  } catch (err) {
    if (err?.name === "AbortError" || signal?.aborted) {
      return { rows: null, currencyCodes: null };
    }
    return { rows: null, currencyCodes: null };
  }
}

/** Warm Games Process List data before route swap (Bank → Games). */
export async function prefetchGamesProcessListPayload(companyId) {
  const cid = Number(companyId);
  if (!cid) return { rows: null, meta: null, currencyCodes: null };

  try {
    const [slice, meta] = await Promise.all([
      fetchGamesProcessListSlice(cid),
      fetchProcessFormMeta(cid).catch(() => null),
    ]);

    return {
      rows: slice.rows,
      meta: meta || { currencies: [], descriptions: [], days: [], existingProcesses: [] },
      currencyCodes: slice.currencyCodes,
    };
  } catch {
    return { rows: null, meta: null, currencyCodes: null };
  }
}
