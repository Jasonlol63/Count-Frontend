/**
 * Generic in-memory list cache for optimistic company switching (Process / Bank / Maintenance tables).
 */

export function rowsFingerprint(rows, idKey = "id") {
  if (!Array.isArray(rows) || rows.length === 0) return "0";
  return rows.map((r) => Number(r[idKey])).join(",");
}

export function getListCacheEntry(cacheRef, cacheKey) {
  return cacheRef.current?.get(cacheKey) ?? null;
}

export function setListCacheEntry(cacheRef, cacheKey, entry) {
  cacheRef.current.set(cacheKey, entry);
}

export function hasListCacheRows(cacheRef, cacheKey) {
  const entry = getListCacheEntry(cacheRef, cacheKey);
  return Boolean(entry?.rows);
}

/** Apply cached rows; optional side effect for currency/meta. Returns true when cache hit. */
export function applyListCacheRows(cacheRef, cacheKey, setRows, { fingerprint = rowsFingerprint, onExtra } = {}) {
  const cached = getListCacheEntry(cacheRef, cacheKey);
  if (!cached?.rows) return false;
  setRows((prev) => (fingerprint(prev) === fingerprint(cached.rows) ? prev : cached.rows));
  onExtra?.(cached);
  return true;
}
