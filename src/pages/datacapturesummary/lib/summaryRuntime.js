/**
 * Module-scoped runtime for pure React Summary page (toast + i18n for pushSummaryNotification).
 */

let notifyHandler = null;
let translateNotification = null;

export function registerSummaryRuntime({
  showNotification,
  translateNotification: translateFn,
}) {
  if (typeof showNotification === "function") notifyHandler = showNotification;
  if (typeof translateFn === "function") translateNotification = translateFn;
}

export function unregisterSummaryRuntime() {
  notifyHandler = null;
  translateNotification = null;
}

export function summaryShowNotification(title, message, type = "success") {
  if (notifyHandler) {
    notifyHandler(title, message, type);
    return true;
  }
  return false;
}

export function summaryTranslateNotification(payload) {
  if (translateNotification) return translateNotification(payload);
  return payload;
}
