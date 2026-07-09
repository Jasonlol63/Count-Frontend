import {
  isCitibetCaptureType,
  normalizeCaptureType as normalizeStoredCaptureType,
} from "./dataCaptureFormRules.js";
import {
  isDashboardGroupOnlyMode,
  persistDashboardGroupFilter,
  persistDashboardGroupOnlyMode,
  persistDashboardSelectedCompany,
} from "../../../utils/company/sharedCompanyFilter.js";
import { isGroupLedgerCapture } from "../../../utils/company/c168CaptureChannel.js";
import {
  dataCaptureScopeCacheCompanyKey,
  resolveDataCaptureScopeFromSessionMeta,
} from "./dataCaptureScope.js";
import { saveGroupOnlyProcessPrefsFromProcessData } from "./dataCaptureGroupOnlyProcessPersistence.js";

export const CAPTURE_TABLE_STORAGE_KEY = "capturedTableData";
export const CAPTURE_PROCESS_STORAGE_KEY = "capturedProcessData";
export const CAPTURE_TYPE_STORAGE_KEY = "capturedDataCaptureType";
/** Points at the scoped storage suffix for Summary / cross-page reads. */
export const CAPTURE_SCOPE_POINTER_KEY = "dc_capture_active_scope_key";

export { normalizeStoredCaptureType, isCitibetCaptureType };

function captureStorageKeys(scope) {
  const suffix = dataCaptureScopeCacheCompanyKey(scope);
  if (suffix == null) {
    return {
      table: CAPTURE_TABLE_STORAGE_KEY,
      process: CAPTURE_PROCESS_STORAGE_KEY,
      type: CAPTURE_TYPE_STORAGE_KEY,
    };
  }
  const tag = String(suffix);
  return {
    table: `${CAPTURE_TABLE_STORAGE_KEY}:${tag}`,
    process: `${CAPTURE_PROCESS_STORAGE_KEY}:${tag}`,
    type: `${CAPTURE_TYPE_STORAGE_KEY}:${tag}`,
  };
}

