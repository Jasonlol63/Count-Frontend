/**
 * Games/Bank category flags for a company — computed from data already in hand
 * (SessionUser.tenant_has_game/tenant_has_bank at boot, or the `has_gambling`/`has_bank`
 * fields Spring's `auth/switch-tenant` response already returns on company switch), not
 * fetched. The legacy PHP `domain/domain_api.php` "get_company_permissions" round-trip this
 * replaced was redundant: every caller already had the same answer in hand for free.
 */

/** Fallback when category flags are unavailable (access guards only; no Category UI). */
const DEFAULT_PERMISSIONS_FULL = ["Games", "Bank"];

/** `{hasGame, hasBank}` → legacy `["Games","Bank"]`-shaped array the existing predicates below expect. */
export function permissionsFromCategoryFlags({ hasGame = false, hasBank = false } = {}) {
  const perms = [];
  if (hasGame) perms.push("Games");
  if (hasBank) perms.push("Bank");
  return perms;
}

/**
 * Games/Bank permissions for a company, with the same C168-bypass + fail-open default the
 * page boot/switch flows relied on when this was a PHP fetch.
 */
export function resolveCompanyPermissions({
  companyCode = null,
  hasGame = false,
  hasBank = false,
  defaultPermissions = DEFAULT_PERMISSIONS_FULL,
} = {}) {
  const perms = permissionsFromCategoryFlags({ hasGame, hasBank });
  return perms.length > 0 ? perms : [...defaultPermissions];
}

export function isBankOnlyCategoryCompany(permissions) {
  if (!Array.isArray(permissions) || permissions.length === 0) return false;
  const hasBank = permissions.includes("Bank");
  const hasGames = permissions.includes("Games") || permissions.includes("Gambling");
  return hasBank && !hasGames;
}

/** Capture / Transaction maintenance: company has Games/Gambling or Bank category. */
export function companyPermsAllowDataCaptureMaintenance(permissions) {
  if (!Array.isArray(permissions) || permissions.length === 0) return true;
  const hasGames = permissions.includes("Games") || permissions.includes("Gambling");
  const hasBank = permissions.includes("Bank");
  return hasGames || hasBank;
}
