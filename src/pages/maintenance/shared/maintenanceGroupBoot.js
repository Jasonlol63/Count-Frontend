import { canUseGroupOnlyMode } from "../../../utils/company/loginScope.js";
import { isC168CompanyRow } from "../../../utils/company/c168CaptureChannel.js";
import {
  companyRowIsGroupEntity,
  isDashboardGroupOnlyMode,
  readPersistedDashboardGcFilter,
} from "../../../utils/company/sharedCompanyFilter.js";

/** Session synced to group entity row (AP/IG) — treat as group ledger boot. */
export function isMaintenanceSessionGroupEntityBoot(companyRow, me) {
  if (!companyRow) return false;
  const entityCode = String(companyRow.company_id ?? "").trim().toUpperCase();
  if (!entityCode || !companyRowIsGroupEntity(companyRow, entityCode)) return false;
  return canUseGroupOnlyMode(me, entityCode);
}

/** Match Transaction / Capture Maintenance boot: group ledger without a subsidiary pill. */
export function isMaintenanceGroupOnlyBoot({
  groupFilterOptOut = false,
  sessionGroup = null,
  initialUiCompanyId = null,
  persistedGc = null,
} = {}) {
  if (groupFilterOptOut) return false;
  const persisted = persistedGc ?? readPersistedDashboardGcFilter();
  if (persisted.companyId != null) return false;
  return (
    isDashboardGroupOnlyMode() ||
    Boolean(persisted?.groupOnly) ||
    (sessionGroup != null && initialUiCompanyId == null)
  );
}

/**
 * Group payroll maintenance (AP/IG + SALARY/COMMISSION/BONUS) must not use subsidiary
 * Games category checks — same rule as Summary / Transaction Maintenance group boot.
 */
export function shouldSkipMaintenanceCategoryGuard({
  groupOnlyBoot = false,
  scope = null,
  me = null,
  selectedGroup = null,
  companyRow = null,
  companyId = null,
} = {}) {
  if (groupOnlyBoot) return true;
  if (companyRow && isC168CompanyRow(companyRow)) return true;
  if (scope?.c168Channel) return true;
  if (scope?.mode === "group") {
    const g = String(selectedGroup || scope?.groupId || scope?.viewGroup || "").trim();
    return g ? canUseGroupOnlyMode(me, g) : false;
  }
  const g = selectedGroup ? String(selectedGroup).trim().toUpperCase() : "";
  if (g && companyRow && companyRowIsGroupEntity(companyRow, g)) {
    return canUseGroupOnlyMode(me, g);
  }
  if (companyRow) {
    const entityCode = String(companyRow.company_id ?? "").trim().toUpperCase();
    if (entityCode && companyRowIsGroupEntity(companyRow, entityCode)) {
      return canUseGroupOnlyMode(me, entityCode);
    }
  }
  const cid = companyId != null && companyId !== "" ? Number(companyId) : Number.NaN;
  if (g && !(Number.isFinite(cid) && cid > 0) && canUseGroupOnlyMode(me, g)) {
    return true;
  }
  return false;
}
