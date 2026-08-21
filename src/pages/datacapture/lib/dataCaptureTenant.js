/**
 * Data Capture tenant scope — pill `id` === backend `tenant.id`.
 */

/** Numeric tenant id from capture scope (subsidiary company, or the GROUP tenant's own ledger id). */
export function resolveDataCaptureTenantId(scope) {
  if (!scope) return null;
  const tid = Number(scope.scopeCompanyId);
  if (Number.isFinite(tid) && tid > 0) return tid;
  const groupTid = Number(scope.groupEntityTenantId);
  return Number.isFinite(groupTid) && groupTid > 0 ? groupTid : null;
}

/** Tenant id for category permissions / session sync (scope first, then UI company pill). */
export function resolveDataCaptureEffectiveTenantId(scope, companyId = null) {
  return resolveDataCaptureTenantId(scope) ?? resolveTenantIdFromCompanyPill(companyId);
}

export function resolveTenantIdFromCompanyPill(companyId) {
  const tid = Number(companyId);
  return Number.isFinite(tid) && tid > 0 ? tid : null;
}
