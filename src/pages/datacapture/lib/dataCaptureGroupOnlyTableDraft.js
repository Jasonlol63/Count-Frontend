/**
 * Group payroll table drafts — shared via server for group buckets (AP/IG).
 * Company payroll buckets (e.g. company:5 for C168) stay local-only to avoid AP data mixing.
 */
import { resolveDataCaptureGridDimensions } from "../grid/dataCaptureGridMeta.js";
import { isGroupOnlyProcessId, selectedProcessFromGroupOnlySession } from "./dataCaptureGroupOnlyProcesses.js";
import { tableSnapshotHasData } from "./dataCaptureTableSnapshot.js";
import { applyBridgeCaptureType } from "./dataCaptureBridge.js";
import { callDataCaptureRuntime, getDataCaptureState } from "./dataCaptureRuntime.js";
import {
  clearGroupCaptureDraft,
  fetchGroupCaptureDraft,
  saveGroupCaptureDraft,
} from "./dataCaptureGroupDraftApi.js";
import {
  isGroupPayrollCaptureSession,
  payrollDraftBucketIsCompany,
} from "../../../utils/company/c168CaptureChannel.js";

export const GROUP_ONLY_TABLE_DRAFTS_KEY = "dc_group_only_table_drafts";

const SERVER_SAVE_DEBOUNCE_MS = 1500;
const serverSaveTimers = new Map();
let restoreSeq = 0;

/** Drop in-flight debounced server writes (e.g. before process/currency switch). */
export function cancelAllScheduledServerDraftSaves() {
  serverSaveTimers.forEach((timer) => clearTimeout(timer));
  serverSaveTimers.clear();
}

function normalizeDraftBucket(bucketId) {
  const raw = bucketId != null ? String(bucketId).trim() : "";
  if (!raw) return null;
  if (payrollDraftBucketIsCompany(raw)) return raw;
  return raw.toUpperCase();
}

function normalizeProcessKey(processKey) {
  const p = processKey != null ? String(processKey).trim().toLowerCase() : "";
  return isGroupOnlyProcessId(p) ? p : null;
}

export function normalizeGroupOnlyDraftCurrencyId(currencyId) {
  const id = currencyId != null ? String(currencyId).trim() : "";
  if (!id || !/^\d+$/.test(id)) return null;
  return id;
}

function draftTimerKey(bucketId, processKey, currencyId) {
  return `${bucketId}:${processKey}:${currencyId}`;
}

