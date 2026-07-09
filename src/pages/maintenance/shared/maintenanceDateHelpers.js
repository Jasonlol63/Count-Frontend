/** Quick-range keys used by maintenance filter date pickers. */
export const MAINTENANCE_QUICK_RANGE_KEYS = [
  "today",
  "yesterday",
  "thisWeek",
  "lastWeek",
  "thisMonth",
  "lastMonth",
  "thisYear",
  "lastYear",
];

/** Parse `dd/mm/yyyy` to `yyyy-mm-dd` for ReportDatePicker. */
export function parseDmy(dmy) {
  const match = String(dmy || "")
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return "";
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

/** Format `yyyy-mm-dd` to `dd/mm/yyyy`. */
export function formatDmyFromYmd(ymd) {
  const [y, m, d] = (ymd || "").split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

/** Format a Date as `dd/mm/yyyy` (bank process maintenance default range). */
export function formatDmyFromDate(d) {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function buildMaintenancePeriodPresets(m) {
  return MAINTENANCE_QUICK_RANGE_KEYS.map((key) => ({ key, label: m[key] || key }));
}
