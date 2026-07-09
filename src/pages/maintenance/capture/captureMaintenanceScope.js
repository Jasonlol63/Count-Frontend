import {
  customerReportScopeApiParams,
  customerReportScopeCacheCompanyKey,
  customerReportScopeCacheKey,
  customerReportScopeIsReady,
  resolveCustomerReportScope,
} from "../../report/shared/reportScope.js";

export {
  customerReportScopeIsReady as captureMaintenanceScopeIsReady,
  customerReportScopeCacheCompanyKey as captureMaintenanceScopeCacheCompanyKey,
  customerReportScopeCacheKey as captureMaintenanceScopeCacheKey,
  resolveCustomerReportScope as resolveCaptureMaintenanceScope,
};

/** Group entity or C168 company payroll: SALARY / BONUS / COMMISSION process list. */
export function captureMaintenanceUsesGroupProcesses(scope) {
  if (!scope) return false;
  if (scope.c168Channel) return true;
  return scope.mode === "group";
}

/** Query params for capture maintenance search / delete APIs. */
export function captureMaintenanceScopeApiParams(scope) {
  if (!scope) return {};
  // C168: company ledger only — never group_only (matches Data Capture channel).
  if (scope.c168Channel) {
    const companyId = scope.scopeCompanyId ?? scope.uiCompanyId ?? undefined;
    return {
      companyId,
      viewGroup: scope.viewGroup || scope.groupId || undefined,
      reportScope: "company",
    };
  }
  const base = customerReportScopeApiParams(scope);
  const out = {
    ...base,
    reportScope: scope.mode,
  };
  if (scope.mode === "group") {
    out.groupOnly = true;
    out.groupAggregate = true;
  }
  return out;
}
