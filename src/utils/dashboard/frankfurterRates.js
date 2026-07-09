const FRANKFURTER_API = "https://api.frankfurter.dev/v2/rates";
const CACHE_TTL_MS = 60 * 60 * 1000;
const SESSION_CACHE_PREFIX = "frankfurter_rates_v1:";

/** Crypto / custom codes — never sent to Frankfurter (would fail the whole batch). */
const FRANKFURTER_EXCLUDED_CODES = new Set([
  "USDT",
  "USDC",
  "BUSD",
  "DAI",
  "TUSD",
  "FDUSD",
  "USDD",
  "BTC",
  "ETH",
  "BNB",
  "XRP",
  "SOL",
]);

/** @type {Map<string, { expires: number, rates: Record<string, number>, date: string | null, unsupported?: string[] }>} */
const rateCache = new Map();
/** @type {Map<string, Promise<{ rates: Record<string, number>, date: string | null, unsupported: string[] }>>} */
const frankfurterInflight = new Map();

function readSessionRateCache(key) {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${SESSION_CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.expires || parsed.expires <= Date.now()) {
      sessionStorage.removeItem(`${SESSION_CACHE_PREFIX}${key}`);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeSessionRateCache(key, payload) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(
      `${SESSION_CACHE_PREFIX}${key}`,
      JSON.stringify({
        expires: Date.now() + CACHE_TTL_MS,
        rates: payload.rates,
        date: payload.date,
        unsupported: payload.unsupported || [],
      })
    );
  } catch {
    /* sessionStorage quota — memory cache still works */
  }
}

function cacheKey(base, quotes, date) {
  const sorted = [...quotes].sort().join(",");
  return `${base}|${sorted}|${date || "latest"}`;
}

export function isFrankfurterExcludedCode(code) {
  return FRANKFURTER_EXCLUDED_CODES.has(String(code || "").trim().toUpperCase());
}

/** Split quotes into Frankfurter API candidates vs locally excluded codes (e.g. USDT). */
function partitionFrankfurterQuotes(baseCode, quoteCodes) {
  const quotes = normalizeFrankfurterQuotes(baseCode, quoteCodes);
  const apiQuotes = [];
  const excluded = [];
  for (const quote of quotes) {
    if (isFrankfurterExcludedCode(quote)) excluded.push(quote);
    else apiQuotes.push(quote);
  }
  return { quotes, apiQuotes, excluded };
}

function mergeFrankfurterUnsupported(preExcluded, apiUnsupported, baseCode, quoteCodes, rates) {
  const missing = frankfurterMissingQuotes(baseCode, quoteCodes, rates);
  return [...new Set([...preExcluded, ...(apiUnsupported || []), ...missing])];
}

function missingFrankfurterApiQuotes(baseCode, apiQuotes, rates) {
  return (apiQuotes || []).filter((quote) => {
    const rate = rates?.[quote];
    return !rate || rate <= 0;
  });
}

function mergeFrankfurterRatePayload(baseCode, target, patch) {
  const rates = { [baseCode]: 1, ...target?.rates, ...patch?.rates };
  return {
    rates,
    date: patch?.date || target?.date || null,
    unsupported: patch?.unsupported || target?.unsupported || [],
  };
}

function isFrankfurterCacheComplete(baseCode, apiQuotes, cached) {
  if (!cached || cached.expires <= Date.now()) return false;
  if (!frankfurterRatesPartiallyUsable(baseCode, apiQuotes, cached.rates)) return false;
  return missingFrankfurterApiQuotes(baseCode, apiQuotes, cached.rates).length === 0;
}

/** True when every Frankfurter-eligible quote in `quoteCodes` has a rate in `payload`. */
export function isFrankfurterRatesPayloadComplete(base, quoteCodes, payload) {
  const baseCode = String(base || "").trim().toUpperCase();
  const { apiQuotes } = partitionFrankfurterQuotes(baseCode, quoteCodes);
  if (!apiQuotes.length) return true;
  const rates = payload?.rates;
  if (!rates?.[baseCode]) return false;
  return missingFrankfurterApiQuotes(baseCode, apiQuotes, rates).length === 0;
}

