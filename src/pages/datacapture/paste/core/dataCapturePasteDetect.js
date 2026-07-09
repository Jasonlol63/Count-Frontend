import {
  parseCitibetFormatBasedPaste,
  parseCitibetMajorPaymentReport,
  parseCitibetPaymentReport,
} from "../vendors/dataCaptureCitibetParsers.js";

/** Citibet reports are tab-separated with Upline/Downline section headers. */
export function pastedPlainTextLooksCitibetReport(pastedData) {
  if (!pastedData || typeof pastedData !== "string" || !pastedData.includes("\t")) return false;
  const lower = pastedData.toLowerCase();
  return (
    lower.includes("upline payment") ||
    lower.includes("downline payment") ||
    lower.includes("upline payment report") ||
    lower.includes("downline payment report")
  );
}

/** Strict auto-detect — avoids misclassifying generic Excel pastes as CITIBET. */
export function autoDetectCaptureTypeFromPaste(pastedData) {
  if (!pastedData || typeof pastedData !== "string") return null;
  if (parseCitibetMajorPaymentReport(pastedData)) return "CITIBET";
  if (pastedPlainTextLooksCitibetReport(pastedData) && parseCitibetPaymentReport(pastedData)) {
    return "CITIBET";
  }
  return null;
}

export function parseCitibetPasteData(pastedData, captureType) {
  const isCitibetMode = captureType === "CITIBET";
  let usedMajorParser = false;

  if (isCitibetMode) {
    const majorParsed = parseCitibetMajorPaymentReport(pastedData);
    usedMajorParser = Boolean(majorParsed);
    let parsed = majorParsed || parseCitibetPaymentReport(pastedData);
    if (!parsed && pastedPlainTextLooksCitibetReport(pastedData)) {
      parsed = parseCitibetFormatBasedPaste(pastedData);
    }
    return parsed ? { ...parsed, usedMajorParser } : null;
  }

  const parsed = parseCitibetPaymentReport(pastedData);
  return parsed ? { ...parsed, usedMajorParser: false } : null;
}

export function shouldExitCitibetMode(pastedData, captureType) {
  if (captureType !== "CITIBET") return false;
  const stillCitibet =
    parseCitibetMajorPaymentReport(pastedData) ||
    parseCitibetPaymentReport(pastedData) ||
    (pastedPlainTextLooksCitibetReport(pastedData) && parseCitibetFormatBasedPaste(pastedData));
  return !stillCitibet;
}
