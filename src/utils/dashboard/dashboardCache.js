/** Scope entries: company/group × currency × date (session-sized LRU). */
const MAX_ENTRIES = 512;
/** Per-company dashboard_api payload dedupe (session-sized LRU). */
const MAX_PAYLOAD_ENTRIES = 1024;

let sessionOwnerKey = "";
let sessionBootstrapDone = false;
let sessionWarmDone = false;

/** @type {Map<string, { current: unknown, previous: unknown, earnings?: Array<{ code: string, earnings: number }> }>} */
const store = new Map();

/** In-memory dedupe for dashboard_api.php payloads (same query = one network call). */
/** @type {Map<string, unknown>} */
const payloadStore = new Map();

export function buildDashboardCacheKey({
  companyId,
  dateFrom,
  dateTo,
  currencyCode,
  selectedGroup,
  groupAllMode,
  mergedSubsetIds,
  showAllCurrencies = false,
  conversionBaseCurrency = "",
}) {
  const subset = mergedSubsetIds?.length
    ? [...mergedSubsetIds].sort((a, b) => a - b).join(",")
    : "";
  const currencyKey = showAllCurrencies
    ? `ALL:${conversionBaseCurrency || currencyCode || ""}`
    : currencyCode || "";
  return [
    companyId ?? "",
    dateFrom,
    dateTo,
    currencyKey,
    selectedGroup || "",
    groupAllMode ? "1" : "0",
    subset,
  ].join("|");
}

export function bindDashboardSessionCache(ownerKey) {
  const key = String(ownerKey || "").trim();
  if (!key) return;
  if (sessionOwnerKey && sessionOwnerKey !== key) {
    store.clear();
    payloadStore.clear();
    sessionBootstrapDone = false;
  }
  sessionOwnerKey = key;
}

export function isDashboardSessionBootstrapped(ownerKey) {
  const key = String(ownerKey || "").trim();
  return Boolean(key && sessionBootstrapDone && sessionOwnerKey === key);
}

export function markDashboardSessionBootstrapped(ownerKey) {
  const key = String(ownerKey || "").trim();
  if (!key) return;
  sessionOwnerKey = key;
  sessionBootstrapDone = true;
}

export function isDashboardSessionWarmDone() {
  return sessionWarmDone;
}

export function markDashboardSessionWarmDone() {
  sessionWarmDone = true;
}

export function resetDashboardSessionCaches() {
  store.clear();
  payloadStore.clear();
  sessionOwnerKey = "";
  sessionBootstrapDone = false;
  sessionWarmDone = false;
}

export function getDashboardCache(key) {
  return store.get(key) ?? null;
}

export function setDashboardCache(key, entry) {
  if (store.has(key)) store.delete(key);
  store.set(key, entry);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
}

export function patchDashboardCache(key, patch) {
  const prev = store.get(key);
  if (!prev) {
    setDashboardCache(key, patch);
    return;
  }
  setDashboardCache(key, { ...prev, ...patch });
}

/** Stable signature for a currency code list (earnings rows must match exactly). */
export function earningsCodesSignature(codes) {
  return [...new Set(
    (codes || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean)
  )].sort().join(",");
}

/** True when every expected code has a row with a numeric earnings value. */
export function earningsRowsMatchCodes(rows, codes) {
  const expected = earningsCodesSignature(codes).split(",").filter(Boolean);
  if (!expected.length) return false;
  if (!Array.isArray(rows) || rows.length !== expected.length) return false;
  const rowCodes = rows
    .map((row) => String(row?.code || "").trim().toUpperCase())
    .filter(Boolean)
    .sort();
  if (rowCodes.join(",") !== expected.sort().join(",")) return false;
  return rows.every((row) => row.earnings != null && Number.isFinite(Number(row.earnings)));
}

/** Suspicious when 2+ currencies share the same earnings (stale mirrored cache). */
export function earningsRowsLookUniform(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return false;
  const values = rows
    .map((row) => Number(row?.earnings))
    .filter((n) => Number.isFinite(n));
  if (values.length < 2) return false;
  const first = values[0];
  return values.every((n) => Math.abs(n - first) < 0.01);
}

/**
 * Non-primary row copied from primary KPI (common stale seed when only 2 currencies).
 */
export function earningsRowsDuplicatePrimary(rows, primaryCode) {
  if (!Array.isArray(rows) || rows.length < 2 || primaryCode == null) return false;
  const primary = String(primaryCode).trim().toUpperCase();
  if (!primary) return false;
  const primaryRow = rows.find(
    (r) => String(r?.code || "").trim().toUpperCase() === primary
  );
  if (primaryRow?.earnings == null || !Number.isFinite(Number(primaryRow.earnings))) {
    return false;
  }
  const primaryValue = Number(primaryRow.earnings);
  return rows.some((row) => {
    const code = String(row?.code || "").trim().toUpperCase();
    if (!code || code === primary || row.earnings == null) return false;
    return Math.abs(Number(row.earnings) - primaryValue) < 0.02;
  });
}