/** Fetch each missing quote individually (historical date first, then latest). */
async function backfillMissingFrankfurterQuotes(baseCode, apiQuotes, dateYmd, seed) {
  let merged = mergeFrankfurterRatePayload(baseCode, { rates: { [baseCode]: 1 } }, seed);
  const missing = missingFrankfurterApiQuotes(baseCode, apiQuotes, merged.rates);
  if (!missing.length) {
    return {
      ...merged,
      unsupported: missingFrankfurterApiQuotes(baseCode, apiQuotes, merged.rates),
    };
  }

  const unsupported = new Set(missing);
  for (const quote of missing) {
    const dateCandidates = dateYmd ? [dateYmd, null] : [null];
    for (const dateTry of dateCandidates) {
      try {
        const one = await fetchFrankfurterRatesOnce(baseCode, [quote], dateTry);
        if (one.rates[quote] && one.rates[quote] > 0) {
          merged = mergeFrankfurterRatePayload(baseCode, merged, one);
          unsupported.delete(quote);
          break;
        }
      } catch {
        /* try next date or leave unsupported */
      }
    }
  }

  return {
    rates: merged.rates,
    date: merged.date,
    unsupported: [...unsupported],
  };
}

/**
 * Fetch Frankfurter rates with base→quote multipliers (1 base = rate quote).
 * @param {string} base - e.g. MYR
 * @param {string[]} quoteCodes - target codes excluding base
 * @param {string | null} [dateYmd] - optional YYYY-MM-DD
 */
export async function fetchFrankfurterRates(base, quoteCodes, dateYmd = null) {
  const baseCode = String(base || "").trim().toUpperCase();
  const { quotes, apiQuotes, excluded: preExcluded } = partitionFrankfurterQuotes(
    baseCode,
    quoteCodes
  );

  if (!baseCode) {
    return { rates: {}, date: null, unsupported: quotes };
  }

  if (!quotes.length) {
    return { rates: { [baseCode]: 1 }, date: dateYmd, unsupported: [] };
  }

  const key = cacheKey(baseCode, quotes, dateYmd);
  const cached = rateCache.get(key);
  if (isFrankfurterCacheComplete(baseCode, apiQuotes, cached)) {
    return { rates: cached.rates, date: cached.date, unsupported: cached.unsupported || [] };
  }

  const sessionCached = readSessionRateCache(key);
  if (isFrankfurterCacheComplete(baseCode, apiQuotes, sessionCached)) {
    rateCache.set(key, sessionCached);
    return {
      rates: sessionCached.rates,
      date: sessionCached.date,
      unsupported: sessionCached.unsupported || [],
    };
  }

  const seedFromCache =
    cached && cached.expires > Date.now()
      ? cached
      : sessionCached && sessionCached.expires > Date.now()
        ? sessionCached
        : null;

  if (frankfurterInflight.has(key)) {
    return frankfurterInflight.get(key);
  }

  const promise = (async () => {
    let lastResult = {
      rates: { [baseCode]: 1 },
      date: dateYmd,
      unsupported: mergeFrankfurterUnsupported(
        preExcluded,
        [],
        baseCode,
        quoteCodes,
        { [baseCode]: 1 }
      ),
    };

    if (!apiQuotes.length) {
      return lastResult;
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const fetched = await fetchFrankfurterRatesResilient(
        baseCode,
        apiQuotes,
        dateYmd,
        seedFromCache
      );
      lastResult = {
        rates: fetched.rates,
        date: fetched.date,
        unsupported: mergeFrankfurterUnsupported(
          preExcluded,
          fetched.unsupported,
          baseCode,
          quoteCodes,
          fetched.rates
        ),
      };
      if (frankfurterRatesPartiallyUsable(baseCode, quoteCodes, lastResult.rates)) {
        storeFrankfurterRatesCache(baseCode, quotes, dateYmd, lastResult);
        return lastResult;
      }
      if (attempt === 0) {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
      }
    }
    return lastResult;
  })();

  frankfurterInflight.set(key, promise);
  try {
    return await promise;
  } finally {
    frankfurterInflight.delete(key);
  }
}

function normalizeFrankfurterQuotes(baseCode, quoteCodes) {
  return [...new Set(
    (quoteCodes || [])
      .map((c) => String(c || "").trim().toUpperCase())
      .filter((c) => c && c !== baseCode)
  )];
}

