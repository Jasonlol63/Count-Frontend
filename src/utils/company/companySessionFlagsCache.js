/**
 * In-memory cache of `update_company_session_api.php` payloads for instant sidebar updates.
 * Keyed by company id (view_group is not part of flags).
 */

/** @type {Map<number, { company_id: number, company_code: string|null, has_gambling: boolean, has_bank: boolean }>} */
const flagsByCompanyId = new Map();

export function rememberCompanySessionFlags(data) {
  if (!data || typeof data !== "object") return;
  const id = Number(data.company_id);
  if (!Number.isFinite(id) || id <= 0) return;
  const code =
    data.company_code != null && String(data.company_code).trim() !== ""
      ? String(data.company_code).trim().toUpperCase()
      : null;
  flagsByCompanyId.set(id, {
    company_id: id,
    company_code: code,
    has_gambling: Boolean(data.has_gambling),
    has_bank: Boolean(data.has_bank),
  });
}

export function peekCompanySessionFlags(companyId) {
  const id = Number(companyId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return flagsByCompanyId.get(id) ?? null;
}

export function clearCompanySessionFlagsCache() {
  flagsByCompanyId.clear();
}