function readLegacyProcessMeta() {
  try {
    const raw = localStorage.getItem(CAPTURE_PROCESS_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function migrateLegacyStorageToScope(scope) {
  if (!scope) return;
  const keys = captureStorageKeys(scope);
  if (localStorage.getItem(keys.table) && localStorage.getItem(keys.process)) return;

  const legacyTable = localStorage.getItem(CAPTURE_TABLE_STORAGE_KEY);
  const legacyProcess = localStorage.getItem(CAPTURE_PROCESS_STORAGE_KEY);
  const legacyType = localStorage.getItem(CAPTURE_TYPE_STORAGE_KEY);
  if (!legacyTable || !legacyProcess) return;

  try {
    const meta = JSON.parse(legacyProcess);
    const legacyScope = resolveDataCaptureScopeFromSessionMeta(meta);
    const legacyKey = dataCaptureScopeCacheCompanyKey(legacyScope);
    const targetKey = dataCaptureScopeCacheCompanyKey(scope);
    if (legacyKey == null || targetKey == null || String(legacyKey) !== String(targetKey)) {
      return;
    }
    localStorage.setItem(keys.table, legacyTable);
    localStorage.setItem(keys.process, legacyProcess);
    if (legacyType) localStorage.setItem(keys.type, legacyType);
  } catch {
    /* ignore */
  }
}

export function saveCaptureSession(tableData, processData, captureType, context = {}) {
  const type = normalizeStoredCaptureType(captureType || processData?.dataCaptureType) || "1.Text";
  const groupPayrollUi = context.groupPayrollUi === true || context.groupOnly === true;
  const groupLedgerCapture = context.groupOnly === true && context.groupPayrollCapture !== true;
  const groupPayrollCapture = context.groupPayrollCapture === true;
  const captureSelectedGroup = context.selectedGroup
    ? String(context.selectedGroup).trim().toUpperCase()
    : null;
  const scope = context.scope || null;
  const scopeCompanyId =
    scope?.scopeCompanyId != null && Number(scope.scopeCompanyId) > 0
      ? Number(scope.scopeCompanyId)
      : context.scopeCompanyId != null && Number(context.scopeCompanyId) > 0
        ? Number(context.scopeCompanyId)
        : null;
  const payrollPrefsKey =
    context.payrollPrefsKey ||
    (groupPayrollCapture && scopeCompanyId ? `company:${scopeCompanyId}` : captureSelectedGroup);

  const enrichedProcess = {
    ...processData,
    dataCaptureType: type,
    groupPayrollUi,
    groupPayrollCapture,
    groupOnlyCapture: groupLedgerCapture,
    captureSelectedGroup,
    payrollPrefsKey,
    captureScopeMode: scope?.mode || (groupLedgerCapture ? "group" : "company"),
    scopeCompanyId,
  };

  const keys = captureStorageKeys(scope);
  localStorage.setItem(keys.table, JSON.stringify(tableData));
  localStorage.setItem(keys.process, JSON.stringify(enrichedProcess));
  localStorage.setItem(keys.type, type);

  const cacheKey = dataCaptureScopeCacheCompanyKey(scope);
  if (cacheKey != null) {
    localStorage.setItem(CAPTURE_SCOPE_POINTER_KEY, String(cacheKey));
  }

  if (groupPayrollUi) {
    saveGroupOnlyProcessPrefsFromProcessData(enrichedProcess, payrollPrefsKey);
  }
}

/** Metadata saved with the last capture session (group-only back navigation). */
export function readCaptureSessionMeta(scope = null) {
  try {
    const keys = scope ? captureStorageKeys(scope) : null;
    let processDataStr = keys ? localStorage.getItem(keys.process) : null;
    if (!processDataStr) {
      processDataStr = localStorage.getItem(CAPTURE_PROCESS_STORAGE_KEY);
    }
    if (!processDataStr) return null;
    const processData = JSON.parse(processDataStr);
    return {
      groupPayrollUi: processData.groupPayrollUi === true,
      groupPayrollCapture: processData.groupPayrollCapture === true,
      groupOnlyCapture: processData.groupOnlyCapture === true,
      payrollPrefsKey: processData.payrollPrefsKey || null,
      captureSelectedGroup: processData.captureSelectedGroup
        ? String(processData.captureSelectedGroup).trim().toUpperCase()
        : null,
      captureScopeMode: processData.captureScopeMode || null,
      scopeCompanyId:
        processData.scopeCompanyId != null && Number(processData.scopeCompanyId) > 0
          ? Number(processData.scopeCompanyId)
          : null,
    };
  } catch {
    return null;
  }
}

export function isGroupOnlyCaptureRestoreRequested() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("group_only") === "1") return true;
  const meta = readCaptureSessionMeta();
  if (meta?.groupPayrollCapture) return false;
  if (meta?.groupOnlyCapture) return true;
  return isDashboardGroupOnlyMode() && params.get("restore") === "1";
}

/** Re-apply dashboard group-only filter before restoring table/form from storage. */
export function applyGroupOnlyCaptureRestoreFilter(processData) {
  const meta = readCaptureSessionMeta();
  const groupRaw =
    processData?.captureSelectedGroup || meta?.captureSelectedGroup || null;
  const group = groupRaw ? String(groupRaw).trim().toUpperCase() : null;
  if (group) persistDashboardGroupFilter(group);
  persistDashboardGroupOnlyMode(true);
  persistDashboardSelectedCompany(null);
  stripSearchParamsFromUrl(["company_id", "group_only"]);
  return group;
}

export function resolveActiveCaptureScopeFromPointer(companies = []) {
  try {
    const ptr = localStorage.getItem(CAPTURE_SCOPE_POINTER_KEY);
    if (!ptr) return null;
    const tag = String(ptr).trim();
    if (tag.startsWith("group:")) {
      const groupId = tag.slice(6).trim().toUpperCase();
      if (!groupId) return null;
      return resolveDataCaptureScopeFromSessionMeta(
        { groupOnlyCapture: true, captureSelectedGroup: groupId },
        companies,
      );
    }
    const id = Number(tag);
    if (Number.isFinite(id) && id > 0) {
      return resolveDataCaptureScopeFromSessionMeta(
        { groupOnlyCapture: false, scopeCompanyId: id },
        companies,
      );
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function loadActiveCaptureSession(companies = []) {
  const scope =
    resolveActiveCaptureScopeFromPointer(companies) ||
    resolveDataCaptureScopeFromSessionMeta(readLegacyProcessMeta(), companies);
  return loadCaptureSession(scope);
}

export function loadCaptureSession(scope = null) {
  try {
    if (scope) migrateLegacyStorageToScope(scope);
    const keys = scope ? captureStorageKeys(scope) : captureStorageKeys(null);
    let tableDataStr = localStorage.getItem(keys.table);
    let processDataStr = localStorage.getItem(keys.process);
    if ((!tableDataStr || !processDataStr) && scope) {
      tableDataStr = tableDataStr || localStorage.getItem(CAPTURE_TABLE_STORAGE_KEY);
      processDataStr = processDataStr || localStorage.getItem(CAPTURE_PROCESS_STORAGE_KEY);
    }
    if (!tableDataStr || !processDataStr) return null;
    const tableData = JSON.parse(tableDataStr);
    const processData = JSON.parse(processDataStr);
    const savedTypeRaw =
      processData?.dataCaptureType ||
      processData?.captureType ||
      localStorage.getItem(keys.type) ||
      localStorage.getItem(CAPTURE_TYPE_STORAGE_KEY) ||
      "1.Text";
    return {
      tableData,
      processData,
      captureType: normalizeStoredCaptureType(savedTypeRaw) || "1.Text",
    };
  } catch {
    return null;
  }
}

export function captureSessionMatchesScope(session, scope) {
  if (!session?.processData || !scope) return false;
  const pd = session.processData;
  const expectedGroup = scope.groupId ? String(scope.groupId).trim().toUpperCase() : "";
  const savedGroup = pd.captureSelectedGroup
    ? String(pd.captureSelectedGroup).trim().toUpperCase()
    : "";
  if (pd.groupPayrollCapture === true || (pd.groupPayrollUi && pd.captureScopeMode === "company")) {
    const savedCid =
      pd.scopeCompanyId != null ? Number(pd.scopeCompanyId) : Number(pd.companyId);
    if (Number.isFinite(savedCid) && savedCid > 0 && Number(scope.scopeCompanyId) !== savedCid) {
      return false;
    }
    if (expectedGroup && savedGroup && expectedGroup !== savedGroup) return false;
    return scope.mode === "company";
  }
  if (scope.mode === "group") {
    if (!isGroupLedgerCapture(scope, pd)) return false;
    if (expectedGroup && savedGroup && expectedGroup !== savedGroup) return false;
    return true;
  }
  if (pd.groupOnlyCapture === true) return false;
  const savedCid =
    pd.scopeCompanyId != null ? Number(pd.scopeCompanyId) : Number(pd.companyId);
  if (Number.isFinite(savedCid) && savedCid > 0 && Number(scope.scopeCompanyId) !== savedCid) {
    return false;
  }
  if (expectedGroup && savedGroup && expectedGroup !== savedGroup) return false;
  return true;
}

export function shouldRestoreFromUrl() {
  return new URLSearchParams(window.location.search).get("restore") === "1";
}

export function stripRestoreParamFromUrl() {
  stripSearchParamsFromUrl(["restore"]);
}

export function stripSearchParamsFromUrl(keys) {
  if (!Array.isArray(keys) || keys.length === 0) return;
  try {
    const url = new URL(window.location.href);
    keys.forEach((key) => url.searchParams.delete(key));
    const qs = url.searchParams.toString();
    window.history.replaceState({}, "", `${url.pathname}${qs ? `?${qs}` : ""}${url.hash}`);
  } catch {
    /* ignore */
  }
}

/** @deprecated legacy global meta read — prefer readCaptureSessionMeta(scope) */
export function readLegacyCaptureProcessMeta() {
  return readLegacyProcessMeta();
}