/** True when every foreign quote has a positive rate for `base`. */
export function frankfurterRatesCoverQuotes(base, quoteCodes, rates) {
  const baseCode = String(base || "").trim().toUpperCase();
  if (!baseCode || !rates?.[baseCode] || rates[baseCode] <= 0) return false;
  const quotes = normalizeFrankfurterQuotes(baseCode, quoteCodes);
  if (!quotes.length) return true;
  return quotes.every((quote) => {
    const rate = rates[quote];
    return rate && rate > 0;
  });
}

/** True when base rate exists and at least one foreign quote can convert (partial OK). */
export function frankfurterRatesPartiallyUsable(base, quoteCodes, rates) {
  const baseCode = String(base || "").trim().toUpperCase();
  if (!baseCode || !rates?.[baseCode] || rates[baseCode] <= 0) return false;
  const quotes = normalizeFrankfurterQuotes(baseCode, quoteCodes);
  if (!quotes.length) return true;
  return quotes.some((quote) => {
    const rate = rates[quote];
    return rate && rate > 0;
  });
}

/** Foreign quotes missing from a Frankfurter base→quote rate map. */
export function frankfurterMissingQuotes(base, quoteCodes, rates) {
  const baseCode = String(base || "").trim().toUpperCase();
  return normalizeFrankfurterQuotes(baseCode, quoteCodes).filter((quote) => {
    const rate = rates?.[quote];
    return !rate || rate <= 0;
  });
}

function storeFrankfurterRatesCache(baseCode, quotes, dateYmd, payload) {
  if (!frankfurterRatesPartiallyUsable(baseCode, [baseCode, ...quotes], payload.rates)) {
    return;
  }
  const key = cacheKey(baseCode, quotes, dateYmd);
  const entry = {
    expires: Date.now() + CACHE_TTL_MS,
    rates: payload.rates,
    date: payload.date,
    unsupported: payload.unsupported || [],
  };
  rateCache.set(key, entry);
  writeSessionRateCache(key, entry);
}

function parseFrankfurterRateRows(baseCode, quotes, rows, dateYmd) {
  const rates = { [baseCode]: 1 };
  const supported = new Set();
  for (const row of rows || []) {
    const quote = String(row.quote || "").toUpperCase();
    const rate = parseFloat(row.rate);
    if (quote && Number.isFinite(rate) && rate > 0) {
      rates[quote] = rate;
      supported.add(quote);
    }
  }
  return {
    rates,
    date: rows?.[0]?.date || dateYmd || null,
    unsupported: quotes.filter((q) => !supported.has(q)),
  };
}

async function fetchFrankfurterRatesOnce(baseCode, quotes, dateYmd) {
  if (!quotes.length) {
    return { rates: { [baseCode]: 1 }, date: dateYmd, unsupported: [] };
  }

  const params = new URLSearchParams({ base: baseCode, quotes: quotes.join(",") });
  if (dateYmd) params.set("date", dateYmd);

  const res = await fetch(`${FRANKFURTER_API}?${params}`);
  if (!res.ok) {
    throw new Error(`Frankfurter HTTP ${res.status}`);
  }

  const rows = await res.json();
  if (!Array.isArray(rows)) {
    throw new Error("Frankfurter invalid response");
  }

  return parseFrankfurterRateRows(baseCode, quotes, rows, dateYmd);
}

/**
 * Batch fetch first, then backfill any missing quotes individually
 * (partial batch responses must not be treated as complete).
 */
async function fetchFrankfurterRatesResilient(baseCode, apiQuotes, dateYmd, seedFromCache = null) {
  let merged = seedFromCache
    ? mergeFrankfurterRatePayload(baseCode, { rates: { [baseCode]: 1 } }, seedFromCache)
    : { rates: { [baseCode]: 1 }, date: dateYmd, unsupported: [...apiQuotes] };

  if (missingFrankfurterApiQuotes(baseCode, apiQuotes, merged.rates).length === 0) {
    return {
      rates: merged.rates,
      date: merged.date,
      unsupported: [],
    };
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const batch = await fetchFrankfurterRatesOnce(baseCode, apiQuotes, dateYmd);
      merged = mergeFrankfurterRatePayload(baseCode, merged, batch);
      if (missingFrankfurterApiQuotes(baseCode, apiQuotes, merged.rates).length === 0) {
        return { rates: merged.rates, date: merged.date, unsupported: [] };
      }
      break;
    } catch {
      if (attempt === 0) {
        await new Promise((resolve) => window.setTimeout(resolve, 200));
      }
    }
  }

  return backfillMissingFrankfurterQuotes(baseCode, apiQuotes, dateYmd, merged);
}

