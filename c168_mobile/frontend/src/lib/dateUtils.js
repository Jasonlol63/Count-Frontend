/** Minimal date helpers for Domain (subset of desktop dateUtils). */

export function formatYmd(d) {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseYmd(s) {
  if (!s) return null;
  const [y, m, d] = String(s).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setHours(0, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function parseDdMmYyyyToYmd(str) {
  if (!str || typeof str !== "string") return "";
  const parts = str.trim().split(/[/\-.]/);
  if (parts.length !== 3) return "";
  const day = parts[0].padStart(2, "0");
  const month = parts[1].padStart(2, "0");
  const year = parts[2];
  if (year.length !== 4) return "";
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
    return parseYmd(`${ymdHead[1]}-${ymdHead[2]}-${ymdHead[3]}`);
  }
  const dmy = raw.match(/^(\d{1,2})[/.\\-](\d{1,2})[/.\\-](\d{4})$/);
  if (dmy) {
    return parseYmd(`${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`);
  }
  return null;
}

export function formatDmyDash(input) {
  const d = toLocalDate(input);
  if (!d) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}
