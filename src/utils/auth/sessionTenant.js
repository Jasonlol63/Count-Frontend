/** Session tenant fields from Spring {@code SessionUser} / {@code auth/current-user}. */

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
