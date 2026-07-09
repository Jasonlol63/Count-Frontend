import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { isC168CompanyCode } from "../../../utils/company/c168CaptureChannel.js";
import { companiesNativeInGroupList } from "../../../utils/company/sharedCompanyFilter.js";
import {
  fetchDomainCompanyPermissions,
  fetchMaintenanceProcesses,
} from "../shared/maintenanceCompanyApi.js";
import { fetchProcesses as fetchDomainReportProcesses } from "../../report/domain/domainReportApi.js";
import { mapDomainGroupProcesses } from "../../report/domain/domainReportGroupProcesses.js";
import { GROUP_ONLY_PROCESS_CODES } from "../../datacapture/lib/dataCaptureGroupOnlyProcesses.js";
import {
  captureMaintenanceScopeApiParams,
  captureMaintenanceUsesGroupProcesses,
} from "./captureMaintenanceScope.js";

/** ProcessSelect expects process_name; domain report rows use process / display_text. */
export function mapProcessesForMaintenanceSelect(apiList) {
  return (Array.isArray(apiList) ? apiList : []).map((row) => {
    const processName = String(
      row.process_name ?? row.process ?? row.process_id ?? "",
    ).trim();
    return {
      id: row.id,
      process_name: processName,
      description: row.description ?? null,
    };
  });
}

function appendScopeToParams(params, scope) {
  const { companyId, viewGroup, groupId, reportScope, groupOnly, groupAggregate } =
    captureMaintenanceScopeApiParams(scope);
  if (companyId) params.append("company_id", String(companyId));
  const vg = viewGroup ? String(viewGroup).trim().toUpperCase() : "";
  if (vg) params.append("view_group", vg);
  const gid = groupId ? String(groupId).trim().toUpperCase() : "";
  if (gid) params.append("group_id", gid);
  if (reportScope) params.append("report_scope", reportScope);
  if (groupOnly) params.append("group_only", "1");
  if (groupAggregate) params.append("group_aggregate", "1");
}

export async function fetchCompanyPermissions(companyCode) {
  const code = String(companyCode ?? "").trim().toUpperCase();
  if (isC168CompanyCode(code)) {
    return ["Games", "Gambling"];
  }
  const perms = await fetchDomainCompanyPermissions(companyCode);
  return perms.length > 0 ? perms : ["Games", "Gambling", "Bank", "Loan", "Rate", "Money"];
}

export async function fetchProcesses(companyId, scope = null) {
  const c168Channel = Boolean(scope?.c168Channel);
  if (scope && captureMaintenanceUsesGroupProcesses(scope) && !c168Channel) {
    const apiList = await fetchDomainReportProcesses(scope, { credentials: "include" });
    return mapProcessesForMaintenanceSelect(mapDomainGroupProcesses(apiList));
  }
  const effectiveId = scope?.scopeCompanyId ?? companyId;
  const rows = await fetchMaintenanceProcesses(effectiveId, { credentials: "include" });
  let mapped = mapProcessesForMaintenanceSelect(rows);
  if (c168Channel) {
    const payrollCodes = new Set(GROUP_ONLY_PROCESS_CODES);
    mapped = mapped.filter((p) =>
      payrollCodes.has(String(p.process_name ?? "").trim().toUpperCase()),
    );
  }
  return mapped;
}

/**
 * Permissions + process list when Group is selected without Company (group-only).
 */
export async function bootstrapCaptureMaintenanceMeta({ companies, groupId = null }) {
  const anchor =
    (groupId ? companiesNativeInGroupList(companies, groupId)[0] : null) ??
    (Array.isArray(companies) ? companies[0] : null) ??
    null;
  const code = anchor?.company_id ? String(anchor.company_id) : "";
  const companyPerms = code
    ? await fetchCompanyPermissions(code)
    : ["Games", "Gambling", "Bank", "Loan", "Rate", "Money"];
  const savedPerm = code ? localStorage.getItem(`selectedPermission_${code}`) : null;
  const initialActive =
    savedPerm && companyPerms.includes(savedPerm) ? savedPerm : companyPerms.length > 0 ? companyPerms[0] : "";
  return { permissions: companyPerms, activePermission: initialActive };
}

/**
 * Search capture data
 * @param {AbortSignal} [options.signal] — 切换公司等场景取消过时请求，避免列表闪动与竞态
 */
export async function searchCaptureData(
  { dateFrom, dateTo, process, category, scope },
  options = {},
) {
  const { signal } = options;
  const params = new URLSearchParams();
  params.append("date_from", dateFrom);
  params.append("date_to", dateTo);
  if (process) {
    params.append("process", process);
  }
  if (category) {
    params.append("category", category);
  }
  appendScopeToParams(params, scope);

  const url = buildApiUrl(`api/capture_maintenance/search_api.php?${params.toString()}`);
  const response = await fetch(url, { signal, credentials: "include" });
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.message || data.error || "Search failed");
  }
  return data.data || [];
}

/**
 * Delete selected capture items
 */
export async function deleteCaptureItems({ items, dateFrom, dateTo, scope }) {
  const payload = {
    date_from: dateFrom,
    date_to: dateTo,
    items,
  };
  const { companyId, viewGroup, groupId, reportScope, groupOnly, groupAggregate } =
    captureMaintenanceScopeApiParams(scope);
  if (companyId) payload.company_id = companyId;
  if (viewGroup) payload.view_group = viewGroup;
  if (groupId) payload.group_id = groupId;
  if (reportScope) payload.report_scope = reportScope;
  if (groupOnly) payload.group_only = "1";
  if (groupAggregate) payload.group_aggregate = "1";

  const response = await fetch(buildApiUrl("api/capture_maintenance/delete_api.php"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.message || data.error || "Delete failed");
  }
  return data;
}

/**
 * Update session company
 */
export async function updateSessionCompany(companyId) {
  const response = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${companyId}`), {
    credentials: "include",
  });
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || "Failed to update session company");
  }
  return result.data;
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
