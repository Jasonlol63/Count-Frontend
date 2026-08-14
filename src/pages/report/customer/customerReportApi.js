import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { customerReportScopeApiParams } from "../shared/reportScope.js";
import { formatReportAmount, reportAmountAdd } from "../shared/reportAmountFormat.js";

export const formatAmount = formatReportAmount;
export const reportAdd = reportAmountAdd;

function appendScopeParams(params, scope) {
  const { companyId, viewGroup, groupId, groupsAll, groupAll, groupAggregate } =
    customerReportScopeApiParams(scope);
  if (companyId) params.append("company_id", String(companyId));
  const vg = viewGroup ? String(viewGroup).trim().toUpperCase() : "";
  if (vg) params.append("view_group", vg);
  const gid = groupId ? String(groupId).trim().toUpperCase() : "";
  if (gid) params.append("group_id", gid);
  if (groupsAll) params.append("groups_all", "1");
  if (groupAll) params.append("group_all", "1");
  if (groupAggregate) params.append("group_aggregate", "1");
  if (scope?.mode) params.append("report_scope", scope.mode);
}

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
  const params = new URLSearchParams();
  if (accountId) params.append("account_id", accountId);
  params.append("date_from", dateFrom);
  params.append("date_to", dateTo);
  if (showAll) params.append("show_all", "1");

  appendScopeParams(params, reportScope);

  if (!showAllCurrencies && selectedCurrencies.length > 0) {
    params.append("currency", selectedCurrencies.join(","));
  }

  const res = await fetch(buildApiUrl(`api/reports/customer_report_api.php?${params.toString()}`), {
    credentials: "include",
    signal,
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || json.error || "Failed to load report");
  }
  return json;
}

export async function fetchAccounts(reportScope, options = {}) {
  const { signal } = options;
  const params = new URLSearchParams();
  appendScopeParams(params, reportScope);
  const url = buildApiUrl(`api/transactions/get_accounts_api.php?${params.toString()}`);
  const res = await fetch(url, { credentials: "include", signal });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || json.error || "Failed to load accounts");
  }
  return json.data || [];
}
