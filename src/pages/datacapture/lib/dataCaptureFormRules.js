import { tableSnapshotHasData } from "./dataCaptureTableSnapshot.js";

/** Replace / remove / remark fields: first letter uppercase, rest lowercase. */
export function toDataCaptureWordFieldCase(value) {
  const s = String(value ?? "");
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export const CAPTURE_TYPE_OPTIONS = ["1.Text", "2.Format", "CITIBET", "4.RETURN"];

/** Align with `normalizeCaptureTypeValue` in `js/datacapture.js`. */
export function normalizeCaptureType(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  if (s === "1.GENERAL") s = "1.Text";
  if (s === "655") s = "2.Format";
  if (s === "CITIBET_MAJOR") s = "CITIBET";
  return CAPTURE_TYPE_OPTIONS.includes(s) ? s : "";
}

export function readInitialCaptureType() {
  const url = new URLSearchParams(window.location.search);
  if (url.get("restore") === "1") {
    try {
      const pd = JSON.parse(localStorage.getItem("capturedProcessData") || "null");
      const fromStore =
        pd?.dataCaptureType || pd?.captureType || localStorage.getItem("capturedDataCaptureType") || "";
      const normalized = normalizeCaptureType(fromStore);
      if (normalized) return normalized;
    } catch {
      /* ignore */
    }
  }
  const v = String(url.get("captureType") || url.get("dataCaptureType") || "").trim();
  return normalizeCaptureType(v) || "1.Text";
}

export function isCitibetCaptureType(captureType) {
  return normalizeCaptureType(captureType) === "CITIBET";
}

/** Descriptions from Context/modal, with fallback when display text is set but array is empty. */
export function getActiveDescriptions(descriptionDisplay, selectedDescriptions = null) {
  const fromContext = Array.isArray(selectedDescriptions) ? selectedDescriptions : [];
  if (fromContext.length) return fromContext.filter(Boolean);
  const display = String(descriptionDisplay || "").trim();
  if (!display) return [];
  return display
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function validateDataCaptureForm({
  selectedProcess,
  descriptions,
  descriptionDisplay,
  currencyId,
  captureType,
  tableData,
  requireDescriptions = true,
  requireTableData = false,
}) {
  const activeDescriptions = descriptions?.length
    ? descriptions
    : getActiveDescriptions(descriptionDisplay);

  if (!selectedProcess?.id) {
    return { ok: false, message: "Please select a process" };
  }
  if (requireDescriptions && !activeDescriptions.length) {
    return { ok: false, message: "Please select at least one description" };
  }
  if (!currencyId) {
    return { ok: false, message: "Please select a currency" };
  }
  // Group-only capture and CITIBET require grid data before Submit.
  // 2.Format table checks run at submit time (after prepareFormatSubmitSnapshot).
  if (
    (requireTableData || isCitibetCaptureType(captureType)) &&
    !tableSnapshotHasData(tableData)
  ) {
    return { ok: false, message: "Please enter data in the table" };
  }
  return { ok: true };
}

export function isSubmitReady(params) {
  return validateDataCaptureForm(params).ok;
}
