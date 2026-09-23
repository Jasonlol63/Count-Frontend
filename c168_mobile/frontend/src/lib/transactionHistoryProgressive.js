/** Inclusive day count between two Y-m-d dates (UTC calendar). */
function daysInclusiveYmd(fromYmd, toYmd) {
  const a = Date.parse(`${fromYmd}T00:00:00Z`);
  const b = Date.parse(`${toYmd}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.floor((b - a) / 86400000) + 1;
}

/**
 * Payment History scope uses dd/mm/yyyy; some callers may pass yyyy-mm-dd.
 * @returns {{ y: number, mo: number, d: number, style: 'dmy' | 'ymd' } | null}
 */
export function parseHistoryDate(value) {
  const s = String(value || "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return { y, mo, d, style: "ymd" };
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const y = Number(m[3]);
    if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return { y, mo, d, style: "dmy" };
  }
  return null;
}

function formatYmd({ y, mo, d }) {
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function formatHistoryDate({ y, mo, d }, style) {
  if (style === "dmy") {
    return `${String(d).padStart(2, "0")}/${String(mo).padStart(2, "0")}/${String(y).padStart(4, "0")}`;
  }
  return formatYmd({ y, mo, d });
}

function subtractOneDay({ y, mo, d }) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return { y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function ymdNum({ y, mo, d }) {
  return y * 10000 + mo * 100 + d;
}

/**
 * Split a long range for fast first paint without N× B/F cost.
 * - Short ranges: one request (unchanged).
 * - Long ranges: [older remainder, newest calendar month] — true date windows,
 *   newest fetched first; remainder is a single follow-up (not per-month).
 * Accepts dd/mm/yyyy (scope default) or yyyy-mm-dd; output keeps input style.
 */
export function splitHistoryDateChunks(dateFrom, dateTo, { minDaysToChunk = 40 } = {}) {
  const from = String(dateFrom || "").trim();
  const to = String(dateTo || "").trim();
  if (!from || !to) return [{ dateFrom: from, dateTo: to }];

  const start = parseHistoryDate(from);
  const end = parseHistoryDate(to);
  if (!start || !end || ymdNum(start) > ymdNum(end)) {
    return [{ dateFrom: from, dateTo: to }];
  }

  const style = start.style === "dmy" || end.style === "dmy" ? "dmy" : "ymd";
  const span = daysInclusiveYmd(formatYmd(start), formatYmd(end));
  if (span <= minDaysToChunk) {
    return [{ dateFrom: from, dateTo: to }];
  }

  const newestStart = { y: end.y, mo: end.mo, d: 1 };
  if (ymdNum(newestStart) <= ymdNum(start)) {
    return [{ dateFrom: from, dateTo: to }];
  }

  const remainderEnd = subtractOneDay(newestStart);
  return [
    {
      dateFrom: formatHistoryDate(start, style),
      dateTo: formatHistoryDate(remainderEnd, style),
    },
    {
      dateFrom: formatHistoryDate(newestStart, style),
      dateTo: formatHistoryDate(end, style),
    },
  ];
}

export function isHistoryBfRow(row) {
  return row?.row_type === "bf";
}

/**
 * Merge a later date-chunk into accumulated rows.
 * Keep B/F only from the earliest loaded contiguous chunk; later chunks drop opening rows.
 */
export function mergeHistoryChunkRows(existing, incoming, { isFirstChunk }) {
  const next = Array.isArray(incoming) ? incoming : [];
  if (isFirstChunk || !existing.length) {
    return next.slice();
  }
  const withoutBf = next.filter((row) => !isHistoryBfRow(row));
  return existing.concat(withoutBf);
}

/**
 * Assemble rows from chronological chunk slots using only the contiguous
 * suffix of loaded chunks (newest → older).
 *
 * @param {(Array|null|undefined)[]} slots
 */
export function assembleContiguousSuffix(slots) {
  const list = Array.isArray(slots) ? slots : [];
  if (!list.length) return [];

  let start = list.length;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i] == null) break;
    start = i;
  }
  if (start >= list.length) return [];

  let out = [];
  for (let i = start; i < list.length; i += 1) {
    out = mergeHistoryChunkRows(out, list[i], { isFirstChunk: i === start });
  }
  return out;
}

/** Newest-first fetch order indices for chronological chunks. */
export function historyChunkFetchOrder(chunkCount) {
  const n = Math.max(0, Number(chunkCount) || 0);
  const order = [];
  for (let i = n - 1; i >= 0; i -= 1) order.push(i);
  return order;
}
