import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { getDataCaptureWeekdayLabels } from "../../../translateFile/pages/dataCaptureTranslate.js";
import { dataCaptureScopeApiParams, dataCaptureScopeCacheKey } from "./dataCaptureScope.js";
import { resolveDataCaptureTenantId } from "./dataCaptureTenant.js";
import {
  fetchCaptureCurrenciesByTenantId,
  fetchCaptureDescriptionCatalog,
  fetchTenantCategoryPermissions,
  postCaptureDescription,
  postCaptureDescriptionDelete,
  postGameCaptureForm,
  postSubmittedProcesses,
} from "./dataCaptureSpringApi.js";

/** Legacy PHP — still used for get_group_process_id (submissions list migrated to Spring). */
const DATA_CAPTURE_SUBMISSIONS_API = "api/datacapture/submissions_api.php";

/** One option per currency code (subsidiary + group rows can share company_id). */
export function dedupeCaptureCurrenciesByCode(rows) {
  const byCode = new Map();
  for (const row of rows || []) {
    const code = String(row.code || "").trim().toUpperCase();
    if (!code) continue;
    const id = String(row.id);
    const existing = byCode.get(code);
    if (!existing || Number(id) < Number(existing.id)) {
      byCode.set(code, { id, code });
    }
  }
  return Array.from(byCode.values()).sort((a, b) => a.code.localeCompare(b.code));
}

export const dataCaptureQueryKeys = {
  root: () => ["dataCapture"],
  permissions: (tenantId) => [
    ...dataCaptureQueryKeys.root(),
    "permissions",
    tenantId != null ? String(tenantId) : "none",
  ],
  submissions: (scopeKey, captureDate) => [
    ...dataCaptureQueryKeys.root(),
    "submissions",
    scopeKey || "none",
    captureDate || "",
  ],
  companyFormCatalog: (scopeKey) => [
    ...dataCaptureQueryKeys.root(),
    "companyFormCatalog",
    scopeKey || "none",
  ],
  groupCurrencies: (viewGroup) => [
    ...dataCaptureQueryKeys.root(),
    "groupCurrencies",
    viewGroup || "none",
  ],
  processesByDay: (scopeKey, date) => [
    ...dataCaptureQueryKeys.root(),
    "processesByDay",
    scopeKey || "none",
    date || "",
  ],
  processesForScope: (scopeKey) => [
    ...dataCaptureQueryKeys.root(),
    "processesByDay",
    scopeKey || "none",
  ],
  processDetail: (scopeKey, processId) => [
    ...dataCaptureQueryKeys.root(),
    "processDetail",
    scopeKey || "none",
    String(processId ?? ""),
  ],
  descriptionCatalog: (companyId) => [
    ...dataCaptureQueryKeys.root(),
    "descriptionCatalog",
    String(companyId ?? ""),
  ],
};

export function dataCaptureScopeQueryKey(scope) {
  return dataCaptureScopeCacheKey(scope);
}

