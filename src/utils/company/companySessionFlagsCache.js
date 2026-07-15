/**
 * In-memory cache of POST /auth/switch-tenant payloads for instant sidebar updates.
 * Keyed by tenant id.
 */

/** @type {Map<number, { company_id: number, company_code: string|null, has_gambling: boolean, has_bank: boolean }>} */
const flagsByCompanyId = new Map();

export function rememberCompanySessionFlags(data) {
  if (!data || typeof data !== "object") return;
  const id = Number(data.tenant_id ?? data.company_id);
  if (!Number.isFinite(id) || id <= 0) return;
  const code =
    (data.tenant_code ?? data.company_code) != null &&
    String(data.tenant_code ?? data.company_code).trim() !== ""
      ? String(data.tenant_code ?? data.company_code).trim().toUpperCase()
      : null;
  flagsByCompanyId.set(id, {
    company_id: id,
    company_code: code,
    has_gambling: Boolean(data.has_game ?? data.has_gambling),
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
