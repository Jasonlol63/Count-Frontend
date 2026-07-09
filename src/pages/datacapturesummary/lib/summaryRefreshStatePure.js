import { dataCaptureScopeCacheCompanyKey } from "../../datacapture/lib/dataCaptureScope.js";
import { normalizeSummaryIdProductText } from "./summaryIdProductUtils.js";
import { summaryRefreshStorageKeys, RATE_BY_PRODUCT_KEY } from "./summaryStorage.js";
import {
  SUMMARY_FORMULA_SOURCE_KEY,
  SUMMARY_RATE_VALUES_KEY,
} from "./summaryStorage.js";

const SNAPSHOT_PREFIX = "summaryRowsSnapshot";

/** True when at least one row has template/account/formula data (not id-product skeleton). */
export function summaryRowsLookPopulated(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  return rows.some((row) => {
    if (row?.templateApplied) return true;
    if (String(row?.account || "").trim()) return true;
    if (String(row?.formulaOperators || "").trim()) return true;
    if (String(row?.formulaDisplay || "").trim()) return true;
    return false;
  });
}

function summaryAccountIdentity(row) {
  const accountId = row?.accountId != null ? String(row.accountId).trim() : "";
  const account = String(row?.account || "").trim().replace(/\s+/g, " ");
  if (accountId) return `id:${accountId}`;
  return `txt:${account}`;
}

/**
 * Stable row key for refresh restore (aligned with legacy getSummaryRowStableKey).
 * idProduct \t rowIndex \t account \t currency \t productType \t subOrder \t formulaVariant [\t rowKey]
 */
export function buildSummaryRowStableKey(row) {
  const idProduct = normalizeSummaryIdProductText(row?.idProduct || "");
  const rowIndex = row?.rowIndex != null && row.rowIndex !== "" ? String(row.rowIndex) : "";
  const currency = String(row?.currency || "").trim().replace(/\s+/g, " ");
  const productType = row?.productType || "main";
  const subOrder =
    row?.subOrder != null && row.subOrder !== ""
      ? String(row.subOrder)
      : productType === "sub"
        ? "1"
        : "0";
  const formulaVariant =
    row?.formulaVariant != null && row.formulaVariant !== "" ? String(row.formulaVariant) : "";
  const base = [idProduct, rowIndex, summaryAccountIdentity(row), currency, productType, subOrder, formulaVariant].join(
    "\t"
  );
  const rowKey = row?.key ? String(row.key).trim() : "";
  return rowKey ? `${base}\t${rowKey}` : base;
}

/** Build stable key from a saved refresh payload row. */
export function buildSummaryRowStableKeyFromSaved(saved) {
  if (!saved || typeof saved !== "object") return "";
  if (saved.stableKey && String(saved.stableKey).trim() !== "") {
    return String(saved.stableKey).trim();
  }
  return buildSummaryRowStableKey({
    idProduct: saved.idProduct || saved.id_product,
    rowIndex: saved.displayOrder ?? saved.rowIndex,
    accountId: saved.accountId,
    account: saved.account || saved.accountDisplay,
    currency: saved.currency || saved.currencyDisplay,
    productType: saved.productType || "main",
    subOrder: saved.subOrder,
    formulaVariant: saved.formulaVariant,
    key: saved.rowKey,
  });
}

/** Base stable key without trailing React row.key segment. */
export function buildSummaryRowStableKeyBase(row) {
  const full = buildSummaryRowStableKey(row);
  const parts = full.split("\t");
  if (parts.length > 7) {
    return parts.slice(0, 7).join("\t");
  }
  return full;
}

function summarySessionSnapshotKey(captureScope, processMeta) {
  const scopeTag = dataCaptureScopeCacheCompanyKey(captureScope) ?? "global";
  const pid = processMeta?.processId != null ? String(processMeta.processId) : "none";
  const pcode = processMeta?.processCode
    ? String(processMeta.processCode).trim().toUpperCase()
    : "none";
  return `${SNAPSHOT_PREFIX}:${scopeTag}:${pid}:${pcode}`;
}

