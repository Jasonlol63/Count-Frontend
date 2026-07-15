import { pathnameIs, spaPath } from "../../../utils/routing/pageRoutes.js";
import { readPersistedDashboardGcFilter } from "../../../utils/company/sharedCompanyFilter.js";
import { replaceBrowserPathOnly } from "../../../utils/routing/privateBrowserUrl.js";

const PAYMENT_HISTORY_SCOPE_KEY = "ec_payment_history_scope";

export function paymentHistoryTitle({ accountCode, accountName, accountMeta }) {
  const code = String(accountMeta?.account_id ?? accountCode ?? "").trim();
  const name = resolveHistoryAccountName({ accountName, accountMeta, accountCode }) || code;
  return `Payment History - ${code} (${name})`;
}

export function resolveHistoryAccountName({ accountName, accountMeta, accountCode }) {
  const rowName = String(accountName ?? "").trim();
  const apiName = String(accountMeta?.name ?? "").trim();
  const bad = (n) => !n || n.toUpperCase() === "CURRENCY";
  if (!bad(rowName)) return rowName;
  if (!bad(apiName)) return apiName;
  return String(accountMeta?.account_id ?? accountCode ?? "").trim();
}

function readFilterCompanyId() {
  try {
    const saved = readPersistedDashboardGcFilter()?.companyId;
    const cid = saved != null ? Number(saved) : 0;
    return Number.isFinite(cid) && cid > 0 ? cid : undefined;
  } catch {
    return undefined;
  }
}

export function persistPaymentHistoryScope(scope) {
  if (!scope || typeof sessionStorage === "undefined") return;
  try {
    const payload = JSON.stringify(scope);
    sessionStorage.setItem(PAYMENT_HISTORY_SCOPE_KEY, payload);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(PAYMENT_HISTORY_SCOPE_KEY, payload);
    }
  } catch {
    /* ignore */
  }
}

