import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { dataCaptureScopeApiParams, dataCaptureScopeCacheKey } from "./dataCaptureScope.js";

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
  permissions: (companyCode) => [
    ...dataCaptureQueryKeys.root(),
    "permissions",
    companyCode ?? "none",
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

export function buildDateOptions() {
  const today = new Date();
  const opts = [];
  for (let i = 6; i >= -6; i -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const dateString = `${year}-${month}-${day}`;
    const weekdayNames = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
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

/** Same as legacy loadFormData: GET api/processes/addprocess_api.php */
export async function fetchAddProcessFormData(scopeOrCompanyId) {
  const scope =
    scopeOrCompanyId != null && typeof scopeOrCompanyId === "object"
      ? scopeOrCompanyId
      : scopeOrCompanyId
        ? { mode: "company", scopeCompanyId: Number(scopeOrCompanyId) }
        : null;
  let url = buildApiUrl("api/processes/addprocess_api.php");
  url = scope ? withScope(url, scope) : url;
  if (!scope && scopeOrCompanyId) url = withCompany(url, scopeOrCompanyId);
  const response = await fetch(url, { credentials: "include" });
  return response.json();
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

/** Same as legacy loadProcessesByDate */
export async function fetchProcessesByDay(selectedDate, scope) {
  const params = new URLSearchParams({
    action: "get_processes_by_day",
    date: selectedDate,
  });
  appendDataCaptureScopeParams(params, scope);
  const url = buildApiUrl(`api/processes/submitted_processes_api.php?${params.toString()}`);
  const response = await fetch(url, { credentials: "include" });
  return response.json();
}

/** Same as legacy loadProcessData */
export async function fetchProcessDetail(processId, scope) {
  const params = new URLSearchParams({
    action: "get_process",
    id: String(processId),
  });
  appendDataCaptureScopeParams(params, scope);
  const url = buildApiUrl(`api/processes/processlist_api.php?${params.toString()}`);
  const response = await fetch(url, { credentials: "include" });
  return response.json();
}

/** Resolve numeric process.id for SALARY/COMMISSION/BONUS under group entity company. */
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
  const url = buildApiUrl(`api/processes/submitted_processes_api.php?${params.toString()}`);
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

/** Same as legacy `loadSubmittedProcesses`: GET get_submissions_by_capture_date */
export async function fetchSubmissionsByCaptureDate(captureDate, scope) {
  const params = new URLSearchParams({
    action: "get_submissions_by_capture_date",
    capture_date: captureDate,
  });
  appendDataCaptureScopeParams(params, scope);
  const url = buildApiUrl(`api/processes/submitted_processes_api.php?${params.toString()}`);
  const response = await fetch(url, { credentials: "include" });
  return response.json();
}

/** Same as legacy `loadPermissionButtons`: POST domain_api get_company_permissions */
export async function fetchCompanyPermissionsForDataCapture(companyCode) {
  const response = await fetch(buildApiUrl("api/domain/domain_api.php"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "get_company_permissions", company_id: companyCode }),
  });
  return response.json();
}

/** Matches `renderSubmittedProcesses` date/time formatting in `js/datacapture.js`. */
export function formatSubmittedProcessDateTime(process) {
  let formattedDate = "";
  let formattedTime = "";

  if (process.created_at) {
    const createdObj = new Date(process.created_at);
    const day = String(createdObj.getDate()).padStart(2, "0");
    const month = String(createdObj.getMonth() + 1).padStart(2, "0");
    const year = createdObj.getFullYear();
    formattedDate = `${day}/${month}/${year}`;
    formattedTime = `${String(createdObj.getHours()).padStart(2, "0")}:${String(createdObj.getMinutes()).padStart(2, "0")}:${String(createdObj.getSeconds()).padStart(2, "0")}`;
  } else {
    const logicalDateStr = process.capture_date || process.date_submitted;
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
  if (process.process_display != null && String(process.process_display).trim() !== "") {
    return String(process.process_display).trim();
  }
  if (process.description_name) {
    return `${process.process_id} (${process.description_name})`;
  }
  return process.process_id;
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

/** GET addprocess_api.php — returns `descriptions` at top level (and under `data`). */
export async function fetchDescriptionCatalog(scopeOrCompanyId) {
  const scope =
    scopeOrCompanyId != null && typeof scopeOrCompanyId === "object"
      ? scopeOrCompanyId
      : scopeOrCompanyId
        ? { mode: "company", scopeCompanyId: Number(scopeOrCompanyId) }
        : null;
  let url = buildApiUrl("api/processes/addprocess_api.php");
  url = scope ? withScope(url, scope) : withCompany(url, scopeOrCompanyId);
  const response = await fetch(url, { credentials: "include" });
  return response.json();
}

/** POST action=add_description — same fields as legacy `addDescriptionForm` handler. */
export async function postAddDescription(scopeOrCompanyId, descriptionName) {
  const formData = new FormData();
  formData.append("action", "add_description");
  formData.append("description_name", descriptionName);
  const scope =
    scopeOrCompanyId != null && typeof scopeOrCompanyId === "object"
      ? scopeOrCompanyId
      : null;
  if (scope) {
    const { companyId, groupId, reportScope } = dataCaptureScopeApiParams(scope);
    if (companyId) formData.append("company_id", String(companyId));
    if (groupId) formData.append("group_id", String(groupId));
    if (reportScope) formData.append("report_scope", reportScope);
  } else if (scopeOrCompanyId) {
    formData.append("company_id", String(scopeOrCompanyId));
  }
  const response = await fetch(buildApiUrl("api/processes/addprocess_api.php"), {
    method: "POST",
    body: formData,
    credentials: "include",
  });
  return response.json();
}

/** POST action=delete_description — matches legacy `deleteDescription` body. */
export async function postDeleteDescription(descriptionId) {
  const formData = new FormData();
  formData.append("action", "delete_description");
  formData.append("description_id", String(descriptionId));
  const response = await fetch(buildApiUrl("api/processes/addprocess_api.php"), {
    method: "POST",
    body: formData,
    credentials: "include",
  });
  return response.json();
}

export { appendDataCaptureScopeParams as appendScopeParams };