/** Persist full row models for same-tab F5 (sessionStorage). */
export function saveSummarySessionSnapshot(rows, processMeta, captureScope = null) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  if (!summaryRowsLookPopulated(rows)) return;
  try {
    const payload = {
      processId: processMeta?.processId ?? null,
      processCode: processMeta?.processCode ?? "",
      savedAt: Date.now(),
      rows,
    };
    sessionStorage.setItem(summarySessionSnapshotKey(captureScope, processMeta), JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

/** Load session snapshot when process matches. */
function parseSummarySessionSnapshot(raw, processMeta = null) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.rows) || parsed.rows.length === 0) return null;
    if (!summaryRowsLookPopulated(parsed.rows)) return null;
    if (processMeta?.processId != null && parsed.processId != null) {
      if (String(parsed.processId) !== String(processMeta.processId)) return null;
    }
    if (processMeta?.processCode && parsed.processCode) {
      if (
        String(parsed.processCode).trim().toUpperCase() !==
        String(processMeta.processCode).trim().toUpperCase()
      ) {
        return null;
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

export function loadSummarySessionSnapshot(captureScope, processMeta = null) {
  try {
    const raw = sessionStorage.getItem(summarySessionSnapshotKey(captureScope, processMeta));
    return parseSummarySessionSnapshot(raw, processMeta);
  } catch {
    return null;
  }
}

/** Try primary scope key, then alternate capture scopes (F5 before scope settles). */
export function loadSummarySessionSnapshotWithFallback(captureScope, processMeta = null, scopeCandidates = []) {
  const seen = new Set();
  const scopes = [captureScope, ...scopeCandidates].filter((scope) => {
    const tag = dataCaptureScopeCacheCompanyKey(scope) ?? "global";
    if (seen.has(tag)) return false;
    seen.add(tag);
    return true;
  });

  for (const scope of scopes) {
    const snapshot = loadSummarySessionSnapshot(scope, processMeta);
    if (snapshot?.rows?.length) return snapshot;
  }

  return null;
}

export function clearSummarySessionSnapshot(captureScope, processMeta = null) {
  try {
    sessionStorage.removeItem(summarySessionSnapshotKey(captureScope, processMeta));
  } catch {
    /* ignore */
  }
}

function serializeRowForRefresh(row) {  return {
    rowKey: row.key,
    stableKey: buildSummaryRowStableKey(row),
    idProduct: row.idProduct,
    displayOrder: row.rowIndex,
    account: row.account,
    accountId: row.accountId,
    currency: row.currency,
    currencyId: row.currencyId,
    formula: row.formulaDisplay || row.formula,
    formulaDisplay: row.formulaDisplay || row.formula,
    formulaOperators: row.formulaOperators,
    sourceColumns: row.sourceColumns,
    sourcePercent: row.sourcePercent,
    enableSourcePercent: row.enableSourcePercent,
    clickedColumns: row.clickedColumns,
    inputMethod: row.inputMethod,
    enableInputMethod: row.enableInputMethod,
    originalDescription: row.originalDescription,
    processedAmount: row.processedAmount,
    baseProcessedAmount: row.baseProcessedAmount,
    rateChecked: row.rateChecked,
    rateValue: row.rateValue,
    selectChecked: row.selectChecked,
    productType: row.productType,
    subOrder: row.subOrder,
    formulaVariant: row.formulaVariant,
    templateId: row.templateId,
    templateKey: row.templateKey,
  };
}

/** Persist formula/rate draft before refresh or back (pure React, scoped by capture ledger). */
export function saveSummaryRefreshStatePure(rows, processMeta, captureScope = null) {
  try {
    const keys = summaryRefreshStorageKeys(captureScope);
    const payload = {
      processId: processMeta?.processId ?? null,
      processCode: processMeta?.processCode ?? "",
      rowOrder: rows.map((r) => r.key),
      rows: rows
        .filter((r) => r.account?.trim() || r.formulaOperators || r.formulaDisplay)
        .map(serializeRowForRefresh),
    };
    localStorage.setItem(keys.formulaSource, JSON.stringify(payload));

    const rateMap = {};
    const rateByProduct = {};
    for (const row of rows) {
      if (!row.rateChecked && !row.rateValue) continue;
      const key = row.key;
      rateMap[key] = { checked: row.rateChecked, value: row.rateValue || "" };
      const stableKey = buildSummaryRowStableKey(row);
      if (stableKey) {
        rateMap[stableKey] = rateMap[key];
      }
      if (row.idProduct) {
        rateByProduct[row.idProduct] = { checked: row.rateChecked, value: row.rateValue || "" };
      }
    }
    localStorage.setItem(keys.rateValues, JSON.stringify(rateMap));
    localStorage.setItem(keys.rateByProduct, JSON.stringify(rateByProduct));

    saveSummarySessionSnapshot(rows, processMeta, captureScope);
  } catch {
    /* ignore */
  }
}

/** Clear formula/rate refresh draft (fresh capture — avoid stale F5 restore). */
export function clearSummaryRefreshDraftStorage(captureScope = null, processMeta = null) {
  try {
    const keys = summaryRefreshStorageKeys(captureScope);
    localStorage.removeItem(keys.formulaSource);
    localStorage.removeItem(keys.rateValues);
    localStorage.removeItem(keys.rateByProduct);
    localStorage.removeItem(SUMMARY_FORMULA_SOURCE_KEY);
    localStorage.removeItem(SUMMARY_RATE_VALUES_KEY);
    localStorage.removeItem(RATE_BY_PRODUCT_KEY);
    clearSummarySessionSnapshot(captureScope, processMeta);
  } catch {
    /* ignore */
  }
}

/**
 * Resolve refresh payload for repopulate: localStorage first (pure React writes `.rows`),
 * then server state only when it uses the same array shape.
 */
export function resolveSummaryRefreshSavedState(serverState, captureScope, processMeta = null) {
  const fromLocal = loadSummaryRefreshFormulaState(captureScope, processMeta);
  if (fromLocal?.rows?.length) return fromLocal;

  if (
    serverState &&
    typeof serverState === "object" &&
    Array.isArray(serverState.rows) &&
    serverState.rows.length > 0
  ) {
    return serverState;
  }

  return null;
}

/** Read refresh formula payload; prefers scoped key, falls back to legacy global key. */
export function loadSummaryRefreshFormulaState(captureScope, processMeta = null) {
  const keys = summaryRefreshStorageKeys(captureScope);
  const candidates = [keys.formulaSource, SUMMARY_FORMULA_SOURCE_KEY];
  for (const storageKey of candidates) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.rows)) continue;
      if (processMeta?.processId != null && parsed.processId != null) {
        if (String(parsed.processId) !== String(processMeta.processId)) continue;
      }
      if (processMeta?.processCode && parsed.processCode) {
        if (
          String(parsed.processCode).trim().toUpperCase() !==
          String(processMeta.processCode).trim().toUpperCase()
        ) {
          continue;
        }
      }
      return parsed;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Merge one saved refresh row into a live row model. */
export function applySavedRefreshRowToModel(row, saved) {
  if (!row || !saved) return row;
  const formulaDisplay = saved.formula || saved.formulaDisplay || row.formulaDisplay;
  return {
    ...row,
    account: saved.account || saved.accountDisplay || row.account,
    accountId: saved.accountId != null ? String(saved.accountId) : row.accountId,
    currency: saved.currency || saved.currencyDisplay || row.currency,
    currencyId: saved.currencyId != null ? String(saved.currencyId) : row.currencyId,
    formulaOperators: saved.formulaOperators || row.formulaOperators,
    formulaDisplay,
    formula: formulaDisplay || row.formula,
    sourceColumns: saved.sourceColumns || saved.columns || row.sourceColumns,
    sourcePercent: saved.sourcePercent != null ? String(saved.sourcePercent) : row.sourcePercent,
    enableSourcePercent:
      saved.enableSourcePercent != null ? !!saved.enableSourcePercent : row.enableSourcePercent,
    clickedColumns: saved.clickedColumns || row.clickedColumns,
    inputMethod: saved.inputMethod || row.inputMethod,
    enableInputMethod:
      saved.enableInputMethod != null ? !!saved.enableInputMethod : row.enableInputMethod,
    originalDescription:
      saved.originalDescription || saved.descriptionMain || row.originalDescription,
    baseProcessedAmount:
      saved.baseProcessedAmount != null ? String(saved.baseProcessedAmount) : row.baseProcessedAmount,
    processedAmount:
      saved.processedAmount != null ? String(saved.processedAmount) : row.processedAmount,
    rateChecked: saved.rateChecked != null ? !!saved.rateChecked : row.rateChecked,
    rateValue: saved.rateValue != null ? String(saved.rateValue) : row.rateValue,
    selectChecked: saved.selectChecked != null ? !!saved.selectChecked : row.selectChecked,
    subOrder: saved.subOrder != null ? Number(saved.subOrder) : row.subOrder,
    formulaVariant:
      saved.formulaVariant != null ? Number(saved.formulaVariant) : row.formulaVariant,
    templateId: saved.templateId != null ? Number(saved.templateId) : row.templateId,
    templateKey: saved.templateKey || row.templateKey,
    templateApplied: true,
  };
}
