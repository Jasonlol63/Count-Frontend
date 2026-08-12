import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { isC168CompanyCode } from "../../../utils/company/c168CaptureChannel.js";
import { companiesNativeInGroupList } from "../../../utils/company/sharedCompanyFilter.js";
import { fetchDomainCompanyPermissions } from "../shared/maintenanceCompanyApi.js";
import { fetchProcesses as fetchDomainReportProcesses } from "../../report/domain/domainReportApi.js";
import { mapDomainGroupProcesses } from "../../report/domain/domainReportGroupProcesses.js";
import { fetchProcessListByTenantId } from "../../processlist/processListApi.js";
import { captureMaintenanceScopeApiParams, captureMaintenanceUsesGroupProcesses } from "./captureMaintenanceScope.js";

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

export async function fetchCompanyPermissions(companyCode) {
  const code = String(companyCode ?? "").trim().toUpperCase();
  if (isC168CompanyCode(code)) {
    return ["Games", "Gambling"];
  }
  const perms = await fetchDomainCompanyPermissions(companyCode);
  return perms.length > 0 ? perms : ["Games", "Gambling", "Bank", "Loan", "Rate", "Money"];
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
    return mapProcessesForMaintenanceSelect(mapDomainGroupProcesses(apiList));
  }
  // Company mode: every GAME-category process under the current tenant (Spring `/api/process/process-list`,
  // same source as the Process List page — BANK rows are already filtered out by normalizeProcessListRows).
  const effectiveId = scope?.scopeCompanyId ?? companyId;
  const rows = await fetchProcessListByTenantId(effectiveId);
  return mapProcessesForMaintenanceSelect(rows);
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

/** Select All 误传占位文案时视为未选 Process（ProcessSelect 在部分 valueMode 下可能透传显示文案）。 */
function normalizeCaptureMaintenanceProcessFilter(process) {
  const raw = String(process ?? "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower === "select all" || lower === "--select all--" || raw === "全部" || raw === "--全部--") {
    return "";
  }
  return raw;
}

/**
 * Category sent to the Spring endpoint — required, hard-filters `data_captures.category` so
 * GAME/BANK rows never mix. Capture Maintenance has no explicit Category tab; it's derived the
 * same way `fetchProcesses` already picks the process source: payroll-channel/C168 (bank-only)
 * companies are Bank, everyone else is Games.
 */
function resolveCaptureMaintenanceCategory(scope) {
  const payrollChannel = Boolean(scope?.c168Channel || scope?.companyPayrollChannel);
  return payrollChannel ? "Bank" : "Games";
}

/** Resolve the single tenantId a scope points at (same field Payment/Transaction Maintenance use). */
function resolveCaptureMaintenanceTenantId(scope) {
  const id = Number(scope?.scopeCompanyId ?? scope?.uiCompanyId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Spring LocalDateTime → dd/MM/yyyy HH:mm:ss for existing table display. */
function formatCaptureMaintenanceCreatedAt(value) {
  if (value == null || value === "") return "";
  if (Array.isArray(value) && value.length >= 3) {
    const [y, m, d, hh = 0, mm = 0, ss = 0] = value;
    return `${pad2(d)}/${pad2(m)}/${y} ${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
  }
  const raw = String(value).trim();
  if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) return raw;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6] || "00"}`;
  }
  return raw;
}

/** Spring CaptureMaintenanceRow → table row fields (aligned to backend camelCase). */
function normalizeSpringCaptureMaintenanceRow(row) {
  if (!row || typeof row !== "object") return null;
  const isDeleted = row.deleted === true || row.deleted === 1 || row.deleted === "1";
  return {
    capture_id: row.id ?? null,
    dts_created: formatCaptureMaintenanceCreatedAt(row.dtsCreated),
    product: row.product ?? "",
    process: row.process ?? "",
    currency: String(row.currency || "").trim().toUpperCase(),
    wl_group: row.wlGroup ?? "",
    submitted_by: row.createdBy ?? "",
    is_deleted: isDeleted ? 1 : 0,
    deleted_by: row.deletedBy ?? "",
    dts_deleted: formatCaptureMaintenanceCreatedAt(row.deletedAt),
  };
}

/**
 * Search capture data via Spring POST /api/maintenance/capture-maintenance/list (tenant-only, no pagination).
 * @param {AbortSignal} [options.signal] — 切换公司等场景取消过时请求，避免列表闪动与竞态
 */
export async function searchCaptureData(
  { dateFrom, dateTo, process, query, scope },
  options = {},
) {
  const { signal } = options;
  const tenantId = resolveCaptureMaintenanceTenantId(scope);
  if (!tenantId) {
    throw new Error("tenantIdRequired");
  }
  const body = {
    tenantId,
    dateFrom: String(dateFrom || "").trim(),
    dateTo: String(dateTo || "").trim(),
    process: normalizeCaptureMaintenanceProcessFilter(process) || null,
    category: resolveCaptureMaintenanceCategory(scope),
    q: String(query || "").trim() || null,
  };

  const response = await fetch(buildApiUrl("api/maintenance/capture-maintenance/list"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify(body),
    signal,
  });
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.message || data.error || "Search failed");
  }
  const rows = Array.isArray(data.data) ? data.data : [];
  return rows.map(normalizeSpringCaptureMaintenanceRow).filter(Boolean);
}

/**
 * Delete selected capture items
 * NOTE: still calling the legacy PHP endpoint — Capture Maintenance delete (soft-delete archive
 * table + Spring service/controller) has not been implemented yet, out of scope for this pass.
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
  const response = await fetch(buildApiUrl(`auth/switch-tenant?tenant_id=${companyId}`), {
    method: "POST",
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
