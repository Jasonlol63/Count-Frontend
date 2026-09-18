export function formatTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * before_data/after_data come back from the API as JSON *text* (the DB column is TEXT, not the
 * native JSON type — see docs/it-role-audit-log.md), so this must be JSON.parse()'d before use.
 * Re-stringifying a still-encoded string (a previous bug here) double-escapes every quote.
 */
export function safeParse(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "object") return raw; // already parsed — defensive, shouldn't normally happen
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** `2026-09-15T17:36:06` (raw ISO datetime field value) → `2026-09-15 17:36:06` — the literal "T" separator reads as a typo, not a date, to anyone not used to ISO 8601. */
function dropIsoT(text) {
  return text.replace(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/, "$1 $2");
}

export function formatFieldValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value);
  return dropIsoT(String(value));
}

/**
 * Backend summaries for short string fields look like `的 remark: old → new 在 BK`.
 * Remark text is noise in the table (same reason insurance_price is already field-name-only),
 * so strip the values and keep the quoted field name.
 */
export function coarsenAuditSummary(summary) {
  if (summary == null || summary === "") return summary;
  return String(summary).replace(/\s*"?remark"?\s*:\s*.+?(?=\s+在\s|$)/gi, ' "remark"');
}

export function initials(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
