import {
  captureSessionMatchesScope,
  loadActiveCaptureSession,
  loadCaptureSession,
  CAPTURE_SCOPE_POINTER_KEY,
} from "../../datacapture/lib/dataCaptureStorage.js";
import { resolveDataCaptureScopeFromSessionMeta } from "../../datacapture/lib/dataCaptureScope.js";
import { dataCaptureScopeCacheCompanyKey } from "../../datacapture/lib/dataCaptureScope.js";
export const SUMMARY_CAPTURE_STORAGE_KEYS = [
  "capturedTableData",
  "capturedProcessData",
  "capturedDataCaptureType",
  "capturedFormatPreviewHtml",
  "captured655PreviewHtml",
  "capturedTableRateValues",
  "capturedTableRateValuesByProductId",
  "capturedTableFormulaSourceForRefresh",
  "capturedCaptureId",
  "summarySuppressedRowKeys",
];

export const SUMMARY_RATE_VALUES_KEY = "capturedTableRateValues";
export const SUMMARY_FORMULA_SOURCE_KEY = "capturedTableFormulaSourceForRefresh";
export const SUMMARY_CAPTURE_ID_KEY = "capturedCaptureId";
export const RATE_BY_PRODUCT_KEY = "capturedTableRateValuesByProductId";
const SUMMARY_FRESH_NAV_KEY = "dc_summary_fresh_nav";

function scopedRefreshStorageKey(base, captureScope) {
  const tag = dataCaptureScopeCacheCompanyKey(captureScope);
  if (tag == null) return base;
  return `${base}:${tag}`;
}

/** Scoped localStorage keys for Summary refresh draft (formula / rate). */
export function summaryRefreshStorageKeys(captureScope) {
  return {
    formulaSource: scopedRefreshStorageKey(SUMMARY_FORMULA_SOURCE_KEY, captureScope),
    rateValues: scopedRefreshStorageKey(SUMMARY_RATE_VALUES_KEY, captureScope),
    rateByProduct: scopedRefreshStorageKey(RATE_BY_PRODUCT_KEY, captureScope),
  };
}

export function markSummaryFreshNavigation() {
  try {
    sessionStorage.setItem(SUMMARY_FRESH_NAV_KEY, "1");
  } catch {
    /* ignore */
  }
  window.isNavigatingAwayByBackOrSubmit = true;
}

export function consumeSummaryFreshNavigation() {
  try {
    if (sessionStorage.getItem(SUMMARY_FRESH_NAV_KEY) === "1") {
      sessionStorage.removeItem(SUMMARY_FRESH_NAV_KEY);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function clearSummaryCaptureRoundStorage() {
  try {
    const session = loadActiveCaptureSession();
    const scopeKey = session?.processData
      ? dataCaptureScopeCacheCompanyKey({
          mode:
            session.processData.captureScopeMode === "group" &&
            session.processData.groupPayrollCapture !== true
              ? "group"
              : "company",
          scopeCompanyId: session.processData.scopeCompanyId,
          groupId: session.processData.captureSelectedGroup,
        })
      : localStorage.getItem(CAPTURE_SCOPE_POINTER_KEY);

    for (const key of SUMMARY_CAPTURE_STORAGE_KEYS) {
      localStorage.removeItem(key);
      if (scopeKey != null) {
        localStorage.removeItem(`${key}:${scopeKey}`);
      }
      if (key === "capturedFormatPreviewHtml" || key === "captured655PreviewHtml") {
        sessionStorage.removeItem(key);
      }
    }
    localStorage.removeItem(CAPTURE_SCOPE_POINTER_KEY);
  } catch {
    /* ignore */
  }
}

export function isSummaryFreshFromCapture(searchParams) {
  return searchParams?.get("success") === "1";
}

export function stripSummarySuccessParamFromUrl() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("success") && !url.searchParams.has("error")) return;
    url.searchParams.delete("success");
    url.searchParams.delete("error");
    const qs = url.searchParams.toString();
    window.history.replaceState({}, "", `${url.pathname}${qs ? `?${qs}` : ""}${url.hash}`);
  } catch {
    /* ignore */
  }
}

/**
 * Load capture session for Summary — tries pointer/active scope, then explicit scope, then legacy keys.
 */
export function loadSummaryCaptureSession(captureScope = null) {
  const active = loadActiveCaptureSession();
  if (active?.tableData && active?.processData) {
    return active;
  }

  if (captureScope) {
    const scoped = loadCaptureSession(captureScope);
    if (scoped?.tableData && scoped?.processData) {
      return scoped;
    }
  }

  const legacy = loadCaptureSession(null);
  if (legacy?.tableData && legacy?.processData) {
    return legacy;
  }

  if (active?.processData) {
    const fromMeta = resolveDataCaptureScopeFromSessionMeta(active.processData);
    if (fromMeta) {
      const metaScoped = loadCaptureSession(fromMeta);
      if (metaScoped?.tableData && metaScoped?.processData) {
        return metaScoped;
      }
    }
  }

  return null;
}

export function readCaptureSessionFromStorage(expectedScope = null) {
  const session = loadSummaryCaptureSession(expectedScope);
  if (!session) return null;
  if (expectedScope && !captureSessionMatchesScope(session, expectedScope)) {
    return null;
  }
  return {
    tableData: session.tableData,
    processData: session.processData,
  };
}

/** Fresh capture round: drop stale captureId before rendering summary. */
export function clearStaleCaptureIdForFreshRound() {
  try {
    localStorage.removeItem(SUMMARY_CAPTURE_ID_KEY);
  } catch {
    /* ignore */
  }
}
