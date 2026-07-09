/** Keys cleared when finishing a capture round (legacy PHP + JS parity). */

const FORMAT_PREVIEW_SESSION_KEYS = [
  "capturedFormatPreviewHtml",
  "captured655PreviewHtml",
];

export function clearDataCaptureRoundLocalStorage() {
  [
    "capturedTableData",
    "capturedProcessData",
    "capturedDataCaptureType",
    ...FORMAT_PREVIEW_SESSION_KEYS,
    "capturedTableRateValues",
    "capturedTableRateValuesByProductId",
    "capturedTableFormulaSourceForRefresh",
    "capturedCaptureId",
  ].forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  });
  FORMAT_PREVIEW_SESSION_KEYS.forEach((k) => {
    try {
      sessionStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  });
}