/** Clear non-primary rows that mirror the primary KPI so UI can refetch real values. */
export function sanitizeDuplicateNonPrimaryEarnings(rows, primaryCode, primaryEarnings = null) {
  if (!Array.isArray(rows) || rows.length < 2 || primaryCode == null) return rows;
  const primary = String(primaryCode).trim().toUpperCase();
  if (!primary) return rows;
  let primaryValue = null;
  if (primaryEarnings != null && Number.isFinite(Number(primaryEarnings))) {
    primaryValue = Number(primaryEarnings);
  } else {
    const primaryRow = rows.find(
      (r) => String(r?.code || "").trim().toUpperCase() === primary
    );
    if (primaryRow?.earnings != null && Number.isFinite(Number(primaryRow.earnings))) {
      primaryValue = Number(primaryRow.earnings);
    }
  }
  if (primaryValue == null) return rows;
  return rows.map((row) => {
    const code = String(row?.code || "").trim().toUpperCase();
    if (!code || code === primary || row.earnings == null) return row;
    if (Math.abs(Number(row.earnings) - primaryValue) < 0.02) {
      return { ...row, earnings: null };
    }
    return row;
  });
}

/**
 * Primary display currency row must match live KPI earnings when provided.
 */
export function earningsRowsPrimaryMatches(rows, primaryCode, primaryEarnings) {
  if (primaryCode == null || String(primaryCode).trim() === "") return true;
  if (primaryEarnings == null || !Number.isFinite(Number(primaryEarnings))) return true;
  const primary = String(primaryCode).trim().toUpperCase();
  const row = (rows || []).find(
    (r) => String(r?.code || "").trim().toUpperCase() === primary
  );
  if (!row || row.earnings == null) return false;
  return Math.abs(Number(row.earnings) - Number(primaryEarnings)) < 0.02;
}

export function earningsRowsAreUsable(rows, codes, primaryCode = null, primaryEarnings = null) {
  if (!earningsRowsMatchCodes(rows, codes)) return false;
  if (earningsRowsLookUniform(rows)) return false;
  if (earningsRowsDuplicatePrimary(rows, primaryCode)) return false;
  if (!earningsRowsPrimaryMatches(rows, primaryCode, primaryEarnings)) return false;
  return true;
}

/** Drop cached earnings on sibling currency scopes (e.g. after currency pill list changes). */
export function clearEarningsFromScopeKeys(scopeKeys) {
  const keys = Array.isArray(scopeKeys) ? scopeKeys : [scopeKeys];
  for (const key of keys) {
    if (!key || !store.has(key)) continue;
    const entry = store.get(key);
    if (!entry || entry.earnings == null) continue;
    const { earnings: _removed, ...rest } = entry;
    store.set(key, rest);
  }
}

/**
 * Earnings breakdown is shared across display-currency scopes — reuse from a sibling cache
 * only when row codes match the active currency list and data passes sanity checks.
 */
export function findSharedDashboardEarnings(scopeKeys, codes, primaryCode = null, primaryEarnings = null) {
  const keys = Array.isArray(scopeKeys) ? scopeKeys : [scopeKeys];
  const codeList = typeof codes === "number"
    ? null
    : (Array.isArray(codes) ? codes : String(codes || "").split(","));
  const expectedCount = typeof codes === "number" ? codes : (codeList?.length ?? 0);

  for (const key of keys) {
    if (!key) continue;
    const earnings = store.get(key)?.earnings;
    if (!Array.isArray(earnings) || !earnings.length) continue;
    if (codeList) {
      if (!earningsRowsAreUsable(earnings, codeList, primaryCode, primaryEarnings)) continue;
    } else if (expectedCount > 0 && earnings.length !== expectedCount) {
      continue;
    }
    return earnings;
  }
  return null;
}

export function getDashboardPayloadCache(queryString) {
  return payloadStore.get(queryString) ?? null;
}

export function setDashboardPayloadCache(queryString, data) {
  if (payloadStore.has(queryString)) payloadStore.delete(queryString);
  payloadStore.set(queryString, data);
  while (payloadStore.size > MAX_PAYLOAD_ENTRIES) {
    payloadStore.delete(payloadStore.keys().next().value);
  }
}

export function clearDashboardPayloadCache() {
  payloadStore.clear();
}

export function clearDashboardCache() {
  store.clear();
}
