import { buildApiUrl } from "../../utils/core/apiUrl.js";
import { isApiSuccess } from "./shared/ownershipHelpers.js";
import {
  getOwnershipCurrentMonthKey,
  isOwnershipHistoricalMonth,
} from "./shared/ownershipMonthHelpers.js";

const cache = new Map();
const inflight = new Map();

function cacheKey(monthKey) {
  return monthKey || getOwnershipCurrentMonthKey();
}

function companiesApiUrl(monthKey, force = false) {
  const monthQs = isOwnershipHistoricalMonth(monthKey)
    ? `&month=${encodeURIComponent(monthKey)}`
    : "";
  const bustQs = force ? `&_=${Date.now()}` : "";
  return buildApiUrl(`api/ownership/get_companies_api.php?all=1${monthQs}${bustQs}`);
}

/** Read warm company list from sidebar hover prefetch (same shape as get_companies_api JSON). */
export function peekOwnershipCompaniesCache(monthKey = getOwnershipCurrentMonthKey()) {
  return cache.get(cacheKey(monthKey)) ?? null;
}

/** Drop cached company list so the next load hits the API (after join/ungroup/save). */
export function invalidateOwnershipCompaniesCache(monthKey = getOwnershipCurrentMonthKey()) {
  const key = cacheKey(monthKey);
  cache.delete(key);
  inflight.delete(key);
}

export async function prefetchOwnershipCompanies(
  monthKey = getOwnershipCurrentMonthKey(),
  { force = false } = {},
) {
  const key = cacheKey(monthKey);
  if (force) {
    cache.delete(key);
    inflight.delete(key);
  } else {
    const hit = cache.get(key);
    if (hit) return hit;
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = fetch(companiesApiUrl(monthKey, force), {
    credentials: "include",
    cache: force ? "no-store" : "default",
  })
    .then((res) => res.json())
    .then((json) => {
      if (isApiSuccess(json)) {
        cache.set(key, json);
        return json;
      }
      throw new Error(json?.message || "Failed to load ownership companies");
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}