/** Re-base Frankfurter multipliers (1 sourceBase = rate[quote] quote). */
export function deriveFrankfurterRates(newBase, sourceRates, sourceBase, quoteCodes) {
  const targetBase = String(newBase || "").trim().toUpperCase();
  const fromBase = String(sourceBase || "").trim().toUpperCase();
  const quotes = normalizeFrankfurterQuotes(targetBase, quoteCodes);
  if (!targetBase || !fromBase || !sourceRates) return null;

  if (targetBase === fromBase) {
    const rates = { [targetBase]: 1 };
    for (const quote of quotes) {
      const rate = sourceRates[quote];
      if (rate && rate > 0) rates[quote] = rate;
    }
    return { rates, unsupported: quotes.filter((q) => !rates[q]) };
  }

  const pivotRate = sourceRates[targetBase];
  if (!pivotRate || pivotRate <= 0) return null;

  const rates = { [targetBase]: 1 };
  for (const quote of quotes) {
    const sourceRate = sourceRates[quote];
    if (sourceRate && sourceRate > 0) {
      rates[quote] = sourceRate / pivotRate;
    }
  }
  return { rates, unsupported: quotes.filter((q) => !rates[q]) };
}

/** Return cached Frankfurter rates synchronously, or null if missing/expired. */
export function peekFrankfurterRatesCache(base, quoteCodes, dateYmd = null) {
  const baseCode = String(base || "").trim().toUpperCase();
  const quotes = normalizeFrankfurterQuotes(baseCode, quoteCodes);
  if (!baseCode) return null;
  if (!quotes.length) {
    return { rates: { [baseCode]: 1 }, date: dateYmd, unsupported: [] };
  }
  const key = cacheKey(baseCode, quotes, dateYmd);
  let cached = rateCache.get(key);
  if (!cached || cached.expires <= Date.now()) {
    const sessionCached = readSessionRateCache(key);
    if (sessionCached) {
      rateCache.set(key, sessionCached);
      cached = sessionCached;
    }
  }
  if (cached && cached.expires > Date.now()) {
    return {
      rates: cached.rates,
      date: cached.date,
      unsupported: cached.unsupported || [],
    };
  }
  return null;
}

/**
 * Return cached rates for `base`, or derive them from another cached base for the same date.
 * Stores derived rates in cache so later reads are instant.
 */
export function peekFrankfurterRatesCacheOrDerived(base, quoteCodes, dateYmd = null) {
  const direct = peekFrankfurterRatesCache(base, quoteCodes, dateYmd);
  if (direct) return direct;

  const baseCode = String(base || "").trim().toUpperCase();
  const quotes = normalizeFrankfurterQuotes(baseCode, quoteCodes);
  if (!baseCode) return null;
  if (!quotes.length) {
    return { rates: { [baseCode]: 1 }, date: dateYmd, unsupported: [] };
  }

  const dateToken = dateYmd || "latest";
  for (const [key, cached] of rateCache.entries()) {
    if (!cached || cached.expires <= Date.now()) continue;
    const parts = key.split("|");
    if (parts.length < 3 || parts[parts.length - 1] !== dateToken) continue;
    const sourceBase = parts[0];
    if (!sourceBase || sourceBase === baseCode) continue;
    const derived = deriveFrankfurterRates(baseCode, cached.rates, sourceBase, [
      baseCode,
      ...quotes,
    ]);
    if (!derived || !Object.keys(derived.rates).length) continue;
    if (!frankfurterRatesPartiallyUsable(baseCode, quoteCodes, derived.rates)) continue;
    const payload = {
      rates: derived.rates,
      date: cached.date,
      unsupported: derived.unsupported || [],
    };
    storeFrankfurterRatesCache(baseCode, quotes, dateYmd, payload);
    return payload;
  }

  return null;
}

