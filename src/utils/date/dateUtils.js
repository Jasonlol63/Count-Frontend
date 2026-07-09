/**
 * Format a Date object to 'DD/MM/YYYY'
 */
export function formatDmy(d) {
  if (!d) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const y = d.getFullYear();
  return `${day}/${m}/${y}`;
}

/**
 * Format a Date object to 'YYYY-MM-DD'
 */
export function formatYmd(d) {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Parse 'YYYY-MM-DD' to Date object.
 */
export function parseYmd(s) {
  if (!s) return null;
  const [y, m, d] = String(s).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

/**
 * Format 'DD/MM/YYYY' to 'YYYY-MM-DD'
 */
export function parseDdMmYyyyToYmd(str) {
  if (!str || typeof str !== "string") return "";
  const parts = str.trim().split(/[/\-.]/);
  if (parts.length !== 3) return "";
  const day = parts[0].padStart(2, "0");
  const month = parts[1].padStart(2, "0");
  const year = parts[2];
  if (day.length > 2 || month.length > 2 || year.length !== 4) return "";
  return `${year}-${month}-${day}`;
}

/**
 * Quick range helper
 */
export function quickRangeToDates(range) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let startDate;
  let endDate;
  switch (range) {
    case "today":
      startDate = new Date(today);
      endDate = new Date(today);
      break;
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      startDate = y;
      endDate = y;
      break;
    }
    case "thisWeek": {
      const w = new Date(today);
      const dayOfWeek = w.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      w.setDate(w.getDate() - daysToMonday);
      startDate = w;
      endDate = new Date(today);
      break;
    }
    case "lastWeek": {
      const lastWeekEnd = new Date(today);
      const lastWeekDayOfWeek = lastWeekEnd.getDay();
      const daysToLastSunday = lastWeekDayOfWeek === 0 ? 0 : lastWeekDayOfWeek;
      lastWeekEnd.setDate(lastWeekEnd.getDate() - daysToLastSunday - 1);
      const lastWeekStart = new Date(lastWeekEnd);
      lastWeekStart.setDate(lastWeekStart.getDate() - 6);
      startDate = lastWeekStart;
      endDate = lastWeekEnd;
      break;
    }
    case "thisMonth":
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      endDate = new Date(today);
      break;
    case "lastMonth": {
      const lm = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lmEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      startDate = lm;
      endDate = lmEnd;
      break;
    }
    case "thisYear":
      startDate = new Date(today.getFullYear(), 0, 1);
      endDate = new Date(today);
      break;
    case "lastYear":
      startDate = new Date(today.getFullYear() - 1, 0, 1);
      endDate = new Date(today.getFullYear() - 1, 11, 31);
      break;
    default:
      return null;
  }
  return { startDate: formatYmd(startDate), endDate: formatYmd(endDate) };
}
