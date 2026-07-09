import { isDashboardGroupOnlyMode } from "../../../utils/company/sharedCompanyFilter.js";
import {
  customerReportScopeIsReady,
  resolveCustomerReportScope,
} from "../shared/reportScope.js";

/**
 * Domain Report: group pill without subsidiary → group SALARY/BONUS ledger only.
 * Honour group-only session so stale company_id does not pull C168 captures into AP group view.
 */
export function resolveDomainReportScope(args) {
  const { companies, selectedGroup, companyId, groupsAllMode, groupAllMode } = args;
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
  });
}

/** Group entity / group-only: SALARY + BONUS only (aligned with Data Capture). */
export function domainReportUsesSalaryBonusProcesses(scope) {
  return scope?.mode === "group";
}

export { customerReportScopeIsReady as domainReportScopeIsReady };
