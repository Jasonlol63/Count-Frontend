import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { getDataCaptureWeekdayLabels } from "../../../translateFile/pages/dataCaptureTranslate.js";
import { dataCaptureScopeApiParams, dataCaptureScopeCacheKey } from "./dataCaptureScope.js";

/**
 * True AP/IG group ledger only (unmigrated, see docs/datacapture-spring-api.md §4) —
 * `get_group_process_id` resolves the numeric process id for group payroll codes.
 */
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
  permissions: (companyCode) => [
    ...dataCaptureQueryKeys.root(),
    "permissions",
    companyCode ?? "none",
  ],
  submissions: (scopeKey, captureDate, permissionCategory = "") => [
    ...dataCaptureQueryKeys.root(),
    "submissions",
    scopeKey || "none",
    captureDate || "",
    String(permissionCategory || "").trim().toUpperCase(),
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

/**
 * Group Data Capture: currencies from group ledger scope only (same as Dashboard group-only filter).
 * Uses account_currency on group KPI accounts — not subsidiary company currency rows.
 * True AP/IG group ledger only (unmigrated, see docs/datacapture-spring-api.md §4).
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
 * Resolve numeric process.id for group payroll codes (SALARY/COMMISSION/BONUS/PROFIT) under scoped company.
 * True AP/IG group ledger only (unmigrated, see docs/datacapture-spring-api.md §4).
 */
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

/** Matches `renderSubmittedProcesses` date/time formatting in `js/datacapture.js`. */
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

export { appendDataCaptureScopeParams as appendScopeParams };
