export { injectStylesheet } from "../../../utils/core/injectStylesheet.js";

/** dd/mm/yyyy -> Date (local). */
export function parseDmyToDate(value) {
  const s = String(value || "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function loadTxScriptOnce(src, marker) {
  const key = marker || src;
  return new Promise((resolve, reject) => {
    const bySrc = document.querySelector(`script[src="${src}"]`);
    if (bySrc) {
      const finish = () => resolve();
      /** Script may have loaded on a previous route; `load` will never fire again. */
      if (typeof window.MaintenanceDateRangePicker?.init === "function" || typeof window.selectQuickRange === "function") {
        queueMicrotask(finish);
        return;
      }
      bySrc.addEventListener("load", finish, { once: true });
      bySrc.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
      setTimeout(() => {
        if (typeof window.MaintenanceDateRangePicker?.init === "function" || typeof window.selectQuickRange === "function") {
          finish();
        }
      }, 0);
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.dataset.txScript = key;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(s);
  });
}

export function companyButtonStyle(comp, snapGroup) {
  const cGid = comp.group_id != null ? String(comp.group_id).toUpperCase().trim() : "";
  if (snapGroup) {
    return cGid === snapGroup ? {} : { display: "none" };
  }
  return cGid ? { display: "none" } : {};
}

/** 与 transaction.php / TRANSACTION_PAGE.showDescriptionColumn 一致（PHP 默认为 true）。 */
export const TRANSACTION_SHOW_DESCRIPTION_COLUMN = true;
