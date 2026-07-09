/**
 * Strict split: group ledger (group_only + group_id, NO company_id) vs subsidiary company.
 * Do not mix legacy "group entity" company rows with group scope_type=currency rows.
 */
import { canUseGroupOnlyMode, getLoginIdentifier, isGroupLogin } from "./loginScope.js";

export const LEDGER_GROUP = "group";
export const LEDGER_COMPANY = "company";

function setParam(target, key, value) {
  if (target instanceof URLSearchParams) {
    target.set(key, value);
  } else if (target instanceof FormData) {
    target.set(key, value);
  }
}

/**
 * @param {URLSearchParams|FormData} target
 * @param {{ ledger: 'group'|'company', groupId?: string|null, companyId?: number|null }} scope
 */
export function applyTenantLedgerToParams(target, scope) {
  const ledger = scope?.ledger === LEDGER_GROUP ? LEDGER_GROUP : LEDGER_COMPANY;
  const groupId = String(scope?.groupId || "")
    .trim()
    .toUpperCase();

  if (ledger === LEDGER_GROUP) {
    if (groupId) setParam(target, "group_id", groupId);
    setParam(target, "group_only", "1");
    return;
  }

  if (groupId) setParam(target, "group_id", groupId);
  const companyId = scope?.companyId;
  if (companyId != null && Number(companyId) > 0) {
    setParam(target, "company_id", String(Number(companyId)));
  }
}

/**
 * Page filter → API ledger (Account List pills).
 */
export function resolvePageLedgerScope({
  groupOnly = false,
  selectedGroup = null,
  companyId = null,
  sessionMe = null,
} = {}) {
  const groupId =
    (selectedGroup && String(selectedGroup).trim().toUpperCase()) ||
    (isGroupLogin(sessionMe) ? getLoginIdentifier(sessionMe) : null);

  if (groupOnly && groupId && canUseGroupOnlyMode(sessionMe, groupId)) {
    return { ledger: LEDGER_GROUP, groupId, companyId: null };
  }

  return {
    ledger: LEDGER_COMPANY,
    groupId,
    companyId: companyId != null && Number(companyId) > 0 ? Number(companyId) : null,
  };
}

/**
 * Edit modal: account's own group ledger overrides page company filter.
 */
export function resolveModalLedgerScope(pageScope, modalLedgerScope) {
  const ledgerGroup = String(modalLedgerScope?.group_code || "").trim().toUpperCase();
  if (modalLedgerScope?.mode === LEDGER_GROUP && ledgerGroup) {
    return { ledger: LEDGER_GROUP, groupId: ledgerGroup, companyId: null };
  }
  return pageScope;
}