/** YYYY-MM-DD in local timezone */
export function getLocalDateString(date = null) {
  const d = date || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function buildDateOptions(lang = "en") {
  const weekdayNames = getDataCaptureWeekdayLabels(lang);
  const today = new Date();
  const opts = [];
  for (let i = 6; i >= -6; i -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const dateString = `${year}-${month}-${day}`;
    const weekday = weekdayNames[date.getDay()];
    opts.push({
      value: dateString,
      label: `${dateString} (${weekday})`,
      isToday: i === 0,
    });
  }
  return opts;
}

export function appendDataCaptureScopeParams(params, scope) {
  const { companyId, viewGroup, groupId, reportScope, groupsAll, groupAll, groupOnly } =
    dataCaptureScopeApiParams(scope);
  if (companyId) params.set("company_id", String(companyId));
  const vg = viewGroup ? String(viewGroup).trim().toUpperCase() : "";
  if (vg) params.set("view_group", vg);
  const gid = groupId ? String(groupId).trim().toUpperCase() : "";
  if (gid) params.set("group_id", gid);
  if (groupsAll) params.set("groups_all", "1");
  if (groupAll) params.set("group_all", "1");
  if (reportScope) params.set("report_scope", reportScope);
  if (groupOnly) params.set("group_only", "1");
}

function withScope(url, scope) {
  if (!scope) return url;
  const sep = url.includes("?") ? "&" : "?";
  const params = new URLSearchParams();
  appendDataCaptureScopeParams(params, scope);
  const qs = params.toString();
  return qs ? `${url}${sep}${qs}` : url;
}

function withCompany(url, companyId) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}company_id=${encodeURIComponent(String(cid))}`;
}

/** Load currency list for Games capture form — Spring `/api/currency/list`. */
export async function fetchAddProcessFormData(scopeOrTenantId) {
  const tenantId =
    scopeOrTenantId != null && typeof scopeOrTenantId === "object"
      ? resolveDataCaptureTenantId(scopeOrTenantId)
      : Number(scopeOrTenantId);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    return { success: false, message: "tenantId is required", currencies: [] };
  }
  try {
    const currencies = await fetchCaptureCurrenciesByTenantId(tenantId);
    return { success: true, currencies };
  } catch (err) {
    return { success: false, message: err?.message || "Failed to load currencies", currencies: [] };
  }
}

/**
 * Group Data Capture: currencies from group ledger scope only (same as Dashboard group-only filter).
 * Uses account_currency on group KPI accounts — not subsidiary company currency rows.
 */
export async function fetchGroupCaptureCurrencies(viewGroup) {
  const gid = viewGroup ? String(viewGroup).trim().toUpperCase() : "";
  if (!gid) return [];
  const params = new URLSearchParams({
    group_id: gid,
    view_group: gid,
    group_aggregate: "1",
  });
  try {
    const response = await fetch(
      buildApiUrl(
        `api/transactions/get_scope_account_currencies_api.php?${params.toString()}`,
      ),
      { credentials: "include" },
    );
    const json = await response.json();
    if (!response.ok || !json.success || !Array.isArray(json.data)) return [];
    return dedupeCaptureCurrenciesByCode(
      json.data.map((r) => ({
        id: String(r.id),
        code: String(r.code || "").trim().toUpperCase(),
      })),
    );
  } catch {
    return [];
  }
}

/**
 * @deprecated Group capture should use fetchGroupCaptureCurrencies. Kept for legacy callers.
 * Merge currencies from multiple company rows (dedupe by code).
 */
export async function fetchCurrenciesForCompanyIds(
  companyIds,
  preferredCompanyId = null,
  viewGroup = null,
) {
  const ids = [...new Set((companyIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
  if (!ids.length) return [];

  const vg = viewGroup ? String(viewGroup).trim().toUpperCase() : "";

  const rows = (
    await Promise.all(
      ids.map(async (cid) => {
        try {
          const params = new URLSearchParams({ company_id: String(cid) });
          if (vg) {
            params.set("view_group", vg);
            params.set("group_id", vg);
          }
          const response = await fetch(
            buildApiUrl(
              `api/transactions/get_company_currencies_api.php?${params.toString()}`,
            ),
            { credentials: "include" },
          );
          const json = await response.json();
          if (!response.ok || !json.success || !Array.isArray(json.data)) return [];
          return json.data.map((r) => ({
            id: String(r.id),
            code: String(r.code || "").trim().toUpperCase(),
            companyId: cid,
          }));
        } catch {
          return [];
        }
      }),
    )
  ).flat();

  const byCode = new Map();
  const pref = preferredCompanyId != null ? Number(preferredCompanyId) : null;

  for (const row of rows) {
    const code = row.code;
    if (!code) continue;
    const existing = byCode.get(code);
    if (!existing) {
      byCode.set(code, row);
      continue;
    }
    if (pref != null && Number(row.companyId) === pref) {
      byCode.set(code, row);
    }
  }

  return Array.from(byCode.values())
    .map(({ id, code }) => ({ id, code }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

/** Games process options for capture date — Spring POST `/api/datacapture/games/form`. */
export async function fetchProcessesByDay(selectedDate, scope) {
  const tenantId = resolveDataCaptureTenantId(scope);
  if (!tenantId) {
    return { success: false, message: "tenantId is required", data: [] };
  }
  try {
    const json = await postGameCaptureForm({ tenantId, captureDate: selectedDate });
    return { success: true, data: Array.isArray(json.data?.processes) ? json.data.processes : [] };
  } catch (err) {
    return { success: false, message: err?.message || "Failed to load processes", data: [] };
  }
}

/** Auto-fill on process select — Spring POST `/api/datacapture/games/form` with `id`. */
export async function fetchProcessDetail(processPk, scopeOrTenantId, captureDate = null) {
  const tenantId =
    scopeOrTenantId != null && typeof scopeOrTenantId === "object"
      ? resolveDataCaptureTenantId(scopeOrTenantId)
      : Number(scopeOrTenantId);
  const pk = Number(processPk);
  if (!Number.isFinite(tenantId) || tenantId <= 0 || !Number.isFinite(pk) || pk <= 0) {
    return { success: false, message: "tenantId and process id are required", data: null };
  }
  try {
    const json = await postGameCaptureForm({
      tenantId,
      captureDate: captureDate || getLocalDateString(),
      processPk: pk,
    });
    const detail = json.data?.selectedProcess ?? null;
    if (!detail) {
      return { success: false, message: "Process not found", data: null };
    }
    return { success: true, data: detail };
  } catch (err) {
    return { success: false, message: err?.message || "Failed to load process", data: null };
  }
}

/** Resolve numeric process.id for group payroll codes (SALARY/COMMISSION/BONUS/PROFIT) under scoped company. */
export async function fetchGroupProcessIdByCode(scope, processCode, currencyId = null) {
  const params = new URLSearchParams({
    action: "get_group_process_id",
    process_code: String(processCode || "").trim().toUpperCase(),
  });
  const cid =
    currencyId != null && String(currencyId).trim() !== "" ? Number(currencyId) : 0;
  if (Number.isFinite(cid) && cid > 0) {
    params.set("currency_id", String(cid));
  }
  appendDataCaptureScopeParams(params, scope);
  const url = buildApiUrl(`${DATA_CAPTURE_SUBMISSIONS_API}?${params.toString()}`);
  const response = await fetch(url, { credentials: "include" });
  const json = await response.json();
  if (!json?.success) {
    const msg = json?.error || json?.message;
    throw new Error(msg || "Process not found for scope");
  }
  if (json.data?.process_id == null) {
    throw new Error("Process not found for scope");
  }
  const id = Number(json.data.process_id);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Process not found for scope");
  }
  return id;
}

/** Submitted GAME processes for capture date — Spring POST `/api/datacapture/games/submitted`. */
export async function fetchSubmissionsByCaptureDate(captureDate, scope) {
  const tenantId = resolveDataCaptureTenantId(scope);
  if (!tenantId) {
    return { success: false, message: "tenantId is required", data: [] };
  }
  try {
    const json = await postSubmittedProcesses({ tenantId, captureDate });
    return { success: true, data: Array.isArray(json.data) ? json.data : [] };
  } catch (err) {
    return { success: false, message: err?.message || "Failed to load submitted processes", data: [] };
  }
}

/** Tenant category permissions — Spring `/auth/switch-tenant` session flags. */
export async function fetchCompanyPermissionsForDataCapture(tenantId) {
  return fetchTenantCategoryPermissions(tenantId);
}

/** Formats `DataCaptureGameDTO.createAt` (fallback `captureDate`) as `DD/MM/YYYY HH:MM:SS`. */
export function formatSubmittedProcessDateTime(process) {
  let formattedDate = "";
  let formattedTime = "";

  if (process.createAt) {
    const createdObj = new Date(process.createAt);
    const day = String(createdObj.getDate()).padStart(2, "0");
    const month = String(createdObj.getMonth() + 1).padStart(2, "0");
    const year = createdObj.getFullYear();
    formattedDate = `${day}/${month}/${year}`;
    formattedTime = `${String(createdObj.getHours()).padStart(2, "0")}:${String(createdObj.getMinutes()).padStart(2, "0")}:${String(createdObj.getSeconds()).padStart(2, "0")}`;
  } else {
    const logicalDateStr = process.captureDate;
    if (logicalDateStr) {
      const parts = logicalDateStr.split("-");
      if (parts.length === 3) {
        formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }
    const now = new Date();
    if (!formattedDate) {
      formattedDate = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
    }
    formattedTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  }

  return `${formattedDate} ${formattedTime}`;
}

export function displayTextFromProcessRow(process) {
  const display = process?.processDisplay ?? process?.process_display;
  if (display != null && String(display).trim() !== "") {
    return String(display).trim();
  }
  const processId = process?.processId ?? process?.process_id ?? "";
  const descriptionName = process?.descriptionName ?? process?.description_name;
  if (descriptionName) {
    return `${processId} (${descriptionName})`;
  }
  return String(processId);
}

/** Group submitted list: SALARY(1), SALARY(2) when API provides same_day_seq / process_display. */
export function formatGroupSubmittedProcessLabel(process) {
  const display = process?.process_display != null ? String(process.process_display).trim() : "";
  if (display) return display;
  const code = String(process?.process_code ?? process?.process_id ?? "").trim().toUpperCase();
  const seq = Number(process?.same_day_seq);
  if (code && Number.isFinite(seq) && seq > 1) {
    return `${code}(${seq})`;
  }
  return code;
}

/** POST `/api/process/list-description` — tenant description catalog. */
export async function fetchDescriptionCatalog(tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) {
    return { success: false, error: "tenantId is required", descriptions: [] };
  }
  try {
    return await fetchCaptureDescriptionCatalog(tid);
  } catch (err) {
    return { success: false, error: err?.message || "Failed to load descriptions", descriptions: [] };
  }
}

/** POST `/api/process/add-description` */
export async function postAddDescription(tenantId, descriptionName) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) {
    return { success: false, error: "tenantId is required" };
  }
  try {
    return await postCaptureDescription(tid, descriptionName);
  } catch (err) {
    return { success: false, error: err?.message || "Failed to add description" };
  }
}

/** POST `/api/process/delete-description` */
export async function postDeleteDescription(tenantId, descriptionId) {
  const tid = Number(tenantId);
  const id = Number(descriptionId);
  if (!Number.isFinite(tid) || tid <= 0 || !Number.isFinite(id) || id <= 0) {
    return { success: false, error: "tenantId and description id are required" };
  }
  try {
    return await postCaptureDescriptionDelete(tid, id);
  } catch (err) {
    return { success: false, error: err?.message || "Failed to delete description" };
  }
}

export { appendDataCaptureScopeParams as appendScopeParams };
