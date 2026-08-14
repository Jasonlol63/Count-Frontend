import { resolveViewGroupForCompany } from "../../../utils/company/sharedCompanyFilter.js";
import { resolveSavedCurrencyOrder } from "../../../utils/company/currencyDisplayOrder.js";
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
  readTxListInvalidateTs,
  sanitizeSearchApiData,
} from "./transactionPaymentLogic.js";
import {
  resolveTransactionScope,
  transactionScopeApiParams,
  transactionScopeCacheCompanyKey,
  transactionScopeCacheKey,
  resolveTransactionCurrencyOrderParams,
  resolveTransactionCurrencyOrderCacheKey,
} from "./transactionScope.js";

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
  typeSearch = false,
  typeAccountIds = [],
  typeSearchFormType = "",
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
    // Align with search_api.php hide_zero_balance (1=hide, 0=show all 0 balance).
    hide_zero_balance: hideZeroBalance ? "1" : "0",
    companyId: String(scopeCacheCompanyKey || ""),
    showAllCurrencies: !!showAllCurrencies,
    currencies: cur,
    type_search: typeSearch ? "1" : "0",
    type_account_ids: Array.isArray(typeAccountIds)
      ? [...typeAccountIds].map((id) => Number(id)).filter((id) => id > 0).sort((a, b) => a - b).join(",")
      : "",
    type_search_form_type: String(typeSearchFormType || "").toUpperCase().trim(),
  });
}

/** Default filter = first currency in this company's saved drag order. */
function resolveDefaultSearchCurrencies(scope, snapCompanies = []) {
  const scopeCacheCompanyKey = transactionScopeCacheCompanyKey(scope);
  // Group-only: wait for scoped account currencies from API.
  if (String(scopeCacheCompanyKey || "").startsWith("group:")) {
    return { showAll: false, currencies: [] };
  }
  const orderCacheKey = resolveTransactionCurrencyOrderCacheKey(scope, snapCompanies);
  const order = resolveSavedCurrencyOrder(orderCacheKey, null) || [];
  const code = pickTransactionDefaultCurrency(order.length ? order : ["MYR"]);
  return { showAll: false, currencies: code ? [code] : [] };
}

export function buildDefaultSearchApiParams(scope, { dateFrom, dateTo, snapCompanies = [] } = {}) {
  const scopeApi = transactionScopeApiParams(scope);
  const scopeCacheCompanyKey = transactionScopeCacheCompanyKey(scope);
  const currencyPrefs = resolveDefaultSearchCurrencies(scope, snapCompanies);
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

  const orderCacheKey = resolveTransactionCurrencyOrderCacheKey(scope, snapCompanies);
  const ord = orderCacheKey
    ? queryClient.getQueryData([...transactionQueryKeys.userCurrencyOrder(), orderCacheKey])
    : null;
  const accData = Array.isArray(acc?.data) ? acc.data : [];
  const curRows = Array.isArray(cur?.data) ? cur.data : [];
  if (!accData.length && !curRows.length) return null;

  const ordered = orderCurrencyRows(curRows, ord, orderCacheKey);
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

async function prefetchSearchIntoCache(queryClient, scope, dateFrom, dateTo, snapCompanies = []) {
  if (!scope || scope.mode === "aggregate") return;
  const { searchParams, requestKey } = buildDefaultSearchApiParams(scope, {
    dateFrom,
    dateTo,
    snapCompanies,
  });
  if (!searchParams.dateFrom || !searchParams.dateTo) return;

  // Capture before network — drop fill if ledger invalidate lands while we wait.
  const invalidateTsAtStart = readTxListInvalidateTs();

  const body = await searchTransactions({ ...searchParams }).catch(() => null);
  if (readTxListInvalidateTs() !== invalidateTsAtStart) return;
  if (!body?.success || !body?.data) return;

  const cleaned = sanitizeSearchApiData(body.data);
  setTxSearchCache(requestKey, cleaned);
  if (queryClient) {
    queryClient.setQueryData(transactionQueryKeys.search(searchParams), body);
  }
}

async function prefetchAccountsBundle(queryClient, scopeKey, scopeApi, orderParams, orderCacheKey) {
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
      orderCacheKey
        ? queryClient.prefetchQuery({
            queryKey: [...transactionQueryKeys.userCurrencyOrder(), orderCacheKey],
            queryFn: ({ signal }) =>
              getUserCurrencyOrder({
                companyId: orderParams?.companyId,
                groupId: orderParams?.groupId,
                signal,
              }),
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
    orderCacheKey
      ? getUserCurrencyOrder({
          companyId: orderParams?.companyId,
          groupId: orderParams?.groupId,
        }).catch(() => null)
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
  const orderParams = resolveTransactionCurrencyOrderParams(scope, companies);
  const orderCacheKey = resolveTransactionCurrencyOrderCacheKey(scope, companies);
  const dateFrom = todayDmy || formatDmy(new Date());
  const dateTo = dateFrom;

  return Promise.all([
    prefetchAccountsBundle(queryClient, scopeKey, scopeApi, orderParams, orderCacheKey),
    prefetchSearchIntoCache(queryClient, scope, dateFrom, dateTo, companies).catch(() => null),
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
