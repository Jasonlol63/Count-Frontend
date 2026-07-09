import { resolveViewGroupForCompany } from "../../../utils/company/sharedCompanyFilter.js";
import { setTxSearchCache } from "../../../utils/transaction/transactionSearchCache.js";
import {
  getAccounts,
  getCompanyCurrencies,
  getUserCurrencyOrder,
  searchTransactions,
  transactionQueryKeys,
} from "./transactionApi.js";
import { formatDmy } from "./transactionFormat.js";
import {
  orderCurrencyRows,
  pickTransactionDefaultCurrency,
  sanitizeSearchApiData,
} from "./transactionPaymentLogic.js";
import {
  resolveTransactionScope,
  transactionScopeApiParams,
  transactionScopeCacheCompanyKey,
  transactionScopeCacheKey,
  resolveTransactionCurrencyOrderCompanyId,
} from "./transactionScope.js";

const TRANSACTION_CURRENCY_FILTER_KEY_PREFIX = "transaction_currency_filter_v1_";
const hoverWarmInflight = new Map();

/** Must match useTransactionSearch `requestKey` JSON shape. */
export function buildTransactionSearchRequestKey({
  scopeCacheCompanyKey,
  dateFrom,
  dateTo,
  showAllCurrencies = false,
  selectedCurrencies = [],
  categoryParam = "",
  showInactive = false,
  showCaptureOnly = false,
  hideZeroBalance = true,
}) {
  const cur =
    !showAllCurrencies && selectedCurrencies?.length
      ? [...selectedCurrencies]
          .map((c) => String(c || "").toUpperCase().trim())
          .filter(Boolean)
          .sort()
          .join(",")
      : "";
  return JSON.stringify({
    dateFrom,
    dateTo,
    categoryParam,
    showInactive: showInactive ? "1" : "0",
    showCaptureOnly: showCaptureOnly ? "1" : "0",
    hideZero: hideZeroBalance ? "0" : "1",
    companyId: String(scopeCacheCompanyKey || ""),
    showAllCurrencies: !!showAllCurrencies,
    currencies: cur,
  });
}

export function readPersistedCurrencyForCompany(companyCacheKey) {
  if (!companyCacheKey) return { showAll: false, currencies: [] };
  try {
    const raw = localStorage.getItem(`${TRANSACTION_CURRENCY_FILTER_KEY_PREFIX}${companyCacheKey}`);
    if (!raw) return { showAll: false, currencies: [] };
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object") return { showAll: false, currencies: [] };
    return {
      showAll: !!o.showAll,
      currencies: Array.isArray(o.currencies)
        ? o.currencies.map((c) => String(c || "").toUpperCase().trim()).filter(Boolean)
        : [],
    };
  } catch {
    return { showAll: false, currencies: [] };
  }
}

function resolveDefaultSearchCurrencies(scopeCacheCompanyKey) {
  const prefs = readPersistedCurrencyForCompany(scopeCacheCompanyKey);
  if (prefs.showAll) return { showAll: true, currencies: [] };
  if (prefs.currencies.length > 0) {
    return { showAll: false, currencies: prefs.currencies };
  }
  const code = pickTransactionDefaultCurrency(["MYR"]);
  return { showAll: false, currencies: code ? [code] : ["MYR"] };
}

