/**
 * Data Capture tenant scope — pill `id` === backend `tenant.id`.
 */

/** Numeric tenant id from capture scope (subsidiary or group entity row). */
export function resolveDataCaptureTenantId(scope) {
  if (!scope) return null;
  const tid = Number(scope.scopeCompanyId);
  return Number.isFinite(tid) && tid > 0 ? tid : null;
}

/** Tenant id for category permissions / session sync (scope first, then UI company pill). */
export function resolveDataCaptureEffectiveTenantId(scope, companyId = null) {
  return resolveDataCaptureTenantId(scope) ?? resolveTenantIdFromCompanyPill(companyId);
}

export function resolveTenantIdFromCompanyPill(companyId) {
  const tid = Number(companyId);
  return Number.isFinite(tid) && tid > 0 ? tid : null;
}
