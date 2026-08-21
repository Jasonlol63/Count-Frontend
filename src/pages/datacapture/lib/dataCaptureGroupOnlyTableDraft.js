/**
 * Payroll table drafts — shared via server (Spring `data_capture_draft` table,
 * `POST /api/datacapture/bank/draft/save|get`) for both group buckets (AP/IG,
 * tenant resolved from the Group's own `groupEntityTenantId`) and company
 * payroll buckets (e.g. company:5 for C168 / bank-only, tenant parsed from the
 * bucket id). No PHP endpoint involved.
 */
import { GROUP_ONLY_GRID_COLS, resolveDataCaptureGridDimensions } from "../grid/dataCaptureGridMeta.js";
import {
  isGroupPayrollDraftProcessId,
  selectedProcessFromGroupOnlySession,
} from "./dataCaptureGroupOnlyProcesses.js";
import { tableSnapshotHasData } from "./dataCaptureTableSnapshot.js";
import { applyBridgeCaptureType } from "./dataCaptureBridge.js";
import { callDataCaptureRuntime, getDataCaptureState } from "./dataCaptureRuntime.js";
import { getBankCaptureDraft, saveBankCaptureDraft } from "./dataCaptureSpringApi.js";
import { resolveDataCaptureTenantId } from "./dataCaptureTenant.js";
import {
  isGroupPayrollCaptureSession,
  payrollDraftBucketIsCompany,
} from "../../../utils/company/c168CaptureChannel.js";

function tenantIdFromCompanyBucket(bucketId) {
  const m = /^company:(\d+)$/i.exec(String(bucketId || "").trim());
  return m ? Number(m[1]) : null;
}

/** Company bucket carries its own tenant id; a group bucket needs the scope's `groupEntityTenantId`. */
function resolveDraftTenantId(bucketId, scope) {
  return tenantIdFromCompanyBucket(bucketId) ?? resolveDataCaptureTenantId(scope);
}

/**
 * `snapshotToGrid` trusts `tableData.colCount` over the fixed grid width when rebuilding
 * the grid; the Spring `data_capture_draft` row only reports the filled-cell bounding box
 * (e.g. 2 data columns), which would shrink the table below its fixed 11-column width. Force
 * it back up to the grid's real column count (colCount = data cols + 1 row-label column).
 */
function normalizeBankDraftTableData(tableData) {
  if (!tableData || typeof tableData !== "object") return tableData;
  const { rows: minRowCount } = resolveDataCaptureGridDimensions(true);
  const minColCount = GROUP_ONLY_GRID_COLS + 1;
  const patch = {};
  if ((tableData.colCount || 0) < minColCount) patch.colCount = minColCount;
  if ((tableData.rowCount || 0) < minRowCount) patch.rowCount = minRowCount;
  return Object.keys(patch).length ? { ...tableData, ...patch } : tableData;
}

/**
 * Both company payroll buckets ("company:{tenantId}") and Group buckets (AP/IG code, tenant
 * resolved from `scope.groupEntityTenantId`) persist drafts via the same Spring
 * `data_capture_draft` table (`POST /api/datacapture/bank/draft/save|get`).
 */
const draftBackend = {
  async fetch(scope, bucketId, processKey, currencyId) {
    const tenantId = resolveDraftTenantId(bucketId, scope);
    if (!tenantId) return null;
    try {
      const result = await getBankCaptureDraft({ tenantId, processCode: processKey, currencyId });
      return result?.tableData
        ? { tableData: normalizeBankDraftTableData(result.tableData), captureType: "1.Text" }
        : null;
    } catch {
      return null;
    }
  },
  async save(scope, bucketId, processKey, currencyId, payload) {
    const tenantId = resolveDraftTenantId(bucketId, scope);
    if (!tenantId) return false;
    try {
      await saveBankCaptureDraft({
        tenantId,
        processCode: processKey,
        currencyId,
        tableData: payload?.tableData ?? null,
      });
      return true;
    } catch {
      return false;
    }
  },
  async clear(scope, bucketId, processKey, currencyId) {
    const tenantId = resolveDraftTenantId(bucketId, scope);
    if (!tenantId) return false;
    try {
      await saveBankCaptureDraft({ tenantId, processCode: processKey, currencyId, tableData: null });
      return true;
    } catch {
      return false;
    }
  },
};

function resolveDraftBackend() {
  return draftBackend;
}

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

/**
 * Bank/AP-IG group mode uses the fixed salary/bonus/commission codes; Games
 * mode uses a real process's own numeric id (gated upstream on its
 * enable_save_draft flag) — accept either shape here.
 */
function normalizeProcessKey(processKey) {
  const p = processKey != null ? String(processKey).trim().toLowerCase() : "";
  if (!p) return null;
  if (isGroupPayrollDraftProcessId(p)) return p;
  return /^\d+$/.test(p) ? p : null;
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
      void resolveDraftBackend(g).save(captureScope, g, p, c, payload);
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
  const backend = resolveDraftBackend(g);
  if (!payload?.tableData || !tableSnapshotHasData(payload.tableData)) {
    if (!draftAllowsServerSync(g, options)) return true;
    return backend.clear(captureScope, g, p, c);
  }
  if (!draftAllowsServerSync(g, options)) return true;
  return backend.save(captureScope, g, p, c, payload);
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

  const isCompany = payrollDraftBucketIsCompany(g);
  const scope = isCompany ? captureScope : captureScope || scopeFromGroupId(g);
  const serverDraft = isCompany || scope ? await resolveDraftBackend(g).fetch(scope, g, p, c) : null;
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

  const isCompany = payrollDraftBucketIsCompany(g);
  const scope = options.captureScope || scopeFromGroupId(g);
  if (scope || isCompany) {
    await resolveDraftBackend(g).clear(scope, g, p, c);
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
  const serverSync = true;
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