/** Warm Frankfurter cache for the display base only (best-effort, non-blocking). */
export function warmFrankfurterRatesForCurrencies(
  currencies,
  dateYmd = null,
  preferredBase = null
) {
  const codes = [...new Set(
    (currencies || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean)
  )];
  if (codes.length <= 1) return;

  const base = String(preferredBase || codes[0] || "")
    .trim()
    .toUpperCase();
  if (!base || !codes.includes(base)) return;
  if (peekFrankfurterRatesCacheOrDerived(base, codes, dateYmd)) return;
  void fetchFrankfurterRates(base, codes, dateYmd).catch(() => {});
}

/**
 * Convert amount from `fromCode` into `baseCode` using base→quote rates.
 * rate[fromCode] = how many fromCode per 1 baseCode → amount_in_base = amount / rate
 */
export function convertToBaseAmount(amount, fromCode, baseCode, rates) {
  const from = String(fromCode || "").trim().toUpperCase();
  const base = String(baseCode || "").trim().toUpperCase();
  const n = parseFloat(amount);
  if (!Number.isFinite(n)) return null;
  if (from === base) return n;
  const rate = rates?.[from];
  if (!rate || rate <= 0) return null;
  return n / rate;
}

export function sumConvertedEarnings(rows, baseCode, rates) {
  let total = 0;
  let hasMissing = false;
  for (const row of rows) {
    const converted = convertToBaseAmount(row.earnings, row.code, baseCode, rates);
    if (converted == null && String(row.code).toUpperCase() !== String(baseCode).toUpperCase()) {
      hasMissing = true;
      continue;
    }
    total += converted ?? 0;
  }
  return { total, hasMissing };
}

/** Sum KPI fields from per-currency metrics into one base currency. */
export function sumConvertedKpiMetrics(rows, baseCode, rates) {
  const empty = {
    profit: 0,
    expenses: 0,
    netProfit: 0,
    earnings: 0,
    showEarnings: false,
  };
  if (!rows?.length) return empty;

  let showEarnings = false;
  const totals = { profit: 0, expenses: 0, netProfit: 0, earnings: 0 };

  for (const row of rows) {
    const code = String(row.code || "").toUpperCase();
    for (const key of ["profit", "expenses", "netProfit", "earnings"]) {
      const converted = convertToBaseAmount(row[key], code, baseCode, rates);
      if (converted == null && code !== String(baseCode).toUpperCase()) continue;
      totals[key] += converted ?? (parseFloat(row[key]) || 0);
    }
    if (row.showEarnings) showEarnings = true;
  }

  return { ...totals, showEarnings };
}

/** Pick rate date: use range end if not in the future, else latest. */
export function resolveFrankfurterDate(endYmd) {
  if (!endYmd) return null;
  const end = new Date(`${endYmd}T12:00:00`);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (Number.isNaN(end.getTime()) || end > today) return null;
  return endYmd;
}

/** How many `baseCode` units equal 1 `fromCode` unit (Frankfurter base→quote rates). */
export function frankfurterUnitRate(fromCode, baseCode, rates) {
  const from = String(fromCode || "").trim().toUpperCase();
  const base = String(baseCode || "").trim().toUpperCase();
  if (!from || !base) return null;
  if (from === base) return 1;
  const rate = rates?.[from];
  if (!rate || rate <= 0) return null;
  return 1 / rate;
}

export function formatFrankfurterUnitRate(fromCode, baseCode, rates) {
  const unitRate = frankfurterUnitRate(fromCode, baseCode, rates);
  if (unitRate == null) return "—";
  if (unitRate === 1) return "1";
  const abs = Math.abs(unitRate);
  if (abs >= 1000) return unitRate.toFixed(2);
  if (abs >= 100) return unitRate.toFixed(4);
  if (abs >= 1) return unitRate.toFixed(6);
  if (abs >= 0.01) return unitRate.toFixed(6);
  if (abs >= 0.0001) return unitRate.toFixed(6);
  return unitRate.toExponential(4);
}

/**
 * Convert using the same unit rate string shown in the Rate column
 * (amount × displayed rate) so manual calculator checks match the UI.
 */
export function computeDisplayConvertedAmount(amount, fromCode, baseCode, rates) {
  const formatted = formatFrankfurterUnitRate(fromCode, baseCode, rates);
  if (formatted === "—") return null;
  const unitRate = parseFloat(formatted);
  const n = parseFloat(amount);
  if (!Number.isFinite(unitRate) || !Number.isFinite(n)) return null;
  return n * unitRate;
}
