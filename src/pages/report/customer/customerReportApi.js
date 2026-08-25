import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { fetchAccountListByTenantId } from "../../account/accountListApi.js";
import { formatReportAmount, reportAmountAdd } from "../shared/reportAmountFormat.js";

export const formatAmount = formatReportAmount;
export const reportAdd = reportAmountAdd;

/**
 * Spring POST /api/report/customer-report/list body (tenant-only, aligned with Maintenance/Payment
 * History: no legacy company_id/group_id/report_scope — see backend docs/frontend-springboot-migration.md 第29节).
 */
export function buildSpringCustomerReportRequest({
  tenantId,
  dateFrom,
  dateTo,
  accountId,
  currencyCodes,
  showAll,
} = {}) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) {
    throw new Error("tenantIdRequired");
  }
  const aid = Number(accountId);
  return {
    tenantId: tid,
    dateFrom: String(dateFrom || "").trim(),
    dateTo: String(dateTo || "").trim(),
    accountId: Number.isFinite(aid) && aid > 0 ? aid : null,
    // Empty/omitted = every currency the account is assigned to (account_currency) — "Show All Currencies".
    currencyCodes: Array.isArray(currencyCodes) && currencyCodes.length > 0
      ? currencyCodes.map((c) => String(c).trim().toUpperCase()).filter(Boolean)
      : null,
    showAll: Boolean(showAll),
  };
}

/** Spring CustomerReportDTO row → table row fields (aligned to backend camelCase). */
function normalizeSpringCustomerReportRow(row) {
  if (!row || typeof row !== "object") return null;
  return {
    id: row.accountRowId ?? null,
    account_id: row.accountCode ?? "",
    name: row.accountName ?? "",
    currency: row.currencyCode ? String(row.currencyCode).trim().toUpperCase() : null,
    win: row.winAmount,
    lose: row.loseAmount,
  };
}

/**
 * Single-tenant fetch via Spring POST /api/report/customer-report/list.
 * The Spring response list ends with one synthesized row (totalRow=true) carrying the blended
 * Total — split it out here so callers get the same { rows, totalWin, totalLose } shape regardless
 * of how many tenants get merged.
 */
async function fetchCustomerReportOnce({
  tenantId,
  dateFrom,
  dateTo,
  accountId,
  currencyCodes,
  showAll,
  signal,
}) {
  const body = buildSpringCustomerReportRequest({
    tenantId,
    dateFrom,
    dateTo,
    accountId,
    currencyCodes,
    showAll,
  });

  const res = await fetch(buildApiUrl("api/report/customer-report/list"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify(body),
    signal,
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || json.error || "Failed to load report");
  }

  const allRows = Array.isArray(json.data) ? json.data : [];
  let totalWin = "0";
  let totalLose = "0";
  const rows = [];
  for (const raw of allRows) {
    if (raw?.totalRow) {
      totalWin = raw.winAmount ?? "0";
      totalLose = raw.loseAmount ?? "0";
      continue;
    }
    const row = normalizeSpringCustomerReportRow(raw);
    if (row) rows.push(row);
  }
  return { rows, totalWin, totalLose };
}

/** Resolve the single tenantId a scope points at (company mode / one leg of an aggregate loop). */
function resolveCustomerReportTenantId(scope) {
  const id = Number(scope?.scopeCompanyId ?? scope?.uiCompanyId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function resolveCustomerReportTenantIds(reportScope) {
  const mergeCompanyIds =
    reportScope?.mode === "aggregate" && Array.isArray(reportScope.mergeCompanyIds)
      ? reportScope.mergeCompanyIds.filter((id) => Number(id) > 0)
      : [];
  if (mergeCompanyIds.length > 0) return mergeCompanyIds.map((id) => Number(id));
  const id = resolveCustomerReportTenantId(reportScope);
  return id ? [id] : [];
}

/**
 * Customer Report list. Group "aggregate" scope loops per company tenant and merges client-side —
 * the Spring backend only ever answers for one tenant at a time (see resolveCustomerReportTenantIds).
 */
export async function fetchCustomerReport(
  {
    accountId,
    dateFrom,
    dateTo,
    showAll,
    reportScope,
    selectedCurrencies,
    showAllCurrencies,
  },
  options = {},
) {
  const { signal } = options;
  const currencyCodes = showAllCurrencies ? [] : (selectedCurrencies || []);

  const tenantIds = resolveCustomerReportTenantIds(reportScope);
  if (!tenantIds.length) {
    throw new Error("tenantIdRequired");
  }

  let rows = [];
  let totalWin = "0";
  let totalLose = "0";
  for (const tenantId of tenantIds) {
    const part = await fetchCustomerReportOnce({
      tenantId,
      dateFrom,
      dateTo,
      accountId,
      currencyCodes,
      showAll,
      signal,
    });
    rows = rows.concat(part.rows);
    totalWin = reportAmountAdd(totalWin, part.totalWin);
    totalLose = reportAmountAdd(totalLose, part.totalLose);
  }

  return {
    success: true,
    data: rows,
    total_win: totalWin,
    total_lose: totalLose,
    date_from: dateFrom,
    date_to: dateTo,
  };
}

/**
 * Account dropdown data source — Spring `POST /api/account/list` (same helper Formula Maintenance
 * uses for its account dropdown, see backend docs/frontend-springboot-migration.md 第18节). Replaces the legacy
 * `api/transactions/get_accounts_api.php`, which 500s now that the reverse proxy sends every
 * unrewritten `/api/*` path to Spring. Aggregate scope loops per tenant and merges, same pattern as
 * the report list itself. No status filter — matches the legacy Customer Report account list, which
 * never filtered ACTIVE/INACTIVE either.
 */
export async function fetchAccounts(reportScope, options = {}) {
  const { signal } = options;

  const tenantIds = resolveCustomerReportTenantIds(reportScope);
  if (!tenantIds.length) return [];

  const seen = new Set();
  let accounts = [];
  for (const tenantId of tenantIds) {
    const rows = await fetchAccountListByTenantId(tenantId, signal);
    for (const row of rows) {
      if (row?.id == null || seen.has(row.id)) continue;
      seen.add(row.id);
      accounts.push(row);
    }
  }
  accounts.sort((a, b) => String(a.account_id || "").localeCompare(String(b.account_id || "")));
  return accounts;
}