export function buildDefaultSearchApiParams(scope, { dateFrom, dateTo } = {}) {
  const scopeApi = transactionScopeApiParams(scope);
  const scopeCacheCompanyKey = transactionScopeCacheCompanyKey(scope);
  const currencyPrefs = resolveDefaultSearchCurrencies(scopeCacheCompanyKey);
  const subsidiarySearch =
    scopeApi.subsidiaryAccountsOnly ||
    (scopeApi.companyId != null && Number(scopeApi.companyId) > 0);

  return {
    scopeApi,
    scopeCacheCompanyKey,
    currencyPrefs,
    searchParams: {
      ...scopeApi,
      viewGroup: subsidiarySearch ? undefined : scopeApi.viewGroup,
      groupId: subsidiarySearch ? undefined : scopeApi.groupId,
      groupAggregate: subsidiarySearch ? undefined : scopeApi.groupAggregate,
      subsidiaryAccountsOnly: subsidiarySearch ? true : scopeApi.subsidiaryAccountsOnly,
      dateFrom,
      dateTo,
      showInactive: false,
      showCaptureOnly: false,
      hideZeroBalance: true,
      currencyCodes:
        !currencyPrefs.showAll && currencyPrefs.currencies.length > 0
          ? currencyPrefs.currencies
          : undefined,
    },
    requestKey: buildTransactionSearchRequestKey({
      scopeCacheCompanyKey,
      dateFrom,
      dateTo,
      showAllCurrencies: currencyPrefs.showAll,
      selectedCurrencies: currencyPrefs.currencies,
      hideZeroBalance: true,
    }),
  };
}

export function hydrateTransactionScopeMetadataFromCache(queryClient, scope, snapCompanies = []) {
  if (!queryClient || !scope) return null;
  const scopeCacheKey = transactionScopeCacheKey(scope);
  if (!scopeCacheKey) return null;

  const acc = queryClient.getQueryData(transactionQueryKeys.accounts(scopeCacheKey));
  const cur = queryClient.getQueryData(transactionQueryKeys.companyCurrencies(scopeCacheKey));
  if (!acc || !cur) return null;

  const orderCompanyId = resolveTransactionCurrencyOrderCompanyId(scope, snapCompanies);
  const ord = orderCompanyId
    ? queryClient.getQueryData([...transactionQueryKeys.userCurrencyOrder(), orderCompanyId])
    : null;
  const accData = Array.isArray(acc?.data) ? acc.data : [];
  const curRows = Array.isArray(cur?.data) ? cur.data : [];
  if (!accData.length && !curRows.length) return null;

  const ordered = orderCurrencyRows(curRows, ord, orderCompanyId);
  const codes = ordered
    .map((x) => String(x.code || x.currency || "").toUpperCase().trim())
    .filter(Boolean);

  return {
    scopeCacheKey,
    accData,
    ordered,
    codes: [...new Set(codes)],
  };
}

async function prefetchSearchIntoCache(queryClient, scope, dateFrom, dateTo) {
  if (!scope || scope.mode === "aggregate") return;
  const { searchParams, requestKey } = buildDefaultSearchApiParams(scope, { dateFrom, dateTo });
  if (!searchParams.dateFrom || !searchParams.dateTo) return;

  if (queryClient) {
    const body = await queryClient.fetchQuery({
      queryKey: transactionQueryKeys.search(searchParams),
      queryFn: ({ signal }) => searchTransactions({ ...searchParams, signal }),
      staleTime: 5 * 60_000,
      gcTime: 15 * 60_000,
    });
    if (body?.success && body?.data) {
      setTxSearchCache(requestKey, sanitizeSearchApiData(body.data));
    }
    return;
  }

  const body = await searchTransactions(searchParams).catch(() => null);
  if (body?.success && body?.data) {
    setTxSearchCache(requestKey, sanitizeSearchApiData(body.data));
  }
}

async function prefetchAccountsBundle(queryClient, scopeKey, scopeApi, orderCompanyId) {
  if (queryClient) {
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: transactionQueryKeys.accounts(scopeKey),
        queryFn: ({ signal }) => getAccounts({ ...scopeApi, signal }),
        staleTime: 60_000,
        gcTime: 10 * 60_000,
      }),
      queryClient.prefetchQuery({
        queryKey: transactionQueryKeys.companyCurrencies(scopeKey),
        queryFn: ({ signal }) => getCompanyCurrencies({ ...scopeApi, signal }),
        staleTime: 60_000,
        gcTime: 10 * 60_000,
      }),
      orderCompanyId
        ? queryClient.prefetchQuery({
            queryKey: [...transactionQueryKeys.userCurrencyOrder(), orderCompanyId],
            queryFn: ({ signal }) => getUserCurrencyOrder({ companyId: orderCompanyId, signal }),
            staleTime: 60_000,
            gcTime: 10 * 60_000,
          })
        : Promise.resolve(),
    ]);
    return;
  }

  await Promise.all([
    getAccounts({ ...scopeApi }).catch(() => null),
    getCompanyCurrencies({ ...scopeApi }).catch(() => null),
    orderCompanyId
      ? getUserCurrencyOrder({ companyId: orderCompanyId }).catch(() => null)
      : Promise.resolve(null),
  ]);
}

