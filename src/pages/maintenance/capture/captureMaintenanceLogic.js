import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { isC168CompanyCode } from "../../../utils/company/c168CaptureChannel.js";
import { fetchDomainCompanyPermissions } from "../shared/maintenanceCompanyApi.js";
import { fetchProcessListByTenantId } from "../../processlist/processListApi.js";
import { fetchProcesses as fetchDomainReportProcesses } from "../../report/domain/domainReportApi.js";
import { mapGroupPayrollProcesses } from "../../datacapture/lib/dataCaptureGroupOnlyProcesses.js";
import { syncCompanySessionApi } from "../../../utils/company/companySessionSync.js";
import { formatSpringDateTimeToDmy } from "../shared/maintenanceDateHelpers.js";
import { captureMaintenanceUsesGroupProcesses } from "./captureMaintenanceScope.js";

/** ProcessSelect expects process_name; domain report / Spring process-list rows both normalize to this shape. */
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

export async function fetchCompanyPermissions(companyCode) {
  const code = String(companyCode ?? "").trim().toUpperCase();
  if (isC168CompanyCode(code)) {
    return ["Games", "Gambling"];
  }
  const perms = await fetchDomainCompanyPermissions(companyCode);
  return perms.length > 0 ? perms : ["Games", "Bank"];
}

export async function fetchProcesses(companyId, scope = null) {
  const payrollChannel = Boolean(scope?.c168Channel || scope?.companyPayrollChannel);
  if (payrollChannel) {
    return [
      { id: "PROFIT", process_name: "PROFIT", description: null },
      { id: "SALARY", process_name: "SALARY", description: null },
      { id: "COMMISSION", process_name: "COMMISSION", description: null },
      { id: "BONUS", process_name: "BONUS", description: null },
    ];
  }
  if (scope && captureMaintenanceUsesGroupProcesses(scope) && !payrollChannel) {
    const apiList = await fetchDomainReportProcesses(scope, { credentials: "include" });
    return mapProcessesForMaintenanceSelect(mapGroupPayrollProcesses(apiList));
  }
  const effectiveId = scope?.scopeCompanyId ?? companyId;
  const tid = Number(effectiveId);
  if (!Number.isFinite(tid) || tid <= 0) return [];
  const rows = await fetchProcessListByTenantId(tid);
  return mapProcessesForMaintenanceSelect(rows);
}

/**
 * "Bank" for C168 / bank-only payroll companies AND pure Group mode — group payroll submissions
 * (SALARY/COMMISSION/BONUS/PROFIT) always land under category BANK, same tenant as GAME data.
 * Mirrors `captureMaintenanceUsesGroupProcesses` exactly (same three conditions) so the process
 * dropdown and the actual list/delete category filter never disagree.
 * "Games" otherwise — category is a required hard filter server-side.
 */
function resolveCaptureMaintenanceCategory(scope) {
  return captureMaintenanceUsesGroupProcesses(scope) ? "Bank" : "Games";
}

/**
 * Numeric tenant id(s) for capture maintenance list/delete.
 * Group entity + subsidiary company share one Spring tenant row; "aggregate" (Groups All / Group All) spans several.
 * Pure Group scope's `scope.scopeCompanyId` is already resolved to the group's real entity tenantId by
 * `resolveCustomerReportScope` (reportScope.js) — capture maintenance has no separate group-only resolution path.
 */
function resolveCaptureMaintenanceTenantIds({ companyId, scope } = {}) {
  if (scope?.mode === "aggregate") {
    const ids = Array.isArray(scope.mergeCompanyIds) ? scope.mergeCompanyIds : [];
    return ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
  }
  const tid = Number(companyId ?? scope?.scopeCompanyId);
  if (Number.isFinite(tid) && tid > 0) return [tid];
  return [];
}

/** Spring `MaintenanceCaptureDTO` row (one row per `data_captures` header) → legacy grid row shape. */
function normalizeSpringCaptureMaintenanceRow(row, tenantId) {
  return {
    capture_id: Number(row?.id) || 0,
    dts_created: formatSpringDateTimeToDmy(row?.dtsCreated),
    product: row?.product ?? "",
    process: row?.process ?? "",
    currency: row?.currency ?? "",
    wl_group: row?.wlGroup ?? "",
    submitted_by: row?.createdBy ?? "",
    is_deleted: row?.deleted === true,
    deleted_by: row?.deletedBy ?? "",
    dts_deleted: formatSpringDateTimeToDmy(row?.deletedAt),
    _tenant_id: tenantId,
    _dts_created_raw: String(row?.dtsCreated ?? ""),
  };
}

