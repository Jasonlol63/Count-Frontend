/**
 * Split a maintenance list datetime string (e.g. "04/05/2026 17:18:44") into date + time.
 * @param {string | null | undefined} value
 * @returns {{ date: string, time: string | null } | null}
 */
export function parseMaintenanceDateTime(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const spaceIdx = raw.indexOf(" ");
  if (spaceIdx === -1) return { date: raw, time: null };
  const date = raw.slice(0, spaceIdx);
  const time = raw.slice(spaceIdx + 1).trim();
  return { date, time: time || null };
}
