import { isDashboardGroupOnlyMode } from "../../../utils/company/sharedCompanyFilter.js";
import {
  customerReportScopeIsReady,
  resolveCustomerReportScope,
} from "../shared/reportScope.js";

/**
 * Domain Report: group pill without subsidiary → group payroll ledger
 * (PROFIT / SALARY / COMMISSION / BONUS).
 * Honour group-only session so stale company_id does not pull C168 captures into AP group view.
 */
export function resolveDomainReportScope(args) {
  const { companies, selectedGroup, companyId, groupsAllMode, groupAllMode, me = null } = args;
  const groupOnlyUi =
    Boolean(selectedGroup) &&
    !groupsAllMode &&
    !groupAllMode &&
    (companyId == null || companyId === "" || isDashboardGroupOnlyMode());

  return resolveCustomerReportScope({
    companies,
    selectedGroup,
    companyId: groupOnlyUi ? null : companyId,
    groupsAllMode,
    groupAllMode,
    me,
  });
}

/** Group entity / group-only: PROFIT + SALARY + COMMISSION + BONUS (aligned with Data Capture). */
export function domainReportUsesSalaryBonusProcesses(scope) {
  return scope?.mode === "group";
}

export { customerReportScopeIsReady as domainReportScopeIsReady };