/**
 * Warm accounts, currencies, order, and default search for a filter snapshot.
 * Safe to call before commitFilterSnapshot (uses nextSnap only).
 */
export function prefetchTransactionScopeBundle(queryClient, { nextSnap, todayDmy, snapCompanies } = {}) {
  if (!nextSnap) return Promise.resolve();
  const scope = resolveTransactionScope(nextSnap);
  if (!scope || scope.mode === "aggregate") return Promise.resolve();

  const scopeKey = transactionScopeCacheKey(scope);
  const scopeApi = transactionScopeApiParams(scope);
  const companies = snapCompanies || nextSnap.snapCompaniesAll || nextSnap.snapCompanies || [];
  const orderCompanyId = resolveTransactionCurrencyOrderCompanyId(scope, companies);
  const dateFrom = todayDmy || formatDmy(new Date());
  const dateTo = dateFrom;

  return Promise.all([
    prefetchAccountsBundle(queryClient, scopeKey, scopeApi, orderCompanyId),
    prefetchSearchIntoCache(queryClient, scope, dateFrom, dateTo).catch(() => null),
  ]).catch(() => null);
}

/** Hover/focus on company pill — warm target scope without switching. */
export function warmTransactionCompanyHover(queryClient, { filterSnapshot, company, todayDmy } = {}) {
  if (!queryClient || !filterSnapshot || !company?.id) return;
  const numericCid = Number(company.id);
  if (!Number.isFinite(numericCid) || numericCid <= 0) return;
  if (Number(numericCid) === Number(filterSnapshot.companyId)) return;

  const key = String(numericCid);
  if (hoverWarmInflight.has(key)) return;

  const gid = company.group_id ? String(company.group_id).toUpperCase().trim() : null;
  const nextGroup = gid || filterSnapshot.selectedGroup;
  const nextSnap = {
    ...filterSnapshot,
    companyId: numericCid,
    groupOnlyLedger: false,
    selectedGroup: nextGroup || filterSnapshot.selectedGroup,
    displayCompanyRow: company,
    groupsAllMode: false,
    groupAllMode: false,
  };

  const promise = prefetchTransactionScopeBundle(queryClient, {
    nextSnap,
    todayDmy,
    snapCompanies: filterSnapshot.snapCompaniesAll || filterSnapshot.snapCompanies,
  }).finally(() => {
    if (hoverWarmInflight.get(key) === promise) hoverWarmInflight.delete(key);
  });
  hoverWarmInflight.set(key, promise);
}

export function buildNextSnapForCompany(filterSnapshot, company) {
  if (!filterSnapshot || !company?.id) return null;
  const numericCid = Number(company.id);
  const gid = company.group_id ? String(company.group_id).toUpperCase().trim() : null;
  const nextGroup = gid || filterSnapshot.selectedGroup;
  return {
    ...filterSnapshot,
    companyId: numericCid,
    groupOnlyLedger: false,
    selectedGroup: nextGroup || filterSnapshot.selectedGroup,
    displayCompanyRow: company,
    groupsAllMode: false,
    groupAllMode: false,
  };
}

export function resolveViewGroupForCompanyRow(company, selectedGroup) {
  return resolveViewGroupForCompany(company, selectedGroup);
}
