import { pathnameIs, spaPath } from "../../../utils/routing/pageRoutes.js";
import { readPersistedDashboardGcFilter } from "../../../utils/company/sharedCompanyFilter.js";

export function resolveHistoryAccountName({ accountName, accountMeta, accountCode }) {
  const rowName = String(accountName ?? "").trim();
  const apiName = String(accountMeta?.name ?? "").trim();
  const bad = (n) => !n || n.toUpperCase() === "CURRENCY";
  if (!bad(rowName)) return rowName;
  if (!bad(apiName)) return apiName;
  return String(accountMeta?.account_id ?? accountCode ?? "").trim();
}

export function paymentHistoryTitle({ accountCode, accountName, accountMeta }) {
  const code = String(accountMeta?.account_id ?? accountCode ?? "").trim();
  const name = resolveHistoryAccountName({ accountName, accountMeta, accountCode }) || code;
  return `Payment History - ${code} (${name})`;
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

/** Merge URL params with dashboard filter — new tab has no React transaction scope state. */
export function resolvePaymentHistoryScope(searchParams, scopeApi = null) {
  const parsed = parsePaymentHistoryParams(searchParams);
  const merged = {
    companyId: parsed.companyId ?? scopeApi?.companyId,
    viewGroup: parsed.viewGroup ?? scopeApi?.viewGroup,
    groupId: parsed.groupId ?? scopeApi?.groupId,
    groupAggregate: parsed.groupAggregate || scopeApi?.groupAggregate || false,
    subsidiaryAccountsOnly:
      parsed.subsidiaryAccountsOnly || scopeApi?.subsidiaryAccountsOnly || false,
    accountDbId: parsed.accountDbId,
    accountCode: parsed.accountCode,
    accountName: parsed.accountName,
    dateFrom: parsed.dateFrom,
    dateTo: parsed.dateTo,
    currency: parsed.currency,
    virtualCompanyCode: parsed.virtualCompanyCode,
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

  params.set("ph", "1");

  const qs = params.toString();
  return `${spaPath("transaction")}?${qs}`;
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
  };
}

export function paymentHistoryParamsReady(params) {
  if (!params?.dateFrom || !params?.dateTo) return false;
  if (!params.accountDbId && !params.virtualCompanyCode) return false;
  if (params.companyId) return true;
  // Group / aggregate ledger — view_group (or group_id) is enough without company_id.
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
