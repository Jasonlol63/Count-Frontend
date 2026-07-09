/**
 * Persists group-only Process (and related form fields) across Summary final submit
 * and page reloads. Scoped per dashboard GroupID (AP / IG).
 */
import { isGroupPayrollCaptureSession } from "../../../utils/company/c168CaptureChannel.js";
import {
  isGroupOnlyProcessId,
  selectedProcessFromGroupOnlySession,
} from "./dataCaptureGroupOnlyProcesses.js";

export const GROUP_ONLY_PROCESS_PREFS_KEY = "dc_group_only_process_prefs";

function normalizePrefsKey(key) {
  const raw = key != null ? String(key).trim() : "";
  if (!raw) return null;
  if (raw.toLowerCase().startsWith("company:")) return raw;
  return raw.toUpperCase();
}

function readAllPrefs() {
  try {
    const raw = localStorage.getItem(GROUP_ONLY_PROCESS_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAllPrefs(map) {
  try {
    localStorage.setItem(GROUP_ONLY_PROCESS_PREFS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** @returns {object|null} */
export function readGroupOnlyProcessPrefs(prefsKey) {
  const g = normalizePrefsKey(prefsKey);
  if (!g) return null;
  const entry = readAllPrefs()[g];
  if (!entry?.process) return null;
  if (!isGroupOnlyProcessId(entry.process)) return null;
  return entry;
}

export function clearGroupOnlyProcessPrefs(prefsKey) {
  const g = normalizePrefsKey(prefsKey);
  if (!g) return;
  const map = readAllPrefs();
  if (!map[g]) return;
  delete map[g];
  writeAllPrefs(map);
}

/**
 * @param {string|null|undefined} groupId
 * @param {{ process?: string|number, processCode?: string, processName?: string, currency?: string|number, date?: string }} payload
 */
export function saveGroupOnlyProcessPrefs(prefsKey, payload = {}) {
  const g = normalizePrefsKey(prefsKey);
  const pid = payload.process != null ? String(payload.process) : "";
  if (!g || !pid || !isGroupOnlyProcessId(pid)) return;

  const map = readAllPrefs();
  map[g] = {
    process: pid,
    processCode: String(payload.processCode || payload.process_code || pid).trim().toUpperCase(),
    processName: String(payload.processName || payload.process_name || "").trim(),
    currency: payload.currency != null ? String(payload.currency) : "",
    date: payload.date ? String(payload.date) : "",
    savedAt: Date.now(),
  };
  writeAllPrefs(map);
}

export function saveGroupOnlyProcessPrefsFromProcessData(processData, prefsKey) {
  if (!processData) return;
  const gid =
    normalizePrefsKey(prefsKey) ||
    normalizePrefsKey(processData.payrollPrefsKey) ||
    normalizePrefsKey(processData.captureSelectedGroup) ||
    (processData.groupPayrollCapture && processData.scopeCompanyId
      ? `company:${Number(processData.scopeCompanyId)}`
      : null);
  const proc = isGroupPayrollCaptureSession(processData)
    ? selectedProcessFromGroupOnlySession(processData)
    : null;
  saveGroupOnlyProcessPrefs(gid, {
    process: proc?.id ?? processData.process,
    processCode: proc?.process_id || processData.processCode || processData.process_code,
    processName: proc?.displayText || processData.processName || processData.process_name,
    currency: processData.currency,
    date: processData.date,
  });
}

/** Build selectedProcess shape for React form state. */
export function selectedProcessFromGroupOnlyPrefs(prefs) {
  if (!prefs?.process) return null;
  const pid = String(prefs.process);
  const pcode = String(prefs.processCode || pid).trim();
  const pname = String(prefs.processName || "").trim();
  return {
    id: pid,
    displayText: pname || pcode || pid.toUpperCase(),
    process_id: pcode || pid.toUpperCase(),
    description_name: null,
  };
}
