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

function toLocalDate(input) {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    const copy = new Date(input);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  const raw = String(input || "").trim();
  if (!raw) return null;

  const ymdHead = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymdHead) {
    const y = Number(ymdHead[1]);
    const m = Number(ymdHead[2]);
    const d = Number(ymdHead[3]);
    const dt = new Date(y, m - 1, d);
    if (Number.isNaN(dt.getTime())) return null;
    dt.setHours(0, 0, 0, 0);
    return dt;
  }

  const dmy = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    const dt = new Date(year, month - 1, day);
    if (Number.isNaN(dt.getTime())) return null;
    dt.setHours(0, 0, 0, 0);
    return dt;
  }

  const parsed = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

/** Format date-like input to DD-MM-YYYY for user-facing text. */
export function formatDmyDash(input) {
  const d = toLocalDate(input);
  if (!d) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
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
