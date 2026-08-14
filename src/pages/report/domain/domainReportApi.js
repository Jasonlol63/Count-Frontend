import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { formatReportAmount } from "../shared/reportAmountFormat.js";
import { customerReportScopeApiParams } from "../shared/reportScope.js";

export const formatAmount = formatReportAmount;

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

export async function fetchDomainReport(
  { dateFrom, dateTo, processId, reportScope, selectedCurrencies = [], showAllCurrencies = true },
  options = {},
) {
  const { signal } = options;
  const params = new URLSearchParams();
  params.append("date_from", dateFrom);
  params.append("date_to", dateTo);
  if (processId) params.append("process_id", processId);
  appendScopeParams(params, reportScope);
  if (!showAllCurrencies && Array.isArray(selectedCurrencies) && selectedCurrencies.length > 0) {
    params.append("currency", selectedCurrencies.join(","));
  }

  const res = await fetch(buildApiUrl(`api/reports/domain_report_api.php?${params.toString()}`), {
    credentials: "include",
    signal,
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || json.error || "Failed to load report");
  }
  return json;
}

export async function fetchProcesses(reportScope, options = {}) {
  const { signal } = options;
  const params = new URLSearchParams();
  params.append("action", "processes");
  appendScopeParams(params, reportScope);
  const url = buildApiUrl(`api/reports/domain_report_api.php?${params.toString()}`);
  const res = await fetch(url, { credentials: "include", signal });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || json.error || "Failed to load processes");
  }
  return json.data || [];
}
