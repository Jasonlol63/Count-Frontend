const PAYMENT_HISTORY_SCOPE_KEY = "ec_payment_history_scope";

export function paymentHistoryTitle({ accountCode, accountName, accountMeta }) {
  const code = String(accountMeta?.account_id ?? accountCode ?? "").trim();
  const name = resolveHistoryAccountName({ accountName, accountMeta, accountCode }) || code;
  return `${code} (${name})`;
}

export function resolveHistoryAccountName({ accountName, accountMeta, accountCode }) {
  const rowName = String(accountName ?? "").trim();
  const apiName = String(accountMeta?.name ?? "").trim();
  const bad = (n) => !n || n.toUpperCase() === "CURRENCY";
  if (!bad(rowName)) return rowName;
  if (!bad(apiName)) return apiName;
  return String(accountMeta?.account_id ?? accountCode ?? "").trim();
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

export function buildPaymentHistoryScope({ row, dateFrom, dateTo, scopeApi, currency }) {
  const companyId =
    scopeApi?.companyId != null && Number(scopeApi.companyId) > 0
      ? Number(scopeApi.companyId)
      : undefined;

  const scope = {
    companyId,
    viewGroup: scopeApi?.viewGroup || undefined,
    groupId: scopeApi?.groupId || undefined,
    groupAggregate: Boolean(scopeApi?.groupAggregate),
    subsidiaryAccountsOnly: Boolean(
      scopeApi?.subsidiaryAccountsOnly || (companyId && !scopeApi?.groupAggregate),
    ),
    accountDbId: row?.account_db_id ? String(row.account_db_id) : undefined,
    accountCode: String(row?.account_id || "").trim() || undefined,
    accountName: String(row?.account_name || "").trim() || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    currency: String(row?.currency || currency || "")
      .toUpperCase()
      .trim() || undefined,
    virtualCompanyCode: undefined,
    pureTypeSearch: null,
  };

  if (!scope.accountDbId && scope.accountCode) {
    scope.virtualCompanyCode = scope.accountCode.toUpperCase();
  }

  return scope;
}

export function resolvePaymentHistoryScope(searchParams) {
  const stored = readPersistedPaymentHistoryScope();
  const parsed = searchParams ? parsePaymentHistoryParams(searchParams) : {};
  const merged = {
    companyId: parsed.companyId ?? stored?.companyId,
    viewGroup: parsed.viewGroup ?? stored?.viewGroup,
    groupId: parsed.groupId ?? stored?.groupId,
    groupAggregate: parsed.groupAggregate || stored?.groupAggregate || false,
    subsidiaryAccountsOnly:
      parsed.subsidiaryAccountsOnly || stored?.subsidiaryAccountsOnly || false,
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

  if (merged.subsidiaryAccountsOnly || (merged.companyId && !merged.groupAggregate)) {
    merged.subsidiaryAccountsOnly = true;
  }

  return merged;
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
