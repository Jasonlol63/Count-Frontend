import { buildApiUrl } from "../../utils/core/apiUrl.js";
import { mergeCurrencyCodesWithSavedOrder } from "../../utils/company/currencyDisplayOrder.js";
import { normalizeRows as normalizeGamesProcessRows, processListCacheHasEntry, processListCacheHasRows } from "./processListHelpers.js";
import { normalizeRows as normalizeBankProcessRows } from "../bankprocesslist/lib/bankProcessHelpers.js";

const processListRouteWarmCache = new Map();
const processListRouteWarmInflight = new Map();
const bankProcessListRouteWarmCache = new Map();
const bankProcessListRouteWarmInflight = new Map();

function processListRouteCacheKey(companyId, { search = "", showInactive = false, showAll = false } = {}) {
  return `${Number(companyId)}|${String(search || "").trim()}|${showInactive ? 1 : 0}|${showAll ? 1 : 0}`;
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

export function consumeProcessListRouteCache(companyId, opts = {}) {
  const key = processListRouteCacheKey(Number(companyId), opts);
  const cached = processListRouteWarmCache.get(key) || null;
  if (cached) processListRouteWarmCache.delete(key);
  return cached;
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

/** Games process list row + currency pill payload (company switch cache / hover warm). */
export async function fetchGamesProcessListSlice(
  companyId,
  { search = "", showInactive = false, showAll = false, signal } = {},
) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) {
    return { rows: null, currencyCodes: null };
  }

  const listUrl = new URL(buildApiUrl("api/process/list"));
  listUrl.searchParams.set("tenant_id", String(cid));
  const q = String(search || "").trim();
  if (q) listUrl.searchParams.set("search", q);
  if (showInactive) listUrl.searchParams.set("showInactive", "1");
  if (showAll) listUrl.searchParams.set("showAll", "1");

  const curUrl = new URL(buildApiUrl("api/currency/list"));
  curUrl.searchParams.set("tenant_id", String(cid));

  try {
    const fetchOpts = { credentials: "include", signal };
    const [listRes, curRes] = await Promise.all([
      fetch(listUrl.toString(), { ...fetchOpts, method: "POST" }),
      fetch(curUrl.toString(), { ...fetchOpts, method: "POST" }),
    ]);
    const listJson = await listRes.json();
    const curJson = await curRes.json();
 
    const rows =
      listRes.ok && listJson?.success && Array.isArray(listJson.data)
        ? normalizeGamesProcessRows(listJson.data)
        : null;
 
    let currencyCodes = null;
    if (curRes.ok && curJson?.success && Array.isArray(curJson.data)) {
      const codes = curJson.data.map((r) => String(r.code).toUpperCase());
      const savedOrder = null; // Fallback to default sorting order
      currencyCodes = mergeCurrencyCodesWithSavedOrder(codes, savedOrder);
    }

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

/** Warm Bank Process List data before route swap (Games → Bank). */
export async function prefetchBankProcessListPayload(companyId, { search = "" } = {}) {
  const cid = Number(companyId);
  if (!cid) return { rows: null, currencyCodes: null };

  const listUrl = new URL(buildApiUrl("api/processes/processlist_api.php"));
  listUrl.searchParams.set("permission", "Bank");
  listUrl.searchParams.set("company_id", String(cid));
  listUrl.searchParams.set("showAll", "1");
  const q = String(search || "").trim();
  if (q) listUrl.searchParams.set("search", q);

  const curUrl = buildApiUrl(`api/transactions/get_company_currencies_api.php?company_id=${cid}`);
  const ordUrl = buildApiUrl(
    `api/transactions/user_currency_order_api.php?company_id=${cid}&_t=${Date.now()}`,
  );

  try {
    const [listRes, curRes, ordRes] = await Promise.all([
      fetch(listUrl.toString(), { credentials: "include" }),
      fetch(curUrl, { credentials: "include" }),
      fetch(ordUrl, { credentials: "include" }).catch(() => null),
    ]);
    const listJson = await listRes.json();
    const curJson = await curRes.json();

    const rows =
      listRes.ok && listJson?.success && Array.isArray(listJson.data)
        ? normalizeBankProcessRows(listJson.data)
        : null;

    let currencyCodes = null;
    if (curRes.ok && curJson?.success && Array.isArray(curJson.data)) {
      const codes = curJson.data.map((r) => String(r.code).toUpperCase());
      let savedOrder = null;
      if (ordRes) {
        try {
          const ordJson = await ordRes.json();
          savedOrder = ordJson?.data?.order;
        } catch {
          /* optional order */
        }
      }
      currencyCodes = mergeCurrencyCodesWithSavedOrder(codes, savedOrder);
    }

    return { rows, currencyCodes };
  } catch {
    return { rows: null, currencyCodes: null };
  }
}

/** Warm Games Process List data before route swap (Bank → Games). */
export async function prefetchGamesProcessListPayload(companyId) {
  const cid = Number(companyId);
  if (!cid) return { rows: null, meta: null, currencyCodes: null };

  const metaUrl = new URL(buildApiUrl("api/processes/addprocess_api.php"));
  metaUrl.searchParams.set("company_id", String(cid));

  try {
    const [slice, metaRes] = await Promise.all([
      fetchGamesProcessListSlice(cid),
      fetch(metaUrl.toString(), { credentials: "include" }),
    ]);
    const metaJson = await metaRes.json();
    const metaData = metaJson?.data || metaJson || {};

    const meta = {
      currencies: Array.isArray(metaData.currencies) ? metaData.currencies : [],
      descriptions: Array.isArray(metaData.descriptions) ? metaData.descriptions : [],
      days: Array.isArray(metaData.days) ? metaData.days : [],
      existingProcesses: Array.isArray(metaData.existingProcesses) ? metaData.existingProcesses : [],
    };

    return { rows: slice.rows, meta, currencyCodes: slice.currencyCodes };
  } catch {
    return { rows: null, meta: null, currencyCodes: null };
  }
}
