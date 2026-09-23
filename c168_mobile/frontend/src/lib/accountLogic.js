/**
 * Account role list — Spring account API does not expose a dynamic per-company role
 * endpoint (there is no `/api/account/roles` equivalent to the old `editdata_api.php`).
 * Copied from Count-frontend/src/pages/account/accountLogic.js (desktop) — that file's
 * comment explains the reasoning in full; keep this list in sync with it.
 */
export const ROLE_PRIORITY = [
  "CAPITAL",
  "BANK",
  "CASH",
  "PROFIT",
  "EXPENSES",
  "COMPANY",
  "PARTNER",
  "STAFF",
  "SUPPLIER",
  "AGENT",
  "MEMBER",
  "DEBTOR",
];

function toUpper(value) {
  return String(value || "").trim().toUpperCase();
}

export function roleSortOrder(role, knownRoles) {
  const base = [...ROLE_PRIORITY];
  (knownRoles || []).forEach((r) => {
    const upper = toUpper(r);
    if (upper && !base.includes(upper)) base.push(upper);
  });
  return base.indexOf(toUpper(role) === "UPLINE" ? "SUPPLIER" : toUpper(role));
}

export function getOrderedRoles(roles) {
  const known = new Set();
  (roles || []).forEach((r) => known.add(toUpper(r)));
  const ordered = [];
  ROLE_PRIORITY.forEach((p) => {
    if (known.has(p)) ordered.push(p);
  });
  known.forEach((r) => {
    if (!ordered.includes(r)) ordered.push(r);
  });
  return ordered;
}

/**
 * Add/Edit Account modal role options — a static system list, not fetched from the
 * backend. Always includes every standard role, plus any legacy role value already on
 * the account being edited (so an old/unusual value isn't silently dropped).
 */
export function getAccountModalOrderedRoles(roles = []) {
  const merged = [...roles];
  ROLE_PRIORITY.forEach((role) => {
    if (!merged.some((r) => toUpper(r) === role)) {
      merged.push(role);
    }
  });
  return getOrderedRoles(merged);
}

export function normalizeAlertAmount(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.startsWith("-") ? raw : `-${raw}`;
}
