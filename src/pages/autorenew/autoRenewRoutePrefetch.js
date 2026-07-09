import { fetchAutoRenewApprovals } from "./autoRenewLogic.js";

const cache = new Map();

function cacheKey(status, dateFrom, dateTo, entityType = "company") {
  return `${entityType}|${status}|${dateFrom || ""}|${dateTo || ""}`;
}

/** Read warm list payload from sidebar hover prefetch (same shape as fetchAutoRenewApprovals). */
export function consumeAutoRenewPrefetch(status, { dateFrom, dateTo, entityType = "company" } = {}) {
  const key = cacheKey(status, dateFrom, dateTo, entityType);
  const hit = cache.get(key);
  if (!hit) return null;
  cache.delete(key);
  return hit;
}

export function stashAutoRenewPrefetch(status, range, data) {
  cache.set(cacheKey(status, range?.dateFrom, range?.dateTo, range?.entityType), data);
}

export function peekAutoRenewListCache(status, { dateFrom, dateTo, entityType = "company" } = {}) {
  return cache.get(cacheKey(status, dateFrom, dateTo, entityType)) ?? null;
}

export function rememberAutoRenewListCache(status, { dateFrom, dateTo, entityType = "company" } = {}, data) {
  cache.set(cacheKey(status, dateFrom, dateTo, entityType), data);
}

/** Drop cached list payloads so filter/tab switches always refetch after mutations. */
export function clearAutoRenewListCache({ dateFrom, dateTo, entityType } = {}) {
  const statuses = ["pending", "approved", "rejected", "all"];
  const entities = entityType ? [entityType] : ["company", "group"];
  for (const entity of entities) {
    for (const status of statuses) {
      cache.delete(cacheKey(status, dateFrom, dateTo, entity));
    }
  }
}

export async function prefetchAutoRenewApprovals(status = "pending", range = {}) {
  const key = cacheKey(status, range.dateFrom, range.dateTo, range.entityType);
  if (cache.has(key)) return cache.get(key);
  const data = await fetchAutoRenewApprovals(status, range);
  cache.set(key, data);
  return data;
}
