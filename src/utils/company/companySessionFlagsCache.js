/**
 * In-memory cache of session tenant flags for instant sidebar updates.
 * Keyed by tenant id.
 */

/** @type {Map<number, { tenant_id: number, tenant_code: string|null, has_game: boolean, has_bank: boolean }>} */
const flagsByTenantId = new Map();

export function rememberCompanySessionFlags(data) {
  if (!data || typeof data !== "object") return;
  const id = Number(data.tenant_id ?? data.company_id);
  if (!Number.isFinite(id) || id <= 0) return;
  const codeRaw = data.tenant_code ?? data.company_code;
  const code =
    codeRaw != null && String(codeRaw).trim() !== ""
      ? String(codeRaw).trim().toUpperCase()
      : null;
  flagsByTenantId.set(id, {
    tenant_id: id,
    tenant_code: code,
    has_game: Boolean(data.has_game ?? data.has_gambling ?? data.tenant_has_game),
    has_bank: Boolean(data.has_bank ?? data.tenant_has_bank),
  });
}

export function peekCompanySessionFlags(tenantId) {
  const id = Number(tenantId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return flagsByTenantId.get(id) ?? null;
}

export function clearCompanySessionFlagsCache() {
  flagsByTenantId.clear();
}
