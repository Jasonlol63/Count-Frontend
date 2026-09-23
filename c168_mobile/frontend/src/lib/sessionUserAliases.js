/**
 * Spring `SessionUser` (from `/auth/current-user`) uses `tenant_*` field names, while
 * mobile's scope helpers (`pickCompany`, `filterCompaniesForUserScope`,
 * `resolveInitialMobileGcScope`) still read the legacy PHP `company_*` names. Alias them
 * here once so those call sites keep working unchanged.
 *
 * Copied from Count-frontend/src/utils/auth/sessionTenant.js +
 * Count-frontend/src/components/AuthenticatedLayout.jsx (`withLegacyCompanyAliases`) —
 * keep the fallback rules in sync with those two files.
 */

export function getSessionTenantId(me) {
  const id = me?.tenant_id ?? me?.company_id;
  if (id == null || id === "") return null;
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function getSessionTenantCode(me) {
  const code = String(me?.tenant_code ?? me?.company_code ?? "").trim().toUpperCase();
  return code || null;
}

export function sessionHasTenantGame(me) {
  return Boolean(me?.tenant_has_game ?? me?.company_has_gambling);
}

export function sessionHasTenantBank(me) {
  return Boolean(me?.tenant_has_bank ?? me?.company_has_bank);
}

export function isCurrentTenantC168(me) {
  return Boolean(me?.is_current_tenant_c168 ?? me?.is_current_company_c168);
}

/**
 * Every Spring session user that reaches a scope helper goes through here first, so
 * `company_id` / `company_code` / `company_has_gambling` / `company_has_bank` /
 * `is_current_company_c168` are always populated (falling back to the `tenant_*` names).
 * @param {object|null|undefined} user
 */
export function withLegacyCompanyAliases(user) {
  if (!user) return user;
  return {
    ...user,
    company_id: user.company_id ?? getSessionTenantId(user),
    company_code: user.company_code ?? getSessionTenantCode(user),
    company_has_gambling: user.company_has_gambling ?? sessionHasTenantGame(user),
    company_has_bank: user.company_has_bank ?? sessionHasTenantBank(user),
    is_current_company_c168: user.is_current_company_c168 ?? isCurrentTenantC168(user),
  };
}
