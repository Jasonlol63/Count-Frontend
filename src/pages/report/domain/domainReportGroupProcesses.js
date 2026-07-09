/** Group-scope Domain Report: SALARY / COMMISSION / BONUS (aligned with Data Capture group-only). */

export const DOMAIN_GROUP_PROCESS_CODES = ["SALARY", "COMMISSION", "BONUS"];

function normalizeProcessCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s*\(.*$/, "");
}

/**
 * Map API process rows to fixed SALARY / COMMISSION / BONUS dropdown options (numeric ids for report filter).
 * Always returns both codes when the API provides matching ids (backend ensures rows exist).
 */
export function mapDomainGroupProcesses(apiList) {
  const rows = Array.isArray(apiList) ? apiList : [];
  const mapped = DOMAIN_GROUP_PROCESS_CODES.map((code) => {
    const row = rows.find((p) => {
      const fromProcess = normalizeProcessCode(p.process ?? p.process_id);
      const fromDisplay = normalizeProcessCode(p.display_text);
      return fromProcess === code || fromDisplay === code || fromDisplay.startsWith(`${code} `);
    });
    const id = row?.id != null ? Number(row.id) : 0;
    if (!Number.isFinite(id) || id <= 0) {
      return null;
    }
    return {
      id,
      process: code,
      display_text: code,
    };
  }).filter(Boolean);
  return mapped.length > 0 ? mapped : rows;
}

export function isDomainGroupProcessSelection(processId, processes) {
  if (!processId) return true;
  return (processes || []).some((p) => String(p.id) === String(processId));
}