export function readPersistedPaymentHistoryScope() {
  if (typeof sessionStorage === "undefined") return null;
  try {
    let raw = sessionStorage.getItem(PAYMENT_HISTORY_SCOPE_KEY);
    if (!raw && typeof localStorage !== "undefined") {
      raw = localStorage.getItem(PAYMENT_HISTORY_SCOPE_KEY);
    }
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function buildPaymentHistoryScopePayload({ row, dateFrom, dateTo, scopeApi, opts = {} }) {
  const params = new URLSearchParams();
  let companyId = scopeApi?.companyId != null ? Number(scopeApi.companyId) : undefined;
  if (!Number.isFinite(companyId) || companyId <= 0) {
    companyId = readFilterCompanyId();
  }
  if (Number.isFinite(companyId) && companyId > 0) params.set("company_id", String(companyId));
  if (scopeApi?.viewGroup) params.set("view_group", String(scopeApi.viewGroup));
  if (scopeApi?.groupId) params.set("group_id", String(scopeApi.groupId));
  if (scopeApi?.groupAggregate) params.set("group_aggregate", "1");
  if (scopeApi?.subsidiaryAccountsOnly || (companyId && !scopeApi?.groupAggregate)) {
    params.set("subsidiary_accounts_only", "1");
  }

  const accountDbId = row?.account_db_id ? String(row.account_db_id) : "";
  const accountCode = String(row?.account_id || "").trim();
  if (accountDbId) params.set("account_db_id", accountDbId);
  if (accountCode) params.set("account_code", accountCode);

  const accountName = String(row?.account_name || "").trim();
  if (accountName) params.set("account_name", accountName);

  if (dateFrom) params.set("date_from", String(dateFrom));
  if (dateTo) params.set("date_to", String(dateTo));

  let currency = String(row?.currency || "").toUpperCase().trim();
  const { selectedCurrencies = [], showAllCurrencies = true } = opts;
  if (!currency && !showAllCurrencies && Array.isArray(selectedCurrencies) && selectedCurrencies.length > 0) {
    currency = [...selectedCurrencies]
      .map((c) => String(c || "").toUpperCase().trim())
      .filter(Boolean)
      .join(",");
  }
  if (currency) params.set("currency", currency);

  if (!accountDbId && accountCode) params.set("virtual_company_code", accountCode.toUpperCase());

  const pureType = String(opts.pureTypeSearch || "").toUpperCase().trim();

  return {
    ...parsePaymentHistoryParams(params),
    pureTypeSearch: pureType || null,
  };
}

/** Merge session scope with legacy URL params (old bookmarks) and dashboard filter. */
export function resolvePaymentHistoryScope(searchParams, scopeApi = null) {
  const stored = readPersistedPaymentHistoryScope();
  const parsed = searchParams ? parsePaymentHistoryParams(searchParams) : {};
  const merged = {
    companyId: parsed.companyId ?? stored?.companyId ?? scopeApi?.companyId,
    viewGroup: parsed.viewGroup ?? stored?.viewGroup ?? scopeApi?.viewGroup,
    groupId: parsed.groupId ?? stored?.groupId ?? scopeApi?.groupId,
    groupAggregate: parsed.groupAggregate || stored?.groupAggregate || scopeApi?.groupAggregate || false,
    subsidiaryAccountsOnly:
      parsed.subsidiaryAccountsOnly ||
      stored?.subsidiaryAccountsOnly ||
      scopeApi?.subsidiaryAccountsOnly ||
      false,
    accountDbId: parsed.accountDbId ?? stored?.accountDbId,
    accountCode: parsed.accountCode ?? stored?.accountCode,
    accountName: parsed.accountName ?? stored?.accountName,
    dateFrom: parsed.dateFrom ?? stored?.dateFrom,
    dateTo: parsed.dateTo ?? stored?.dateTo,
    currency: parsed.currency ?? stored?.currency,
    virtualCompanyCode: parsed.virtualCompanyCode ?? stored?.virtualCompanyCode,
    pureTypeSearch:
      parsed.pureTypeSearch !== undefined
        ? parsed.pureTypeSearch || null
        : stored?.pureTypeSearch ?? null,
  };

  if ((!merged.companyId || merged.companyId <= 0) && (merged.subsidiaryAccountsOnly || merged.accountDbId)) {
    const filterCid = readFilterCompanyId();
    if (filterCid) merged.companyId = filterCid;
  }

  if (!merged.viewGroup && !merged.groupId) {
    const persisted = readPersistedDashboardGcFilter();
    const bootGroup = persisted?.selectedGroup || persisted?.sidebarAnchorGroup;
    if (bootGroup) merged.viewGroup = String(bootGroup).trim().toUpperCase();
  }

  if (merged.subsidiaryAccountsOnly || (merged.companyId && !merged.groupAggregate)) {
    merged.subsidiaryAccountsOnly = true;
  }

  return merged;
}

export function buildPaymentHistoryUrl({ row, dateFrom, dateTo, scopeApi, opts = {} }) {
  const scope = buildPaymentHistoryScopePayload({ row, dateFrom, dateTo, scopeApi, opts });
  persistPaymentHistoryScope(scope);
  return spaPath("transaction-payment-history");
}

export function isPaymentHistoryView(searchParams) {
  return searchParams?.get("ph") === "1";
}

export function isPaymentHistoryChromelessPath(pathname, searchParams) {
  if (pathnameIs("transaction-payment-history", pathname)) return true;
  if (pathnameIs("transaction", pathname)) return isPaymentHistoryView(searchParams);
  return false;
}

export function parsePaymentHistoryParams(searchParams) {
  const get = (key) => {
    const value = searchParams.get(key);
    return value != null && value !== "" ? value : undefined;
  };
  const companyIdRaw = get("company_id");
  const companyId = companyIdRaw != null ? Number(companyIdRaw) : undefined;
  return {
    companyId: Number.isFinite(companyId) && companyId > 0 ? companyId : undefined,
    viewGroup: get("view_group"),
    groupId: get("group_id"),
    groupAggregate: get("group_aggregate") === "1",
    subsidiaryAccountsOnly: get("subsidiary_accounts_only") === "1",
    accountDbId: get("account_db_id"),
    accountCode: get("account_code"),
    accountName: get("account_name"),
    dateFrom: get("date_from"),
    dateTo: get("date_to"),
    currency: get("currency"),
    virtualCompanyCode: get("virtual_company_code"),
    pureTypeSearch: get("pure_type_search"),
  };
}

export function stripPaymentHistoryUrlQuery() {
  replaceBrowserPathOnly();
}

export function paymentHistoryParamsReady(params) {
  if (!params?.dateFrom || !params?.dateTo) return false;
  if (!params.accountDbId && !params.virtualCompanyCode) return false;
  if (params.companyId) return true;
  if (params.viewGroup || params.groupId || params.groupAggregate) return true;
  return false;
}

export function paymentHistoryScopeApiParams(scope) {
  if (!scope) return {};
  return {
    companyId: scope.companyId,
    viewGroup: scope.viewGroup,
    groupId: scope.groupId,
    groupAggregate: scope.groupAggregate,
    subsidiaryAccountsOnly: scope.subsidiaryAccountsOnly,
  };
}