function readAllDrafts() {
  try {
    const raw = localStorage.getItem(GROUP_ONLY_TABLE_DRAFTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAllDrafts(map) {
  try {
    localStorage.setItem(GROUP_ONLY_TABLE_DRAFTS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function draftAllowsServerSync(bucket, options = {}) {
  if (options.serverSync === false) return false;
  if (payrollDraftBucketIsCompany(bucket)) return false;
  return true;
}

function writeLocalDraft(bucketId, processKey, currencyId, payload) {
  const g = normalizeDraftBucket(bucketId);
  const p = normalizeProcessKey(processKey);
  const c = normalizeGroupOnlyDraftCurrencyId(currencyId);
  if (!g || !p || !c || !payload?.tableData || !tableSnapshotHasData(payload.tableData)) return;

  const map = readAllDrafts();
  if (!map[g]) map[g] = {};
  if (!map[g][p]) map[g][p] = {};
  map[g][p][c] = {
    tableData: payload.tableData,
    captureType: payload.captureType || "1.Text",
    savedAt: payload.savedAt ?? Date.now(),
    processKey: p,
    currencyId: c,
  };
  writeAllDrafts(map);
}

function clearLocalDraft(bucketId, processKey, currencyId) {
  const g = normalizeDraftBucket(bucketId);
  const p = normalizeProcessKey(processKey);
  const c = normalizeGroupOnlyDraftCurrencyId(currencyId);
  if (!g || !p || !c) return;
  const map = readAllDrafts();
  if (!map[g]?.[p]?.[c]) return;
  delete map[g][p][c];
  if (Object.keys(map[g][p]).length === 0) delete map[g][p];
  if (Object.keys(map[g]).length === 0) delete map[g];
  writeAllDrafts(map);
}

function cancelScheduledServerSave(bucketId, processKey, currencyId) {
  const g = normalizeDraftBucket(bucketId);
  const p = normalizeProcessKey(processKey);
  const c = normalizeGroupOnlyDraftCurrencyId(currencyId);
  if (!g || !p || !c) return;
  const key = draftTimerKey(g, p, c);
  const timer = serverSaveTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    serverSaveTimers.delete(key);
  }
}

function scheduleServerDraftSave(bucketId, processKey, currencyId, payload, captureScope, options = {}) {
  const g = normalizeDraftBucket(bucketId);
  const p = normalizeProcessKey(processKey);
  const c = normalizeGroupOnlyDraftCurrencyId(currencyId);
  if (!g || !p || !c) return;
  if (!draftAllowsServerSync(g, options)) return;

  const key = draftTimerKey(g, p, c);
  cancelScheduledServerSave(g, p, c);
  serverSaveTimers.set(
    key,
    setTimeout(() => {
      serverSaveTimers.delete(key);
      void saveGroupCaptureDraft(captureScope, g, p, c, payload);
    }, SERVER_SAVE_DEBOUNCE_MS),
  );
}

/** Immediate server persist (e.g. process/currency switch). */
export async function flushGroupOnlyTableDraftToServer(
  bucketId,
  processKey,
  currencyId,
  payload,
  captureScope = null,
  options = {},
) {
  const g = normalizeDraftBucket(bucketId);
  const p = normalizeProcessKey(processKey);
  const c = normalizeGroupOnlyDraftCurrencyId(currencyId);
  if (!g || !p || !c) return false;
  cancelScheduledServerSave(g, p, c);
  if (!payload?.tableData || !tableSnapshotHasData(payload.tableData)) {
    if (!draftAllowsServerSync(g, options)) return true;
    return clearGroupCaptureDraft(captureScope, g, p, c);
  }
  if (!draftAllowsServerSync(g, options)) return true;
  return saveGroupCaptureDraft(captureScope, g, p, c, payload);
}

function scopeFromGroupId(groupId) {
  const g = normalizeDraftBucket(groupId);
  if (!g || payrollDraftBucketIsCompany(g)) return null;
  return {
    mode: "group",
    groupId: g,
    viewGroup: g,
    scopeCompanyId: 0,
    resolveCompanyViaGroupId: true,
  };
}

/** @returns {{ tableData: object, captureType: string, savedAt?: number }|null} */
export function readGroupOnlyTableDraft(bucketId, processKey, currencyId) {
  const g = normalizeDraftBucket(bucketId);
  const p = normalizeProcessKey(processKey);
  const c = normalizeGroupOnlyDraftCurrencyId(currencyId);
  if (!g || !p || !c) return null;
  const entry = readAllDrafts()[g]?.[p]?.[c];
  if (!entry?.tableData) return null;
  return {
    tableData: entry.tableData,
    captureType: entry.captureType || "1.Text",
    savedAt: entry.savedAt,
  };
}

export async function fetchGroupOnlyTableDraft(
  bucketId,
  processKey,
  currencyId,
  captureScope = null,
  options = {},
) {
  const g = normalizeDraftBucket(bucketId);
  const p = normalizeProcessKey(processKey);
  const c = normalizeGroupOnlyDraftCurrencyId(currencyId);
  if (!g || !p || !c) return null;

  if (!draftAllowsServerSync(g, options)) {
    return readGroupOnlyTableDraft(g, p, c);
  }

  const scope = captureScope || scopeFromGroupId(g);
  const serverDraft = scope ? await fetchGroupCaptureDraft(scope, g, p, c) : null;
  if (serverDraft?.tableData) {
    writeLocalDraft(g, p, c, serverDraft);
    return serverDraft;
  }

  clearLocalDraft(g, p, c);
  return null;
}

export async function clearGroupOnlyTableDraft(bucketId, processKey, currencyId, options = {}) {
  const g = normalizeDraftBucket(bucketId);
  const p = normalizeProcessKey(processKey);
  const c = normalizeGroupOnlyDraftCurrencyId(currencyId);
  if (!g || !p || !c) return;

  cancelScheduledServerSave(g, p, c);
  clearLocalDraft(g, p, c);

  if (!draftAllowsServerSync(g, options)) return;

  const scope = options.captureScope || scopeFromGroupId(g);
  if (scope) {
    await clearGroupCaptureDraft(scope, g, p, c);
  }
}

/**
 * @param {string|null|undefined} bucketId group code or company:{id}
 * @param {string} processKey salary | commission | bonus
 * @param {string|number} currencyId
 * @param {{ tableData?: object, captureType?: string, savedAt?: number }} payload
 * @param {{ captureScope?: object, flush?: boolean, serverSync?: boolean }} [options]
 */
export async function saveGroupOnlyTableDraft(
  bucketId,
  processKey,
  currencyId,
  payload = {},
  options = {},
) {
  const g = normalizeDraftBucket(bucketId);
  const p = normalizeProcessKey(processKey);
  const c = normalizeGroupOnlyDraftCurrencyId(currencyId);
  if (!g || !p || !c || !payload.tableData || !tableSnapshotHasData(payload.tableData)) return;

  const entry = {
    tableData: payload.tableData,
    captureType: payload.captureType || "1.Text",
    savedAt: payload.savedAt ?? Date.now(),
    processKey: p,
    currencyId: c,
  };

  writeLocalDraft(g, p, c, entry);

  if (!draftAllowsServerSync(g, options)) return;

  const scope = options.captureScope || scopeFromGroupId(g);
  if (!scope) return;

  if (options.flush) {
    return flushGroupOnlyTableDraftToServer(g, p, c, entry, scope, options);
  }
  scheduleServerDraftSave(g, p, c, entry, scope, options);
}

/** Persist draft from active capture session before Summary clears storage. */
export function saveGroupOnlyTableDraftFromCaptureSession(session, options = {}) {
  if (!isGroupPayrollCaptureSession(session?.processData)) return;
  const pd = session.processData;
  const bucket =
    pd.payrollPrefsKey ||
    (pd.groupPayrollCapture && pd.scopeCompanyId
      ? `company:${Number(pd.scopeCompanyId)}`
      : null) ||
    (pd.captureSelectedGroup ? String(pd.captureSelectedGroup).trim().toUpperCase() : null);
  const groupId = normalizeDraftBucket(bucket);
  if (!groupId) return;

  const proc = selectedProcessFromGroupOnlySession(pd);
  const processKey = proc?.id ? normalizeProcessKey(proc.id) : null;
  const currencyId = normalizeGroupOnlyDraftCurrencyId(pd.currency);
  if (!processKey || !currencyId) return;

  const captureScope = options.captureScope || scopeFromGroupId(groupId);
  const serverSync = !payrollDraftBucketIsCompany(groupId);
  saveGroupOnlyTableDraft(
    groupId,
    processKey,
    currencyId,
    {
      tableData: session.tableData,
      captureType: session.captureType,
    },
    { captureScope, flush: true, serverSync },
  );
}

export function shouldApplyGroupOnlyTableDraft() {
  if (getDataCaptureState().isRestoring) return false;
  try {
    if (new URLSearchParams(window.location.search).get("restore") === "1") return false;
  } catch {
    /* ignore */
  }
  return true;
}

/** Build draft scope key for process + optional currency (tracks UI transitions). */
export function groupOnlyDraftScopeKey(processKey, currencyId) {
  const p = normalizeProcessKey(processKey);
  if (!p) return null;
  const c = normalizeGroupOnlyDraftCurrencyId(currencyId);
  return c ? `${p}:${c}` : `${p}:`;
}

/** Build draft storage key — requires both process and currency. */
export function groupOnlyTableDraftKey(processKey, currencyId) {
  const p = normalizeProcessKey(processKey);
  const c = normalizeGroupOnlyDraftCurrencyId(currencyId);
  if (!p || !c) return null;
  return `${p}:${c}`;
}

/** Flush table snapshot for a draft key before switching process/currency. */
export function flushGroupOnlyTableDraftForKey(bucketId, draftKey, options = {}) {
  if (!draftKey) return;
  const [processKey, currencyId] = draftKey.split(":");
  if (!processKey || !currencyId) return;
  const activeCaptureType = options.captureType || "1.Text";
  const tableData = options.tableData;
  if (!tableData || !tableSnapshotHasData(tableData)) return;
  saveGroupOnlyTableDraft(
    bucketId,
    processKey,
    currencyId,
    { tableData, captureType: activeCaptureType },
    { captureScope: options.captureScope, flush: true, serverSync: options.serverSync },
  );
}

/** Restore grid from payroll draft, or clear grid when no draft. */
export async function restoreGroupOnlyTableDraft(
  bucketId,
  processKey,
  currencyId,
  options = {},
) {
  if (!shouldApplyGroupOnlyTableDraft()) return;

  const g = normalizeDraftBucket(bucketId);
  const p = normalizeProcessKey(processKey);
  const c = normalizeGroupOnlyDraftCurrencyId(currencyId);
  if (!g || !p || !c) return;

  const seq = ++restoreSeq;
  const state = getDataCaptureState();
  state.isRestoring = true;

  try {
    callDataCaptureRuntime("clearCaptureTable");

    const scope = payrollDraftBucketIsCompany(g) ? options.captureScope : options.captureScope || scopeFromGroupId(g);
    const draft = await fetchGroupOnlyTableDraft(g, p, c, scope, options);
    if (seq !== restoreSeq) return;

    if (!draft?.tableData) {
      callDataCaptureRuntime("clearCaptureTable");
      callDataCaptureRuntime("recomputeSubmitState");
      return;
    }

    const type = draft.captureType || "1.Text";
    applyBridgeCaptureType(type);

    const { rows, cols } = resolveDataCaptureGridDimensions(true);
    await callDataCaptureRuntime("ensureGridReady", rows, cols);
    if (seq !== restoreSeq) return;

    await callDataCaptureRuntime("restoreCaptureTable", draft.tableData, type);
    if (seq !== restoreSeq) return;

    callDataCaptureRuntime("recomputeSubmitState");
  } finally {
    if (seq === restoreSeq) {
      state.isRestoring = false;
    }
  }
}