/** Global sort across (possibly several, aggregate-merged) tenants: dtsCreated desc, id desc — mirrors backend CC_ROW_ORDER. */
function sortCaptureMaintenanceRows(rows) {
  return [...rows].sort((a, b) => {
    const cmp = String(b._dts_created_raw || "").localeCompare(String(a._dts_created_raw || ""));
    if (cmp !== 0) return cmp;
    return Number(b.capture_id || 0) - Number(a.capture_id || 0);
  });
}

async function fetchCaptureMaintenancePage({ tenantId, dateFrom, dateTo, process, category, q, signal }) {
  const request = {
    tenantId,
    dateFrom,
    dateTo,
    process: process || null,
    category,
    q: q || null,
  };
  const response = await fetch(buildApiUrl("api/maintenance/capture-maintenance/list"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.message || data.error || "Search failed");
  }
  return Array.isArray(data.data) ? data.data : [];
}

/**
 * Search capture data
 * @param {AbortSignal} [options.signal] — 切换公司等场景取消过时请求，避免列表闪动与竞态
 */
export async function searchCaptureData(
  { dateFrom, dateTo, process, query, scope },
  options = {},
) {
  const { signal } = options;
  const tenantIds = resolveCaptureMaintenanceTenantIds({ scope });
  if (tenantIds.length === 0) return [];

  const processFilter = String(process ?? "").trim();
  const category = resolveCaptureMaintenanceCategory(scope);
  const q = query?.trim() ? query.trim().toUpperCase() : null;

  const perTenant = await Promise.all(
    tenantIds.map((tenantId) =>
      fetchCaptureMaintenancePage({
        tenantId,
        dateFrom,
        dateTo,
        process: processFilter,
        category,
        q,
        signal,
      }).then((rows) => rows.map((row) => normalizeSpringCaptureMaintenanceRow(row, tenantId))),
    ),
  );

  return sortCaptureMaintenanceRows(perTenant.flat());
}

/**
 * Delete selected capture items — deletion unit is always the whole capture (`data_captures.id`); every
 * `data_capture_line` under it goes together, so `captureIds` are exactly `row.capture_id` values.
 * @param {number[]} captureIds
 * @param {object} scope
 * @param {Array<object>} rows currently-loaded rows (carry `_tenant_id` from the search response)
 */
export async function deleteCaptureItems({ captureIds, scope = null, rows = [] }) {
  const ids = Array.isArray(captureIds)
    ? captureIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
    : [];
  if (ids.length === 0) {
    throw new Error("Please select at least one record");
  }

  const rowByCaptureId = new Map((Array.isArray(rows) ? rows : []).map((r) => [Number(r.capture_id), r]));
  const fallbackTenantId = resolveCaptureMaintenanceTenantIds({ scope })[0] ?? null;

  const idsByTenant = new Map();
  for (const id of ids) {
    const tenantId = Number(rowByCaptureId.get(id)?._tenant_id) || fallbackTenantId;
    if (!tenantId) continue;
    if (!idsByTenant.has(tenantId)) idsByTenant.set(tenantId, []);
    idsByTenant.get(tenantId).push(id);
  }
  if (idsByTenant.size === 0) {
    throw new Error("tenantIdRequired");
  }

  let lastResult = null;
  for (const [tenantId, tenantCaptureIds] of idsByTenant) {
    const response = await fetch(buildApiUrl("api/maintenance/capture-maintenance/delete"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ tenantId, captureIds: tenantCaptureIds }),
    });
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || data.error || "Delete failed");
    }
    lastResult = data;
  }
  return lastResult;
}

/**
 * Update session company
 */
export async function updateSessionCompany(companyId) {
  const json = await syncCompanySessionApi(companyId);
  if (!json?.success) {
    throw new Error(json?.message || "Failed to update session company");
  }
  return json.data;
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
